import { prisma } from '../db/client.js'
import { env } from '../config/env.js'
import { providerRegistry } from '../price/registry.js'
import type { QuotePair } from '../price/PriceProvider.js'

async function syncOnce(): Promise<void> {
  const rows = await prisma.quotation.findMany({
    where: { provider: { not: null } },
    include: {
      symbol:      { select: { name: true } },
      quoteSymbol: { select: { name: true } },
    },
  })

  // Group by provider name
  const groups = new Map<string, QuotePair[]>()
  for (const row of rows) {
    const providerName = row.provider!
    if (!groups.has(providerName)) groups.set(providerName, [])
    groups.get(providerName)!.push({
      symbolId:       row.symbolId,
      quoteSymbolId:  row.quoteSymbolId,
      symbolName:     row.symbol.name,
      quoteSymbolName: row.quoteSymbol.name,
    })
  }

  const updates: ReturnType<typeof prisma.quotation.update>[] = []

  for (const [providerName, pairs] of groups) {
    const provider = providerRegistry[providerName]
    if (!provider) {
      console.warn(`[quoteSync] unknown provider: ${providerName}`)
      continue
    }

    let results
    try {
      results = await provider.fetchPrices(pairs)
    } catch (err) {
      console.error(`[quoteSync] ${providerName} fetchPrices failed:`, err)
      continue
    }

    for (const r of results) {
      updates.push(
        prisma.quotation.update({
          where: { symbolId_quoteSymbolId: { symbolId: r.symbolId, quoteSymbolId: r.quoteSymbolId } },
          data:  { price: r.price },
        }),
      )
    }
  }

  if (updates.length > 0) {
    await prisma.$transaction(updates)
    console.log(`[quoteSync] updated ${updates.length} quotations`)
  }
}

let timer: ReturnType<typeof setInterval> | null = null

export function startQuoteSync(): void {
  void syncOnce()
  timer = setInterval(() => void syncOnce(), env.QUOTE_SYNC_INTERVAL_MS)
  console.log(`[quoteSync] started, interval ${env.QUOTE_SYNC_INTERVAL_MS}ms`)
}

export function stopQuoteSync(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}