import { Pool } from 'pg'
import type { AuthContext } from './auth/context.js'
import { readAuthServerConfig } from './auth/config.js'
import {
  checkDatabaseBackupAvailability,
  createDatabaseBackup,
  getLatestDatabaseBackupMeta,
  readDatabaseBackupConfig,
} from './postgres-backup.js'
import { readSyncServerConfig } from './sync-config.js'
import type {
  CreateWorkspaceResponse,
  DatabaseBackupMeta,
  RenameWorkspaceResponse,
  StorageAdminServerStatusResponse,
  WorkspaceAdminSummary,
} from '../shared/storage-admin-contract.js'

export interface StorageAdminService {
  getStatus(auth: AuthContext): Promise<StorageAdminServerStatusResponse>
  createDatabaseBackup(auth: AuthContext): Promise<DatabaseBackupMeta & { filePath: string }>
  createWorkspace(auth: AuthContext, name: string): Promise<CreateWorkspaceResponse>
  renameWorkspace(auth: AuthContext, workspaceId: string, name: string): Promise<RenameWorkspaceResponse>
  deleteWorkspace(auth: AuthContext, workspaceId: string): Promise<{ deletedWorkspaceId: string }>
}

export class StorageAdminError extends Error {
  readonly status: number

  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

function trimMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function normalizeWorkspaceName(name: string): string {
  return name.trim()
}

function requireWorkspaceName(name: string): string {
  const normalized = normalizeWorkspaceName(name)
  if (!normalized) {
    throw new StorageAdminError('Workspace name is required.', 400)
  }

  return normalized
}

function createWorkspaceId(): string {
  return `workspace_local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

async function withWorkspacePool<T>(
  databaseUrl: string,
  ssl: boolean,
  handler: (pool: Pool) => Promise<T>,
): Promise<T> {
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: ssl ? { rejectUnauthorized: false } : undefined,
  })

  try {
    return await handler(pool)
  } finally {
    await pool.end()
  }
}

async function readWorkspaceOwnedByUser(
  pool: Pool,
  userId: string,
  workspaceId: string,
): Promise<WorkspaceAdminSummary | null> {
  const result = await pool.query(
    `select
       w.id,
       w.user_id,
       w.name,
       w.created_at,
       w.updated_at,
       coalesce(sum(case when h.entity_type = 'document' and h.deleted_at is null then 1 else 0 end), 0)::int as document_count,
       coalesce(sum(case when h.entity_type = 'conversation' and h.deleted_at is null then 1 else 0 end), 0)::int as conversation_count
     from workspaces w
     left join sync_heads h on h.workspace_id = w.id
     where w.user_id = $1 and w.id = $2
     group by w.id, w.user_id, w.name, w.created_at, w.updated_at
     limit 1`,
    [userId, workspaceId],
  )

  const row = result.rows[0]
  if (!row) {
    return null
  }

  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    documentCount: Number(row.document_count ?? 0),
    conversationCount: Number(row.conversation_count ?? 0),
  }
}

async function ensureWorkspaceNameAvailable(
  pool: Pool,
  userId: string,
  workspaceName: string,
  currentWorkspaceId?: string,
): Promise<void> {
  const result = await pool.query(
    `select id
       from workspaces
      where user_id = $1
        and lower(name) = lower($2)
        and ($3::text is null or id <> $3)
      limit 1`,
    [userId, workspaceName, currentWorkspaceId ?? null],
  )

  if (result.rowCount) {
    throw new StorageAdminError('Workspace name already exists.', 409)
  }
}

async function readWorkspaceSummary(databaseUrl: string, ssl: boolean, userId: string | null) {
  if (!userId) {
    return { id: null, name: null }
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: ssl ? { rejectUnauthorized: false } : undefined,
  })

  try {
    const result = await pool.query(
      `select id, name from workspaces where user_id = $1 order by updated_at desc limit 1`,
      [userId],
    )
    const row = result.rows[0] as { id?: string; name?: string } | undefined
    return {
      id: row?.id ?? null,
      name: row?.name ?? null,
    }
  } finally {
    await pool.end()
  }
}

async function listManagedWorkspaces(
  databaseUrl: string,
  ssl: boolean,
  userId: string | null,
): Promise<WorkspaceAdminSummary[]> {
  if (!userId) {
    return []
  }

  return withWorkspacePool(databaseUrl, ssl, async (pool) => {
    const result = await pool.query(
      `select
         w.id,
         w.user_id,
         w.name,
         w.created_at,
         w.updated_at,
         coalesce(sum(case when h.entity_type = 'document' and h.deleted_at is null then 1 else 0 end), 0)::int as document_count,
         coalesce(sum(case when h.entity_type = 'conversation' and h.deleted_at is null then 1 else 0 end), 0)::int as conversation_count
       from workspaces w
       left join sync_heads h on h.workspace_id = w.id
       where w.user_id = $1
       group by w.id, w.user_id, w.name, w.created_at, w.updated_at
       order by w.updated_at desc, w.created_at desc, w.id asc`,
      [userId],
    )

    return result.rows.map((row) => ({
      id: String(row.id),
      userId: String(row.user_id),
      name: String(row.name),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
      documentCount: Number(row.document_count ?? 0),
      conversationCount: Number(row.conversation_count ?? 0),
    }))
  })
}

export class LocalStorageAdminService implements StorageAdminService {
  async getStatus(auth: AuthContext): Promise<StorageAdminServerStatusResponse> {
    const checkedAt = Date.now()
    const authConfig = readAuthServerConfig()

    let configured = false
    let reachable = false
    let label: string | null = null
    let lastError: string | null = null
    let workspace = { id: null as string | null, name: null as string | null }
    let backupFormat: StorageAdminServerStatusResponse['database']['backupFormat'] = 'custom'
    let lastBackupAt: number | null = null
    let backupDirectory: string | null = null
    let backupAvailable = false
    let backupLastError: string | null = null
    let workspaces: WorkspaceAdminSummary[] = []

    try {
      const syncConfig = readSyncServerConfig()
      const backupConfig = readDatabaseBackupConfig()
      configured = true
      backupFormat = backupConfig.format
      backupDirectory = backupConfig.outputDir

      const pool = new Pool({
        connectionString: syncConfig.databaseUrl,
        ssl: syncConfig.databaseSsl ? { rejectUnauthorized: false } : undefined,
      })

      try {
        const result = await pool.query(`select current_database() as database_name`)
        reachable = true
        const databaseName = String(result.rows[0]?.database_name ?? '').trim()
        label = databaseName ? `本机 Postgres / ${databaseName}` : '本机 Postgres'
      } finally {
        await pool.end()
      }

      workspace = await readWorkspaceSummary(syncConfig.databaseUrl, syncConfig.databaseSsl, auth.userId)
      workspaces = await listManagedWorkspaces(syncConfig.databaseUrl, syncConfig.databaseSsl, auth.userId)

      const backupCapability = await checkDatabaseBackupAvailability(backupConfig)
      if (backupCapability.available) {
        backupAvailable = true
      } else {
        backupLastError = backupCapability.error
      }

      const latestBackup = await getLatestDatabaseBackupMeta(backupConfig)
      lastBackupAt = latestBackup?.createdAt ?? null
    } catch (error) {
      lastError = trimMessage(error)
    }

    return {
      mode: 'local_postgres',
      checkedAt,
      api: {
        reachable: true,
        checkedAt,
      },
      database: {
        driver: 'postgres',
        configured,
        reachable,
        label,
        lastError,
        backupFormat,
        lastBackupAt,
      },
      backup: {
        available: backupAvailable,
        directory: backupDirectory,
        lastError: backupLastError,
      },
      auth: {
        mode: auth.authMode,
        authenticated: auth.authenticated,
        username: auth.username ?? (auth.authMode === 'stub' ? authConfig.adminUsername : null),
      },
      workspace,
      workspaces,
      runtime: {
        canonicalOrigin: authConfig.canonicalOrigin,
      },
    }
  }

  async createDatabaseBackup(_auth: AuthContext): Promise<DatabaseBackupMeta & { filePath: string }> {
    const backupConfig = readDatabaseBackupConfig()
    return createDatabaseBackup(backupConfig)
  }

  async createWorkspace(auth: AuthContext, name: string): Promise<CreateWorkspaceResponse> {
    if (!auth.userId) {
      throw new StorageAdminError('Authenticated user id is required.', 401)
    }

    const workspaceName = requireWorkspaceName(name)
    const syncConfig = readSyncServerConfig()

    return withWorkspacePool(syncConfig.databaseUrl, syncConfig.databaseSsl, async (pool) => {
      await ensureWorkspaceNameAvailable(pool, auth.userId as string, workspaceName)

      const now = Date.now()
      const workspaceId = createWorkspaceId()
      await pool.query(
        `insert into workspaces (id, user_id, name, created_at, updated_at)
         values ($1, $2, $3, $4, $5)`,
        [workspaceId, auth.userId, workspaceName, now, now],
      )

      const workspace = await readWorkspaceOwnedByUser(pool, auth.userId as string, workspaceId)
      if (!workspace) {
        throw new StorageAdminError('Workspace was created but could not be loaded.', 500)
      }

      return { workspace }
    })
  }

  async renameWorkspace(
    auth: AuthContext,
    workspaceId: string,
    name: string,
  ): Promise<RenameWorkspaceResponse> {
    if (!auth.userId) {
      throw new StorageAdminError('Authenticated user id is required.', 401)
    }

    const workspaceName = requireWorkspaceName(name)
    const syncConfig = readSyncServerConfig()

    return withWorkspacePool(syncConfig.databaseUrl, syncConfig.databaseSsl, async (pool) => {
      const currentWorkspace = await readWorkspaceOwnedByUser(pool, auth.userId as string, workspaceId)
      if (!currentWorkspace) {
        throw new StorageAdminError('Workspace not found.', 404)
      }

      await ensureWorkspaceNameAvailable(pool, auth.userId as string, workspaceName, workspaceId)

      const now = Date.now()
      await pool.query(
        `update workspaces
            set name = $3,
                updated_at = $4
          where id = $1 and user_id = $2`,
        [workspaceId, auth.userId, workspaceName, now],
      )

      const workspace = await readWorkspaceOwnedByUser(pool, auth.userId as string, workspaceId)
      if (!workspace) {
        throw new StorageAdminError('Workspace not found after rename.', 404)
      }

      return { workspace }
    })
  }

  async deleteWorkspace(auth: AuthContext, workspaceId: string): Promise<{ deletedWorkspaceId: string }> {
    if (!auth.userId) {
      throw new StorageAdminError('Authenticated user id is required.', 401)
    }

    const syncConfig = readSyncServerConfig()
    const pool = new Pool({
      connectionString: syncConfig.databaseUrl,
      ssl: syncConfig.databaseSsl ? { rejectUnauthorized: false } : undefined,
    })

    try {
      const workspaceResult = await pool.query(
        `select id from workspaces where id = $1 and user_id = $2 limit 1`,
        [workspaceId, auth.userId],
      )
      if (!workspaceResult.rowCount) {
        throw new StorageAdminError('Workspace not found.', 404)
      }

      await pool.query('begin')
      await pool.query(`delete from sync_conflicts where workspace_id = $1`, [workspaceId])
      await pool.query(`delete from workspace_change_log where workspace_id = $1`, [workspaceId])
      await pool.query(`delete from sync_snapshots where workspace_id = $1`, [workspaceId])
      await pool.query(`delete from sync_heads where workspace_id = $1`, [workspaceId])
      await pool.query(`delete from devices where workspace_id = $1`, [workspaceId])
      await pool.query(`delete from workspaces where id = $1 and user_id = $2`, [workspaceId, auth.userId])
      await pool.query('commit')

      return { deletedWorkspaceId: workspaceId }
    } catch (error) {
      await pool.query('rollback').catch(() => undefined)
      throw error
    } finally {
      await pool.end()
    }
  }
}
