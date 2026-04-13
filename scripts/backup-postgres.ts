import { createDatabaseBackup, readDatabaseBackupConfig } from '../server/postgres-backup.js'
import { loadBrainFlowEnv } from '../server/load-env.js'

loadBrainFlowEnv()

async function main(): Promise<void> {
  const backup = await createDatabaseBackup(readDatabaseBackupConfig())
  console.log(`Postgres backup written to ${backup.filePath}`)
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
