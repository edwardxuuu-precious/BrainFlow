import { pathToFileURL } from 'node:url'
import { createDevSupervisor } from '../server/dev-supervisor.js'
import { loadBrainFlowEnv } from '../server/load-env.js'
import { ensureLocalPostgres } from './ensure-local-postgres.js'

export async function startLocalDevStack(): Promise<void> {
  const { loadedFiles } = loadBrainFlowEnv()
  if (loadedFiles.length > 0) {
    console.log(`[env] loaded ${loadedFiles.join(', ')}`)
  }

  await ensureLocalPostgres()

  const supervisor = createDevSupervisor()

  process.on('SIGINT', () => {
    void supervisor.shutdown(0)
  })

  process.on('SIGTERM', () => {
    void supervisor.shutdown(0)
  })

  supervisor.start()
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startLocalDevStack()
}
