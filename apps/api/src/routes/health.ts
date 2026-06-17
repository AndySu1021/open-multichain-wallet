import type { FastifyInstance } from 'fastify'
import { prisma } from '../db/client.js'

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`
      return reply.send({ ok: true, db: 'connected', ts: new Date().toISOString() })
    } catch {
      return reply.code(503).send({ ok: false, db: 'disconnected' })
    }
  })
}