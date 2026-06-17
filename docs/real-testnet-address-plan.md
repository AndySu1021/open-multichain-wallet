# 真實測試網地址產生 — 實作計劃

## 目標

1. 每個用戶擁有獨立的私鑰（BIP39 助記詞）
2. 從同一組私鑰，依 BIP44 標準派生各條鏈的地址
3. Network 資料表以 `hdDerivationPath` + `hdCurve` 取代 `hdCoinType`

---

## 架構決策

### HD Wallet（分層確定性錢包）

採用 **BIP39 + BIP44** 標準：

- 每位用戶初次建立任一鏈地址時，生成一組 12 字助記詞
- 加密後儲存於 `User.encryptedSeed`（新增欄位）
- 各鏈的派生路徑與曲線類型存在 `Network` 表，KeyManager 從 DB 讀取，不寫死
- `WalletAddress.encryptedKeyRef` 改為儲存派生路徑（如 `m/44'/60'/0'/0/0`）作為稽核軌跡

### 為何不用 `hdCoinType: Int?`

`hdCoinType` 單一欄位有兩個缺陷：

| 問題 | 說明 |
|------|------|
| 不夠描述曲線類型 | SOL/Cardano 使用 **ed25519**（SLIP-0010），`@scure/bip32` 的 secp256k1 派生邏輯不適用 |
| Purpose 可能不同 | Cardano Shelley 使用 purpose `1852'`，而非標準的 `44'` |
| Nullable 帶來歧義 | 若為 null 代表「尚未設定」還是「此鏈不適用 BIP44」？不清楚 |

**改用 `hdDerivationPath: String` + `hdCurve: String`（均非 nullable）**：
- 每條支援的鏈都必須填寫，強制明確
- 新鏈只需在 `seed.sql` 加一行，不需動 KeyManager 邏輯

### 各鏈派生設定

| Chain | Protocol | hdDerivationPath    | hdCurve     | 地址格式                    |
|-------|----------|---------------------|-------------|-----------------------------|
| ETH   | ERC20    | `m/44'/60'/0'/0/0`  | secp256k1   | `0x...`（EIP-55 checksum）  |
| BTC   | BTC      | `m/44'/1'/0'/0/0`   | secp256k1   | `tb1q...`（testnet bech32） |
| XRP   | XRP      | `m/44'/144'/0'/0/0` | secp256k1   | `r...`（base58check）       |
| BSC   | BEP20    | `m/44'/60'/0'/0/0`  | secp256k1   | `0x...`（同 ETH，EVM）      |
| SOL\* | —        | `m/44'/501'/0'/0'`  | ed25519     | base58                      |
| ADA\* | —        | `m/1852'/1815'/0'/0/0` | ed25519  | bech32 addr1...             |

> \* SOL / ADA 為未來擴充範例，無需現在實作。新增時：1) 加 adapter 2) seed.sql 新增 network row 3) 不動 KeyManager 邏輯。  
> ETH 與 BSC 共用派生路徑，同一用戶兩鏈地址相同——符合 MetaMask 標準行為。

---

## Key Security 架構（三層策略）

> 回應問題：`encryptedSeed` 存 DB 的風險與替代方案

### 現狀風險

將加密後的助記詞存在 DB 有「雙重單點失敗」問題：
- **DB breach + master key 外洩** → 攻擊者可解密所有用戶私鑰
- Master key 存在 env var → 若 server 被入侵，key 與 ciphertext 同時暴露

### 三層遞進策略

```
Tier 1（Testnet MVP）    Tier 2（Pre-production）    Tier 3（真實資金）
───────────────────      ──────────────────────────   ──────────────────────
encryptedSeed 存 DB  →   encryptedSeed 存 DB       →  MPC / 非託管
master key 在 env        master key 在 AWS KMS         私鑰碎片化，無完整私鑰
                         HSM 保護，CloudTrail 稽核
```

#### Tier 1 — 本計劃（Testnet/MVP）
- Master key 從 `WALLET_MASTER_KEY` env var 讀取
- 可接受原因：testnet 無真實資金，不涉及合規
- 缺點：server process 記憶體中有 master key 明文

#### Tier 2 — AWS KMS（生產前必做）

架構變更最小（只換 `encrypt/decrypt` 實作）：

```
DB 存的 encryptedSeed  →  用 KMS Data Key 加密
KMS Data Key           →  由 KMS Master Key（CMK）加密，從不離開 HSM
server 簽名流程        →  呼叫 kms.decrypt() → 得到 Data Key → 解密 seed → 派生私鑰 → 簽名 → 私鑰丟棄
```

