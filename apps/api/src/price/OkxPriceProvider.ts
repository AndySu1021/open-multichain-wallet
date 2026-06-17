import type { PriceProvider, QuotePair, PriceResult } from './PriceProvider.js'

interface OkxTicker {
  instId: string
  last: string
}

interface OkxResponse {
  code: string
  data: OkxTicker[]
}

export class OkxPriceProvider implements PriceProvider {
  readonly name = 'okx'

  async fetchPrices(pairs: QuotePair[]): Promise<PriceResult[]> {
    const resp = await fetch('https://www.okx.com/api/v5/market/tickers?instType=SPOT')
    if (!resp.ok) throw new Error(`OKX API error: ${resp.status}`)

    const json = (await resp.json()) as OkxResponse
    if (json.code !== '0') throw new Error(`OKX API code: ${json.code}`)

    const tickerMap = new Map(json.data.map((t) => [t.instId, t.last]))

    const results: PriceResult[] = []
    for (const p of pairs) {
      const instId = `${p.symbolName}-${p.quoteSymbolName}`
      const price = tickerMap.get(instId)
      if (!price) {
        console.warn(`[OKX] no ticker for ${instId}`)
        continue
      }
      results.push({ symbolId: p.symbolId, quoteSymbolId: p.quoteSymbolId, price })
    }
    return results
  }
}