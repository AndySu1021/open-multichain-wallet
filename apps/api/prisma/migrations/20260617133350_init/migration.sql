-- CreateTable
CREATE TABLE "user" (
    "id" BIGSERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "google_id" TEXT,
    "encrypted_seed" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "protocol" TEXT NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 1,
    "image_url" TEXT NOT NULL,
    "explorer_url" TEXT,
    "hd_derivation_path" TEXT,
    "hd_curve" TEXT,
    "confirmation_blocks" INTEGER NOT NULL DEFAULT 12,
    "evm_chain_id" INTEGER,
    "sync_enabled" BOOLEAN NOT NULL DEFAULT false,
    "node_ws_url" TEXT,
    "node_http_url" TEXT,
    "catchup_blocks" INTEGER NOT NULL DEFAULT 100,

    CONSTRAINT "network_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "symbol" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 1,
    "image_url" TEXT NOT NULL,

    CONSTRAINT "symbol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_symbol" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "quote_symbol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation" (
    "id" SERIAL NOT NULL,
    "symbol_id" INTEGER NOT NULL,
    "quote_symbol_id" INTEGER NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "provider" TEXT,

    CONSTRAINT "quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset" (
    "id" SERIAL NOT NULL,
    "symbol_id" INTEGER NOT NULL,
    "network_id" INTEGER NOT NULL,
    "contract_address" TEXT,
    "decimals" INTEGER NOT NULL DEFAULT 18,
    "status" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_asset" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "network_id" INTEGER NOT NULL,
    "symbol_id" INTEGER NOT NULL,
    "balance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_address" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "network_id" INTEGER NOT NULL,
    "encrypted_key_ref" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction" (
    "id" TEXT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "network_id" INTEGER NOT NULL,
    "symbol_id" INTEGER NOT NULL,
    "type" INTEGER NOT NULL,
    "from_address" TEXT NOT NULL,
    "to_address" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "tx_hash" TEXT NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 0,
    "fee" TEXT,
    "block_number" BIGINT,
    "block_hash" TEXT,
    "block_time" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "block_cursor" (
    "id" SERIAL NOT NULL,
    "network_id" INTEGER NOT NULL,
    "block_number" BIGINT NOT NULL,
    "block_hash" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "block_cursor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_google_id_key" ON "user"("google_id");

-- CreateIndex
CREATE UNIQUE INDEX "network_name_key" ON "network"("name");

-- CreateIndex
CREATE UNIQUE INDEX "symbol_name_key" ON "symbol"("name");

-- CreateIndex
CREATE UNIQUE INDEX "quote_symbol_name_key" ON "quote_symbol"("name");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_symbol_id_quote_symbol_id_key" ON "quotation"("symbol_id", "quote_symbol_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_symbol_id_network_id_key" ON "asset"("symbol_id", "network_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_asset_user_id_network_id_symbol_id_key" ON "user_asset"("user_id", "network_id", "symbol_id");

-- CreateIndex
CREATE INDEX "transaction_user_id_network_id_idx" ON "transaction"("user_id", "network_id");

-- CreateIndex
CREATE INDEX "transaction_tx_hash_idx" ON "transaction"("tx_hash");

-- CreateIndex
CREATE INDEX "transaction_network_id_block_number_idx" ON "transaction"("network_id", "block_number");

-- CreateIndex
CREATE UNIQUE INDEX "block_cursor_network_id_key" ON "block_cursor"("network_id");

-- AddForeignKey
ALTER TABLE "quotation" ADD CONSTRAINT "quotation_symbol_id_fkey" FOREIGN KEY ("symbol_id") REFERENCES "symbol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation" ADD CONSTRAINT "quotation_quote_symbol_id_fkey" FOREIGN KEY ("quote_symbol_id") REFERENCES "quote_symbol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "asset_symbol_id_fkey" FOREIGN KEY ("symbol_id") REFERENCES "symbol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "asset_network_id_fkey" FOREIGN KEY ("network_id") REFERENCES "network"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_asset" ADD CONSTRAINT "user_asset_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_asset" ADD CONSTRAINT "user_asset_network_id_fkey" FOREIGN KEY ("network_id") REFERENCES "network"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_asset" ADD CONSTRAINT "user_asset_symbol_id_fkey" FOREIGN KEY ("symbol_id") REFERENCES "symbol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_address" ADD CONSTRAINT "wallet_address_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_address" ADD CONSTRAINT "wallet_address_network_id_fkey" FOREIGN KEY ("network_id") REFERENCES "network"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_network_id_fkey" FOREIGN KEY ("network_id") REFERENCES "network"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_symbol_id_fkey" FOREIGN KEY ("symbol_id") REFERENCES "symbol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
