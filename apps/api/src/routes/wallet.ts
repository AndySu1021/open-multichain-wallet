import type { FastifyInstance } from 'fastify'
import { GetAddressSchema, SUPPORTED_CHAINS } from '@fox-wallet/shared'
import type { Chain } from '@fox-wallet/shared'
import { prisma } from '../db/client.js'
import { requireAuth } from '../middleware/auth.js'
import { getAdapter } from '../chains/registry.js'
import { MockKeyManager } from '../keymanager/MockKeyManager.js'

const keyManager = new MockKeyManager()

async function getOrCreateAddress(userId: string, chain: Chain): Promise<string> {
  const existing = await prisma.wallet.findUnique({ where: { userId_chain: { userId, chain } } })
  if (existing) return existing.address

  const { address } = await keyManager.createWallet(userId, chain)
  await prisma.wallet.create({ data: { userId, chain, address } })
  return address
}

export async function walletRoutes(app: FastifyInstance) {
  app.get('/wallet/address', { preHandler: requireAuth }, async (request, reply) => {
    const query = GetAddressSchema.safeParse(request.query)
    if (!query.success) {
      return reply.code(400).send({ ok: false, error: { code: 'VALIDATION', message: query.error.message } })
    }

    const userId = request.user.sub
    const address = await getOrCreateAddress(userId, query.data.chain)
    return reply.send({ ok: true, data: { chain: query.data.chain, address } })
  })

  app.get('/wallet/balances', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user.sub
    const balances = await Promise.all(
      SUPPORTED_CHAINS.map(async (chain) => {
        const wallet = await prisma.wallet.findUnique({ where: { userId_chain: { userId, chain } } })
        if (!wallet) return []
        return getAdapter(chain).getBalance(wallet.address)
      }),
    )
    return reply.send({ ok: true, data: { balances: balances.flat() } })
  })
}