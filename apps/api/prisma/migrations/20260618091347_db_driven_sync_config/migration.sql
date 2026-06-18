-- AlterTable
ALTER TABLE "asset" ADD COLUMN     "decimals" INTEGER NOT NULL DEFAULT 18;

-- AlterTable
ALTER TABLE "network" ADD COLUMN     "catchup_blocks" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "evm_chain_id" INTEGER,
ADD COLUMN     "node_http_url" TEXT,
ADD COLUMN     "node_ws_url" TEXT,
ADD COLUMN     "sync_enabled" BOOLEAN NOT NULL DEFAULT false;
