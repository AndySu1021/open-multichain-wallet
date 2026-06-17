import { randomBytes } from 'node:crypto'
import type { Balance, Transaction, SendParams, FeeEstimate, TxHash, RawTx } from '@fox-wallet/shared'
import type { ChainAdapter } from './ChainAdapter.js'

export class BscAdapter implements ChainAdapter {
  readonly chain = 'bsc' as const

  async getBalance(_address: string): Promise<Balance[]> {
    return [
      { chain: 'bsc', asset: 'BNB',  amount: '0',  usdValue: '0.00',  change24h: '+2.1%' },
      { chain: 'bsc', asset: 'USDT', amount: '0',  usdValue: '0.00',  change24h: '0.0%'  },
    ]
  }

  async buildTransaction(params: SendParams): Promise<RawTx> {
    return { ...params, nonce: Math.floor(Math.random() * 200) }
  }

  async broadcastTransaction(_signedTx: string): Promise<TxHash> {
    return '0x' + randomBytes(32).toString('hex')
  }

  async getTransactionHistory(_address: string, _page = 1, _limit = 20): Promise<Transaction[]> {
    return []
  }

  async getTransaction(hash: string): Promise<Transaction> {
    return {
      id: hash,
      networkId: 0,
      symbolId: 0,
      networkName: 'Binance Smart Chain',
      symbolName: 'BNB',
      networkProtocol: 'BEP20',
      type: 'send',
      amount: '0.0',
      fromAddress: '',
      toAddress: '',
      txHash: hash,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }
  }

  async estimateFee(_params: SendParams): Promise<FeeEstimate> {
    return { fee: '0.0005', feeUsd: '0.30', estimatedTime: '~5s' }
  }
}