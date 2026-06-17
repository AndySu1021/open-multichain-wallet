# 即時報價排程 — 實作計劃

## 目標

定時依 `quotation.provider` 欄位決定要向哪個行情來源拉取報價，並 upsert 至 `quotation` 資料表：
- **USDT 計價** → OKX 現貨報價
- **USD 計價** → CoinGecko 免費 API
- **同幣種（USDT/USDT）** → 略過，price 恆為 1，不呼叫任何 API

---

## Schema 變更

### quotation 表新增 provider 欄位

```sql
ALTER TABLE "quotation" ADD COLUMN "provider" TEXT;
```

| symbol | quote | provider |
|--------|-------|----------|
| ETH    | USDT  | `okx`        |
| BTC    | USDT  | `okx`        |
| XRP    | USDT  | `okx`        |
| BNB    | USDT  | `okx`        |
| USDT   | USDT  | `NULL`       | ← 同幣種，略過 |
| USDC   | USDT  | `okx`        |
| ETH    | USD   | `coingecko`  |
| BTC    | USD   | `coingecko`  |
| XRP    | USD   | `coingecko`  |
| BNB    | USD   | `coingecko`  |
| USDT   | USD   | `coingecko`  |
| USDC   | USD   | `coingecko`  |

### Prisma schema 更新

```prisma
model Quotation {
  id            Int     @id @default(autoincrement())
  symbolId      Int     @map("symbol_id")
  quoteSymbolId Int     @map("quote_symbol_id")
  price         Decimal
  provider      String? // 'okx' | 'coingecko' | null（同幣種略過）

  symbol      Symbol      @relation(fields: [symbolId], references: [id])
  quoteSymbol QuoteSymbol @relation(fields: [quoteSymbolId], references: [id])

  @@unique([symbolId, quoteSymbolId])
  @@map("quotation")
}
```

### seed.sql 更新

`quotation` insert 補上 provider 欄位，並更新 ON CONFLICT 語句一併 SET provider。

---

## 架構設計

```
apps/api/src/
├── price/
│   ├── PriceProvider.ts            # interface
│   ├── OkxPriceProvider.ts         # OKX 實作（USDT 計價）
│   ├── CoinGeckoPriceProvider.ts   # CoinGecko 實作（USD 計價）
│   └── registry.ts                 # providerRegistry: Record<string, PriceProvider>
└── jobs/
    └── quoteSync.ts                # 排程主體
```

`index.ts` 新增：

```ts
import { startQuoteSync, stopQuoteSync } from './jobs/quoteSync.js'
startQuoteSync()   // app.listen 之後
stopQuoteSync()    // shutdown() 之內
```

---

## PriceProvider interface

```typescript
// price/PriceProvider.ts

export interface QuotePair {
  symbolId: number
  quoteSymbolId: number
  symbolName: string       // e.g. 'ETH'
  quoteSymbolName: string  // e.g. 'USDT'
}

export interface PriceResult {
  symbolId: number
  quoteSymbolId: number
  price: string  // Decimal-safe string
}

export interface PriceProvider {
  readonly name: string
  fetchPrices(pairs: QuotePair[]): Promise<PriceResult[]>
}
```

---

## OKX Provider（USDT 計價）

- **Endpoint**（公開，免 API Key）：`GET https://www.okx.com/api/v5/market/tickers?instType=SPOT`
- 一次拉回全量現貨報價，本地過濾所需交易對
- instId 格式：`ETH-USDT`、`BTC-USDT` …（symbol 名稱與 OKX 一致，無需額外映射）

```typescript
// 概念
async fetchPrices(pairs: QuotePair[]): Promise<PriceResult[]> {
  const resp = await fetch('https://www.okx.com/api/v5/market/tickers?instType=SPOT')
  const { data } = await resp.json()
  // data[].instId = "ETH-USDT", data[].last = "1800.12"
  const tickerMap = new Map(data.map((t) => [t.instId, t.last]))
  return pairs.flatMap((p) => {
    const price = tickerMap.get(`${p.symbolName}-${p.quoteSymbolName}`)
    if (!price) { /* warn log */ return [] }
    return [{ symbolId: p.symbolId, quoteSymbolId: p.quoteSymbolId, price }]
  })
}
```

---

## CoinGecko Provider（USD 計價）

- **Endpoint**（公開，免 API Key）：`GET https://api.coingecko.com/api/v3/simple/price`
- 一次請求帶所有 coin ID，vs_currencies=usd
- 回應：`{ "bitcoin": { "usd": 64808.5 }, ... }`

內部映射表（provider 自行維護，不外洩）：

```typescript
const SYMBOL_TO_ID: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', XRP: 'ripple',
  BNB: 'binancecoin', USDT: 'tether', USDC: 'usd-coin',
}
```

---

## providerRegistry

```typescript
// price/registry.ts
import { OkxPriceProvider } from './OkxPriceProvider.js'
import { CoinGeckoPriceProvider } from './CoinGeckoPriceProvider.js'
import type { PriceProvider } from './PriceProvider.js'

export const providerRegistry: Record<string, PriceProvider> = {
  okx:       new OkxPriceProvider(),
  coingecko: new CoinGeckoPriceProvider(),
}
```

日後換廠商：在 registry 新增一個 key，更新 quotation.provider 資料即可，**不改排程邏輯**。

---

## 排程器設計（quoteSync.ts）

```
syncOnce()
  ├─ 1. 讀 DB：
  │       prisma.quotation.findMany({
  │         where: { provider: { not: null } },
  │         include: { symbol, quoteSymbol }
  │       })
  │
  ├─ 2. 按 provider 分群：
  │       Map<providerName, QuotePair[]>
  │
  ├─ 3. 對每個 provider 群組：
  │       const provider = providerRegistry[providerName]
  │       const results = await provider.fetchPrices(pairs)
  │
  ├─ 4. 合併所有 results，組成 prisma.quotation.update[] 陣列
  │       （provider 未回傳的對 → 略過，保留舊值，warn log）
  │
  └─ 5. prisma.$transaction([...updates])
```

---

## 環境變數（新增至 .env / env.ts）

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `QUOTE_SYNC_INTERVAL_MS` | `60000` | 排程間隔（毫秒） |

---

## 實作順序

1. **DB migration**：`quotation` 加 `provider` 欄位，更新 Prisma schema
2. **seed.sql**：補 provider 欄位值，ON CONFLICT 時一併更新
3. `apps/api/src/price/PriceProvider.ts` — interface
4. `apps/api/src/price/OkxPriceProvider.ts` — OKX 實作
5. `apps/api/src/price/CoinGeckoPriceProvider.ts` — CoinGecko 實作
6. `apps/api/src/price/registry.ts` — providerRegistry
7. `apps/api/src/config/env.ts` — 新增 `QUOTE_SYNC_INTERVAL_MS`
8. `apps/api/src/jobs/quoteSync.ts` — 排程主體
9. `apps/api/src/index.ts` — 啟動 / 關閉排程

---

## 注意事項

- OKX 公開 API rate limit 20 req/s，用全量 tickers 每分鐘只打一次，安全
- CoinGecko 免費 tier rate limit 約 10–30 req/min，同上
- `quotation.price` 為 Prisma `Decimal`，upsert 傳字串即可
- 排程 error 只 log，不 throw，不影響主程序
- 首次啟動立刻執行一次 `syncOnce()`，不等第一個 interval