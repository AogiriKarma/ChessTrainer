import type { FastifyPluginAsync } from 'fastify'
import crypto from 'crypto'
import { prisma } from '../lib/prisma.js'
import { signToken } from '../lib/jwt.js'

const LICHESS_HOST = 'https://lichess.org'
const CLIENT_ID = process.env.LICHESS_CLIENT_ID || ''
const CALLBACK_URL = process.env.LICHESS_CALLBACK_URL || 'http://localhost:3001/api/auth/lichess/callback'
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

// Store PKCE verifiers in memory (in prod, use Redis)
const pkceStore = new Map<string, string>()

function base64url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  // Step 1: redirect to Lichess OAuth
  app.get('/lichess', async (_req, reply) => {
    const codeVerifier = base64url(crypto.randomBytes(32))
    const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest())
    const state = base64url(crypto.randomBytes(16))

    pkceStore.set(state, codeVerifier)
    // Clean up after 10 min
    setTimeout(() => pkceStore.delete(state), 10 * 60 * 1000)

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: CALLBACK_URL,
      scope: 'preference:read',
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
      state,
    })

    return reply.redirect(`${LICHESS_HOST}/oauth?${params}`)
  })

  // Step 2: Lichess OAuth callback
  app.get<{ Querystring: { code?: string; state?: string } }>(
    '/lichess/callback',
    async (req, reply) => {
      const { code, state } = req.query

      if (!code || !state) {
        return reply.status(400).send({ error: 'Missing code or state' })
      }

      const codeVerifier = pkceStore.get(state)
      if (!codeVerifier) {
        return reply.status(400).send({ error: 'Invalid or expired state' })
      }
      pkceStore.delete(state)

      // Exchange code for token
      const tokenRes = await fetch(`${LICHESS_HOST}/api/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: CALLBACK_URL,
          client_id: CLIENT_ID,
          code_verifier: codeVerifier,
        }),
      })

      if (!tokenRes.ok) {
        const err = await tokenRes.text()
        app.log.error(`Lichess token exchange failed: ${err}`)
        return reply.status(502).send({ error: 'Failed to exchange token with Lichess' })
      }

      const tokenData = (await tokenRes.json()) as { access_token: string }
      const accessToken = tokenData.access_token

      // Get Lichess user info
      const userRes = await fetch(`${LICHESS_HOST}/api/account`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      if (!userRes.ok) {
        return reply.status(502).send({ error: 'Failed to fetch Lichess profile' })
      }

      const userData = (await userRes.json()) as { id: string; username: string }

      // Upsert player
      const player = await prisma.player.upsert({
        where: { lichessId: userData.id },
        update: {},
        create: { lichessId: userData.id },
      })

      const jwt = signToken({ playerId: player.id })

      // Redirect to frontend with token
      return reply.redirect(`${FRONTEND_URL}/auth/callback?token=${jwt}&username=${userData.username}`)
    },
  )

  // Chess.com: connect by username
  app.post<{ Body: { username: string; playerId?: string } }>(
    '/chesscom',
    async (req, reply) => {
      const { username, playerId } = req.body

      // Verify the username exists on Chess.com
      const profileRes = await fetch(`https://api.chess.com/pub/player/${username}`)
      if (!profileRes.ok) {
        return reply.status(404).send({ error: 'Chess.com player not found' })
      }

      // If we have a playerId (already logged in via Lichess), link Chess.com
      if (playerId) {
        const player = await prisma.player.update({
          where: { id: playerId },
          data: { chesscomId: username },
        })
        return reply.send({ player })
      }

      // Otherwise, create or find by Chess.com username
      const player = await prisma.player.upsert({
        where: { chesscomId: username },
        update: {},
        create: { chesscomId: username },
      })

      const jwt = signToken({ playerId: player.id })
      return reply.send({ token: jwt, player })
    },
  )

  // Get current user info
  app.get('/me', async (req, reply) => {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Not authenticated' })
    }

    try {
      const { verifyToken } = await import('../lib/jwt.js')
      const payload = verifyToken(authHeader.slice(7))
      const player = await prisma.player.findUnique({
        where: { id: payload.playerId },
      })

      if (!player) {
        return reply.status(404).send({ error: 'Player not found' })
      }

      return reply.send({ player })
    } catch {
      return reply.status(401).send({ error: 'Invalid token' })
    }
  })
}
