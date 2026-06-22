import {
  createPublicClient,
  webSocket,
  http,
  parseAbiItem,
  formatEther,
  formatUnits,
  type Block,
  type Address,
  type Chain,
  type PublicClient,
} from 'viem'
import {
  mainnet,
  sepolia,
  holesky,
  bsc,
  bscTestnet,
} from 'viem/chains'
import { prisma } from '../db/client.js'

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
)

// Add entries here when supporting additional EVM chains.
const CHAIN_MAP: Record<number, Chain> = {
  1:        mainnet,
  11155111: sepolia,
  17000:    holesky,
  56:       bsc,
  97:       bscTestnet,
}

function getViemChain(evmChainId: number): Chain {
  const chain = CHAIN_MAP[evmChainId]
  if (!chain) throw new Error(`Unsupported EVM chain ID: ${evmChainId}`)
  return chain
}

interface Erc20Asset {
  address: Address
  symbolId: number
  decimals: number
}

interface SyncConfig {
  networkId: number
  confirmationBlocks: number
  catchupBlocks: number
  nativeSymbolId: number
  erc20Assets: Erc20Asset[]
  wsClient: PublicClient
  httpClient: PublicClient
}

export class EthBlockSync {
  private config!: SyncConfig
  private lastBlockAt = Date.now()
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private fallbackTimer: ReturnType<typeof setInterval> | null = null
  private unwatch: (() => void) | null = null
  private fallbackActive = false

  constructor(private readonly networkId: number) {}

  async start(): Promise<void> {
    this.config = await this.loadConfig()
    const { networkId, confirmationBlocks, catchupBlocks, wsClient, httpClient } = this.config
    const tag = `[EthSync:${networkId}]`

    const currentBlock = await httpClient.getBlockNumber()
    const cursor = await prisma.blockCursor.findUnique({ where: { networkId } })
    const startBlock = cursor
      ? cursor.blockNumber + 1n
      : currentBlock - BigInt(catchupBlocks)

    if (startBlock <= currentBlock) {
      console.log(`${tag} catching up blocks ${startBlock}–${currentBlock}`)
      for (let n = startBlock; n <= currentBlock; n++) {
        await this.fetchWithRetry(n)
        if (n < currentBlock) await sleep(250) // throttle to stay within free-tier rate limits
      }
    }

    this.unwatch = wsClient.watchBlocks({
      includeTransactions: true,
      onBlock: (block) => {
        this.lastBlockAt = Date.now()
        if (this.fallbackActive) this.stopFallback()
        void this.processBlock(block)
      },
      onError: (err) => console.error(`${tag} WS error:`, err),
    })

    this.heartbeatTimer = setInterval(() => {
      if (Date.now() - this.lastBlockAt > 90_000 && !this.fallbackActive) {
        console.warn(`${tag} no block for 90s, activating HTTP fallback`)
        this.startFallback()
      }
    }, 30_000)

    console.log(`${tag} started (confirmations=${confirmationBlocks})`)
  }

  private async loadConfig(): Promise<SyncConfig> {
    const network = await prisma.network.findUniqueOrThrow({
      where: { id: this.networkId },
    })

    if (!network.syncEnabled)  throw new Error(`[EthSync:${this.networkId}] sync_enabled=false`)
    if (!network.nodeWsUrl)    throw new Error(`[EthSync:${this.networkId}] node_ws_url not set`)
    if (!network.nodeHttpUrl)  throw new Error(`[EthSync:${this.networkId}] node_http_url not set`)
    if (!network.evmChainId)   throw new Error(`[EthSync:${this.networkId}] evm_chain_id not set`)

    const viemChain = getViemChain(network.evmChainId)

    const wsClient = createPublicClient({
      chain: viemChain,
      transport: webSocket(network.nodeWsUrl, {
        reconnect: { delay: 1000, attempts: Infinity },
      }),
    }) as PublicClient

    const httpClient = createPublicClient({
      chain: viemChain,
      transport: http(network.nodeHttpUrl),
    }) as PublicClient

    const [nativeAsset, erc20Assets] = await Promise.all([
      prisma.asset.findFirst({
        where: { networkId: this.networkId, contractAddress: null, status: 1 },
      }),
      prisma.asset.findMany({
        where: { networkId: this.networkId, contractAddress: { not: null }, status: 1 },
      }),
    ])

    return {
      networkId: this.networkId,
      confirmationBlocks: network.confirmationBlocks,
      catchupBlocks: network.catchupBlocks,
      nativeSymbolId: nativeAsset?.symbolId ?? 0,
      erc20Assets: erc20Assets.map((a) => ({
        address: a.contractAddress! as Address,
        symbolId: a.symbolId,
        decimals: a.decimals,
      })),
      wsClient,
      httpClient,
    }
  }

