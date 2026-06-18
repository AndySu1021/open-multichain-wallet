-- AlterTable
ALTER TABLE "network" ADD COLUMN     "confirmation_blocks" INTEGER NOT NULL DEFAULT 12;

-- AlterTable
ALTER TABLE "transaction" ADD COLUMN     "block_hash" TEXT,
ADD COLUMN     "block_number" BIGINT;

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
CREATE UNIQUE INDEX "block_cursor_network_id_key" ON "block_cursor"("network_id");

-- CreateIndex
CREATE INDEX "transaction_network_id_block_number_idx" ON "transaction"("network_id", "block_number");
