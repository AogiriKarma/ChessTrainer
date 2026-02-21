import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { authenticate } from '../lib/auth.js'

export const exercisesRoutes: FastifyPluginAsync = async (app) => {
  // List exercises for the current player
  app.get('/', { preHandler: authenticate }, async (req, reply) => {
    const exercises = await prisma.exercise.findMany({
      where: {
        mistake: {
          game: { playerId: req.playerId },
        },
      },
      include: {
        mistake: {
          select: {
            type: true,
            theme: true,
            evalLoss: true,
            moveNumber: true,
          },
        },
      },
      orderBy: { id: 'desc' },
    })

    return reply.send({ exercises })
  })

  // Get single exercise
  app.get<{ Params: { id: string } }>('/:id', { preHandler: authenticate }, async (req, reply) => {
    const exercise = await prisma.exercise.findUnique({
      where: { id: req.params.id },
      include: {
        mistake: true,
      },
    })

    if (!exercise) {
      return reply.status(404).send({ error: 'Exercise not found' })
    }

    return reply.send({ exercise })
  })

  // Submit an attempt
  app.post<{ Params: { id: string }; Body: { solved: boolean } }>(
    '/:id/attempt',
    { preHandler: authenticate },
    async (req, reply) => {
      const exercise = await prisma.exercise.update({
        where: { id: req.params.id },
        data: {
          attempts: { increment: 1 },
          ...(req.body.solved
            ? { completed: true, solvedAt: new Date() }
            : {}),
        },
      })

      return reply.send({ exercise })
    },
  )
}
