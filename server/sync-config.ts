export interface SyncServerConfig {
  driver: 'memory' | 'postgres'
  databaseUrl: string | null
  databaseSsl: boolean
  pullLimit: number
}

export function readSyncServerConfig(env: NodeJS.ProcessEnv = process.env): SyncServerConfig {
  const databaseUrl = env.BRAINFLOW_SYNC_DATABASE_URL?.trim() || null
  return {
    driver: databaseUrl ? 'postgres' : 'memory',
    databaseUrl,
    databaseSsl: env.BRAINFLOW_SYNC_DATABASE_SSL === 'true',
    pullLimit: Number(env.BRAINFLOW_SYNC_PULL_LIMIT ?? 200),
  }
}
