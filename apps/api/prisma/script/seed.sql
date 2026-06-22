-- ── Symbols ───────────────────────────────────────────────────────────────────
-- id 1 ETH | 2 BTC | 3 XRP | 4 BNB | 5 USDT | 6 USDC | 7 SOL | 8 ADA
-- Must be inserted before network (network.fee_symbol_id references symbol.id)
INSERT INTO symbol (id, name, status, image_url)
VALUES (1, 'ETH',  1, '/icons/symbol/ETH.png'),
       (2, 'BTC',  1, '/icons/symbol/BTC.png'),
       (3, 'XRP',  1, '/icons/symbol/XRP.png'),
       (4, 'BNB',  1, '/icons/symbol/BNB.png'),
       (5, 'USDT', 1, '/icons/symbol/USDT.png'),
       (6, 'USDC', 1, '/icons/symbol/USDC.png'),
       (7, 'SOL',  1, '/icons/symbol/SOL.png'),
       (8, 'ADA',  1, '/icons/symbol/ADA.png')
ON CONFLICT (id) DO UPDATE SET
  name      = EXCLUDED.name,
  image_url = EXCLUDED.image_url;

-- ── Networks ──────────────────────────────────────────────────────────────────
-- id 1 Ethereum | 2 Bitcoin | 3 XRP Ledger | 4 Binance Smart Chain | 5 Solana | 6 Cardano
--
-- evm_chain_id: EVM numeric chain ID (NULL for non-EVM chains)
--   11155111 = Sepolia | 97 = BSC Testnet | 1 = Mainnet | 56 = BSC | 17000 = Holesky
--
-- node_ws_url / node_http_url: set by admin to enable sync.
--   e.g. UPDATE network SET sync_enabled=true,
--          node_ws_url='wss://sepolia.infura.io/v3/<KEY>',
--          node_http_url='https://sepolia.infura.io/v3/<KEY>'
--        WHERE id = 1;
INSERT INTO network (
  id, name, protocol, status, image_url, explorer_url,
  hd_derivation_path, hd_curve,
  confirmation_blocks, evm_chain_id,
  sync_enabled, node_ws_url, node_http_url, catchup_blocks,
  gas_fee, fee_symbol_id
)
VALUES
  (1, 'Ethereum',            'ERC20', 1, '/icons/network/ETH.png', 'https://sepolia.etherscan.io',
   $$m/44'/60'/0'/0/0$$,    'secp256k1', 12, 11155111, false, NULL, NULL, 100,
   0.00042,  1),  -- fee in ETH  (symbol_id=1)

  (2, 'Bitcoin',             'BTC',   1, '/icons/network/BTC.png', 'https://blockstream.info/testnet',
   $$m/44'/1'/0'/0/0$$,     'secp256k1',  6,     NULL, false, NULL, NULL, 100,
   0.00001,  2),  -- fee in BTC  (symbol_id=2)

  (3, 'XRP Ledger',          'XRP',   1, '/icons/network/XRP.png', 'https://testnet.xrpl.org',
   $$m/44'/144'/0'/0/0$$,   'secp256k1',  1,     NULL, false, NULL, NULL, 100,
   0.000012, 3),  -- fee in XRP  (symbol_id=3)

  (4, 'Binance Smart Chain', 'BEP20', 1, '/icons/network/BNB.png', 'https://testnet.bscscan.com',
   $$m/44'/60'/0'/0/0$$,    'secp256k1', 12,       97, false, NULL, NULL, 100,
   0.000105, 4),  -- fee in BNB  (symbol_id=4)

  (5, 'Solana',              'SOL',   1, '/icons/network/SOL.png', 'https://explorer.solana.com/?cluster=testnet',
   $$m/44'/501'/0'$$,        'ed25519', 32,     NULL, false, NULL, NULL, 100,
   0.000005, 7),  -- fee in SOL  (symbol_id=7)

  (6, 'Cardano',             'ADA',   1, '/icons/network/ADA.png', 'https://preprod.cardanoscan.io',
   $$m/1852'/1815'/0'/0/0$$, 'ed25519', 10,     NULL, false, NULL, NULL, 100,
   0.17,     8)   -- fee in ADA  (symbol_id=8)

