import type { Chain } from '@fox-wallet/shared'
import type { ChainAdapter } from './ChainAdapter.js'
import { EthAdapter } from './EthAdapter.js'
import { BtcAdapter } from './BtcAdapter.js'
import { XrpAdapter } from './XrpAdapter.js'

const adapters: Record<Chain, ChainAdapter> = {
  eth: new EthAdapter(),
  btc: new BtcAdapter(),
  xrp: new XrpAdapter(),
}

export function getAdapter(chain: Chain): ChainAdapter {
  return adapters[chain]
}