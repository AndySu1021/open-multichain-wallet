import { create } from 'zustand'
import type { SendInput, FeeEstimate } from '@fox-wallet/shared'

interface PendingTxState {
  form: SendInput | null
  fee: FeeEstimate | null
  set: (form: SendInput, fee: FeeEstimate) => void
  clear: () => void
}

export const usePendingTx = create<PendingTxState>((set) => ({
  form: null,
  fee: null,
  set: (form, fee) => set({ form, fee }),
  clear: () => set({ form: null, fee: null }),
}))