優點：
- KMS Master Key 永不離開 HSM（FIPS 140-2 Level 3）
- 每次解密都有 CloudTrail log，可稽核
- 金鑰輪替由 KMS 管理（自動輪替）
- 程式碼變更只有 `crypto.ts` 中替換 decrypt 呼叫

**實作時機**：準備上線前，或開始收 beta 用戶前。

#### Tier 3 — MPC（真實資金）

完全不自存私鑰：

| 方案 | 說明 |
|------|------|
| **Fireblocks** | 企業級 MPC-CMP，3-3 門檻簽名，適合交易所/機構 |
| **Privy** | 消費者導向，embedded wallet，支援 email/social 登入 |
| **Web3Auth** | 開源 MPC，可自架，社群較活躍 |

特性：私鑰碎片分散於用戶裝置、服務端、第三方，任一方單獨無法還原完整私鑰。  
**切換成本**：替換 `KeyManager` interface 實作，業務邏輯零修改（這正是 interface 抽象的設計用意）。

---

## 實作步驟

### Step 1 — 安裝套件

```bash
pnpm --filter api add @scure/bip39 @scure/bip32 viem bitcoinjs-lib tiny-secp256k1 xrpl
```

| 套件              | 用途                                              |
|-------------------|---------------------------------------------------|
| `@scure/bip39`    | BIP39 助記詞生成與 seed 衍生（audited library）    |
| `@scure/bip32`    | BIP32/BIP44 HD key 派生（secp256k1）               |
| `viem`            | ETH / BSC 地址生成、Sepolia/BSC testnet RPC        |
| `bitcoinjs-lib`   | BTC 地址生成、PSBT 交易簽名                        |
| `tiny-secp256k1`  | bitcoinjs-lib 的 secp256k1 實作（必要 peer dep）   |
| `xrpl`            | XRP 地址生成、testnet WebSocket                    |

---

### Step 2 — 資料庫 Schema 更新

#### 2a. `Network` 新增兩欄位（取代 hdCoinType）

```prisma
model Network {
  // ... 現有欄位
  hdDerivationPath  String  @map("hd_derivation_path")           // e.g. "m/44'/60'/0'/0/0"
  hdCurve           String  @default("secp256k1") @map("hd_curve") // "secp256k1" | "ed25519"
}
```

**seed.sql 更新（四條鏈補值）：**
```sql
UPDATE network SET hd_derivation_path = 'm/44''/60''/0''/0/0',  hd_curve = 'secp256k1' WHERE name = 'Ethereum';
UPDATE network SET hd_derivation_path = 'm/44''/1''/0''/0/0',   hd_curve = 'secp256k1' WHERE name = 'Bitcoin';
UPDATE network SET hd_derivation_path = 'm/44''/144''/0''/0/0', hd_curve = 'secp256k1' WHERE name = 'XRP Ledger';
UPDATE network SET hd_derivation_path = 'm/44''/60''/0''/0/0',  hd_curve = 'secp256k1' WHERE name = 'Binance Smart Chain';
```

#### 2b. `User` 新增 `encryptedSeed`

```prisma
model User {
  // ... 現有欄位
  encryptedSeed String? @map("encrypted_seed")  // AES-256-GCM 加密後的 BIP39 mnemonic（Tier 1）
}
```

#### 2c. 執行 migration

```bash
pnpm --filter api prisma migrate dev --name add_hd_wallet_fields
```

---

### Step 3 — 加密工具（`apps/api/src/lib/crypto.ts`）

Tier 1 實作，介面設計預留 Tier 2 換 KMS 的空間：

```typescript
// apps/api/src/lib/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12   // GCM 推薦 96-bit IV
const TAG_LENGTH = 16

function getMasterKey(): Buffer {
  const hex = process.env.WALLET_MASTER_KEY
  if (!hex || hex.length !== 64) throw new Error('WALLET_MASTER_KEY must be 64 hex chars')
  return Buffer.from(hex, 'hex')
}

export function encryptSeed(plaintext: string): string {
  const key = getMasterKey()                             // Tier 2：換成 KMS generateDataKey
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64')
}

export function decryptSeed(ciphertext: string): string {
  const key = getMasterKey()                             // Tier 2：換成 KMS decrypt
  const buf = Buffer.from(ciphertext, 'base64')
  const iv = buf.subarray(0, IV_LENGTH)
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(encrypted) + decipher.final('utf8')
}
```

