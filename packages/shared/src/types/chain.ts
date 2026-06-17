export type Chain = 'btc' | 'eth' | 'xrp'

export type AssetSymbol = 'BTC' | 'ETH' | 'USDC' | 'USDT' | 'XRP'

export type TxType = 'send' | 'receive' | 'swap'

export type TxStatus = 'pending' | 'confirmed' | 'failed'

export interface Balance {
  chain: Chain
  asset: AssetSymbol
  amount: string
  usdValue: string
  change24h?: string
}

export interface Address {
  chain: Chain
  address: string
}

export interface Transaction {
  id: string
  chain: Chain
  type: TxType
  asset: AssetSymbol
  amount: string
  usdValue?: string
  fromAddress: string
  toAddress: string
  txHash: string
  status: TxStatus
  confirmations?: number
  requiredConfirmations?: number
  fee?: string
  feeUsd?: string
  blockTime?: string
  nonce?: number
}

export interface SendParams {
  chain: Chain
  fromAddress: string
  toAddress: string
  asset: AssetSymbol
  amount: string
}

export interface FeeEstimate {
  fee: string
  feeUsd: string
  estimatedTime?: string
}

export type TxHash = string
export type RawTx = unknown