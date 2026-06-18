export type Chain = 'btc' | 'eth' | 'xrp' | 'bsc' | 'sol' | 'ada'

export type AssetSymbol = 'BTC' | 'ETH' | 'USDC' | 'USDT' | 'XRP' | 'BNB' | 'SOL' | 'ADA'

export type TxType = 'send' | 'receive'

type TxStatus = 'pending' | 'confirmed' | 'failed'

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
  networkId: number
  symbolId: number
  networkName: string
  symbolName: string
  networkProtocol: string
  explorerUrl?: string
  type: TxType
  amount: string
  fromAddress: string
  toAddress: string
  txHash: string
  status: TxStatus
  fee?: string
  blockTime?: string
  createdAt: string
}

export interface SendParams {
  chain: Chain
  fromAddress: string
  toAddress: string
  asset: AssetSymbol
  amount: string
  destinationTag?: number
}

export interface FeeEstimate {
  fee: string
  feeUsd: string
  estimatedTime?: string
}

export type TxHash = string
export type RawTx = unknown

export interface AssetItem {
  id: number
  contractAddress: string | null
  status: number
  symbol: { id: number; name: string; imageUrl: string }
  network: { id: number; name: string; protocol: string; imageUrl: string }
}

export interface NetworkItem {
  id: number
  name: string
  protocol: string
  imageUrl: string
  explorerUrl?: string
}

export interface AssetBalance {
  assetId: number
  symbolName: string
  symbolImageUrl: string
  networkName: string
  networkProtocol: string
  networkImageUrl: string
  contractAddress: string | null
  balance: string
  price?: string
  value?: string
}

export interface QuoteSymbolItem {
  id: number
  name: string
  imageUrl: string
}