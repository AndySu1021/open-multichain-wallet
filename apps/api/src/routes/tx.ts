import type { FastifyInstance } from 'fastify'
import { EstimateFeeSchema, SendSchema, GetHistorySchema } from '@fox-wallet/shared'
import type { Chain, TxType, AssetSymbol } from '@fox-wallet/shared'
import { prisma } from '../db/client.js'
import { requireAuth } from '../middleware/auth.js'
import { getAdapter } from '../chains/registry.js'
import { MockKeyManager } from '../keymanager/MockKeyManager.js'
import { Errors } from '../lib/errors.js'

const keyManager = new MockKeyManager()

const PROTOCOL_TO_CHAIN: Record<string, Chain> = { ERC20: 'eth', BTC: 'btc', XRP: 'xrp', BEP20: 'bsc' }

async function getAddressByNetworkId(userId: bigint, networkId: number): Promise<string | null> {
  const wallet = await prisma.walletAddress.findFirst({ where: { userId, networkId } })
  return wallet?.address ?? null
}

function mapTxType(type: number): TxType {
  return type === 1 ? 'send' : 'receive'
}

function mapTxStatus(status: number): string {
  if (status === 1) return 'confirmed'
  if (status === 2) return 'failed'
  return 'pending'
}

export async function txRoutes(app: FastifyInstance) {
  app.post('/tx/estimate', { preHandler: requireAuth }, async (request, reply) => {
    const body = EstimateFeeSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ ok: false, error: { code: 'VALIDATION', message: body.error.message } })
    }

    const userId = BigInt(request.user.sub)
    const { networkId, symbolId, toAddress, amount, destinationTag } = body.data

    const [network, symbol, fromAddress] = await Promise.all([
      prisma.network.findUnique({ where: { id: networkId } }),
      prisma.symbol.findUnique({ where: { id: symbolId } }),
      getAddressByNetworkId(userId, networkId),
    ])

    if (!network || !symbol) {
      const err = Errors.NotFound('Network or Symbol')
      return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message } })
    }
    if (!fromAddress) {
      const err = Errors.NotFound('WalletAddress')
      return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message } })
    }

    const chain = PROTOCOL_TO_CHAIN[network.protocol]
    if (!chain) {
      return reply.code(400).send({ ok: false, error: { code: 'INVALID_NETWORK', message: 'Unsupported network protocol' } })
    }

    const fee = await getAdapter(chain).estimateFee({
      chain,
      fromAddress,
      toAddress,
      asset: symbol.name as AssetSymbol,
      amount,
      ...(destinationTag !== undefined ? { destinationTag } : {}),
    })
    return reply.send({ ok: true, data: fee })
  })

  app.post('/tx/send', { preHandler: requireAuth }, async (request, reply) => {
    const body = SendSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ ok: false, error: { code: 'VALIDATION', message: body.error.message } })
    }

    const userId = BigInt(request.user.sub)
    const { networkId, symbolId, toAddress, amount, destinationTag } = body.data

    const [network, symbol, fromAddress] = await Promise.all([
      prisma.network.findUnique({ where: { id: networkId } }),
      prisma.symbol.findUnique({ where: { id: symbolId } }),
      getAddressByNetworkId(userId, networkId),
    ])

    if (!network || !symbol) {
      const err = Errors.NotFound('Network or Symbol')
      return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message } })
    }
    if (!fromAddress) {
      const err = Errors.NotFound('WalletAddress')
      return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message } })
    }

    const chain = PROTOCOL_TO_CHAIN[network.protocol]
    if (!chain) {
      return reply.code(400).send({ ok: false, error: { code: 'INVALID_NETWORK', message: 'Unsupported network protocol' } })
    }

    const adapter = getAdapter(chain)
    const params = { chain, fromAddress, toAddress, asset: symbol.name as AssetSymbol, amount, ...(destinationTag !== undefined ? { destinationTag } : {}) }
    const rawTx = await adapter.buildTransaction(params)
    const signedTx = await keyManager.signTransaction(userId.toString(), chain, rawTx)
    const txHash = await adapter.broadcastTransaction(signedTx)

    const tx = await prisma.transaction.create({
      data: { userId, networkId, symbolId, type: 1, fromAddress, toAddress, amount, txHash, status: 0 },
    })

    return reply.code(201).send({ ok: true, data: { txHash, txId: tx.id } })
  })

  app.get('/tx/history', { preHandler: requireAuth }, async (request, reply) => {
    const query = GetHistorySchema.safeParse(request.query)
    if (!query.success) {
      return reply.code(400).send({ ok: false, error: { code: 'VALIDATION', message: query.error.message } })
    }

    const userId = BigInt(request.user.sub)
    const where = {
      userId,
      ...(query.data.networkId ? { networkId: query.data.networkId } : {}),
      ...(query.data.symbolId ? { symbolId: query.data.symbolId } : {}),
      ...(query.data.type ? { type: query.data.type } : {}),
    }
    const skip = (query.data.page - 1) * query.data.limit

    const [items, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          network: { select: { name: true, protocol: true, explorerUrl: true } },
          symbol: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.data.limit,
      }),
      prisma.transaction.count({ where }),
    ])

    return reply.send({
      ok: true,
      data: {
        items: items.map((t) => ({
          id: t.id,
          networkId: t.networkId,
          symbolId: t.symbolId,
          networkName: t.network.name,
          symbolName: t.symbol.name,
          networkProtocol: t.network.protocol,
          explorerUrl: t.network.explorerUrl ?? undefined,
          type: mapTxType(t.type),
          amount: t.amount.toString(),
          fromAddress: t.fromAddress,
          toAddress: t.toAddress,
          txHash: t.txHash,
          status: mapTxStatus(t.status),
          fee: t.fee ?? undefined,
          blockTime: t.blockTime?.toISOString(),
          createdAt: t.createdAt.toISOString(),
        })),
        total,
        page: query.data.page,
        limit: query.data.limit,
      },
    })
  })

  app.get('/tx/:hash', { preHandler: requireAuth }, async (request, reply) => {
    const { hash } = request.params as { hash: string }
    const userId = BigInt(request.user.sub)

    const tx = await prisma.transaction.findFirst({
      where: { txHash: hash, userId },
      include: {
        network: { select: { name: true, protocol: true, explorerUrl: true } },
        symbol: { select: { name: true } },
      },
    })
    if (!tx) {
      const err = Errors.NotFound('Transaction')
      return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message } })
    }

    return reply.send({
      ok: true,
      data: {
        id: tx.id,
        networkId: tx.networkId,
        symbolId: tx.symbolId,
        networkName: tx.network.name,
        symbolName: tx.symbol.name,
        networkProtocol: tx.network.protocol,
        explorerUrl: tx.network.explorerUrl ?? undefined,
        type: mapTxType(tx.type),
        amount: tx.amount.toString(),
        fromAddress: tx.fromAddress,
        toAddress: tx.toAddress,
        txHash: tx.txHash,
        status: mapTxStatus(tx.status),
        fee: tx.fee ?? undefined,
        blockTime: tx.blockTime?.toISOString(),
        createdAt: tx.createdAt.toISOString(),
      },
    })
  })
}