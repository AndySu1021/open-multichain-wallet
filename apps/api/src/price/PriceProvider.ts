export interface QuotePair {
  symbolId: number
  quoteSymbolId: number
  symbolName: string
  quoteSymbolName: string
}

export interface PriceResult {
  symbolId: number
  quoteSymbolId: number
  price: string
}

export interface PriceProvider {
  readonly name: string
  fetchPrices(pairs: QuotePair[]): Promise<PriceResult[]>
}