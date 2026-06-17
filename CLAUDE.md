# CLAUDE.md

本檔案提供 Claude Code 在此專案工作時的指引。請在動工前完整閱讀。

---

## 專案概述

**狐錢包 WebWallet** — 一個 MetaMask 風格的網頁版多鏈錢包。

- **階段定位**：MVP / 內部 Demo（先求功能跑通，不碰真錢）
- **私鑰策略**：Mock（不碰真私鑰，以 interface 抽象預留未來替換成 MPC/KMS）
- **鏈環境**：Testnet —— Bitcoin testnet、Ethereum Sepolia、XRP testnet
- **支援資產**：BTC、ETH、ERC20 代幣（USDC/USDT 等）、XRP
- **錢包型態**：託管式（私鑰由平台保管；MVP 階段以 mock 模擬）

### 功能範圍（MVP）
- email 登入 + Google 登入
- Send / Receive
- 交易紀錄 + 交易詳情
- 跨鏈餘額總覽（BTC / ETH / ERC20 / XRP）
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
- Zustand（用戶端狀態：session、UI）
- React Hook Form + Zod（表單與驗證）

### 後端（`apps/api`）
- Node.js + TypeScript
- Fastify（框架，內建 schema 驗證）
- Prisma（ORM）
- PostgreSQL（資料庫）
- JWT + Google OAuth（驗證）
- Zod（輸入驗證，與前端共用）

### 共用（`packages/shared`）
- 前後端共用 TypeScript 型別與 Zod schema

### 鏈串接（Testnet）
- **Ethereum + ERC20**：viem，節點走 Alchemy/Infura（Sepolia）
- **Bitcoin**：bitcoinjs-lib，節點走 BlockCypher/QuickNode（testnet）
- **XRP**：xrpl.js，節點走 Ripple 公開 testnet

---

## 目錄結構

```
fox-wallet/
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── docker-compose.yml          # 本機 PostgreSQL
├── packages/
│   └── shared/
│       └── src/
│           ├── types/          # Address, Balance, Transaction, Chain
│           ├── schemas/        # Zod schema（API 共用）
│           └── constants/      # 支援的鏈、代幣清單
└── apps/
    ├── api/
    │   ├── src/
    │   │   ├── index.ts
    │   │   ├── config/
    │   │   ├── middleware/      # auth, error, rate-limit
    │   │   ├── routes/
    │   │   ├── services/
    │   │   │   ├── auth/
    │   │   │   ├── wallet/
    │   │   │   ├── balance/
    │   │   │   └── tx/
    │   │   ├── keymanager/      # ★ 私鑰抽象層
    │   │   │   ├── KeyManager.ts        # interface
    │   │   │   └── MockKeyManager.ts
    │   │   ├── chains/          # ★ 鏈抽象層
    │   │   │   ├── ChainAdapter.ts      # interface
    │   │   │   ├── BtcAdapter.ts
    │   │   │   ├── EthAdapter.ts        # 含 ERC20
    │   │   │   └── XrpAdapter.ts
    │   │   ├── db/
    │   │   └── lib/
    │   └── prisma/schema.prisma
    └── web/
        └── src/
            ├── routes/         # 對應原型的畫面
            ├── components/
            ├── features/       # auth / wallet / tx
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
  getBalance(address: string): Promise<Balance[]>;       // 含 ERC20
  buildTransaction(params: SendParams): Promise<RawTx>;
  broadcastTransaction(signedTx: string): Promise<TxHash>;
  getTransactionHistory(address: string): Promise<Transaction[]>;
  getTransaction(hash: string): Promise<Transaction>;
}
```

### 2. 每條鏈一個 adapter
`WalletService` / `TxService` 依 `chain` 參數取對應 adapter，不在業務邏輯裡寫 `if (chain === 'btc')` 這種分支。

### 3. 餘額不落地
餘額一律即時向鏈查詢（前端用 TanStack Query 快取），不存資料庫，避免不一致。交易紀錄可存資料庫作快取，但真實來源是鏈上。

### 4. 型別共用
所有跨前後端的型別（Chain、Address、Balance、Transaction、API 請求/回應）定義在 `packages/shared`，兩端 import 同一份。

---

## ★ 地址建立流程（重要：懶惰建立 Lazy Creation）

**不要**在登入時一次建好三條鏈的地址。改成：

> 當會員**切換到某條網路時**，先檢查該用戶在該鏈的地址是否已存在；
> **不存在才建立**，存在則直接回傳。

實作要點：
- 端點如 `GET /wallet/address?chain=eth`：
    1. 查 `Wallet` 表是否有 `(userId, chain)` 紀錄
    2. 有 → 回傳既有地址
    3. 無 → 呼叫 `keyManager.createWallet(userId, chain)`，寫入 `Wallet` 表，再回傳
- 這個「檢查或建立」邏輯封裝在 `WalletService.getOrCreateAddress(userId, chain)`，前端切換網路或進入 Receive 頁時呼叫。
- `KeyManager.getAddress` 回傳 `string | null`（null 代表尚未建立），由 service 判斷是否需建立。

好處：省去用不到的地址、建立時機貼近實際需求、未來換真託管方案時建立成本（可能要呼叫外部 API）只在必要時發生。

---

## 資料模型（Prisma 概要）

