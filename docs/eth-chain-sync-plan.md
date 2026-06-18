# ETH / ERC20 鏈上數據同步計劃

**目標**：實作一個後台 Block Sync 機制，監聽 Ethereum Sepolia，自動偵測會員收款、更新外送交易確認狀態，並支援 reorg rollback。

---

## 一、前置問題決策

### Q1. 是否過濾非我方會員地址？

**決策：是。直接查 DB，不需要記憶體快取。**

每次處理一個新 block 時，直接對 `wallet_address` 表做一次查詢：
```sql
SELECT address FROM wallet_address WHERE network_id = 1
```
結果轉成 `Set<string>`（統一 `toLowerCase()`）用於當次 block 的過濾。

不需要額外的 `AddressRegistry` 快取層，原因：
- 每個 block ~12 秒，一次 DB 查詢開銷可接受
- 新會員 lazy creation 的地址自動包含在內，不會漏掉
- 邏輯更簡單，不用管快取失效問題

---

### Q2. 幾個 block 才算 finalized？

Ethereum PoS（Sepolia）有三層確認狀態：

| 狀態        | 定義                                  | 約等於              |
|-------------|---------------------------------------|---------------------|
| `latest`    | 最新出塊，可能被 reorg                | 立即                |
| `safe`      | 兩個 epoch checkpoint 已通過          | ~2 分鐘 / 12 blocks |
| `finalized` | 已被 FFG finality 保護，實際上不可逆  | ~13 分鐘 / 64 blocks|

**決策：兩階段確認**

1. **1 confirmation**：偵測到 transfer 事件即在 DB 建立 `status=0 (pending)`，讓用戶看到「進行中」
2. **`confirmationBlocks` 個 block**：更新 `status=1 (confirmed)`

`confirmationBlocks` 的值存在 `network` 表（見資料模型），每條鏈可獨立設定（ETH=12、BTC=6、XRP=1）。

---

### Q3. 第一階段範圍（只做 log 拉取，不做 pending 監聽）

**Phase 1 只做：**
- 拉取 ETH native transfer logs（偵測收款）
- 拉取 ERC20 Transfer event logs（偵測收款）
- 將符合條件的交易 upsert 到 DB
- 對已有 `blockNumber` 的交易做 confirmation 升級（pending → confirmed）

**Phase 1 不做：**
- 監聽我方外送 pending tx 是否上鏈（第二階段再補）
- mempool 監聽

---

### Q4. 如何判斷一筆 pending 交易已過 `confirmationBlocks` 個 block？

**機制：**

1. 收款 tx 第一次偵測到時，記錄 `blockNumber`（tx 所在的 block 高度）到 `Transaction` 表
2. 每次處理新 block 時，執行一次 confirmation 升級查詢：
   ```sql
   UPDATE transaction
   SET status = 1
   WHERE status = 0
     AND block_number IS NOT NULL
     AND network_id = 1
     AND :currentBlockNumber - block_number >= :confirmationBlocks
   ```
3. 無需逐一查鏈，純 DB 計算，效率高

---

### Q5. 是否接入 WebSocket 監聽？

**決策：WebSocket 為主、HTTP polling 為備援。**

| 方案                         | 優點                  | 缺點                        |
|------------------------------|-----------------------|-----------------------------|
| HTTP polling (12s)           | 簡單、無狀態           | 延遲高，每次都要發 request   |
| WebSocket (viem watchBlocks) | 即時、減少 API 消耗   | 需要處理斷線重連              |

使用 viem 的 `watchBlocks` + WebSocket transport，搭配 HTTP fallback poller 作為安全網。

---

### Q6. WebSocket 斷線怎麼辦？

**三層防護策略：**

1. **viem 內建重連**：`webSocket` transport 設定 `reconnect: { delay: 1000, retries: Infinity }`
2. **Heartbeat 監控**：每 30 秒 check 上次收到 block 的時間，若超過 90 秒未收到新 block，主動重建連線
3. **HTTP Fallback Poller**：WS 斷線期間啟動 HTTP polling 每 15 秒抓最新 block，補掃 `cursor+1 ~ currentBlock`，WS 恢復後自動停止

---

## 二、整體架構

```
apps/api/src/
  sync/
    types.ts           # BlockRange, SyncedTx 等型別
    EthBlockSync.ts    # 核心：WS watchBlocks + HTTP fallback + block 處理邏輯
    SyncManager.ts     # 統一 start/stop（未來可擴展 BTC/XRP）
  jobs/
    quoteSync.ts       # 現有（不動）
```