**環境變數（`.env`）：**
```
WALLET_MASTER_KEY=<64 hex chars>   # openssl rand -hex 32
```

---

### Step 4 — HdKeyManager（`apps/api/src/keymanager/HdKeyManager.ts`）

KeyManager interface 維持不變（`chain: Chain` 參數），內部透過 chain → network 查 DB 讀取 `hdDerivationPath` 與 `hdCurve`，不在程式碼中寫死：

```typescript
// apps/api/src/keymanager/HdKeyManager.ts
import { generateMnemonic, mnemonicToSeedSync } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'
import { HDKey } from '@scure/bip32'
import { privateKeyToAddress } from 'viem/accounts'
import * as bitcoin from 'bitcoinjs-lib'
import { Wallet as XrpWallet } from 'xrpl'
import { encryptSeed, decryptSeed } from '../lib/crypto.js'
import { prisma } from '../db/index.js'
import type { Chain } from '@fox-wallet/shared'

// chain → network protocol 對應（已存在於 wallet.ts，可共用）
const CHAIN_TO_PROTOCOL: Record<Chain, string> = {
  eth: 'ERC20', btc: 'BTC', xrp: 'XRP', bsc: 'BEP20',
}

export class HdKeyManager implements KeyManager {

  // 從 Network 表讀取派生設定
  private async getDerivationConfig(chain: Chain) {
    const protocol = CHAIN_TO_PROTOCOL[chain]
    const network = await prisma.network.findFirstOrThrow({ where: { protocol } })
    return { path: network.hdDerivationPath, curve: network.hdCurve }
  }

  // 取得或生成 BIP39 seed（64 bytes）
  private async getOrCreateSeed(userId: bigint): Promise<Uint8Array> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
    if (user.encryptedSeed) {
      return Buffer.from(mnemonicToSeedSync(decryptSeed(user.encryptedSeed)))
    }
    const mnemonic = generateMnemonic(wordlist, 128)   // 12 字
    await prisma.user.update({
      where: { id: userId },
      data: { encryptedSeed: encryptSeed(mnemonic) },
    })
    return Buffer.from(mnemonicToSeedSync(mnemonic))
  }

  // secp256k1：@scure/bip32 HDKey
  private deriveSecp256k1Key(seed: Uint8Array, path: string): Uint8Array {
    const hdkey = HDKey.fromMasterSeed(seed)
    const child = hdkey.derive(path)
    if (!child.privateKey) throw new Error('Key derivation failed')
    return child.privateKey
  }

  // 各鏈地址生成
  private toEthAddress(privateKey: Uint8Array): string {
    return privateKeyToAddress(`0x${Buffer.from(privateKey).toString('hex')}`)
  }

  private toBtcAddress(privateKey: Uint8Array): string {
    const { address } = bitcoin.payments.p2wpkh({
      pubkey: Buffer.from(
        bitcoin.ECPair.fromPrivateKey(Buffer.from(privateKey), { network: bitcoin.networks.testnet }).publicKey
      ),
      network: bitcoin.networks.testnet,
    })
    if (!address) throw new Error('BTC address derivation failed')
    return address
  }

  private toXrpAddress(privateKey: Uint8Array): string {
    const wallet = XrpWallet.fromPrivateKey(Buffer.from(privateKey).toString('hex').toUpperCase())
    return wallet.address
  }

  private deriveAddress(chain: Chain, privateKey: Uint8Array): string {
    if (chain === 'eth' || chain === 'bsc') return this.toEthAddress(privateKey)
    if (chain === 'btc') return this.toBtcAddress(privateKey)
    if (chain === 'xrp') return this.toXrpAddress(privateKey)
    throw new Error(`Unsupported chain: ${chain}`)
  }

  async createWallet(userId: string, chain: Chain): Promise<{ address: string }> {
    const { path, curve } = await this.getDerivationConfig(chain)
    if (curve !== 'secp256k1') throw new Error(`Curve ${curve} not yet supported`)
    const seed = await this.getOrCreateSeed(BigInt(userId))
    const privateKey = this.deriveSecp256k1Key(seed, path)
    const address = this.deriveAddress(chain, privateKey)
    return { address }
  }

  async getAddress(userId: string, chain: Chain): Promise<string | null> {
    // wallet.ts 的 lazy creation 已處理此邏輯，此處直接查 DB
    const protocol = CHAIN_TO_PROTOCOL[chain]
    const network = await prisma.network.findFirst({ where: { protocol } })
    if (!network) return null
    const record = await prisma.walletAddress.findFirst({
      where: { userId: BigInt(userId), networkId: network.id },
    })
    return record?.address ?? null
  }

  async signTransaction(userId: string, chain: Chain, rawTx: unknown): Promise<string> {
    const { path, curve } = await this.getDerivationConfig(chain)
    if (curve !== 'secp256k1') throw new Error(`Curve ${curve} not yet supported`)
    const seed = await this.getOrCreateSeed(BigInt(userId))
    const privateKey = this.deriveSecp256k1Key(seed, path)
    // 各鏈簽名邏輯（Step 6 ChainAdapter 對接時完善）
    if (chain === 'eth' || chain === 'bsc') {
      const { signTransaction } = await import('viem/accounts')
      return signTransaction({ privateKey: `0x${Buffer.from(privateKey).toString('hex')}` as `0x${string}` }, rawTx as Parameters<typeof signTransaction>[1])
    }
    throw new Error(`signTransaction for ${chain} not yet implemented`)
  }
}
```

