# 狐錢包 — 待實作 Backlog

> MVP（Phase 0–4）已完成。以下是後續迭代的待辦項目，依優先度排列。

---

## 🔴 高優先度（串接真實 testnet 前必做）

### [Chain] 實作真實 testnet ChainAdapter

取代 mock 回傳的假資料，接上真實鏈節點。

- **EthAdapter**（`apps/api/src/chains/EthAdapter.ts`）
  - 安裝 `viem`
  - `getBalance`：`publicClient.getBalance` + ERC20 `balanceOf`（USDC/USDT contract）
  - `buildTransaction`：組裝 `{ to, value, data, gasPrice, nonce }`
  - `broadcastTransaction`：`walletClient.sendRawTransaction`
  - `getTransactionHistory`：Alchemy/Infura `alchemy_getAssetTransfers` 或 Etherscan API
  - `getTransaction`：`publicClient.getTransactionReceipt`
  - 節點：Alchemy Sepolia（填入 `.env` 的 `ALCHEMY_API_KEY`）

- **BtcAdapter**（`apps/api/src/chains/BtcAdapter.ts`）
  - 安裝 `bitcoinjs-lib`
  - `getBalance`：BlockCypher testnet3 API `/addrs/{addr}/balance`
  - `buildTransaction`：組裝 PSBT，取 UTXO from BlockCypher
  - `broadcastTransaction`：BlockCypher `/txs/push`
  - `getTransactionHistory`：BlockCypher `/addrs/{addr}/full`
  - `getTransaction`：BlockCypher `/txs/{hash}`

- **XrpAdapter**（`apps/api/src/chains/XrpAdapter.ts`）
  - 安裝 `xrpl`
  - `getBalance`：`client.getBalances(address)`
  - `buildTransaction`：`xrpl.Payment` transaction
  - `broadcastTransaction`：`client.submit(signedTx)`
  - `getTransactionHistory`：`client.request({ command: 'account_tx' })`
  - 節點：Ripple Testnet WebSocket

---

## 🟡 中優先度（UX 完整性）

### [Send] 地址格式驗證
- 依選定的鏈驗證地址格式，送出前提示錯誤
  - ETH：`/^0x[0-9a-fA-F]{40}$/`
  - BTC：`bitcoinjs-lib` `address.toOutputScript()` 含錯誤 catch
  - XRP：`xrpl.isValidAddress()`
- 位置：`Send.tsx` form validation 或 `SendSchema` Zod refine

### [Send] 顯示換算後 USD 金額
- 輸入金額時即時顯示「≈ $X.XX USD」
- 需要匯率來源：CoinGecko free API（`/simple/price?ids=bitcoin,ethereum,ripple&vs_currencies=usd`）
- 建議用 TanStack Query 快取 30 秒

### [Dashboard] 顯示 24h 漲跌幅
- Mock adapter 已回傳 `change24h`，接上真實 adapter 後自動生效
- 確認 Dashboard `TokenRow` 的顏色邏輯（負數紅色、正數綠色、零灰色）已就緒

### [TxDetail] 區塊瀏覽器連結依鏈切換
- 目前硬寫 Sepolia Etherscan
- 改為依 `tx.chain` 切換：
  - `eth` → `https://sepolia.etherscan.io/tx/{hash}`
  - `btc` → `https://live.blockcypher.com/btc-testnet/tx/{hash}`
  - `xrp` → `https://testnet.xrpl.org/transactions/{hash}`

### [History] 分頁 / 無限捲動
- 目前一次拿 20 筆，無 load more
- 加入「載入更多」按鈕或 Intersection Observer 無限捲動

### [Login] OAuth 錯誤訊息顯示
- 若 URL 有 `?error=oauth_failed`，在 Login 頁顯示提示訊息

---

## 🟢 低優先度（polish）

### [Account] 變更密碼功能
- Security 頁的「變更密碼」目前只是 UI，無後端
- 需新增 `POST /auth/change-password`（驗舊密碼 → bcrypt hash 新密碼）

### [Dashboard] Network picker 功能化
- 目前「全部網路」按鈕為靜態
- 點擊後開啟網路切換 sheet（參考原型 Screen 07），切換後 Dashboard 只顯示該鏈資產

### [Receive] 切換鏈後 URL 同步
- 切換鏈時更新 URL query param（`?chain=btc`），方便分享/書籤

### [API] Prisma migrate 自動化
- 加入 `apps/api/package.json` 的 `postinstall` script：`prisma generate`
- 避免 Prisma client 過期

### [前端] Zustand persist（sessionStorage）
- 改用 `zustand/middleware` 的 `persist`，存入 sessionStorage
- 可取代目前手動 `hydrateFromStorage` 的作法

### [安全] 移除 @fastify/oauth2 未使用依賴
- `apps/api/package.json` 中 `@fastify/oauth2` 已不使用，可移除

---

## 🚧 上線前必補（CLAUDE.md 已記錄）

1. **私鑰**：MockKeyManager → MPC（Fireblocks/Privy）或 KMS + HSM
2. **合規**：AML/KYC、VASP 法遵登記
3. **安全審計**：滲透測試、相依套件掃描
4. **可觀測性**：交易稽核日誌、異常告警、對帳
5. **災難復原**：私鑰備援、DB 備份、熱冷分離