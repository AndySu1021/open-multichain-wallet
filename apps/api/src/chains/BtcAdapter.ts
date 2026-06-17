import { randomBytes } from 'node:crypto'
import type { Balance, Transaction, SendParams, FeeEstimate, TxHash, RawTx } from '@fox-wallet/shared'
import type { ChainAdapter } from './ChainAdapter.js'

export class BtcAdapter implements ChainAdapter {
  readonly chain = 'btc' as const

  async getBalance(_address: string): Promise<Balance[]> {
    return [{ chain: 'btc', asset: 'BTC', amount: '0.412', usdValue: '28140.00', change24h: '+1.9%' }]
  }

  async buildTransaction(params: SendParams): Promise<RawTx> {
    return { ...params }
  }

  async broadcastTransaction(_signedTx: string): Promise<TxHash> {
    return randomBytes(32).toString('hex')
  }

  async getTransactionHistory(_address: string, _page = 1, _limit = 20): Promise<Transaction[]> {
    return []
  }

  async getTransaction(hash: string): Promise<Transaction> {
    return {
      id: hash,
      chain: 'btc',
      type: 'send',
      asset: 'BTC',
      amount: '0.0',
      fromAddress: '',
      toAddress: '',
      txHash: hash,
      status: 'pending',
    }
  }

  async estimateFee(_params: SendParams): Promise<FeeEstimate> {
    return { fee: '0.00005', feeUsd: '3.42', estimatedTime: '~10 min' }
  }
}