import type { Chain, AssetSymbol } from '../types/chain.js'

export const SUPPORTED_CHAINS: Chain[] = ['eth', 'btc', 'xrp', 'bsc']

export const CHAIN_LABELS: Record<Chain, string> = {
  eth: 'Ethereum',
  btc: 'Bitcoin',
  xrp: 'XRP Ledger',
  bsc: 'Binance Smart Chain',
}

export const CHAIN_NATIVE_ASSET: Record<Chain, AssetSymbol> = {
  eth: 'ETH',
  btc: 'BTC',
  xrp: 'XRP',
  bsc: 'BNB',
}

export const ERC20_ASSETS: AssetSymbol[] = ['USDC', 'USDT']

export const ASSET_CHAIN_MAP: Partial<Record<AssetSymbol, Chain>> = {
  BTC: 'btc',
  ETH: 'eth',
  USDC: 'eth',
  XRP: 'xrp',
  BNB: 'bsc',
}

export const REQUIRED_CONFIRMATIONS: Record<Chain, number> = {
  btc: 6,
  eth: 12,
  xrp: 1,
  bsc: 15,
}