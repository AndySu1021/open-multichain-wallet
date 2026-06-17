import { create } from 'zustand'
import type { SendInput, FeeEstimate } from '@fox-wallet/shared'

interface PendingTxState {
  form: SendInput | null
  fee: FeeEstimate | null
  symbolName: string | null
  networkName: string | null
  set: (form: SendInput, fee: FeeEstimate, symbolName: string, networkName: string) => void
  clear: () => void
}

export const usePendingTx = create<PendingTxState>((set) => ({
  form: null,
  fee: null,
  symbolName: null,
  networkName: null,
  set: (form, fee, symbolName, networkName) => set({ form, fee, symbolName, networkName }),
  clear: () => set({ form: null, fee: null, symbolName: null, networkName: null }),
}))