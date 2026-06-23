# Solana 鏈上數據同步計劃

**目標**：實作後台 Slot Sync 機制，監聽 Solana Devnet/Testnet，自動偵測會員 SOL 收款（未來含 SPL Token），更新外送交易確認狀態，並支援 slot 跳過處理。

---

## 一、前置問題決策

### Q1. Solana 與 EVM 鏈的關鍵差異

| 維度 | Ethereum | Solana |
|------|----------|--------|
| 出塊單位 | Block（~12s） | Slot（~400ms） |
| 確認機制 | Block confirmations | Commitment levels（processed → confirmed → finalized） |
| 原生幣 | ETH (wei, 18 decimals) | SOL (lamports, 9 decimals) |
| 代幣標準 | ERC20 (Transfer event) | SPL Token (instruction parsing) |
| 監聽方式 | watchBlocks + getLogs | logsSubscribe / accountSubscribe / getSignaturesForAddress |
| Reorg | 會發生（需比對 parentHash） | Finalized slot 不可逆；confirmed 偶爾 skip |
| 地址格式 | 0x... (40 hex, case-insensitive) | Base58 (32-44 chars, case-sensitive) |

**結論**：不能複用 EthBlockSync，需要獨立的 `SolSlotSync` 實作。

---

### Q2. 選擇哪種監聽策略？

| 方案 | 優點 | 缺點 |
|------|------|------|
| A. `logsSubscribe` (WS) | 即時、可過濾 program | Devnet WS 不穩、需處理斷線 |
| B. `accountSubscribe` (WS) | 即時、帳戶粒度 | 每個地址一個 subscription，不擴展 |
| C. `getSignaturesForAddress` (HTTP poll) | 穩定、簡單、無狀態 | 有延遲（polling interval） |
| D. Helius Webhook | 零維護、推送式 | 外部依賴、需要公網 endpoint |

**決策：C. HTTP Polling 為主（Phase 1），A. WebSocket 為加速（Phase 2）**

理由：
- MVP 階段用戶數少，polling 每 5 秒即可滿足需求
- Solana Devnet/Testnet 的 WebSocket 連線穩定性不如 Mainnet
- HTTP polling 無狀態，重啟不丟資料，邏輯最簡單
- Phase 2 加入 `logsSubscribe` 作為即時通知，減少延遲

---

### Q3. 如何判斷交易已確認？

Solana 的 commitment levels：

| Level | 含義 | 延遲 |
|-------|------|------|
| `processed` | 節點已處理，未投票 | ~400ms |
| `confirmed` | 超過 2/3 驗證者投票 | ~1-2s |
| `finalized` | 31+ slots（~13s） | ~13-15s |

**決策：兩階段確認（與 ETH 對齊）**

1. **偵測到交易**（commitment = `confirmed`）→ 建立 `status=0 (pending)` 記錄
2. **等到 `finalized`** → 升級 `status=1 (confirmed)`

使用 `network.confirmation_blocks = 32`（已在 seed 中設定）作為從偵測 slot 到 finalized 的最小 slot 差距。

---

### Q4. 如何追蹤 cursor（避免重複/遺漏）？

**策略：以最後處理的 transaction signature 為 cursor**

- Solana 的 `getSignaturesForAddress` 支援 `before` / `until` 參數（signature-based pagination）
- 每次 poll 時傳入 `until = lastProcessedSignature`，只拉取新交易
- 將 `lastProcessedSignature` 存入 `BlockCursor` 表（複用欄位：`blockHash` 存 signature, `blockNumber` 存 slot）

---

### Q5. 第一階段範圍

**Phase 1 只做：**
- SOL 原生轉帳收款偵測（`getSignaturesForAddress` + `getTransaction`）
- 外送交易狀態追蹤（pending → confirmed/failed）
- Confirmation 升級（confirmed slot vs finalized slot）
- HTTP polling（每 5 秒）

**Phase 1 不做：**
- SPL Token 轉帳偵測（Phase 2）
- WebSocket 即時通知（Phase 2）
- Helius webhook 整合（未來）

---

## 二、整體架構

