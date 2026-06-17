import { randomBytes } from 'node:crypto'
import type { ChainAdapter } from './ChainAdapter.js'
import type { Balance, Transaction, SendParams, FeeEstimate, TxHash, RawTx } from '@fox-wallet/shared'

export class SolAdapter implements ChainAdapter {
  readonly chain = 'sol' as const

  async getBalance(_address: string): Promise<Balance[]> {
    return [
      { chain: 'sol', asset: 'SOL', amount: '0', usdValue: '0.00' },
    ]
  }

  async buildTransaction(params: SendParams): Promise<RawTx> {
    return params
  }

  async broadcastTransaction(_signedTx: string): Promise<TxHash> {
    return randomBytes(32).toString('hex').toUpperCase()
  }

  async getTransactionHistory(_address: string): Promise<Transaction[]> {
    return []
  }

  async getTransaction(hash: string): Promise<Transaction> {
    return {
      id: '',
      networkId: 5,
      symbolId: 7,
      networkName: 'Solana',
      symbolName: 'SOL',
      networkProtocol: 'SOL',
      type: 'send',
      amount: '0',
      fromAddress: '',
      toAddress: '',
      txHash: hash,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    }
  }

  async estimateFee(_params: SendParams): Promise<FeeEstimate> {
    return { fee: '0.000005', feeUsd: '0.001', estimatedTime: '~1s' }
  }
}
