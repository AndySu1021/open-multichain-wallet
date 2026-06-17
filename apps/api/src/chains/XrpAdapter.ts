import { randomBytes } from 'node:crypto'
import type { Balance, Transaction, SendParams, FeeEstimate, TxHash, RawTx } from '@fox-wallet/shared'
import type { ChainAdapter } from './ChainAdapter.js'

export class XrpAdapter implements ChainAdapter {
  readonly chain = 'xrp' as const

  async getBalance(_address: string): Promise<Balance[]> {
    return [{ chain: 'xrp', asset: 'XRP', amount: '1540', usdValue: '1253.50', change24h: '-0.7%' }]
  }

  async buildTransaction(params: SendParams): Promise<RawTx> {
    return { ...params }
  }

  async broadcastTransaction(_signedTx: string): Promise<TxHash> {
    return randomBytes(32).toString('hex').toUpperCase()
  }

  async getTransactionHistory(_address: string, _page = 1, _limit = 20): Promise<Transaction[]> {
    return []
  }

  async getTransaction(hash: string): Promise<Transaction> {
    return {
      id: hash,
      chain: 'xrp',
      type: 'send',
      asset: 'XRP',
      amount: '0.0',
      fromAddress: '',
      toAddress: '',
      txHash: hash,
      status: 'pending',
    }
  }

  async estimateFee(_params: SendParams): Promise<FeeEstimate> {
    return { fee: '0.000012', feeUsd: '0.01', estimatedTime: '~4s' }
  }
}