```
apps/api/src/
  sync/
    types.ts            # BlockRange, SyncedTx（不動）
    EthBlockSync.ts     # 現有（不動）
    SolSlotSync.ts      # ★ 新增：Solana polling sync
    SyncManager.ts      # ★ 修改：新增 SOL protocol 支援
```

不需要新增 Prisma migration — 複用現有 `BlockCursor`、`Transaction`、`UserAsset` 表。

---

## 三、資料模型使用（複用現有表）

### `BlockCursor`（複用）

| 欄位 | Solana 用途 |
|------|-------------|
| `networkId` | 5（Solana） |
| `blockNumber` | 最後處理的 slot number |
| `blockHash` | 最後處理的 transaction signature |

### `Transaction`（複用）

| 欄位 | Solana 用途 |
|------|-------------|
| `networkId` | 5 |
| `symbolId` | 7（SOL） |
| `blockNumber` | transaction 所在的 slot |
| `blockHash` | transaction signature（即 txHash） |
| `txHash` | transaction signature |
| `status` | 0=pending, 1=confirmed, 2=failed |

### `Network` 表設定（已在 seed 中）

```
id=5, name='Solana', protocol='SOL', confirmation_blocks=32,
sync_enabled=false, node_ws_url=NULL, node_http_url=NULL
```

啟用時需由管理員設定：
```sql
UPDATE network SET
  sync_enabled = true,
  node_http_url = 'https://api.devnet.solana.com'
WHERE id = 5;
```

---

## 四、SolSlotSync 流程

### 4.1 啟動流程

```
SyncManager.start()
  └─ SolSlotSync.start()
       ├─ 從 Network 表讀取 confirmationBlocks、nodeHttpUrl
       ├─ 從 BlockCursor 讀取 lastSignature / lastSlot
       ├─ 載入所有 Solana 會員地址（networkId=5）
       ├─ 首次補掃（catchup scan）
       └─ 啟動 polling timer（每 5 秒）
```

### 4.2 每次 Poll 的處理邏輯

```
poll()
  │
  ├─ 1. 從 DB 取所有 Solana 會員地址
  │    └─ prisma.walletAddress.findMany({ where: { networkId: 5 } })
  │         → addressList: { address, userId }[]
  │
  ├─ 2. 對每個地址呼叫 getSignaturesForAddress
  │    └─ connection.getSignaturesForAddress(pubkey, {
  │         until: lastSignature,    // 只拉新的
  │         limit: 50,
  │         commitment: 'confirmed'
  │       })
  │    → 回傳 ConfirmedSignatureInfo[]（含 slot, signature, err, blockTime）
  │
  ├─ 3. 過濾並處理每筆新 signature
  │    └─ 對每個 signature:
  │         ├─ getTransaction(signature, { commitment: 'confirmed' })
  │         ├─ 解析 pre/postBalances 判斷金額與方向
  │         ├─ 若為收款（toAddress ∈ memberAddresses）
  │         │    └─ upsert Transaction（type=2, status=0, blockNumber=slot）
  │         └─ 若為已知外送 tx（txHash match pending sends）
  │              └─ 更新 blockNumber、status（err ? 2 : 0）
  │
  ├─ 4. Confirmation 升級（純 DB 操作）
  │    └─ 取得當前 finalized slot：
  │         connection.getSlot({ commitment: 'finalized' })
  │    └─ UPDATE transaction SET status=1
  │         WHERE networkId=5 AND status=0
  │         AND block_number IS NOT NULL
  │         AND :finalizedSlot - block_number >= 0
  │
  └─ 5. 更新 BlockCursor
       └─ blockNumber = 最新處理的 slot
       └─ blockHash = 最新處理的 signature
```

### 4.3 解析 SOL Transfer

Solana 交易結構中判斷 SOL 原生轉帳：

```typescript
// transaction.meta.preBalances / postBalances 對應 transaction.transaction.message.accountKeys
// 計算差值即可得到每個帳戶的 SOL 變動
const accountKeys = tx.transaction.message.accountKeys.map(k => k.toBase58())
const preBalances = tx.meta.preBalances   // lamports[]
const postBalances = tx.meta.postBalances // lamports[]

for (let i = 0; i < accountKeys.length; i++) {
  const diff = postBalances[i] - preBalances[i]
  if (diff > 0 && memberAddressSet.has(accountKeys[i])) {
    // 此帳戶收到 SOL，diff 為 lamports
    // amount = diff / 1e9 (9 decimals)
  }
}
```

