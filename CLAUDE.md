# CLAUDE.md

本檔案提供 Claude Code 在此專案工作時的指引。請在動工前完整閱讀。

---

## 專案概述

**狐錢包 WebWallet** — 一個 MetaMask 風格的網頁版多鏈錢包。

- **階段定位**：MVP / 內部 Demo（先求功能跑通，不碰真錢）
- **私鑰策略**：Mock（不碰真私鑰，以 interface 抽象預留未來替換成 MPC/KMS）
- **鏈環境**：Testnet —— Bitcoin testnet、Ethereum Sepolia、XRP testnet、BSC testnet
- **支援資產**：BTC、ETH、ERC20 代幣（USDC/USDT）、XRP、BNB（BEP20 含 USDT）
- **錢包型態**：託管式（私鑰由平台保管；MVP 階段以 mock 模擬）

### 功能範圍（MVP 已完成）
- email 登入 + Google 登入
- Send / Receive
- 交易紀錄 + 交易詳情
- 跨鏈餘額總覽（BTC / ETH / ERC20 / XRP / BNB）
- 資產估值（vs USDT / USD，眼睛 icon 切換顯示/隱藏）
- 帳號頁：安全與登入、支援與說明

### 明確不在範圍內（MVP 不做）
- Buy / Swap（UI 顯示為 disabled「即將推出」）
- 管理代幣（由平台統一管理，不開放用戶自訂）
- 網路設定 / 貨幣語言設定 / 匯出備份

---

## 技術棧

### Monorepo
- **pnpm workspace**
- TypeScript 全棧

### 前端（`apps/web`）
- React 18 + TypeScript
- Vite（建置）
- Tailwind CSS（RWD，utility-first）
- React Router v6（路由）
- TanStack Query（伺服器狀態：餘額、交易快取與輪詢）
- Zustand（用戶端狀態：session、UI、pendingTx）
- React Hook Form + Zod（表單與驗證）

### 後端（`apps/api`）
- Node.js + TypeScript
- Fastify 5（框架，內建 schema 驗證）
- Prisma 5（ORM）
- PostgreSQL（資料庫）
- JWT + Google OAuth（驗證）
- Zod（輸入驗證，與前端共用）

### 共用（`packages/shared`）
- 前後端共用 TypeScript 型別與 Zod schema

### 鏈串接（Testnet）
- **Ethereum + ERC20**：viem，節點走 Alchemy/Infura（Sepolia）
- **Bitcoin**：bitcoinjs-lib，節點走 BlockCypher/QuickNode（testnet）
- **XRP**：xrpl.js，節點走 Ripple 公開 testnet
- **BSC**：BscAdapter（mock），未來接 BSC testnet RPC

---

## 目錄結構

```
open-multichain-wallet/
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── docker-compose.yml              # 本機 PostgreSQL（container: postgres, port: 5432）
├── packages/
│   └── shared/
│       └── src/
│           ├── types/              # Chain, AssetSymbol, Transaction, AssetBalance, QuoteSymbolItem…
│           ├── schemas/            # Zod schema（ChainSchema, SendSchema, GetHistorySchema…）
│           └── constants/          # SUPPORTED_CHAINS, CHAIN_LABELS, CHAIN_NATIVE_ASSET…
└── apps/
    ├── api/
    │   ├── src/
    │   │   ├── index.ts
    │   │   ├── config/
    │   │   ├── middleware/          # auth, error, rate-limit
    │   │   ├── routes/
    │   │   │   ├── auth.ts
    │   │   │   ├── health.ts
    │   │   │   ├── network.ts       # GET /networks, /assets, /quote-symbols
    │   │   │   ├── tx.ts            # POST /tx/estimate, /tx/send, GET /tx/history, /tx/:hash
    │   │   │   └── wallet.ts        # GET /wallet/address, /wallet/balances
    │   │   ├── keymanager/          # ★ 私鑰抽象層
    │   │   │   ├── KeyManager.ts    # interface
    │   │   │   └── MockKeyManager.ts
    │   │   ├── chains/              # ★ 鏈抽象層
    │   │   │   ├── ChainAdapter.ts  # interface
    │   │   │   ├── BtcAdapter.ts
    │   │   │   ├── EthAdapter.ts    # 含 ERC20（USDT / USDC）
    │   │   │   ├── XrpAdapter.ts
    │   │   │   ├── BscAdapter.ts    # BNB + BEP20 USDT
    │   │   │   └── registry.ts      # { btc, eth, xrp, bsc } adapter map
    │   │   ├── db/
    │   │   └── lib/
    │   └── prisma/
    │       ├── schema.prisma
    │       ├── migrations/
    │       │   └── 20260617133350_init/   # 單一 init migration
    │       └── script/
    │           └── seed.sql               # PostgreSQL seed（psql 執行）
    └── web/
        └── src/
            ├── routes/
            │   ├── Login.tsx
            │   ├── Register.tsx
            │   ├── AuthCallback.tsx
            │   ├── Dashboard.tsx
            │   ├── Send.tsx
            │   ├── SendConfirm.tsx
            │   ├── SendDone.tsx
            │   ├── Receive.tsx
            │   ├── History.tsx
            │   ├── TxDetail.tsx
            │   ├── Account.tsx
            │   ├── Security.tsx
            │   └── Support.tsx
            ├── components/
            ├── hooks/
            ├── api/
            ├── store/
            └── styles/
```

