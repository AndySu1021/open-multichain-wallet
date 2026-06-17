import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Chain } from '@fox-wallet/shared'
import { prisma } from '../db/client.js'
import { requireAuth } from '../middleware/auth.js'
import { MockKeyManager } from '../keymanager/MockKeyManager.js'
import { getAdapter } from '../chains/registry.js'
import { Errors } from '../lib/errors.js'

const keyManager = new MockKeyManager()

const PROTOCOL_TO_CHAIN: Record<string, Chain> = {
  ERC20: 'eth',
  BTC: 'btc',
  XRP: 'xrp',
  BEP20: 'bsc',
}

const GetAddressSchema = z.object({
  networkId: z.coerce.number().int().positive(),
})

async function getOrCreateAddress(userId: bigint, networkId: number): Promise<string> {
  const existing = await prisma.walletAddress.findFirst({ where: { userId, networkId } })
  if (existing) return existing.address

  const network = await prisma.network.findUnique({ where: { id: networkId } })
  if (!network) throw new Error(`Network ${networkId} not found`)

  const chain = PROTOCOL_TO_CHAIN[network.protocol] ?? 'eth'
  const { address } = await keyManager.createWallet(userId.toString(), chain)
  await prisma.walletAddress.create({
    data: { userId, networkId, address, encryptedKeyRef: 'mock' },
  })
  return address
}

export async function walletRoutes(app: FastifyInstance) {
  // GET /wallet/address?networkId=1  — lazy create wallet address
  app.get('/wallet/address', { preHandler: requireAuth }, async (request, reply) => {
    const query = GetAddressSchema.safeParse(request.query)
    if (!query.success) {
      return reply.code(400).send({ ok: false, error: { code: 'VALIDATION', message: query.error.message } })
    }

    const userId = BigInt(request.user.sub)
    try {
      const address = await getOrCreateAddress(userId, query.data.networkId)
      return reply.send({ ok: true, data: { networkId: query.data.networkId, address } })
    } catch (e) {
      const err = Errors.NotFound('Network')
      return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message } })
    }
  })

  // GET /wallet/balances?networkId=1&quoteSymbolId=2  — active assets with optional price
  app.get('/wallet/balances', { preHandler: requireAuth }, async (request, reply) => {
    const userId = BigInt(request.user.sub)
    const { networkId, quoteSymbolId } = request.query as { networkId?: string; quoteSymbolId?: string }
    const networkFilter = networkId ? { networkId: parseInt(networkId, 10) } : {}
    const qsId = quoteSymbolId ? parseInt(quoteSymbolId, 10) : null

    const [assets, userAssets, quotations] = await Promise.all([
      prisma.asset.findMany({
        where: { status: 1, ...networkFilter },
        include: {
          symbol: { select: { id: true, name: true, imageUrl: true } },
          network: { select: { id: true, name: true, protocol: true, imageUrl: true } },
        },
        orderBy: { id: 'asc' },
      }),
      prisma.userAsset.findMany({
        where: { userId },
        select: { networkId: true, symbolId: true, balance: true },
      }),
      qsId
        ? prisma.quotation.findMany({
            where: { quoteSymbolId: qsId },
            select: { symbolId: true, price: true },
          })
        : Promise.resolve([]),
    ])

    const balanceMap = new Map(
      userAssets.map((ua) => [`${ua.networkId}-${ua.symbolId}`, ua.balance.toString()])
    )
    const priceMap = new Map(quotations.map((q) => [q.symbolId, q.price.toString()]))

    let totalValue = 0
    const balances = assets.map((a) => {
      const balance = balanceMap.get(`${a.network.id}-${a.symbol.id}`) ?? '0'
      const price = priceMap.get(a.symbol.id)
      const value = price ? (parseFloat(balance) * parseFloat(price)).toFixed(2) : undefined
      if (value) totalValue += parseFloat(value)
      return {
        assetId: a.id,
        symbolName: a.symbol.name,
        symbolImageUrl: a.symbol.imageUrl,
        networkName: a.network.name,
        networkProtocol: a.network.protocol,
        networkImageUrl: a.network.imageUrl,
        contractAddress: a.contractAddress,
        balance,
        ...(price ? { price, value } : {}),
      }
    })

    return reply.send({
      ok: true,
      data: { balances, ...(qsId ? { totalValue: totalValue.toFixed(2) } : {}) },
    })
  })

  // GET /wallet/address/by-chain?chain=eth  — used by tx routes internally
  app.get('/wallet/address/by-chain', { preHandler: requireAuth }, async (request, reply) => {
    const query = z.object({ chain: z.enum(['eth', 'btc', 'xrp', 'bsc']) }).safeParse(request.query)
    if (!query.success) {
      return reply.code(400).send({ ok: false, error: { code: 'VALIDATION', message: query.error.message } })
    }

    const CHAIN_TO_PROTOCOL: Record<Chain, string> = { eth: 'ERC20', btc: 'BTC', xrp: 'XRP', bsc: 'BEP20' }
    const userId = BigInt(request.user.sub)
    const walletAddr = await prisma.walletAddress.findFirst({
      where: { userId, network: { protocol: CHAIN_TO_PROTOCOL[query.data.chain] } },
    })
    if (!walletAddr) {
      const err = Errors.NotFound('WalletAddress')
      return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message } })
    }
    return reply.send({ ok: true, data: { address: walletAddr.address } })
  })
}

export { getAdapter, PROTOCOL_TO_CHAIN }