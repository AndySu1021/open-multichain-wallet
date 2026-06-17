import type { Chain } from '@fox-wallet/shared'
import type { ChainAdapter } from './ChainAdapter.js'
import { EthAdapter } from './EthAdapter.js'
import { BtcAdapter } from './BtcAdapter.js'
import { XrpAdapter } from './XrpAdapter.js'
import { BscAdapter } from './BscAdapter.js'
import { SolAdapter } from './SolAdapter.js'
import { AdaAdapter } from './AdaAdapter.js'

const adapters: Record<Chain, ChainAdapter> = {
  eth: new EthAdapter(),
  btc: new BtcAdapter(),
  xrp: new XrpAdapter(),
  bsc: new BscAdapter(),
  sol: new SolAdapter(),
  ada: new AdaAdapter(),
}

export function getAdapter(chain: Chain): ChainAdapter {
  return adapters[chain]
}