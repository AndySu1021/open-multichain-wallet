# 🦊 狐錢包 — Open Multichain Wallet

MetaMask 風格的網頁多鏈錢包，支援 BTC、ETH、ERC20、XRP。  
目前為 **MVP / 內部 Demo**，所有鏈操作皆使用 mock adapter，不接觸真實私鑰或資產。

---

## 技術棧

| 層 | 技術 |
|---|---|
| 前端 | React 18 + Vite + Tailwind CSS + React Router v6 + TanStack Query + Zustand |
| 後端 | Fastify + Prisma + PostgreSQL + JWT |
| 共用 | TypeScript（strict）+ Zod schema |
| 資料庫 | PostgreSQL 15（Docker） |

---

## 前置需求

| 工具 | 最低版本 |
|---|---|
| Node.js | 20.0.0 |
| pnpm | 9.0.0 |
| Docker + Docker Compose | 任意近代版本 |

安裝 pnpm（若尚未安裝）：
```bash
npm install -g pnpm
```

---

## 快速啟動

### 1. 安裝依賴

```bash
pnpm install
```

### 2. 設定環境變數

```bash
cp apps/api/.env.example apps/api/.env
```

`.env` 預設值已可直接用於本機開發，不需修改即可啟動：

```env
DATABASE_URL="postgresql://admin:abcd1234@localhost:5432/postgres"
JWT_SECRET="change-me-in-production-at-least-32-chars"
WEB_ORIGIN=http://localhost:5173
PORT=3001
NODE_ENV=development
```

> **Google OAuth（選填）**：若要啟用 Google 登入，需填入 `GOOGLE_CLIENT_ID` 與 `GOOGLE_CLIENT_SECRET`。詳見下方 [Google OAuth 設定](#google-oauth-設定選填)。

### 3. 啟動資料庫

```bash
docker compose up -d
```

確認容器正常運行：

```bash
docker compose ps
# postgres   running   0.0.0.0:5432->5432/tcp
```

### 4. 執行資料庫 Migration（首次 / schema 變更時）

```bash
pnpm --filter api db:migrate
```

> 輸入 migration 名稱時可填 `init`。執行後 Prisma 會自動建立 `User`、`Wallet`、`Transaction` 三張表。

### 5. 啟動開發伺服器

```bash
pnpm dev
```

這會同時啟動前後端：

| 服務 | URL |
|---|---|
| 前端（Web） | http://localhost:5173 |
| 後端（API） | http://localhost:3001 |
| API 健康檢查 | http://localhost:3001/health |

---

## 各服務單獨啟動

```bash
# 只啟動後端
pnpm --filter api dev

# 只啟動前端
pnpm --filter web dev
```

---

## 其他常用指令

```bash
# 型別檢查（前後端同時）
pnpm typecheck

# Lint
pnpm lint

# 查看 / 操作資料庫（Prisma Studio）
pnpm --filter api exec prisma studio

# 停止資料庫
docker compose down

# 停止並清除資料（資料庫資料會一併刪除）
docker compose down -v
```

---

## Google OAuth 設定（選填）

1. 前往 [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. 建立 OAuth 2.0 Client ID（應用程式類型：Web application）
3. 在「Authorized redirect URIs」加入：
   ```
   http://localhost:3001/auth/google/callback
   ```
4. 複製 Client ID 與 Client Secret，填入 `apps/api/.env`：
   ```env
   GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
   GOOGLE_CLIENT_SECRET="your-client-secret"
   ```
5. 重新啟動後端即生效

---

## 專案結構

```
open-multichain-wallet/
├── docker-compose.yml          # PostgreSQL 容器
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── BACKLOG.md                  # 待實作項目清單
├── prototype.html              # 互動式 UI 原型（可直接瀏覽器開啟）
│
├── packages/
│   └── shared/                 # 前後端共用型別與 Zod schema
│       └── src/
│           ├── types/          # Chain, Balance, Transaction, Auth
│           ├── schemas/        # Zod schema（auth, wallet）
│           └── constants/      # 支援的鏈、代幣
│
└── apps/
    ├── api/                    # Fastify 後端
    │   ├── .env                # 環境變數（從 .env.example 複製）
    │   ├── prisma/
    │   │   └── schema.prisma   # DB schema
    │   └── src/
    │       ├── config/env.ts   # 環境變數（含 dotenv 載入）
    │       ├── keymanager/     # KeyManager interface + MockKeyManager
    │       ├── chains/         # ChainAdapter interface + mock adapters
    │       ├── middleware/     # JWT auth
    │       └── routes/         # auth / wallet / tx
    │
    └── web/                    # React 前端
        └── src/
            ├── routes/         # 各畫面（Welcome, Login, Dashboard, Send…）
            ├── components/ui/  # Button, Input, BottomNav, States
            ├── store/          # Zustand（auth, pendingTx）
            └── api/client.ts   # Fetch wrapper + 401 自動 refresh
```

---

## API 端點速覽

```
POST   /auth/register            Email 註冊
POST   /auth/login               Email 登入
GET    /auth/google              Google OAuth 導向
GET    /auth/google/callback     OAuth 回呼
POST   /auth/refresh             刷新 access token

GET    /wallet/address?chain=    取得或建立該鏈地址（lazy creation）
GET    /wallet/balances          跨鏈餘額總覽

POST   /tx/estimate              預估手續費
POST   /tx/send                  送出交易
GET    /tx/history               交易紀錄列表
GET    /tx/:hash                 單筆交易詳情

GET    /health                   健康檢查
```

---

## 架構說明

### 私鑰抽象層（KeyManager）

所有私鑰操作透過 `KeyManager` interface，目前為 `MockKeyManager`（回傳假地址與假簽名）。未來替換為 MPC 或 KMS 時，只需實作同一份 interface，業務邏輯零修改。

### 鏈抽象層（ChainAdapter）

每條鏈一個 adapter（`EthAdapter`、`BtcAdapter`、`XrpAdapter`），統一實作 `ChainAdapter` interface。目前回傳 mock 資料，下一步接上真實 testnet。

### 地址 Lazy Creation

地址不在登入時建立，而是在使用者第一次切換到某條鏈時才建立（`GET /wallet/address?chain=eth`）。Service 層會先查資料庫，不存在才呼叫 `KeyManager.createWallet()`。

---

## 常見問題

**Q：`pnpm --filter api db:migrate` 失敗，顯示 connection refused？**  
A：確認 `docker compose up -d` 已執行且 PostgreSQL 容器正常啟動（`docker compose ps`）。

**Q：啟動後端時出現 `JWT_SECRET must be at least 32 characters`？**  
A：確認 `apps/api/.env` 存在。若不存在，執行 `cp apps/api/.env.example apps/api/.env`。

**Q：前端出現 401 Unauthorized？**  
A：Access token 過期時前端會自動嘗試 refresh。若仍失敗，嘗試重新登入。

**Q：Prisma Studio 在哪裡開？**  
A：`pnpm --filter api exec prisma studio`，開啟後瀏覽 http://localhost:5555。