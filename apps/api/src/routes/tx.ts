import type { FastifyInstance } from 'fastify'
import { EstimateFeeSchema, SendSchema, GetHistorySchema } from '@fox-wallet/shared'
import type { Chain, TxType } from '@fox-wallet/shared'
import { prisma } from '../db/client.js'
import { requireAuth } from '../middleware/auth.js'
import { getAdapter } from '../chains/registry.js'
import { MockKeyManager } from '../keymanager/MockKeyManager.js'
import { Errors } from '../lib/errors.js'

const keyManager = new MockKeyManager()

const CHAIN_TO_PROTOCOL: Record<Chain, string> = { eth: 'ERC20', btc: 'BTC', xrp: 'XRP', bsc: 'BEP20' }

async function getAddressByChain(userId: bigint, chain: Chain): Promise<string | null> {
  const walletAddr = await prisma.walletAddress.findFirst({
    where: { userId, network: { protocol: CHAIN_TO_PROTOCOL[chain] } },
  })
  return walletAddr?.address ?? null
}

async function getNetworkByChain(chain: Chain) {
  return prisma.network.findFirst({ where: { protocol: CHAIN_TO_PROTOCOL[chain] } })
}

async function getSymbolByName(name: string) {
  return prisma.symbol.findUnique({ where: { name } })
}

function mapTxType(type: number): TxType {
  return type === 1 ? 'send' : 'receive'
}

export async function txRoutes(app: FastifyInstance) {
  app.post('/tx/estimate', { preHandler: requireAuth }, async (request, reply) => {
    const body = EstimateFeeSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ ok: false, error: { code: 'VALIDATION', message: body.error.message } })
    }

    const userId = BigInt(request.user.sub)
    const fromAddress = await getAddressByChain(userId, body.data.chain)
    if (!fromAddress) {
      const err = Errors.NotFound('WalletAddress')
      return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message } })
    }

    const fee = await getAdapter(body.data.chain).estimateFee({
      chain: body.data.chain,
      fromAddress,
      toAddress: body.data.toAddress,
      asset: body.data.asset,
      amount: body.data.amount,
    })
    return reply.send({ ok: true, data: fee })
  })

  app.post('/tx/send', { preHandler: requireAuth }, async (request, reply) => {
    const body = SendSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ ok: false, error: { code: 'VALIDATION', message: body.error.message } })
    }

    const userId = BigInt(request.user.sub)
    const fromAddress = await getAddressByChain(userId, body.data.chain)
    if (!fromAddress) {
      const err = Errors.NotFound('WalletAddress')
      return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message } })
    }

    const [network, symbol] = await Promise.all([
      getNetworkByChain(body.data.chain),
      getSymbolByName(body.data.asset),
    ])
    if (!network || !symbol) {
      const err = Errors.NotFound('Network or Symbol')
      return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message } })
    }

    const adapter = getAdapter(body.data.chain)
    const params = {
      chain: body.data.chain,
      fromAddress,
      toAddress: body.data.toAddress,
      asset: body.data.asset,
      amount: body.data.amount,
    }
    const rawTx = await adapter.buildTransaction(params)
    const signedTx = await keyManager.signTransaction(userId.toString(), body.data.chain, rawTx)
    const txHash = await adapter.broadcastTransaction(signedTx)

    const tx = await prisma.transaction.create({
      data: {
        userId,
        networkId: network.id,
        symbolId: symbol.id,
        type: 1,
        fromAddress,
        toAddress: body.data.toAddress,
        amount: body.data.amount,
        txHash,
        status: 'pending',
      },
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
          status: t.status,
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
        status: tx.status,
        fee: tx.fee ?? undefined,
        blockTime: tx.blockTime?.toISOString(),
        createdAt: tx.createdAt.toISOString(),
      },
    })
  })
}