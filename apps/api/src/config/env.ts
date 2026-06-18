import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadDotenv } from 'dotenv'
import { z } from 'zod'

// Load .env before parsing process.env.
// Placing this here (inside env.ts itself) ensures dotenv runs
// before the Zod parse regardless of ES module evaluation order.
const __dirname = dirname(fileURLToPath(import.meta.url))
loadDotenv({ path: resolve(__dirname, '../../.env'), override: false })

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().url().optional(),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  QUOTE_SYNC_INTERVAL_MS: z.coerce.number().int().min(10_000).default(60_000),
  ETH_NODE_WS_URL: z.string().optional(),
  ETH_NODE_HTTP_URL: z.string().optional(),
  ETH_SYNC_ENABLED: z.string().default('false').transform((v) => v === 'true'),
  ETH_CATCHUP_BLOCKS: z.coerce.number().int().min(1).default(100),
})

export const env = EnvSchema.parse(process.env)