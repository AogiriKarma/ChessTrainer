import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { authenticate } from '../lib/auth.js'

export const profileRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: authenticate }, async (req, reply) => {
    const player = await prisma.player.findUnique({
      where: { id: req.playerId },
    })

    const weaknessProfile = await prisma.weaknessProfile.findUnique({
      where: { playerId: req.playerId },
    })

    const stats = await prisma.game.aggregate({
      where: { playerId: req.playerId },
      _count: true,
    })

    const analyzedCount = await prisma.game.count({
      where: { playerId: req.playerId, analyzed: true },
    })

    const exerciseStats = await prisma.exercise.aggregate({
      where: {
        mistake: {
          game: { playerId: req.playerId },
        },
      },
      _count: true,
    })

    const solvedCount = await prisma.exercise.count({
      where: {
        mistake: {
          game: { playerId: req.playerId },
        },
        completed: true,
      },
    })

    return reply.send({
      player,
      weaknessProfile,
      stats: {
        totalGames: stats._count,
        analyzedGames: analyzedCount,
        totalExercises: exerciseStats._count,
        solvedExercises: solvedCount,
      },
    })
  })
}
