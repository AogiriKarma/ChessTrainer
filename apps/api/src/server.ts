import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { authRoutes } from './routes/auth.js'
import { gamesRoutes } from './routes/games.js'
import { exercisesRoutes } from './routes/exercises.js'
import { profileRoutes } from './routes/profile.js'

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
  await app.listen({ port, host: '0.0.0.0' })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
