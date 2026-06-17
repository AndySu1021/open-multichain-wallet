import { randomBytes } from 'node:crypto'
import type { Chain } from '@fox-wallet/shared'
import type { KeyManager } from './KeyManager.js'

function mockEthAddress(): string {
  return '0x' + randomBytes(20).toString('hex')
}

function mockBtcAddress(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const suffix = Array.from({ length: 38 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return 'tb1q' + suffix
}

function mockXrpAddress(): string {
  const chars = 'rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz'
  const suffix = Array.from({ length: 29 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return 'r' + suffix
}

export class MockKeyManager implements KeyManager {
  async createWallet(_userId: string, chain: Chain) {
    const address =
      chain === 'eth' ? mockEthAddress() : chain === 'btc' ? mockBtcAddress() : mockXrpAddress()
    return { chain, address }
  }

  async getAddress(_userId: string, _chain: Chain) {
    return null
  }

  async signTransaction(_userId: string, _chain: Chain, _rawTx: unknown) {
    return '0x' + randomBytes(65).toString('hex')
  }
}