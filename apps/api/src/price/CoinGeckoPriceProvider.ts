import type { PriceProvider, QuotePair, PriceResult } from './PriceProvider.js'

const SYMBOL_TO_ID: Record<string, string> = {
  BTC:  'bitcoin',
  ETH:  'ethereum',
  XRP:  'ripple',
  BNB:  'binancecoin',
  USDT: 'tether',
  USDC: 'usd-coin',
}

const QUOTE_TO_VS: Record<string, string> = {
  USD:  'usd',
  USDT: 'usdt',
}

type CoinGeckoResponse = Record<string, Record<string, number>>

export class CoinGeckoPriceProvider implements PriceProvider {
  readonly name = 'coingecko'

  async fetchPrices(pairs: QuotePair[]): Promise<PriceResult[]> {
    const coinIds = [...new Set(
      pairs.map((p) => SYMBOL_TO_ID[p.symbolName]).filter(Boolean),
    )]
    const vsCurrencies = [...new Set(
      pairs.map((p) => QUOTE_TO_VS[p.quoteSymbolName]).filter(Boolean),
    )]

    if (coinIds.length === 0 || vsCurrencies.length === 0) return []

    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds.join(',')}&vs_currencies=${vsCurrencies.join(',')}`
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`CoinGecko API error: ${resp.status}`)

    const json = (await resp.json()) as CoinGeckoResponse

    const results: PriceResult[] = []
    for (const p of pairs) {
      const coinId = SYMBOL_TO_ID[p.symbolName]
      const vs = QUOTE_TO_VS[p.quoteSymbolName]
      if (!coinId || !vs) {
        console.warn(`[CoinGecko] no mapping for ${p.symbolName}/${p.quoteSymbolName}`)
        continue
      }
      const price = json[coinId]?.[vs]
      if (price === undefined) {
        console.warn(`[CoinGecko] no price for ${coinId}/${vs}`)
        continue
      }
      results.push({ symbolId: p.symbolId, quoteSymbolId: p.quoteSymbolId, price: String(price) })
    }
    return results
  }
}