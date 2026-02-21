import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { authenticate } from '../lib/auth.js'
import { fetchLichessGames } from '../services/lichess.js'
import { fetchRecentChesscomGames } from '../services/chesscom.js'
import { analyzeGameQueue } from '../lib/queues.js'

export const gamesRoutes: FastifyPluginAsync = async (app) => {
  // List player's games
  app.get('/', { preHandler: authenticate }, async (req, reply) => {
    const games = await prisma.game.findMany({
      where: { playerId: req.playerId },
      orderBy: { id: 'desc' },
      select: {
        id: true,
        source: true,
        analyzed: true,
        analyzedAt: true,
      },
    })

    return reply.send({ games })
  })

  // Fetch games from Lichess
  app.post('/fetch/lichess', { preHandler: authenticate }, async (req, reply) => {
    const player = await prisma.player.findUnique({
      where: { id: req.playerId },
    })

    if (!player?.lichessId) {
      return reply.status(400).send({ error: 'No Lichess account linked' })
    }

    const lichessGames = await fetchLichessGames(player.lichessId)
    let imported = 0

    for (const lg of lichessGames) {
      // Check if already imported (by checking PGN hash or source id)
      const exists = await prisma.game.findFirst({
        where: {
          playerId: player.id,
          source: 'lichess',
          pgn: { contains: lg.id },
        },
      })

      if (exists) continue

      const game = await prisma.game.create({
        data: {
          playerId: player.id,
          pgn: lg.pgn,
          source: 'lichess',
        },
      })

      // Enqueue analysis job
      await analyzeGameQueue.add('analyze', {
        gameId: game.id,
        pgn: game.pgn,
      })

      imported++
    }

    return reply.send({ imported, total: lichessGames.length })
  })

  // Fetch games from Chess.com
  app.post('/fetch/chesscom', { preHandler: authenticate }, async (req, reply) => {
    const player = await prisma.player.findUnique({
      where: { id: req.playerId },
    })

    if (!player?.chesscomId) {
      return reply.status(400).send({ error: 'No Chess.com account linked' })
    }

    const chesscomGames = await fetchRecentChesscomGames(player.chesscomId)
    let imported = 0

    for (const cg of chesscomGames) {
      const exists = await prisma.game.findFirst({
        where: {
          playerId: player.id,
          source: 'chesscom',
          pgn: { contains: cg.url },
        },
      })

      if (exists) continue

      const game = await prisma.game.create({
        data: {
          playerId: player.id,
          pgn: cg.pgn,
          source: 'chesscom',
        },
      })

      await analyzeGameQueue.add('analyze', {
        gameId: game.id,
        pgn: game.pgn,
      })

      imported++
    }

    return reply.send({ imported, total: chesscomGames.length })
  })
}
