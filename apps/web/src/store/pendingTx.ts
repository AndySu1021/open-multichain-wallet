import { create } from 'zustand'
import type { SendInput, FeeEstimate, Chain } from '@fox-wallet/shared'

interface PendingTxState {
  form: SendInput | null
  fee: FeeEstimate | null
  symbolName: string | null
  networkName: string | null
  chain: Chain | null
  set: (form: SendInput, fee: FeeEstimate, symbolName: string, networkName: string, chain: Chain) => void
  clear: () => void
}

export const usePendingTx = create<PendingTxState>((set) => ({
  form: null,
  fee: null,
  symbolName: null,
  networkName: null,
  chain: null,
  set: (form, fee, symbolName, networkName, chain) => set({ form, fee, symbolName, networkName, chain }),
  clear: () => set({ form: null, fee: null, symbolName: null, networkName: null, chain: null }),
}))
