import type { FastifyPluginAsync } from 'fastify'

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.get('/lichess', async (_req, reply) => {
    reply.send({ message: 'TODO: Lichess OAuth redirect' })
  })

  app.get('/lichess/callback', async (_req, reply) => {
    reply.send({ message: 'TODO: Lichess OAuth callback' })
  })

  app.post('/chesscom', async (_req, reply) => {
    reply.send({ message: 'TODO: Chess.com username connect' })
  })
}
