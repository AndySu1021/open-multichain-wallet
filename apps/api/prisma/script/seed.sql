-- ── Networks ──────────────────────────────────────────────────────────────────
-- id 1 Ethereum | 2 Bitcoin | 3 XRP Ledger | 4 Binance Smart Chain
INSERT INTO network (id, name, protocol, status, image_url, explorer_url)
VALUES (1, 'Ethereum',            'ERC20', 1, '/icons/network/ETH.png', 'https://sepolia.etherscan.io'),
       (2, 'Bitcoin',             'BTC',   1, '/icons/network/BTC.png', 'https://blockstream.info/testnet'),
       (3, 'XRP Ledger',          'XRP',   1, '/icons/network/XRP.png', 'https://testnet.xrpl.org'),
       (4, 'Binance Smart Chain', 'BEP20', 1, '/icons/network/BNB.png', 'https://testnet.bscscan.com')
ON CONFLICT (id) DO UPDATE SET
  name         = EXCLUDED.name,
  protocol     = EXCLUDED.protocol,
  image_url    = EXCLUDED.image_url,
  explorer_url = EXCLUDED.explorer_url;

-- ── Symbols ───────────────────────────────────────────────────────────────────
-- id 1 ETH | 2 BTC | 3 XRP | 4 BNB | 5 USDT | 6 USDC
INSERT INTO symbol (id, name, status, image_url)
VALUES (1, 'ETH',  1, '/icons/symbol/ETH.png'),
       (2, 'BTC',  1, '/icons/symbol/BTC.png'),
       (3, 'XRP',  1, '/icons/symbol/XRP.png'),
       (4, 'BNB',  1, '/icons/symbol/BNB.png'),
       (5, 'USDT', 1, '/icons/symbol/USDT.png'),
       (6, 'USDC', 1, '/icons/symbol/USDC.png')
ON CONFLICT (id) DO UPDATE SET
  name      = EXCLUDED.name,
  image_url = EXCLUDED.image_url;

-- ── Assets ────────────────────────────────────────────────────────────────────
INSERT INTO asset (symbol_id, network_id, contract_address, status)
VALUES (1, 1, NULL,                                           1),  -- ETH  / Ethereum
       (2, 2, NULL,                                           1),  -- BTC  / Bitcoin
       (3, 3, NULL,                                           1),  -- XRP  / XRP Ledger
       (4, 4, NULL,                                           1),  -- BNB  / Binance Smart Chain
       (5, 1, '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0',  1),  -- USDT / Ethereum (Sepolia)
       (6, 1, '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',  1),  -- USDC / Ethereum (Sepolia)
       (5, 4, '0x337610d27c682E347C9cD60BD4b3b107C9d34dD9',  1)   -- USDT / Binance Smart Chain
ON CONFLICT (symbol_id, network_id) DO NOTHING;

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
  -- vs USD (quote_symbol_id = 2) — fetched from CoinGecko
  (1, 2, 1761.08,  'coingecko'), -- ETH  / USD
  (2, 2, 64808.5,  'coingecko'), -- BTC  / USD
  (3, 2, 1.1949,   'coingecko'), -- XRP  / USD
  (4, 2, 605.20,   'coingecko'), -- BNB  / USD
  (5, 2, 0.99914,  'coingecko'), -- USDT / USD
  (6, 2, 0.99982,  'coingecko')  -- USDC / USD
ON CONFLICT (symbol_id, quote_symbol_id) DO UPDATE SET
  price    = EXCLUDED.price,
  provider = EXCLUDED.provider;