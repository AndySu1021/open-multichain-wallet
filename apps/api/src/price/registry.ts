import type { PriceProvider } from './PriceProvider.js'
import { OkxPriceProvider } from './OkxPriceProvider.js'
import { CoinGeckoPriceProvider } from './CoinGeckoPriceProvider.js'

export const providerRegistry: Record<string, PriceProvider> = {
  okx:       new OkxPriceProvider(),
  coingecko: new CoinGeckoPriceProvider(),
}