**注意**：需排除手續費支付者的扣款（index 0 通常是 fee payer），以及系統 program 的 rent-exempt 變動。

判斷規則：
- `diff > 0` 且地址是我方會員 → 收款
- 排除 fee payer 的 `diff`（含手續費扣款，不是真正的 transfer out）
- 交易 `err !== null` → 失敗交易，跳過

---

## 五、斷線 / 錯誤處理

### HTTP Polling 天然容錯

| 情境 | 處理方式 |
|------|----------|
| RPC 回傳 429 (rate limit) | 指數退避重試（1s → 2s → 4s，最多 30s） |
| RPC timeout | 跳過此次 poll，下次繼續 |
| 重啟 | 從 BlockCursor 的 lastSignature 接續，不重複 |
| 地址新增 | 下次 poll 自動包含（每次從 DB 載入） |

### Rate Limit 保護

Solana 公開 RPC（devnet/testnet）限制：
- 每 10 秒 100 個請求
- 單 IP 限制

策略：
- 每個地址的 `getSignaturesForAddress` 之間加 200ms 間隔
- `getTransaction` 請求之間加 100ms 間隔
- 若觸及 429，整個 poll cycle 延遲 10 秒

---

## 六、實作步驟（Phase 拆分）

### Phase 1：核心 SOL 收款偵測（本次實作）

- [ ] `sync/SolSlotSync.ts`：
  - 初始化 `@solana/web3.js` Connection
  - Polling loop（5s interval）
  - `getSignaturesForAddress` 拉取新交易
  - 解析 pre/postBalances 偵測 SOL 收款
  - upsert Transaction（type=2, status=0）
  - Confirmation 升級（pending → confirmed，基於 finalized slot）
  - BlockCursor 維護
  - Rate limit 保護 + 指數退避
- [ ] `sync/SyncManager.ts` 修改：
  - 新增 `SOL` protocol 支援
  - 管理 `SolSlotSync` 實例的 start/stop
- [ ] 驗證：
  - 在 Devnet 用 airdrop 模擬收款
  - 確認 Transaction 記錄正確建立
  - 確認 confirmation 升級正常運作

### Phase 2：外送交易追蹤

- [ ] Poll 時掃描 `status=0, type=1, blockNumber IS NULL` 的 pending sends
- [ ] 呼叫 `getSignatureStatuses` 批量確認是否上鏈
- [ ] 上鏈成功 → 更新 blockNumber / slot；失敗 → status=2
- [ ] 利用 Phase 1 的 confirmation 升級機制自動 confirmed

### Phase 3：SPL Token 支援

- [ ] 解析交易中的 Token Program instructions
- [ ] 識別 SPL Token Transfer（`TokenkegQEcnVd7gBR...` program）
- [ ] 從 `preTokenBalances` / `postTokenBalances` 取得代幣變動
- [ ] 對應 `Asset` 表的 `contractAddress`（存 SPL token mint address）
- [ ] Seed 新增 SPL Token 資產（如 USDC on Solana: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`）

### Phase 4：WebSocket 加速（可選）

- [ ] 加入 `connection.onLogs` 即時監聽 System Program 日誌
- [ ] WS 收到通知 → 立即觸發一次 poll（而非等 5s）
- [ ] WS 斷線 → 退回純 polling，不影響正確性

---

## 七、技術細節

### 依賴套件

```bash
pnpm --filter api add @solana/web3.js
```

### Solana RPC Endpoints（Devnet）

| 環境 | HTTP URL | 用途 |
|------|----------|------|
| Devnet | `https://api.devnet.solana.com` | 開發測試 |
| Testnet | `https://api.testnet.solana.com` | 正式測試 |
| Mainnet | `https://api.mainnet-beta.solana.com` | 生產（未來） |

可替換為 Helius / QuickNode / Alchemy 等付費 RPC 以獲得更高 rate limit。

### 核心 API 使用