- **User**：id, email, passwordHash（Google 用戶可空）, googleId, createdAt
- **Wallet**：id, userId, chain, address, encryptedKeyRef（mock 階段）；唯一索引 `(userId, chain)`
- **Transaction**：id, userId, chain, type(send/receive), fromAddr, toAddr, asset, amount, txHash, status, blockTime（作快取與顯示）

---

## API 端點（REST）

```
POST   /auth/register           email 註冊
POST   /auth/login              email 登入
GET    /auth/google             Google OAuth 導向
GET    /auth/google/callback    OAuth 回呼
POST   /auth/refresh            刷新 token

GET    /wallet/address?chain=   ★ 取得或建立該鏈地址（lazy creation）
GET    /wallet/balances         跨鏈餘額總覽（Dashboard）

POST   /tx/estimate             預估手續費（Send 確認頁）
POST   /tx/send                 送出交易
GET    /tx/history              交易紀錄列表
GET    /tx/:hash                單筆交易詳情
```

所有端點以 Zod schema 驗證輸入，回應型別來自 `packages/shared`。

---

## 前端畫面（對應已完成的原型）

1. Welcome（入口）
2. Login（email + Google）
3. Dashboard（資產總覽；Buy/Swap 為 disabled）
4. Send（選鏈 → 地址 → 金額 → 預估費 → 確認 → 完成）
5. Receive（QR + 地址；切換網路時觸發 lazy creation）
6. History（交易紀錄）
7. TxDetail（交易詳情）
8. Account → Security（安全與登入）、Support（支援與說明）

**設計風格**：MetaMask 橘狐風。主色 `#f6851b`（橘）、深墨 `#24272a`、背景 `#f2f4f6`。RWD 需同時支援手機與桌機。
切換網路只提供三條主鏈：Bitcoin、Ethereum、XRP Ledger（ERC20 歸在 Ethereum 下，不另列）。

---

## 開發指令

```bash
# 安裝
pnpm install

# 起本機資料庫
docker compose up -d

# Prisma migration
pnpm --filter api prisma migrate dev

# 開發（前後端同時）
pnpm dev                 # 若有設根層 script
pnpm --filter api dev    # 只起後端
pnpm --filter web dev    # 只起前端

# 型別檢查 / lint / 測試
pnpm typecheck
pnpm lint
pnpm test
```

---

## 程式碼規範

- TypeScript `strict: true`，不使用 `any`（必要時用 `unknown` 並收斂）。
- 業務邏輯放 service，路由只做請求解析與回應；不要把鏈邏輯寫進路由。
- 前端元件保持單一職責，資料抓取走 hooks（`useBalance`、`useTx` 等）封裝 TanStack Query。
- 所有 API 輸入用 Zod 驗證，型別從 schema 推導（`z.infer`）。
- 錯誤處理：後端統一 error middleware + 自訂錯誤類別；前端統一處理 loading / error / empty 三態。
- commit 前確保 `pnpm typecheck` 與 `pnpm lint` 通過。

---

## 建議執行順序

1. **Phase 0 — 骨架**：monorepo、shared 型別與 Zod schema、tsconfig、ESLint/Prettier、docker-compose PostgreSQL、Prisma 初始 migration、前後端 health-check 互通。
2. **Phase 1 — Auth**：email 註冊/登入（bcrypt + JWT）、Google OAuth、auth middleware、前端 Welcome/Login 接 API、保護路由。
3. **Phase 2 — 餘額與收款**：三個 ChainAdapter 的 `getBalance`、`WalletService.getOrCreateAddress`（★ lazy creation）、Dashboard 顯示 testnet 餘額、Receive 顯示地址與 QR。
4. **Phase 3 — 交易**：`buildTransaction`/`broadcastTransaction`/`getTransactionHistory`、`MockKeyManager.signTransaction`、Send 完整流程、History、TxDetail、狀態輪詢。
5. **Phase 4 — 收尾**：帳號頁、RWD 檢查、錯誤與空狀態、跨鏈警告、rate limit。

**起手式**：先打通 Phase 0 + Phase 1 的「登入 → 進入 Receive/切換網路 → lazy 建立並看到該鏈地址」最短路徑，驗證兩個抽象層站得住，再往餘額和交易推進。

---

## 上線前必補（MVP 刻意略過，碰真錢前務必回來處理）

1. **私鑰**：`MockKeyManager` 換成 MPC（Fireblocks/Privy）或 KMS + HSM，絕不自存明文私鑰。
2. **合規**：託管式錢包多數地區屬 VASP，需 AML/KYC 與法遵登記，先諮詢法律意見。
3. **安全審計**：第三方滲透測試、相依套件掃描、金鑰輪替。
4. **可觀測性**：交易稽核日誌、異常告警、對帳機制。
5. **災難復原**：私鑰備援、資料庫備份、熱/冷錢包分離。

---

## 給 Claude Code 的提醒

- 動工前先確認當前 Phase，**一次專注一個 Phase**，完成並驗證後再進下一個。
- 新增鏈或替換私鑰方案時，**只動 adapter / KeyManager 實作**，不要改業務邏輯——若發現需要改業務邏輯，代表抽象層設計有問題，先停下來討論。
- 任何涉及「建立地址」的程式碼，務必走 `getOrCreateAddress` 的 lazy creation 流程，不要在登入時批次建立。
- 不確定需求時，先問再寫，不要臆測。