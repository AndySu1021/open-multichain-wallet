import Fastify from 'fastify'
import fjwt from '@fastify/jwt'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { env } from './config/env.js'
import { prisma } from './db/client.js'
import { healthRoutes } from './routes/health.js'
import { authRoutes } from './routes/auth.js'
import { walletRoutes } from './routes/wallet.js'
import { txRoutes } from './routes/tx.js'

const app = Fastify({
  logger: { level: env.NODE_ENV === 'development' ? 'info' : 'warn' },
})

await app.register(cors, {
  origin: env.WEB_ORIGIN,
  credentials: true,
})

await app.register(rateLimit, {
  global: true,
  max: 60,
  timeWindow: '1 minute',
})

await app.register(fjwt, { secret: env.JWT_SECRET })

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error)
  if (reply.statusCode === 429) {
    void reply.send({ ok: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } })
    return
  }
  void reply.code(500).send({ ok: false, error: { code: 'INTERNAL', message: 'Internal server error' } })
})

await app.register(healthRoutes)
await app.register(authRoutes)
await app.register(walletRoutes)
await app.register(txRoutes)

const shutdown = async () => {
  await app.close()
  await prisma.$disconnect()
  process.exit(0)
}
process.on('SIGTERM', () => void shutdown())
process.on('SIGINT', () => void shutdown())

try {
  await prisma.$connect()
  await app.listen({ port: env.PORT, host: '0.0.0.0' })
  console.log(`🦊 API running on http://localhost:${env.PORT}`)
} catch (err) {
  app.log.error(err)
  await prisma.$disconnect()
  process.exit(1)
}