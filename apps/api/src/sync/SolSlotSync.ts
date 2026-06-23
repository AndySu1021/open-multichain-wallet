import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { prisma } from '../db/client.js'

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const POLL_INTERVAL = 5_000
const SIGS_PER_ADDRESS = 50
const INTER_ADDRESS_DELAY = 200
const INTER_TX_DELAY = 100

export class SolSlotSync {
  private connection!: Connection
  private networkId: number
  private confirmationBlocks!: number
  private nativeSymbolId!: number
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private polling = false
  private stopped = false

  constructor(networkId: number) {
    this.networkId = networkId
  }

  async start(): Promise<void> {
    const tag = this.tag()
    await this.loadConfig()

    const cursor = await prisma.blockCursor.findUnique({ where: { networkId: this.networkId } })
    if (cursor) {
      console.log(`${tag} resuming from slot ${cursor.blockNumber}, sig ${cursor.blockHash}`)
    } else {
      console.log(`${tag} no cursor found, will start from latest transactions`)
    }

    await this.poll()

    this.pollTimer = setInterval(() => {
      if (!this.polling && !this.stopped) void this.poll()
    }, POLL_INTERVAL)

    console.log(`${tag} started (poll=${POLL_INTERVAL}ms, confirmations=${this.confirmationBlocks})`)
  }

  stop(): void {
    this.stopped = true
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    console.log(`${this.tag()} stopped`)
  }

  private async loadConfig(): Promise<void> {
    const network = await prisma.network.findUniqueOrThrow({ where: { id: this.networkId } })

    if (!network.syncEnabled) throw new Error(`${this.tag()} sync_enabled=false`)
    if (!network.nodeHttpUrl) throw new Error(`${this.tag()} node_http_url not set`)

    this.connection = new Connection(network.nodeHttpUrl, 'confirmed')
    this.confirmationBlocks = network.confirmationBlocks

    const nativeAsset = await prisma.asset.findFirst({
      where: { networkId: this.networkId, contractAddress: null, status: 1 },
    })
    this.nativeSymbolId = nativeAsset?.symbolId ?? 0
  }

  private async poll(): Promise<void> {
    if (this.polling) return
    this.polling = true
    const tag = this.tag()

    try {
      const wallets = await prisma.walletAddress.findMany({ where: { networkId: this.networkId } })
      if (wallets.length === 0) {
        this.polling = false
        return
      }

      const cursor = await prisma.blockCursor.findUnique({ where: { networkId: this.networkId } })
      const lastSignature = cursor?.blockHash ?? undefined

      let latestSlot = 0n
      let latestSig: string | null = null

      for (const wallet of wallets) {
        const result = await this.processAddress(wallet.address, wallet.userId, lastSignature)
        if (result) {
          if (result.slot > latestSlot) {
            latestSlot = result.slot
            latestSig = result.signature
          }
        }
        if (wallets.length > 1) await sleep(INTER_ADDRESS_DELAY)
      }

      await this.trackPendingSends()
      await this.upgradeConfirmations()

      if (latestSig && latestSlot > 0n) {
        await this.saveCursor(latestSlot, latestSig)
      }
    } catch (err: unknown) {
      const status = (err as { status?: number }).status
      if (status === 429) {
        console.warn(`${tag} rate limited (429), backing off 10s`)
        await sleep(10_000)
      } else {
        console.error(`${tag} poll error:`, err)
      }
    } finally {
      this.polling = false
    }
  }

  private async processAddress(
    address: string,
    userId: bigint,
    lastSignature: string | undefined,
  ): Promise<{ slot: bigint; signature: string } | null> {
    const pubkey = new PublicKey(address)

    const opts: { limit: number; until?: string } = { limit: SIGS_PER_ADDRESS }
    if (lastSignature) opts.until = lastSignature
    const sigs = await this.connection.getSignaturesForAddress(pubkey, opts)

    if (sigs.length === 0) return null

    let maxSlot = 0n
    let maxSig: string | null = null

    for (const sigInfo of sigs) {
      if (sigInfo.err) continue

      const slot = BigInt(sigInfo.slot)
      if (slot > maxSlot) {
        maxSlot = slot
        maxSig = sigInfo.signature
      }

      await this.processTransaction(sigInfo.signature, userId, address, slot)
      await sleep(INTER_TX_DELAY)
    }

    return maxSig ? { slot: maxSlot, signature: maxSig } : null
  }