---

## 核心設計原則（最重要，務必遵守）

### 1. 私鑰與鏈互動一律走 interface 抽象
業務邏輯**只能**依賴介面，不可直接呼叫 mock 實作或特定鏈的函式庫。未來換 MPC/KMS 或接主網時只換 adapter，業務邏輯零修改。

```typescript
// keymanager/KeyManager.ts
interface KeyManager {
  createWallet(userId: string, chain: Chain): Promise<{ address: string }>;
  getAddress(userId: string, chain: Chain): Promise<string | null>;
  signTransaction(userId: string, chain: Chain, rawTx: unknown): Promise<string>;
}

// chains/ChainAdapter.ts
interface ChainAdapter {
  chain: Chain;
  getBalance(address: string): Promise<Balance[]>;
  buildTransaction(params: SendParams): Promise<RawTx>;
  broadcastTransaction(signedTx: string): Promise<TxHash>;
  getTransactionHistory(address: string): Promise<Transaction[]>;
  getTransaction(hash: string): Promise<Transaction>;
}
```

### 2. 每條鏈一個 adapter
路由透過 `registry.ts` 的 adapter map 依 `chain` 取對應 adapter，不在路由 / 業務邏輯裡寫 `if (chain === 'btc')` 分支。

### 3. 餘額不落地
餘額一律即時向鏈查詢（前端用 TanStack Query 快取 + 30 秒輪詢），不存資料庫。交易紀錄存資料庫作快取，真實來源是鏈上。

### 4. 型別共用
所有跨前後端的型別（Chain、AssetBalance、Transaction、QuoteSymbolItem、API 請求/回應）定義在 `packages/shared`，兩端 import 同一份。

---

## ★ 地址建立流程（重要：懶惰建立 Lazy Creation）

**不要**在登入時一次建好所有鏈的地址。改成：

> 當用戶**切換到某條網路時**，先檢查該用戶在該鏈的地址是否已存在；
> **不存在才建立**，存在則直接回傳。

實作要點：
- 端點 `GET /wallet/address?chain=eth`：
    1. 查 `WalletAddress` 表是否有 `(userId, networkId)` 紀錄
    2. 有 → 回傳既有地址
    3. 無 → 呼叫 `keyManager.createWallet(userId, chain)`，寫入 `WalletAddress` 表，再回傳
- 前端在切換網路（Receive 頁、Send 頁）時觸發此端點
- `KeyManager.getAddress` 回傳 `string | null`（null 代表尚未建立）

---

## 資料模型（Prisma）

```
Network       id, name, protocol(ERC20/BTC/XRP/BEP20), status, imageUrl, explorerUrl
Symbol        id, name, status, imageUrl
Asset         id, symbolId, networkId, contractAddress?, status   unique(symbolId, networkId)
QuoteSymbol   id, name, imageUrl, status                          unique(name)
Quotation     id, symbolId, quoteSymbolId, price                  unique(symbolId, quoteSymbolId)
User          id, email, passwordHash?, googleId?, createdAt, updatedAt
WalletAddress id, userId, networkId, address, encryptedKeyRef, createdAt   unique(userId, networkId)
UserAsset     id, userId, networkId, symbolId, createdAt          unique(userId, networkId, symbolId)
Transaction   id, userId, networkId, symbolId, type(tinyint 1=send 2=receive),
              fromAddress, toAddress, amount(Decimal), txHash, status, blockTime?, createdAt
```

**重要**：`Transaction.type` 為 tinyint（`1` = send, `2` = receive），回應時 map 成字串 `'send' | 'receive'`。  
`Transaction.amount` 為 `Decimal`，不是 float。  
`Transaction` 與 `UserAsset` 都用 `(networkId, symbolId)` 組合識別資產，不存 chain string / asset string。

---

## API 端點（REST）

```
POST   /auth/register                    email 註冊
POST   /auth/login                       email 登入
GET    /auth/google                      Google OAuth 導向
GET    /auth/google/callback             OAuth 回呼
POST   /auth/refresh                     刷新 token

GET    /wallet/address?chain=            ★ 取得或建立該鏈地址（lazy creation）
GET    /wallet/balances?networkId=&quoteSymbolId=   跨鏈餘額 + 估值（Dashboard）

POST   /tx/estimate                      預估手續費（Send 確認頁）
POST   /tx/send                          送出交易
GET    /tx/history?type=&networkId=&symbolId=       交易紀錄列表（含篩選）
GET    /tx/:hash                         單筆交易詳情

GET    /networks                         取得所有啟用網路
GET    /assets                           取得所有啟用資產（含 symbol / network 關聯）
GET    /quote-symbols                    取得所有報價幣種（USDT / USD）
GET    /health                           健康檢查
```

