import type { FastifyInstance } from 'fastify'
import { EstimateFeeSchema, SendSchema, GetHistorySchema } from '@fox-wallet/shared'
import type { Chain, AssetSymbol } from '@fox-wallet/shared'
import { prisma } from '../db/client.js'
import { requireAuth } from '../middleware/auth.js'
import { getAdapter } from '../chains/registry.js'
import { MockKeyManager } from '../keymanager/MockKeyManager.js'
import { Errors } from '../lib/errors.js'

const keyManager = new MockKeyManager()

export async function txRoutes(app: FastifyInstance) {
  app.post('/tx/estimate', { preHandler: requireAuth }, async (request, reply) => {
    const body = EstimateFeeSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ ok: false, error: { code: 'VALIDATION', message: body.error.message } })
    }

    const userId = request.user.sub
    const wallet = await prisma.wallet.findUnique({ where: { userId_chain: { userId, chain: body.data.chain } } })
    if (!wallet) {
      const err = Errors.NotFound('Wallet')
      return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message } })
    }

    const fee = await getAdapter(body.data.chain).estimateFee({
      chain: body.data.chain,
      fromAddress: wallet.address,
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

    const userId = request.user.sub
    const wallet = await prisma.wallet.findUnique({ where: { userId_chain: { userId, chain: body.data.chain } } })
    if (!wallet) {
      const err = Errors.NotFound('Wallet')
      return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message } })
    }

    const adapter = getAdapter(body.data.chain)
    const params = { chain: body.data.chain, fromAddress: wallet.address, toAddress: body.data.toAddress, asset: body.data.asset, amount: body.data.amount }
    const rawTx = await adapter.buildTransaction(params)
    const signedTx = await keyManager.signTransaction(userId, body.data.chain, rawTx)
    const txHash = await adapter.broadcastTransaction(signedTx)

    const tx = await prisma.transaction.create({
      data: {
        userId,
        chain: body.data.chain,
        type: 'send',
        fromAddress: wallet.address,
        toAddress: body.data.toAddress,
        asset: body.data.asset,
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

    const userId = request.user.sub
    const where = { userId, ...(query.data.chain ? { chain: query.data.chain } : {}) }
    const skip = (query.data.page - 1) * query.data.limit

    const [items, total] = await Promise.all([
      prisma.transaction.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: query.data.limit }),
      prisma.transaction.count({ where }),
    ])

    return reply.send({
      ok: true,
      data: {
        items: items.map((t) => ({
          id: t.id,
          chain: t.chain as Chain,
          type: t.type,
          asset: t.asset as AssetSymbol,
          amount: t.amount,
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
    const userId = request.user.sub

    const tx = await prisma.transaction.findFirst({ where: { txHash: hash, userId } })
    if (!tx) {
      const err = Errors.NotFound('Transaction')
      return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message } })
    }

    return reply.send({
      ok: true,
      data: {
        id: tx.id,
        chain: tx.chain as Chain,
        type: tx.type,
        asset: tx.asset as AssetSymbol,
        amount: tx.amount,
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