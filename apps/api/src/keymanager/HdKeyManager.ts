import { generateMnemonic, mnemonicToSeedSync, mnemonicToEntropy } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import { HDKey } from '@scure/bip32'
import { privateKeyToAddress } from 'viem/accounts'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { ed25519 } from '@noble/curves/ed25519.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { sha512 } from '@noble/hashes/sha2.js'
import { ripemd160 } from '@noble/hashes/legacy.js'
import { blake2b } from '@noble/hashes/blake2.js'
import { pbkdf2 } from '@noble/hashes/pbkdf2.js'
import { bech32, base58, base58xrp } from '@scure/base'
import { createHmac, randomBytes } from 'node:crypto'
import { encryptSeed, decryptSeed } from '../lib/crypto.js'
import { prisma } from '../db/client.js'
import type { KeyManager } from './KeyManager.js'
import type { Chain, Address } from '@fox-wallet/shared'

const CHAIN_TO_PROTOCOL: Record<Chain, string> = {
  eth: 'ERC20', btc: 'BTC', xrp: 'XRP', bsc: 'BEP20', sol: 'SOL', ada: 'ADA',
}

// ed25519 group order (little-endian bytes converted to BigInt for scalar reduction)
const ED25519_ORDER = 2n ** 252n + 27742317777372353535851937790883648493n

// ─── secp256k1 helpers ────────────────────────────────────────────────────────

function toEthAddress(privateKey: Uint8Array): string {
  return privateKeyToAddress(`0x${Buffer.from(privateKey).toString('hex')}` as `0x${string}`)
}

function toBtcTestnetAddress(privateKey: Uint8Array): string {
  const pubkey = secp256k1.getPublicKey(privateKey, true)
  const hash160 = ripemd160(sha256(pubkey))
  const words = bech32.toWords(hash160)
  return bech32.encode('tb', [0, ...words])
}

function toXrpAddress(privateKey: Uint8Array): string {
  const pubkey = secp256k1.getPublicKey(privateKey, true)
  const accountId = ripemd160(sha256(pubkey))
  const prefixed = new Uint8Array([0x00, ...accountId])
  const checksum = sha256(sha256(prefixed)).subarray(0, 4)
  return base58xrp.encode(new Uint8Array([...prefixed, ...checksum]))
}

// ─── ed25519 SLIP-0010 (SOL) ──────────────────────────────────────────────────

