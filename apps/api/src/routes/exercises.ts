import type { FastifyPluginAsync } from 'fastify'

export const exercisesRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (_req, reply) => {
    reply.send({ message: 'TODO: list exercises' })
  })

  app.get('/:id', async (_req, reply) => {
    reply.send({ message: 'TODO: get exercise by id' })
  })

  app.post('/:id/attempt', async (_req, reply) => {
    reply.send({ message: 'TODO: submit exercise attempt' })
  })
}