```typescript
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'

const connection = new Connection(nodeHttpUrl, 'confirmed')

// 1. 取得某地址的最新交易 signatures
const sigs = await connection.getSignaturesForAddress(
  new PublicKey(address),
  { until: lastSignature, limit: 50 },
  'confirmed'
)

// 2. 取得交易詳情
const tx = await connection.getTransaction(signature, {
  commitment: 'confirmed',
  maxSupportedTransactionVersion: 0,
})

// 3. 取得當前 finalized slot
const finalizedSlot = await connection.getSlot('finalized')

// 4. 批量查詢 signature 狀態
const statuses = await connection.getSignatureStatuses(signatures)
```

### 金額轉換

```typescript
// SOL: 9 decimals (1 SOL = 1_000_000_000 lamports)
const solAmount = (diffLamports / LAMPORTS_PER_SOL).toString()
// 或使用 asset.decimals = 9 from DB
```

### Network 啟用（管理員操作）

```sql
UPDATE network SET
  sync_enabled = true,
  node_http_url = 'https://api.devnet.solana.com'
WHERE id = 5;
```

---

## 八、SolSlotSync 類別設計

```typescript
export class SolSlotSync {
  private connection!: Connection
  private networkId = 5
  private confirmationBlocks!: number
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private polling = false  // 防止重入

  async start(): Promise<void>
  stop(): void

  private async loadConfig(): Promise<void>
  private async poll(): Promise<void>
  private async processAddress(address: string, userId: bigint): Promise<string | null>
  private async processTransaction(sig: string, userId: bigint, address: string): Promise<void>
  private async upgradeConfirmations(): Promise<void>
  private async saveCursor(slot: bigint, signature: string): Promise<void>
}
```

### SyncManager 修改

```typescript
// 新增 SOL protocol 支援
const SOL_PROTOCOL = 'SOL'

export async function startSync(): Promise<void> {
  const networks = await prisma.network.findMany({
    where: { syncEnabled: true },
  })

  for (const network of networks) {
    if (EVM_PROTOCOLS.has(network.protocol)) {
      // 現有 EthBlockSync 邏輯
    } else if (network.protocol === SOL_PROTOCOL) {
      const sync = new SolSlotSync(network.id)
      activeSolSyncs.set(network.id, sync)
      await sync.start()
    }
  }
}
```

---

## 九、測試計劃

### 自動化驗證

1. **Devnet Airdrop 測試**：
   - 建立測試用錢包地址（寫入 DB）
   - 用 `solana airdrop 1 <address> --url devnet` 送 SOL
   - 驗證 5 秒內 Transaction 記錄出現（status=0）
   - 等待 ~15 秒驗證升級為 status=1

2. **外送追蹤測試**：
   - 手動建立 pending send 記錄（status=0, type=1, blockNumber=null）
   - 發送交易後驗證 blockNumber 被填入
   - 驗證 finalized 後升級為 status=1

3. **重啟測試**：
   - 停止 sync → 發送交易 → 重啟 sync
   - 驗證 catchup 正常拉取遺漏交易

4. **Rate limit 測試**：
   - 模擬 429 回應
   - 驗證指數退避機制正常運作

---

## 十、風險與注意事項

1. **Solana Devnet 穩定性**：Devnet 偶爾重置（所有歷史清空），需要有 cursor 失效的處理（fallback 到 catchup scan）。
2. **Rate Limit**：公共 RPC 限制嚴格，地址數超過 50 時需改用付費 RPC 或分批處理。
3. **地址大小寫**：Solana 地址是 Base58，**大小寫敏感**，不可 toLowerCase()。與 ETH 不同。
4. **Versioned Transactions**：Solana 有 legacy 與 v0 兩種格式，`getTransaction` 需設定 `maxSupportedTransactionVersion: 0`。
5. **金額精度**：SOL 為 9 decimals（lamports），存入 `Transaction.amount` 時轉為 `Decimal`。
6. **Skip slots**：Solana 的 slot 可能被 skip（無 block 產出），這不是 reorg，不需要特別處理。
7. **Fee Payer 扣款**：fee payer 的 balance 減少包含手續費，解析時需從 `meta.fee` 排除手續費部分，避免誤判為 send。