import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { authRoutes } from './routes/auth.js'
import { gamesRoutes } from './routes/games.js'
import { exercisesRoutes } from './routes/exercises.js'
import { profileRoutes } from './routes/profile.js'
import { initPool, shutdownPool } from './services/stockfish.js'
import { startWorkers } from './lib/queues.js'

const app = Fastify({ logger: true })

await app.register(cors, {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
})

app.register(authRoutes, { prefix: '/api/auth' })
app.register(gamesRoutes, { prefix: '/api/games' })
app.register(exercisesRoutes, { prefix: '/api/exercises' })
app.register(profileRoutes, { prefix: '/api/profile' })

app.get('/api/health', async () => ({ status: 'ok' }))

const port = parseInt(process.env.PORT || '3001')

try {
  // Init Stockfish pool
  await initPool()
  app.log.info('Stockfish pool ready')

  // Start BullMQ workers
  const workers = startWorkers()
  app.log.info('BullMQ workers started')

  // Graceful shutdown
  const shutdown = async () => {
    app.log.info('Shutting down...')
    await workers.analyzeWorker.close()
    await workers.exerciseWorker.close()
    await shutdownPool()
    await app.close()
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  await app.listen({ port, host: '0.0.0.0' })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