- 所有需登入端點需帶 `Authorization: Bearer <token>`。
- 回應格式統一為 `{ ok: true, data: { ... } }`，錯誤為 `{ ok: false, error: string }`。
- 所有輸入用 Zod 驗證，型別來自 `packages/shared`。

---

## 前端路由

| 路徑 | 元件 | 需登入 |
|---|---|---|
| `/` | → redirect `/login` | — |
| `/login` | Login.tsx | 否 |
| `/register` | Register.tsx | 否 |
| `/auth/callback` | AuthCallback.tsx | 否 |
| `/dashboard` | Dashboard.tsx | 是 |
| `/send` | Send.tsx | 是 |
| `/send/confirm` | SendConfirm.tsx | 是 |
| `/send/done/:hash` | SendDone.tsx | 是 |
| `/receive` | Receive.tsx | 是 |
| `/history` | History.tsx | 是 |
| `/tx/:hash` | TxDetail.tsx | 是 |
| `/account` | Account.tsx | 是 |
| `/account/security` | Security.tsx | 是 |
| `/account/support` | Support.tsx | 是 |

**設計風格**：MetaMask 橘狐風。主色 `#f6851b`（橘）、深墨 `#24272a`、背景 `#f2f4f6`。RWD 支援手機與桌機。  
**支援四條網路**：Ethereum（含 ERC20）、Bitcoin、XRP Ledger、Binance Smart Chain。

---

## 開發指令

```bash
# 安裝
pnpm install

# 起本機資料庫（container: postgres, port: 5432, user: admin, db: postgres）
docker compose up -d

# Prisma migration（新增 schema 異動時）
pnpm --filter api prisma migrate dev

# 重設資料庫並重建（清空所有資料）
pnpm --filter api prisma migrate reset --force --skip-seed

# 執行 seed（透過 docker exec + psql）
docker exec -i postgres psql -U admin -d postgres < apps/api/prisma/script/seed.sql
# 或等同：
pnpm --filter api db:seed

# 開發（前後端）
pnpm --filter api dev    # 後端 :3001
pnpm --filter web dev    # 前端 :5173

# 型別檢查 / lint
pnpm typecheck
pnpm lint
```

---

## 程式碼規範

- TypeScript `strict: true`，不使用 `any`（必要時用 `unknown` 並收斂）。
- 業務邏輯放 route handler 或獨立 service 函式；鏈邏輯只走 adapter interface。
- 前端資料抓取走 TanStack Query，不在元件內直接呼叫 fetch。
- 錯誤處理：後端統一 error middleware；前端統一處理 loading / error / empty 三態（`<LoadingState>` / `<ErrorState>` / `<EmptyState>`）。
- commit 前確保 `pnpm typecheck` 與 `pnpm lint` 通過。

---

## 目前進度（Phase 完成狀況）

- ✅ Phase 0 — 骨架（monorepo、shared、Prisma、docker-compose）
- ✅ Phase 1 — Auth（email + Google OAuth、JWT、保護路由）
- ✅ Phase 2 — 餘額與收款（四鏈 adapter、lazy creation、Dashboard + Receive）
- ✅ Phase 3 — 交易（Send / SendConfirm / SendDone、History + 篩選、TxDetail）
- ✅ Phase 4 — 收尾（Account / Security / Support、估值系統、BSC 網路）

---

## 上線前必補（MVP 刻意略過，碰真錢前務必回來處理）

1. **私鑰**：`MockKeyManager` 換成 MPC（Fireblocks/Privy）或 KMS + HSM，絕不自存明文私鑰。
2. **合規**：託管式錢包多數地區屬 VASP，需 AML/KYC 與法遵登記，先諮詢法律意見。
3. **安全審計**：第三方滲透測試、相依套件掃描、金鑰輪替。
4. **可觀測性**：交易稽核日誌、異常告警、對帳機制。
5. **災難復原**：私鑰備援、資料庫備份、熱/冷錢包分離。

---

## 給 Claude Code 的提醒

- 新增鏈時：新增 `XxxAdapter.ts`，在 `registry.ts` 登記，更新 `Chain` type 與 `ChainSchema`，在 `seed.sql` 補 network / asset / quotation 資料，**不改路由業務邏輯**。
- 任何涉及「建立地址」的程式碼，務必走 `GET /wallet/address?chain=` 的 lazy creation 流程，不要在登入時批次建立。
- `Transaction.type` 存 tinyint（1/2），輸出 API 前用 `mapTxType()` 轉成 `'send' | 'receive'`。
- 資產識別用 `(networkId, symbolId)` 組合，不要用 chain string 或 asset string。
- 新資產若要出現在 Dashboard 估值，需在 `quotation` 表補上對應的 USDT / USD 報價。
- 不確定需求時，先問再寫，不要臆測。