  private startFallback(): void {
    const { networkId, httpClient } = this.config
    this.fallbackActive = true
    this.fallbackTimer = setInterval(async () => {
      try {
        const cursor = await prisma.blockCursor.findUnique({ where: { networkId } })
        const latest = await httpClient.getBlockNumber()
        const from = cursor ? cursor.blockNumber + 1n : latest
        for (let n = from; n <= latest; n++) {
          await this.fetchAndProcess(n)
        }
      } catch (err) {
        console.error(`[EthSync:${networkId}] fallback error:`, err)
      }
    }, 15_000)
  }

  private stopFallback(): void {
    this.fallbackActive = false
    if (this.fallbackTimer) {
      clearInterval(this.fallbackTimer)
      this.fallbackTimer = null
    }
  }

  private async fetchWithRetry(blockNumber: bigint, maxAttempts = 6): Promise<void> {
    let delay = 1_000
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.fetchAndProcess(blockNumber)
        return
      } catch (err: unknown) {
        const status = (err as { status?: number }).status
        if (status === 429 && attempt < maxAttempts) {
          console.warn(
            `[EthSync:${this.config.networkId}] rate limited (429), retrying in ${delay}ms (attempt ${attempt}/${maxAttempts})`,
          )
          await sleep(delay)
          delay = Math.min(delay * 2, 30_000)
        } else {
          throw err
        }
      }
    }
  }

  private async fetchAndProcess(blockNumber: bigint): Promise<void> {
    const block = await this.config.httpClient.getBlock({
      blockNumber,
      includeTransactions: true,
    })
    await this.processBlock(block)
  }

  private async processBlock(block: Block<bigint, true>): Promise<void> {
    if (block.number === null || !block.hash) return
    const { networkId, confirmationBlocks, nativeSymbolId, erc20Assets, httpClient } = this.config

    // Reorg detection
    const cursor = await prisma.blockCursor.findUnique({ where: { networkId } })
    if (
      cursor &&
      cursor.blockNumber === block.number - 1n &&
      cursor.blockHash !== block.parentHash
    ) {
      await this.handleReorg(block.number - 1n)
      await this.fetchAndProcess(block.number)
      return
    }

    // Load member addresses for this block
    const wallets = await prisma.walletAddress.findMany({ where: { networkId } })
    if (wallets.length === 0) {
      await this.saveCursor(block.number, block.hash)
      return
    }
    const memberMap = new Map(wallets.map((w) => [w.address.toLowerCase(), w]))

    // Native coin transfers (ETH, BNB, …)
    for (const tx of block.transactions) {
      if (!tx.to || tx.value === 0n) continue
      const wallet = memberMap.get(tx.to.toLowerCase())
      if (!wallet) continue
      await this.upsertReceiveTx({
        txHash: tx.hash,
        userId: wallet.userId,
        symbolId: nativeSymbolId,
        fromAddress: tx.from,
        toAddress: tx.to,
        amount: formatEther(tx.value),
        blockNumber: block.number,
        blockHash: block.hash,
      })
    }

    // ERC20 Transfer events (loaded from DB)
    for (const asset of erc20Assets) {
      const logs = await httpClient.getLogs({
        address: asset.address,
        event: TRANSFER_EVENT,
        blockHash: block.hash,
      })
      for (const log of logs) {
        if (!log.args.to || !log.args.from || log.args.value === undefined) continue
        const wallet = memberMap.get(log.args.to.toLowerCase())
        if (!wallet) continue
        await this.upsertReceiveTx({
          txHash: log.transactionHash!,
          userId: wallet.userId,
          symbolId: asset.symbolId,
          fromAddress: log.args.from,
          toAddress: log.args.to,
          amount: formatUnits(log.args.value, asset.decimals),
          blockNumber: block.number,
          blockHash: block.hash,
        })
      }
    }

    // Track pending outgoing transactions that landed in this block
    await this.trackPendingSends(block)

    // Upgrade pending transactions to confirmed once N blocks have passed.
    // For receives (type 2) we also credit the amount to UserAsset.balance.
    const confirmThreshold = block.number - BigInt(confirmationBlocks)
    const pendingConfirmFilter = {
      networkId,
      status: 0,
      blockNumber: { not: null, lte: confirmThreshold },
    } as const

    // Fetch pending receives before the status update so we know what to credit.
    const toCredit = await prisma.transaction.findMany({
      where: { ...pendingConfirmFilter, type: 2 },
      select: { userId: true, symbolId: true, amount: true },
    })

    const upgraded = await prisma.transaction.updateMany({
      where: pendingConfirmFilter,
      data: { status: 1 },
    })

    if (upgraded.count > 0) {
      console.log(`[EthSync:${networkId}] confirmed ${upgraded.count} tx(s) at block ${block.number}`)

      for (const tx of toCredit) {
        await prisma.userAsset.upsert({
          where: {
            userId_networkId_symbolId: { userId: tx.userId, networkId, symbolId: tx.symbolId },
          },
          create: { userId: tx.userId, networkId, symbolId: tx.symbolId, balance: tx.amount },
          update: { balance: { increment: tx.amount } },
        })
        console.log(`[EthSync:${networkId}] credited ${tx.amount} → user ${tx.userId} symbolId=${tx.symbolId}`)
      }
    }

    await this.saveCursor(block.number, block.hash)
    console.log(`[EthSync:${networkId}] block ${block.number} processed`)
  }

  private async handleReorg(orphanedBlock: bigint): Promise<void> {
    const { networkId, httpClient } = this.config
    console.warn(`[EthSync:${networkId}] reorg: tracing back from block ${orphanedBlock}`)

    const MAX_DEPTH = 32n
    let ancestorNumber = orphanedBlock

    while (ancestorNumber > 0n && orphanedBlock - ancestorNumber < MAX_DEPTH) {
      const chainBlock = await httpClient.getBlock({ blockNumber: ancestorNumber })
      if (!chainBlock.hash) break

      const rolled = await prisma.transaction.updateMany({
        where: {
          networkId,
          blockNumber: ancestorNumber,
          blockHash: { not: chainBlock.hash },
          status: { in: [0, 1] },
        },
        data: { status: -1, blockNumber: null, blockHash: null },
      })

      if (rolled.count === 0) break
      console.warn(`[EthSync:${networkId}] rolled back ${rolled.count} tx(s) at block ${ancestorNumber}`)
      ancestorNumber--
    }

    const ancestorBlock = await httpClient.getBlock({ blockNumber: ancestorNumber })
    if (ancestorBlock.hash) {
      await this.saveCursor(ancestorNumber, ancestorBlock.hash)
      console.warn(`[EthSync:${networkId}] reorg resolved, cursor reset to block ${ancestorNumber}`)
    }
  }

  private async trackPendingSends(block: Block<bigint, true>): Promise<void> {
    if (block.number === null || !block.hash) return
    const { networkId, httpClient } = this.config

    const pendingSends = await prisma.transaction.findMany({
      where: { networkId, type: 1, status: 0, blockNumber: null },
      select: { id: true, txHash: true },
    })
    if (pendingSends.length === 0) return

    const blockTxHashes = new Set(block.transactions.map((tx) => tx.hash.toLowerCase()))
    const landed = pendingSends.filter((tx) => blockTxHashes.has(tx.txHash.toLowerCase()))
    if (landed.length === 0) return

    for (const tx of landed) {
      const receipt = await httpClient.getTransactionReceipt({
        hash: tx.txHash as `0x${string}`,
      })
      const failed = receipt.status === 'reverted'

      await prisma.transaction.update({
        where: { id: tx.id },
        data: { blockNumber: block.number, blockHash: block.hash, blockTime: new Date(), status: failed ? 2 : 0 },
      })

      console.log(
        `[EthSync:${networkId}] outgoing tx ${tx.txHash} landed in block ${block.number} (${failed ? 'failed' : 'pending confirmation'})`,
      )
    }
  }

  private async upsertReceiveTx(params: {
    txHash: string
    userId: bigint
    symbolId: number
    fromAddress: string
    toAddress: string
    amount: string
    blockNumber: bigint
    blockHash: string
  }): Promise<void> {
    const { networkId } = this.config

    const existing = await prisma.transaction.findFirst({
      where: { txHash: params.txHash, networkId, userId: params.userId, type: 2 },
    })
    if (existing) {
      if (existing.blockNumber === null) {
        await prisma.transaction.update({
          where: { id: existing.id },
          data: { blockNumber: params.blockNumber, blockHash: params.blockHash, blockTime: new Date() },
        })
      }
      return
    }

    await prisma.transaction.create({
      data: {
        userId: params.userId,
        networkId,
        symbolId: params.symbolId,
        type: 2,
        fromAddress: params.fromAddress,
        toAddress: params.toAddress,
        amount: params.amount,
        txHash: params.txHash,
        status: 0,
        blockNumber: params.blockNumber,
        blockHash: params.blockHash,
        blockTime: new Date(),
      },
    })

    await prisma.userAsset.upsert({
      where: {
        userId_networkId_symbolId: {
          userId: params.userId,
          networkId,
          symbolId: params.symbolId,
        },
      },
      create: { userId: params.userId, networkId, symbolId: params.symbolId },
      update: {},
    })

    console.log(
      `[EthSync:${networkId}] receive: ${params.txHash} → ${params.toAddress} (${params.amount})`,
    )
  }

  private async saveCursor(blockNumber: bigint, blockHash: string): Promise<void> {
    const { networkId } = this.config
    await prisma.blockCursor.upsert({
      where: { networkId },
      create: { networkId, blockNumber, blockHash },
      update: { blockNumber, blockHash },
    })
  }

  stop(): void {
    this.unwatch?.()
    this.unwatch = null
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    this.stopFallback()
    console.log(`[EthSync:${this.networkId}] stopped`)
  }
}
