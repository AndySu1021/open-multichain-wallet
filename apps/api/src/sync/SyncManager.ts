import { prisma } from '../db/client.js'
import { EthBlockSync } from './EthBlockSync.js'

// EVM-compatible protocols handled by EthBlockSync
const EVM_PROTOCOLS = new Set(['ERC20', 'BEP20'])

const activeSyncs = new Map<number, EthBlockSync>()

export async function startSync(): Promise<void> {
  const networks = await prisma.network.findMany({
    where: { syncEnabled: true },
  })

  for (const network of networks) {
    if (!EVM_PROTOCOLS.has(network.protocol)) continue
    if (activeSyncs.has(network.id)) continue

    const sync = new EthBlockSync(network.id)
    activeSyncs.set(network.id, sync)
    try {
      await sync.start()
    } catch (err) {
      console.error(`[SyncManager] failed to start sync for network ${network.id}:`, err)
      activeSyncs.delete(network.id)
    }
  }
}

export function stopSync(): void {
  for (const sync of activeSyncs.values()) {
    sync.stop()
  }
  activeSyncs.clear()
}
