export interface SyncServerConfig {
  driver: 'postgres'
  databaseUrl: string
  databaseSsl: boolean
  pullLimit: number
}

export function readSyncServerConfig(env: NodeJS.ProcessEnv = process.env): SyncServerConfig {
  const databaseUrl = env.BRAINFLOW_SYNC_DATABASE_URL?.trim()
  if (!databaseUrl) {
    throw new Error('BRAINFLOW_SYNC_DATABASE_URL is required for persistent sync storage.')
  }

  return {
    driver: 'postgres',
    databaseUrl,
    databaseSsl: env.BRAINFLOW_SYNC_DATABASE_SSL === 'true',
    pullLimit: Number(env.BRAINFLOW_SYNC_PULL_LIMIT ?? 200),
  }
}
