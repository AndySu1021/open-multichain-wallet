import type { FastifyInstance } from 'fastify'
import { prisma } from '../db/client.js'

export async function networkRoutes(app: FastifyInstance) {
  app.get('/networks', async (_request, reply) => {
    const networks = await prisma.network.findMany({
      where: { status: 1 },
      select: { id: true, name: true, protocol: true, imageUrl: true, explorerUrl: true },
      orderBy: { id: 'asc' },
    })
    return reply.send({ ok: true, data: { networks } })
  })

  app.get('/assets', async (_request, reply) => {
    const assets = await prisma.asset.findMany({
      where: { status: 1 },
      include: {
        symbol: { select: { id: true, name: true, imageUrl: true } },
        network: { select: { id: true, name: true, protocol: true, imageUrl: true } },
      },
      orderBy: { id: 'asc' },
    })
    return reply.send({ ok: true, data: { assets } })
  })

  app.get('/quote-symbols', async (_request, reply) => {
    const quoteSymbols = await prisma.quoteSymbol.findMany({
      where: { status: 1 },
      select: { id: true, name: true, imageUrl: true },
      orderBy: { id: 'asc' },
    })
    return reply.send({ ok: true, data: { quoteSymbols } })
  })
}