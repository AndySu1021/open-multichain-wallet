import { prisma } from '../db/client.js'
import { EthBlockSync } from './EthBlockSync.js'
import { SolSlotSync } from './SolSlotSync.js'

const EVM_PROTOCOLS = new Set(['ERC20', 'BEP20'])

const activeEvmSyncs = new Map<number, EthBlockSync>()
const activeSolSyncs = new Map<number, SolSlotSync>()

export async function startSync(): Promise<void> {
  const networks = await prisma.network.findMany({
    where: { syncEnabled: true },
  })

  for (const network of networks) {
    if (EVM_PROTOCOLS.has(network.protocol)) {
      if (activeEvmSyncs.has(network.id)) continue
      const sync = new EthBlockSync(network.id)
      activeEvmSyncs.set(network.id, sync)
      try {
        await sync.start()
      } catch (err) {
        console.error(`[SyncManager] failed to start EVM sync for network ${network.id}:`, err)
        activeEvmSyncs.delete(network.id)
      }
    } else if (network.protocol === 'SOL') {
      if (activeSolSyncs.has(network.id)) continue
      const sync = new SolSlotSync(network.id)
      activeSolSyncs.set(network.id, sync)
      try {
        await sync.start()
      } catch (err) {
        console.error(`[SyncManager] failed to start SOL sync for network ${network.id}:`, err)
        activeSolSyncs.delete(network.id)
      }
    }
  }
}

export function stopSync(): void {
  for (const sync of activeEvmSyncs.values()) {
    sync.stop()
  }
  activeEvmSyncs.clear()
  for (const sync of activeSolSyncs.values()) {
    sync.stop()
  }
  activeSolSyncs.clear()
}