---

### Step 5 — 更新 `wallet.ts`

```typescript
// apps/api/src/routes/wallet.ts
import { HdKeyManager } from '../keymanager/HdKeyManager.js'

const keyManager = new HdKeyManager()  // 取代 MockKeyManager
```

`encryptedKeyRef` 欄位改為儲存派生路徑（稽核用）：
```typescript
// getOrCreateAddress 中
const { path } = await /* 從 network 取得 */ ...
await prisma.walletAddress.create({
  data: { userId, networkId, address, encryptedKeyRef: network.hdDerivationPath }
})
```

---

### Step 6 — 真實 ChainAdapter 實作（選做，可分次完成）

#### EthAdapter — Sepolia testnet
```
環境變數：ALCHEMY_API_KEY 或 INFURA_API_KEY
RPC URL：https://eth-sepolia.g.alchemy.com/v2/<key>
```
- `getBalance`：viem `publicClient.getBalance()` + `readContract()` for ERC20
- `getTransactionHistory`：Alchemy Enhanced APIs 或 Etherscan Sepolia API
- `broadcastTransaction`：`publicClient.sendRawTransaction()`

#### BtcAdapter — Bitcoin testnet3
```
環境變數：BLOCKCYPHER_TOKEN（free tier 可用）
API：https://api.blockcypher.com/v1/btc/test3
```
- `getBalance`：`GET /addrs/<address>/balance`
- `getTransactionHistory`：`GET /addrs/<address>/full`
- `broadcastTransaction`：`POST /txs/push`

#### XrpAdapter — XRP testnet
```
WebSocket：wss://s.altnet.rippletest.net:51233
```
- `getBalance`：`account_info` command
- `getTransactionHistory`：`account_tx` command
- `broadcastTransaction`：`submit` command

#### BscAdapter — BSC testnet
```
RPC URL：https://data-seed-prebsc-1-s1.binance.org:8545（公開）
```
- 同 EthAdapter 邏輯，替換 publicClient chain 設定

---

## 新增環境變數

```env
# .env（僅後端）
WALLET_MASTER_KEY=           # 32 bytes hex，openssl rand -hex 32（Tier 1 必填）
ALCHEMY_API_KEY=             # Ethereum Sepolia RPC（Step 6 需要）
BLOCKCYPHER_TOKEN=           # Bitcoin testnet（Step 6 需要，free tier 可空）
BSC_TESTNET_RPC=https://data-seed-prebsc-1-s1.binance.org:8545
```

---

## 執行順序

```
Step 1  安裝套件
Step 2  schema 變更 + migration + seed.sql 更新
Step 3  實作 crypto.ts 加密工具
Step 4  實作 HdKeyManager（核心功能）
Step 5  wallet.ts 切換 keyManager
Step 6  （選做）各 ChainAdapter 對接真實 RPC
```

Step 1~5 完成後，`GET /wallet/address?networkId=1` 即可回傳真實可用的 Sepolia 地址。

---

## 注意事項

- **同一用戶的 ETH 與 BSC 地址相同**（派生路徑相同）：符合 MetaMask 標準行為
- **BTC 使用 coin type 1**（testnet 專用，非 mainnet 的 0）：避免 testnet/mainnet 地址混用
- **新增鏈只需**：加 adapter + registry + seed.sql network row（`hdDerivationPath` + `hdCurve`）— KeyManager 邏輯零修改
- **ed25519 鏈（SOL / ADA）**：需額外安裝 `@scure/bip32` ed25519 模式，`signTransaction` 中加對應分支
- 現有 mock 地址若需清除，執行 `DELETE FROM wallet_address` 後重新 lazy-create