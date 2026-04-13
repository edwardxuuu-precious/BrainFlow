import { Pool } from 'pg'
import { loadBrainFlowEnv } from '../server/load-env.js'
import { PostgresSyncRepository } from '../server/repos/postgres-sync-repository.js'
import { readSyncServerConfig } from '../server/sync-config.js'

async function main(): Promise<void> {
  loadBrainFlowEnv()
  const config = readSyncServerConfig()
  const repository = new PostgresSyncRepository<unknown>({
    connectionString: config.databaseUrl,
    ssl: config.databaseSsl,
  })
  const pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
  })

  try {
    await repository.initialize()

    const conflicts = await pool.query(`
      select workspace_id,
             count(*) filter (where entity_type = 'document' and resolved_at is null) as unresolved_document_conflicts,
             count(*) filter (where entity_type = 'conversation' and resolved_at is null) as unresolved_conversation_conflicts
        from sync_conflicts
       group by workspace_id
       order by workspace_id
    `)
    const activeCopyDocuments = await pool.query(`
      select workspace_id,
             count(*) as active_copy_documents
        from sync_heads
       where entity_type = 'document'
         and deleted_at is null
         and entity_id like '%_copy_%'
       group by workspace_id
       order by workspace_id
    `)

    console.log(
      JSON.stringify(
        {
          conflicts: conflicts.rows,
          activeCopyDocuments: activeCopyDocuments.rows,
        },
        null,
        2,
      ),
    )
  } finally {
    await pool.end().catch(() => undefined)
    await repository.close().catch(() => undefined)
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