function slip10DeriveEd25519(seed: Uint8Array, path: string): Uint8Array {
  const hmac512 = (key: Uint8Array, data: Uint8Array): Buffer =>
    createHmac('sha512', key).update(data).digest()

  const masterI = hmac512(Buffer.from('ed25519 seed', 'utf8'), Buffer.from(seed))
  let key = Buffer.from(masterI.subarray(0, 32))
  let chainCode = Buffer.from(masterI.subarray(32, 64))

  for (const seg of path.replace(/^m\//, '').split('/')) {
    const hardened = seg.endsWith("'")
    const idx = (parseInt(hardened ? seg.slice(0, -1) : seg, 10) + (hardened ? 0x80000000 : 0)) >>> 0
    const data = Buffer.alloc(37)
    data[0] = 0x00
    key.copy(data, 1)
    data.writeUInt32BE(idx, 33)
    const childI = hmac512(chainCode, data)
    key = Buffer.from(childI.subarray(0, 32))
    chainCode = Buffer.from(childI.subarray(32, 64))
  }
  return key
}

function toSolAddress(privateKey: Uint8Array): string {
  const pubkey = ed25519.getPublicKey(privateKey)
  return base58.encode(pubkey)
}

// ─── BIP32-Ed25519 Icarus (ADA) ───────────────────────────────────────────────

function bytesToBigIntLE(bytes: Uint8Array): bigint {
  return BigInt('0x' + Buffer.from(bytes).reverse().toString('hex'))
}

function bigIntToLEBytes(n: bigint, len: number): Uint8Array {
  return Buffer.from(n.toString(16).padStart(len * 2, '0'), 'hex').reverse()
}

function cardanoRootKey(entropy: Uint8Array): {
  kL: Uint8Array; kR: Uint8Array; chainCode: Uint8Array
} {
  // CIP-0003 Icarus: PBKDF2-HMAC-SHA512(password="", salt=entropy, iter=4096, len=96)
  const root = pbkdf2(sha512, new Uint8Array(0), entropy, { c: 4096, dkLen: 96 })
  const kL = new Uint8Array(root.slice(0, 32))
  const kR = new Uint8Array(root.slice(32, 64))
  const chainCode = new Uint8Array(root.slice(64, 96))

  // Bit tweak kL for ed25519 scalar validity
  kL[0]! &= 0xF8  // clear bits 0, 1, 2 (divisible by 8)
  kL[31]! &= 0x1F // clear bits 5, 6, 7
  kL[31]! |= 0x40 // set bit 6

  if ((kL[31]! & 0x20) !== 0) throw new Error('Cardano root key generation failed')
  return { kL, kR, chainCode }
}

function cardanoPublicKey(kL: Uint8Array): Uint8Array {
  // kL is a clamped scalar in little-endian; reduce mod ed25519 order before multiply
  const scalar = bytesToBigIntLE(kL) % ED25519_ORDER
  return ed25519.Point.BASE.multiply(scalar).toBytes()
}

function cardanoChildKey(
  kL: Uint8Array, kR: Uint8Array, chainCode: Uint8Array, index: number,
): { kL: Uint8Array; kR: Uint8Array; chainCode: Uint8Array } {
  // Cardano stores index as little-endian (unlike SLIP-0010 which uses big-endian)
  const indexLE = Buffer.alloc(4)
  indexLE.writeUInt32LE(index, 0)

  const hmac512 = (key: Uint8Array, data: Uint8Array): Buffer =>
    createHmac('sha512', key).update(data).digest()

  let Z: Buffer, I: Buffer
  if (index >= 0x80000000) {
    Z = hmac512(chainCode, Buffer.concat([Buffer.from([0x00]), kL, kR, indexLE]))
    I = hmac512(chainCode, Buffer.concat([Buffer.from([0x01]), kL, kR, indexLE]))
  } else {
    const pubkey = cardanoPublicKey(kL)
    Z = hmac512(chainCode, Buffer.concat([Buffer.from([0x02]), pubkey, indexLE]))
    I = hmac512(chainCode, Buffer.concat([Buffer.from([0x03]), pubkey, indexLE]))
  }

  const zL = Z.subarray(0, 28)
  const zR = Z.subarray(32, 64)
  const childChainCode = I.subarray(32, 64)

  // childKL = 8 * zL + kL  (256-bit little-endian)
  const childKLBig = bytesToBigIntLE(zL) * 8n + bytesToBigIntLE(kL)
  // childKR = (zR + kR) mod 2^256
  const childKRBig = (bytesToBigIntLE(zR) + bytesToBigIntLE(kR)) % (2n ** 256n)

  return {
    kL: bigIntToLEBytes(childKLBig, 32),
    kR: bigIntToLEBytes(childKRBig, 32),
    chainCode: new Uint8Array(childChainCode),
  }
}

function cardanoDerivePath(
  kL: Uint8Array, kR: Uint8Array, chainCode: Uint8Array, path: string,
): { kL: Uint8Array; kR: Uint8Array; chainCode: Uint8Array } {
  let state = { kL, kR, chainCode }
  for (const seg of path.replace(/^m\//, '').split('/')) {
    const hardened = seg.endsWith("'")
    const idx = (parseInt(hardened ? seg.slice(0, -1) : seg, 10) + (hardened ? 0x80000000 : 0)) >>> 0
    state = cardanoChildKey(state.kL, state.kR, state.chainCode, idx)
  }
  return state
}

function toAdaAddress(entropy: Uint8Array, derivationPath: string): string {
  const { kL, kR, chainCode } = cardanoRootKey(entropy)
  const { kL: paymentKL } = cardanoDerivePath(kL, kR, chainCode, derivationPath)

  const pubkey = cardanoPublicKey(paymentKL)
  const paymentKeyHash = blake2b(pubkey, { dkLen: 28 }) // BLAKE2b-224

  // Enterprise address, testnet (header 0x60 = type 6 | network 0)
  const addrBytes = new Uint8Array([0x60, ...paymentKeyHash])
  return bech32.encode('addr_test', bech32.toWords(addrBytes), false)
}

// ─── HdKeyManager ─────────────────────────────────────────────────────────────

export class HdKeyManager implements KeyManager {
  private async getDerivationConfig(chain: Chain): Promise<{ path: string; curve: string }> {
    const network = await prisma.network.findFirstOrThrow({
      where: { protocol: CHAIN_TO_PROTOCOL[chain] },
      select: { hdDerivationPath: true, hdCurve: true },
    })
    if (!network.hdDerivationPath || !network.hdCurve) {
      throw new Error(`Network for chain '${chain}' is missing hd_derivation_path or hd_curve — run seed.sql`)
    }
    return { path: network.hdDerivationPath, curve: network.hdCurve }
  }

  // Returns the decrypted mnemonic, creating and persisting it if this user has none yet
  private async getOrCreateMnemonic(userId: bigint): Promise<string> {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { encryptedSeed: true },
    })
    if (user.encryptedSeed) return decryptSeed(user.encryptedSeed)
    const mnemonic = generateMnemonic(wordlist, 128) // 12 words
    await prisma.user.update({
      where: { id: userId },
      data: { encryptedSeed: encryptSeed(mnemonic) },
    })
    return mnemonic
  }

  private async getOrCreateSeed(userId: bigint): Promise<Uint8Array> {
    const mnemonic = await this.getOrCreateMnemonic(userId)
    return mnemonicToSeedSync(mnemonic)
  }

  private deriveSecp256k1Key(seed: Uint8Array, path: string): Uint8Array {
    const child = HDKey.fromMasterSeed(seed).derive(path)
    if (!child.privateKey) throw new Error('secp256k1 key derivation failed')
    return child.privateKey
  }

  private deriveAddress(chain: Chain, privateKey: Uint8Array, curve: string): string {
    if (curve === 'ed25519') {
      if (chain === 'sol') return toSolAddress(privateKey)
      throw new Error(`ed25519 address for chain '${chain}' must use a chain-specific derivation`)
    }
    if (chain === 'eth' || chain === 'bsc') return toEthAddress(privateKey)
    if (chain === 'btc') return toBtcTestnetAddress(privateKey)
    if (chain === 'xrp') return toXrpAddress(privateKey)
    throw new Error(`Unsupported chain: ${chain}`)
  }

  async createWallet(userId: string, chain: Chain): Promise<Address> {
    const { path, curve } = await this.getDerivationConfig(chain)
    const bigUserId = BigInt(userId)

    if (chain === 'ada') {
      // Cardano uses BIP32-Ed25519 Icarus from entropy, not from the BIP39 seed
      const mnemonic = await this.getOrCreateMnemonic(bigUserId)
      const entropy = mnemonicToEntropy(mnemonic, wordlist)
      const address = toAdaAddress(entropy, path)
      return { chain, address }
    }

    const seed = await this.getOrCreateSeed(bigUserId)
    const privateKey =
      curve === 'ed25519' ? slip10DeriveEd25519(seed, path) : this.deriveSecp256k1Key(seed, path)
    const address = this.deriveAddress(chain, privateKey, curve)
    return { chain, address }
  }

  async getAddress(userId: string, chain: Chain): Promise<string | null> {
    const network = await prisma.network.findFirst({
      where: { protocol: CHAIN_TO_PROTOCOL[chain] },
    })
    if (!network) return null
    const record = await prisma.walletAddress.findFirst({
      where: { userId: BigInt(userId), networkId: network.id },
    })
    return record?.address ?? null
  }

  async signTransaction(userId: string, chain: Chain, _rawTx: unknown): Promise<string> {
    // TODO Step 6: implement real signing once chain adapters produce real transactions.
    const { path, curve } = await this.getDerivationConfig(chain)
    const seed = await this.getOrCreateSeed(BigInt(userId))
    if (curve === 'secp256k1') {
      this.deriveSecp256k1Key(seed, path) // validate key derivation
    }
    return '0x' + Buffer.from(randomBytes(65)).toString('hex')
  }
}
