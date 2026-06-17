import { z } from 'zod'

const ChainSchema = z.enum(['eth', 'btc', 'xrp', 'bsc'])
const AssetSymbolSchema = z.enum(['BTC', 'ETH', 'USDC', 'USDT', 'XRP', 'BNB'])

export const SendSchema = z.object({
  chain: ChainSchema,
  toAddress: z.string().min(1),
  asset: AssetSymbolSchema,
  amount: z.string().regex(/^\d+(\.\d+)?$/, 'Invalid amount'),
})

export const EstimateFeeSchema = SendSchema

export const GetHistorySchema = z.object({
  networkId: z.coerce.number().int().positive().optional(),
  symbolId: z.coerce.number().int().positive().optional(),
  type: z.coerce.number().int().min(1).max(2).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export type SendInput = z.infer<typeof SendSchema>