新增 Prisma migration：
- `Network` 新增 `confirmationBlocks Int`
- `Transaction` 新增 `blockNumber BigInt?` / `blockHash String?`
- 新增 `BlockCursor` 表

---

## 三、資料模型變更

### `Network` 新增欄位

```prisma
confirmationBlocks  Int  @default(12)  @map("confirmation_blocks")
```

Seed 資料對應更新：

| network_id | 網路                  | confirmationBlocks |
|------------|-----------------------|--------------------|
| 1          | Ethereum              | 12                 |
| 2          | Bitcoin               | 6                  |
| 3          | XRP Ledger            | 1                  |
| 4          | Binance Smart Chain   | 12                 |
| 5          | Solana                | 32                 |
| 6          | Cardano               | 10                 |

### 新增 `BlockCursor` 表

```prisma
model BlockCursor {
  id          Int      @id @default(autoincrement())
  networkId   Int      @unique @map("network_id")
  blockNumber BigInt   @map("block_number")
  blockHash   String   @map("block_hash")
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@map("block_cursor")
}
```

**用途**：
- 重啟後從 `blockNumber` 繼續補掃，不重複不漏掉
- `blockHash` 用於 reorg 偵測（比對 parentHash）

### `Transaction` 新增欄位

```prisma
blockNumber  BigInt?  @map("block_number")  // 上鏈的 block height，pending 交易為 null
blockHash    String?  @map("block_hash")    // 用於 reorg rollback
```

> `Transaction` 以 `txHash` 為業務唯一鍵，upsert 時使用。

---

## 四、ETH Block Sync 流程

### 4.1 啟動流程

```
SyncManager.start()
  └─ EthBlockSync.start()
       ├─ 從 Network 表讀取 confirmationBlocks（networkId=1）
       ├─ 從 BlockCursor 讀取 lastBlock（若無，取 currentBlock - ETH_CATCHUP_BLOCKS）
       ├─ 補掃 lastBlock+1 ~ currentBlock（catchup scan）
       └─ 啟動 watchBlocks（WS）+ heartbeat 監控
```

### 4.2 每個新 Block 的處理邏輯

```
processBlock(block, currentBlockNumber)
  │
  ├─ 1. Reorg 偵測
  │    └─ 若 block.parentHash ≠ BlockCursor 的 blockHash
  │         └─ handleReorg()：回退並重掃
  │
  ├─ 2. 從 DB 取本次 block 要過濾的會員地址
  │    └─ prisma.walletAddress.findMany({ where: { networkId: 1 } })
  │         → memberAddressSet: Set<string>（toLowerCase）
  │
  ├─ 3. 偵測 ETH 原生收款
  │    └─ 掃 block.transactions：value > 0n && to ∈ memberAddressSet
  │         └─ upsert Transaction（type=2 receive, status=0, blockNumber, blockHash）
  │
  ├─ 4. 偵測 ERC20 Transfer 事件（USDT / USDC）
  │    └─ getLogs({ address: [USDT_ADDR, USDC_ADDR], event: Transfer, blockHash })
  │         → 過濾 args.to ∈ memberAddressSet
  │              └─ upsert Transaction（type=2 receive, status=0, blockNumber, blockHash）
  │
  ├─ 5. Confirmation 升級（純 DB 操作）
  │    └─ 更新 status=0 → 1：WHERE block_number IS NOT NULL
  │         AND currentBlockNumber - block_number >= confirmationBlocks
  │
  └─ 6. 更新 BlockCursor（blockNumber = block.number, blockHash = block.hash）
```

### 4.3 Reorg 處理

```
handleReorg(detectedBlock)
  ├─ 往回逐 block 比對 DB hash vs 鏈上 hash，找到最近共同祖先
  ├─ 將祖先之後的所有 Transaction 標記 status=-1（reorged）
  ├─ BlockCursor 回退到祖先 block
  └─ 從祖先重新觸發 processBlock（新的正確鏈）
```

> Sepolia reorg 深度通常 < 2 blocks，防護到 32 blocks（1 epoch）即可。

---

## 五、WS 斷線 / Fallback 機制

```
EthBlockSync
  ├─ wsClient: viem WebSocket（reconnect: { delay: 1000, retries: Infinity }）
  ├─ httpClient: viem HTTP（Alchemy HTTP endpoint）
  ├─ lastBlockTime: Date（每次 processBlock 更新）
  ├─ heartbeatTimer: setInterval(30s)
  │    └─ 若 now - lastBlockTime > 90s → 啟動 httpFallbackPoller
  └─ httpFallbackPoller: setInterval(15s)
       ├─ getBlockNumber() 取最新 block
       ├─ 補掃 cursor+1 ~ latest
       └─ 若 processBlock 被 WS 觸發（lastBlockTime 更新）→ 停止自己
```

