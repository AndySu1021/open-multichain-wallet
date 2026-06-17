import type { Chain, Address } from '@fox-wallet/shared'

export interface KeyManager {
  createWallet(userId: string, chain: Chain): Promise<Address>
  getAddress(userId: string, chain: Chain): Promise<string | null>
  signTransaction(userId: string, chain: Chain, rawTx: unknown): Promise<string>
}