import type { FastifyPluginAsync } from 'fastify'

export const profileRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (_req, reply) => {
    reply.send({ message: 'TODO: get player profile and weakness scores' })
  })
}
