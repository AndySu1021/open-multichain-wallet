import {
  createPublicClient,
  http,
  parseEther,
  parseUnits,
  encodeFunctionData,
  formatEther,
  type PublicClient,
} from 'viem'
import { mainnet, sepolia, holesky, bsc, bscTestnet } from 'viem/chains'
import type { Chain as ViemChain } from 'viem'
import type { Balance, Transaction, SendParams, FeeEstimate, TxHash } from '@fox-wallet/shared'
import type { ChainAdapter } from './ChainAdapter.js'
import { prisma } from '../db/client.js'

const VIEM_CHAIN_MAP: Record<number, ViemChain> = {
  1: mainnet,
  11155111: sepolia,
  17000: holesky,
  56: bsc,
  97: bscTestnet,
}

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

// EIP-1559 unsigned transaction handed off to KeyManager for signing.
export interface EthUnsignedTx {
  to: `0x${string}`
  value: bigint
  data?: `0x${string}`
  nonce: number
  gas: bigint
  maxFeePerGas: bigint
  maxPriorityFeePerGas: bigint
  chainId: number
  type: 'eip1559'
}

export class EthAdapter implements ChainAdapter {
  readonly chain = 'eth' as const
  private _client: PublicClient | null = null

  // Lazily initialised from the network row so the DB URL is the single source of truth.
  private async getClient(): Promise<PublicClient> {
    if (this._client) return this._client
    const network = await prisma.network.findFirstOrThrow({
      where: { protocol: 'ERC20' },
      select: { evmChainId: true, nodeHttpUrl: true },
    })
    const viemChain = VIEM_CHAIN_MAP[network.evmChainId ?? 11155111] ?? sepolia
    this._client = createPublicClient({
      chain: viemChain,
      transport: http(network.nodeHttpUrl ?? undefined),
    })
    return this._client
  }

  async getBalance(address: string): Promise<Balance[]> {
    const client = await this.getClient()
    const addr = address as `0x${string}`
    const ethBalance = await client.getBalance({ address: addr }).catch(() => 0n)
    return [
      { chain: 'eth', asset: 'ETH', amount: formatEther(ethBalance), usdValue: '0', change24h: '0' },
    ]
  }

  async buildTransaction(params: SendParams): Promise<EthUnsignedTx> {
    const client = await this.getClient()
    const fromAddr = params.fromAddress as `0x${string}`
    const toAddr = params.toAddress as `0x${string}`

    const [nonce, fees] = await Promise.all([
      client.getTransactionCount({ address: fromAddr }),
      client.estimateFeesPerGas(),
    ])

    const maxFeePerGas = fees.maxFeePerGas ?? 20n * 10n ** 9n
    const maxPriorityFeePerGas = fees.maxPriorityFeePerGas ?? 2n * 10n ** 9n
    const chainId = client.chain?.id ?? sepolia.id

    if (params.asset === 'ETH') {
      const value = parseEther(params.amount)
      const gas = await client.estimateGas({ account: fromAddr, to: toAddr, value })
      return { to: toAddr, value, nonce, gas, maxFeePerGas, maxPriorityFeePerGas, chainId, type: 'eip1559' }
    }

    // ERC20 transfer — contractAddress and decimals supplied by the route from the asset row.
    const contractAddress = (params.contractAddress ?? '') as `0x${string}`
    const decimals = params.decimals ?? 6
    const data = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [toAddr, parseUnits(params.amount, decimals)],
    })
    const gas = await client.estimateGas({ account: fromAddr, to: contractAddress, data })
    return { to: contractAddress, value: 0n, data, nonce, gas, maxFeePerGas, maxPriorityFeePerGas, chainId, type: 'eip1559' }
  }

  async broadcastTransaction(signedTx: string): Promise<TxHash> {
    const client = await this.getClient()
    return client.sendRawTransaction({ serializedTransaction: signedTx as `0x${string}` })
  }

  async getTransactionHistory(_address: string, _page = 1, _limit = 20): Promise<Transaction[]> {
    return []
  }

  async getTransaction(hash: string): Promise<Transaction> {
    const client = await this.getClient()
    const tx = await client.getTransaction({ hash: hash as `0x${string}` }).catch(() => null)
    return {
      id: hash,
      networkId: 0,
      symbolId: 0,
      networkName: 'Ethereum',
      symbolName: 'ETH',
      networkProtocol: 'ERC20',
      type: 'send',
      amount: tx ? formatEther(tx.value) : '0',
      fromAddress: tx?.from ?? '',
      toAddress: tx?.to ?? '',
      txHash: hash,
      status: tx ? 'confirmed' : 'pending',
      createdAt: new Date().toISOString(),
    }
  }

  async estimateFee(params: SendParams): Promise<FeeEstimate> {
    try {
      const rawTx = await this.buildTransaction(params)
      const feeWei = rawTx.gas * rawTx.maxFeePerGas
      const feeEth = formatEther(feeWei)
      // Rough USD estimate; accurate price comes from the quotation system in DB.
      const ethPriceUsd = 3200
      const feeUsd = (parseFloat(feeEth) * ethPriceUsd).toFixed(2)
      return { fee: feeEth, feeUsd, estimatedTime: '~30s' }
    } catch {
      return { fee: '0.001', feeUsd: '3.20', estimatedTime: '~30s' }
    }
  }
}
