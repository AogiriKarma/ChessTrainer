import type { FastifyPluginAsync } from 'fastify'

export const gamesRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (_req, reply) => {
    reply.send({ message: 'TODO: list games' })
  })

  app.post('/fetch', async (_req, reply) => {
    reply.send({ message: 'TODO: fetch games from Lichess/Chess.com' })
  })
}
