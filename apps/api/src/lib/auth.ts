import type { FastifyRequest, FastifyReply } from 'fastify'
import { verifyToken } from './jwt.js'

export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Missing or invalid token' })
  }

  try {
    const payload = verifyToken(authHeader.slice(7))
    req.playerId = payload.playerId
  } catch {
    return reply.status(401).send({ error: 'Invalid token' })
  }
}

// Extend Fastify request type
declare module 'fastify' {
  interface FastifyRequest {
    playerId: string
  }
}