---

## 六、實作步驟（Phase 拆分）

### Phase 1：核心收款偵測（此次範圍）
- [ ] Prisma migration：`Network.confirmationBlocks`、`Transaction.blockNumber/blockHash`、`BlockCursor` 表
- [ ] 更新 seed.sql：各 network 的 `confirmation_blocks` 值
- [ ] `sync/types.ts`：`BlockRange`、`SyncedTx`
- [ ] `sync/EthBlockSync.ts`：
  - WS + HTTP fallback
  - `processBlock`：ETH native + ERC20 Transfer 收款偵測
  - Confirmation 升級（步驟 5）
  - `BlockCursor` 維護
  - Catchup scan
- [ ] `sync/SyncManager.ts`：`startSync` / `stopSync`
- [ ] `index.ts`：整合 SyncManager（`startSync` / `stopSync`）

### Phase 2：外送交易狀態追蹤
- [ ] `processBlock` 新增步驟：掃 `status=0 AND type=1 (send)` 的交易 txHash，確認是否出現在此 block，更新 `blockNumber`
- [ ] 利用現有 confirmation 升級機制自動 confirmed

### Phase 3：Reorg 支援
- [ ] `handleReorg` 實作
- [ ] 整合測試：模擬 reorg 場景

### Phase 4：斷線防護
- [ ] Heartbeat monitor
- [ ] HTTP Fallback Poller
- [ ] 整合測試：人為切斷 WS，確認 fallback 正常啟動

---

## 七、技術細節

### ERC20 合約地址（Sepolia）

| 代幣 | 合約地址                                       | symbolId | decimals |
|------|------------------------------------------------|----------|----------|
| USDT | `0x7169D38820dfd117C3FA1f22a697dba58d90BA06`   | 5        | 6        |
| USDC | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`   | 6        | 6        |

### viem API 使用

```typescript
// WS client（主）
const wsClient = createPublicClient({
  chain: sepolia,
  transport: webSocket(env.ETH_NODE_WS_URL, {
    reconnect: { delay: 1000, retries: Infinity },
  }),
})

// HTTP client（fallback / catchup）
const httpClient = createPublicClient({
  chain: sepolia,
  transport: http(env.ETH_NODE_HTTP_URL),
})

// watchBlocks
wsClient.watchBlocks({
  includeTransactions: true,
  onBlock: (block) => void processBlock(block),
  onError: (err) => console.error('[EthSync] WS error:', err),
})

// ERC20 Transfer logs（單 block）
const logs = await httpClient.getLogs({
  address: [USDT_ADDR, USDC_ADDR],
  event: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)'),
  blockHash: block.hash,
})
```

### 環境變數新增

```
ALCHEMY_ETH_WS_URL=wss://eth-sepolia.g.alchemy.com/v2/<API_KEY>
ALCHEMY_ETH_HTTP_URL=https://eth-sepolia.g.alchemy.com/v2/<API_KEY>
ETH_SYNC_ENABLED=true
ETH_CATCHUP_BLOCKS=100
```

> `confirmationBlocks` 改由 `network` 表讀取，不再用環境變數。

---

## 八、未來擴展（不在此次 scope）

- BTC：BlockCypher webhook 或 ZMQ socket
- XRP：xrpl.js 的 `subscribe transactions`
- Solana：Helius webhook
- `SyncManager` 抽象成通用介面，各鏈 Sync 實作 `start/stop/processBlock`

---

## 九、風險與注意事項

1. **重複偵測防護**：upsert 以 `txHash + networkId` 為唯一鍵，reorg 後重上鏈不會重複建立。
2. **大量歷史補掃**：catchup 每次最多掃 `ETH_CATCHUP_BLOCKS`（100），分批 `getLogs` 避免超過 Alchemy rate limit。
3. **地址大小寫**：ETH 地址統一 `toLowerCase()` 後比對，避免 checksum 不一致導致漏掉。
4. **金額精度**：ERC20 Transfer event 的 `value` 為 raw uint256，除以 `10^decimals` 後存 `Decimal`（USDT/USDC 均為 6 decimals）。
5. **Alchemy Free Tier**：WS 占 1 個長連線，`getLogs` 每次 ~1-3 CU，Alchemy Free 每月 300M CU，testnet 足夠。