ON CONFLICT (id) DO UPDATE SET
  name               = EXCLUDED.name,
  protocol           = EXCLUDED.protocol,
  image_url          = EXCLUDED.image_url,
  explorer_url       = EXCLUDED.explorer_url,
  hd_derivation_path = EXCLUDED.hd_derivation_path,
  hd_curve           = EXCLUDED.hd_curve,
  confirmation_blocks = EXCLUDED.confirmation_blocks,
  evm_chain_id       = EXCLUDED.evm_chain_id,
  catchup_blocks     = EXCLUDED.catchup_blocks,
  gas_fee            = EXCLUDED.gas_fee,
  fee_symbol_id      = EXCLUDED.fee_symbol_id;
  -- sync_enabled / node_ws_url / node_http_url intentionally NOT overwritten
  -- so admin-configured values survive a re-seed.

-- ── Assets ────────────────────────────────────────────────────────────────────
-- decimals: token precision used to convert raw on-chain amounts to display units
--   ETH/BNB 18 | BTC 8 | XRP 6 | USDT(ERC20) 6 | USDC 6 | USDT(BEP20) 18 | SOL 9 | ADA 6
INSERT INTO asset (symbol_id, network_id, contract_address, decimals, status)
VALUES
  (1, 1, NULL,                                           18, 1),  -- ETH  / Ethereum
  (2, 2, NULL,                                            8, 1),  -- BTC  / Bitcoin
  (3, 3, NULL,                                            6, 1),  -- XRP  / XRP Ledger
  (4, 4, NULL,                                           18, 1),  -- BNB  / Binance Smart Chain
  (5, 1, '0x7169D38820dfd117C3FA1f22a697dba58d90BA06',   6, 1),  -- USDT / Ethereum (Sepolia)
  (6, 1, '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',   6, 1),  -- USDC / Ethereum (Sepolia)
  (5, 4, '0x337610d27c682E347C9cD60BD4b3b107C9d34dD9',  18, 1),  -- USDT / Binance Smart Chain
  (7, 5, NULL,                                            9, 1),  -- SOL  / Solana
  (8, 6, NULL,                                            6, 1)   -- ADA  / Cardano
ON CONFLICT (symbol_id, network_id) DO UPDATE SET
  contract_address = EXCLUDED.contract_address,
  decimals         = EXCLUDED.decimals;

-- ── QuoteSymbols ──────────────────────────────────────────────────────────────
-- id 1 USDT | 2 USD
INSERT INTO quote_symbol (id, name, image_url, status)
VALUES (1, 'USDT', '/icons/symbol/USDT.png', 1),
       (2, 'USD',  '',                        1)
ON CONFLICT (id) DO UPDATE SET
  name      = EXCLUDED.name,
  image_url = EXCLUDED.image_url;

-- ── Quotations ────────────────────────────────────────────────────────────────
INSERT INTO quotation (symbol_id, quote_symbol_id, price, provider)
VALUES
  -- vs USDT (quote_symbol_id = 1) — fetched from OKX
  (1, 1, 1745.77,  'okx'),       -- ETH  / USDT
  (2, 1, 64630.5,  'okx'),       -- BTC  / USDT
  (3, 1, 1.1905,   'okx'),       -- XRP  / USDT
  (4, 1, 603.50,   'okx'),       -- BNB  / USDT
  (5, 1, 1,        NULL),        -- USDT / USDT (same currency, skipped)
  (6, 1, 1.00060,  'okx'),       -- USDC / USDT
  (7, 1, 178.50,   'okx'),       -- SOL  / USDT
  (8, 1, 0.445,    'okx'),       -- ADA  / USDT
  -- vs USD (quote_symbol_id = 2) — fetched from CoinGecko
  (1, 2, 1761.08,  'coingecko'), -- ETH  / USD
  (2, 2, 64808.5,  'coingecko'), -- BTC  / USD
  (3, 2, 1.1949,   'coingecko'), -- XRP  / USD
  (4, 2, 605.20,   'coingecko'), -- BNB  / USD
  (5, 2, 0.99914,  'coingecko'), -- USDT / USD
  (6, 2, 0.99982,  'coingecko'), -- USDC / USD
  (7, 2, 179.20,   'coingecko'), -- SOL  / USD
  (8, 2, 0.448,    'coingecko')  -- ADA  / USD
ON CONFLICT (symbol_id, quote_symbol_id) DO UPDATE SET
  price    = EXCLUDED.price,
  provider = EXCLUDED.provider;