  private async processTransaction(
    signature: string,
    userId: bigint,
    memberAddress: string,
    slot: bigint,
  ): Promise<void> {
    const existing = await prisma.transaction.findFirst({
      where: { txHash: signature, networkId: this.networkId, userId, type: 2 },
    })
    if (existing) return

    const tx = await this.connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    })
    if (!tx || !tx.meta || tx.meta.err) return

    const accountKeys = tx.transaction.message.getAccountKeys()
    const preBalances = tx.meta.preBalances
    const postBalances = tx.meta.postBalances
    const fee = tx.meta.fee

    for (let i = 0; i < accountKeys.length; i++) {
      const key = accountKeys.get(i)?.toBase58()
      if (key !== memberAddress) continue

      const pre = preBalances[i]
      const post = postBalances[i]
      if (pre === undefined || post === undefined) continue

      let diff = post - pre

      // For fee payer (index 0), add back fee to get actual received amount
      if (i === 0) diff += fee

      if (diff <= 0) continue

      const amount = (diff / LAMPORTS_PER_SOL).toFixed(9)
      const fromAddress = accountKeys.get(0)?.toBase58() ?? ''

      await prisma.transaction.create({
        data: {
          userId,
          networkId: this.networkId,
          symbolId: this.nativeSymbolId,
          type: 2,
          fromAddress,
          toAddress: memberAddress,
          amount,
          txHash: signature,
          status: 0,
          blockNumber: slot,
          blockHash: signature,
          blockTime: tx.blockTime ? new Date(tx.blockTime * 1000) : new Date(),
        },
      })

      await prisma.userAsset.upsert({
        where: {
          userId_networkId_symbolId: {
            userId,
            networkId: this.networkId,
            symbolId: this.nativeSymbolId,
          },
        },
        create: { userId, networkId: this.networkId, symbolId: this.nativeSymbolId },
        update: {},
      })

      console.log(
        `${this.tag()} receive: ${signature} → ${memberAddress} (${amount} SOL)`,
      )
      break
    }
  }

  private async trackPendingSends(): Promise<void> {
    const pendingSends = await prisma.transaction.findMany({
      where: { networkId: this.networkId, type: 1, status: 0, blockNumber: null },
      select: { id: true, txHash: true },
    })
    if (pendingSends.length === 0) return

    const signatures = pendingSends.map((tx) => tx.txHash)
    const statuses = await this.connection.getSignatureStatuses(signatures)

    for (let i = 0; i < pendingSends.length; i++) {
      const result = statuses.value[i]
      const pending = pendingSends[i]
      if (!result || !pending) continue

      const failed = result.err !== null
      const slot = BigInt(result.slot)

      await prisma.transaction.update({
        where: { id: pending.id },
        data: {
          blockNumber: slot,
          blockHash: pending.txHash,
          blockTime: new Date(),
          status: failed ? 2 : 0,
        },
      })

      console.log(
        `${this.tag()} send tracked: ${pending.txHash} slot=${slot} (${failed ? 'failed' : 'pending confirmation'})`,
      )
    }
  }

  private async upgradeConfirmations(): Promise<void> {
    const finalizedSlot = await this.connection.getSlot('finalized')
    const threshold = BigInt(finalizedSlot)

    const pendingConfirmFilter = {
      networkId: this.networkId,
      status: 0,
      blockNumber: { not: null, lte: threshold },
    } as const

    const toCredit = await prisma.transaction.findMany({
      where: { ...pendingConfirmFilter, type: 2 },
      select: { userId: true, symbolId: true, amount: true },
    })

    const upgraded = await prisma.transaction.updateMany({
      where: pendingConfirmFilter,
      data: { status: 1 },
    })

    if (upgraded.count > 0) {
      console.log(`${this.tag()} confirmed ${upgraded.count} tx(s) at finalized slot ${finalizedSlot}`)

      for (const tx of toCredit) {
        await prisma.userAsset.upsert({
          where: {
            userId_networkId_symbolId: { userId: tx.userId, networkId: this.networkId, symbolId: tx.symbolId },
          },
          create: { userId: tx.userId, networkId: this.networkId, symbolId: tx.symbolId, balance: tx.amount },
          update: { balance: { increment: tx.amount } },
        })
        console.log(`${this.tag()} credited ${tx.amount} → user ${tx.userId} symbolId=${tx.symbolId}`)
      }
    }
  }

  private async saveCursor(slot: bigint, signature: string): Promise<void> {
    await prisma.blockCursor.upsert({
      where: { networkId: this.networkId },
      create: { networkId: this.networkId, blockNumber: slot, blockHash: signature },
      update: { blockNumber: slot, blockHash: signature },
    })
  }

  private tag(): string {
    return `[SolSync:${this.networkId}]`
  }
}