import type { Chain, Balance, Transaction, SendParams, FeeEstimate, TxHash, RawTx } from '@fox-wallet/shared'

export interface ChainAdapter {
  readonly chain: Chain
  getBalance(address: string): Promise<Balance[]>
  buildTransaction(params: SendParams): Promise<RawTx>
  broadcastTransaction(signedTx: string): Promise<TxHash>
  getTransactionHistory(address: string, page?: number, limit?: number): Promise<Transaction[]>
  getTransaction(hash: string): Promise<Transaction>
  estimateFee(params: SendParams): Promise<FeeEstimate>
}