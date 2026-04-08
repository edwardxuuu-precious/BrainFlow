import { InMemorySyncRepository } from './in-memory-sync-repository.js'
import { PostgresSyncRepository } from './postgres-sync-repository.js'
import type { SyncRepository } from './sync-repository.js'
import type { SyncServerConfig } from '../sync-config.js'

export function createSyncRepository<TPayload>(config: SyncServerConfig): SyncRepository<TPayload> {
  if (config.driver === 'postgres' && config.databaseUrl) {
    return new PostgresSyncRepository<TPayload>({
      connectionString: config.databaseUrl,
      ssl: config.databaseSsl,
    })
  }

  return new InMemorySyncRepository<TPayload>()
}
