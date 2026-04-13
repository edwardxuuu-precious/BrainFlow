import { PostgresSyncRepository } from './postgres-sync-repository.js'
import type { SyncRepository } from './sync-repository.js'
import type { SyncServerConfig } from '../sync-config.js'

export function createSyncRepository<TPayload>(config: SyncServerConfig): SyncRepository<TPayload> {
  return new PostgresSyncRepository<TPayload>({
    connectionString: config.databaseUrl,
    ssl: config.databaseSsl,
  })
}
