import { Pool } from 'pg'
import type {
  SyncConflictRecord,
  SyncEntityType,
  SyncEnvelope,
  SyncWorkspaceSummary,
} from '../../shared/sync-contract.js'
import { computeStableContentHash } from '../../shared/stable-hash.js'
import type {
  ApplyMutationInput,
  ApplyMutationResult,
  BootstrapInput,
  ResolveConflictInput,
  ResolveConflictResult,
  RestoreInput,
  SyncRepository,
  WorkspaceFullResult,
} from './sync-repository.js'
import { buildSaveLocalCopyRecord } from './sync-copy-record.js'

interface PostgresSyncRepositoryOptions {
  connectionString: string
  ssl?: boolean
}

const GENERATED_COPY_DEVICE_ID = 'server_copy_cleanup'
const DEFAULT_DOCUMENT_TITLE = '未命名脑图'
const MAX_DOCUMENT_TITLE_LENGTH = 50
const DUPLICATE_TITLE_SUFFIX_PATTERN = /\s*\((\d+)\)$/

function normalizeDocumentTitle(title: string | null | undefined): string {
  const trimmed = typeof title === 'string' ? title.trim().slice(0, MAX_DOCUMENT_TITLE_LENGTH).trim() : ''
  return trimmed || DEFAULT_DOCUMENT_TITLE
}

function stripGeneratedDuplicateTitle(title: string | null | undefined): string {
  const normalized = normalizeDocumentTitle(title)
  return normalized.replace(DUPLICATE_TITLE_SUFFIX_PATTERN, '').trim() || normalized
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function generateUniqueTitle(desiredTitle: string | null | undefined, existingTitles: string[]): string {
  const normalizedDesired = normalizeDocumentTitle(desiredTitle)
  const normalizedExistingTitles = existingTitles.map((title) => normalizeDocumentTitle(title))
  if (!normalizedExistingTitles.includes(normalizedDesired)) {
    return normalizedDesired
  }

  const baseTitle = stripGeneratedDuplicateTitle(normalizedDesired)
  const baseTitlePattern = new RegExp(`^${escapeRegExp(baseTitle)}\\s*\\((\\d+)\\)$`)
  let maxIndex = 1

  for (const existingTitle of normalizedExistingTitles) {
    if (existingTitle === baseTitle) {
      maxIndex = Math.max(maxIndex, 1)
      continue
    }

    const match = existingTitle.match(baseTitlePattern)
    if (match) {
      maxIndex = Math.max(maxIndex, Number.parseInt(match[1] ?? '1', 10))
    }
  }

  const suffix = ` (${maxIndex + 1})`
  const maxBaseLength = Math.max(0, MAX_DOCUMENT_TITLE_LENGTH - suffix.length)
  return `${baseTitle.slice(0, maxBaseLength).trimEnd()}${suffix}`
}

function getCopyRootId(id: string): string {
  return id.split('_copy_')[0]
}

function getCopyDepth(id: string): number {
  return id.includes('_copy_') ? id.split('_copy_').length - 1 : 0
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getConversationDocumentIdFromEnvelope<TPayload>(record: SyncEnvelope<TPayload> | null): string | null {
  if (!record || !isRecordObject(record.payload) || typeof record.payload.documentId !== 'string') {
    return null
  }

  return record.payload.documentId
}

function mapWorkspace(row: Record<string, unknown>): SyncWorkspaceSummary {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

function mapEnvelope<TPayload>(row: Record<string, unknown>): SyncEnvelope<TPayload> {
  return {
    id: String(row.entity_id),
    userId: String(row.user_id),
    workspaceId: String(row.workspace_id),
    deviceId: String(row.device_id),
    version: Number(row.version),
    baseVersion: row.base_version === null ? null : Number(row.base_version),
    contentHash: String(row.content_hash),
    updatedAt: Number(row.updated_at),
    deletedAt: row.deleted_at === null ? null : Number(row.deleted_at),
    syncStatus: 'synced',
    payload: (row.payload_json ?? null) as TPayload,
  }
}

function mapConflict<TPayload>(row: Record<string, unknown>): SyncConflictRecord<TPayload> {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    entityType: String(row.entity_type) as SyncEntityType,
    entityId: String(row.entity_id),
    deviceId: String(row.device_id),
    localRecord: (row.local_record ?? null) as SyncEnvelope<TPayload> | null,
    cloudRecord: (row.cloud_record ?? null) as SyncEnvelope<TPayload> | null,
    localPayload: ((row.local_record as { payload?: TPayload } | null)?.payload ?? null) as TPayload | null,
    cloudPayload: ((row.cloud_record as { payload?: TPayload } | null)?.payload ?? null) as TPayload | null,
    diffHints: (row.diff_hints ?? {
      updatedAtDeltaMs: null,
      sameContentHash: false,
    }) as SyncConflictRecord<TPayload>['diffHints'],
    analysisStatus: 'pending',
    analysisSource: null,
    recommendedResolution: null,
    confidence: null,
    summary: null,
    reasons: [],
    actionableResolutions: [],
    mergedPayload: null,
    analyzedAt: null,
    analysisNote: null,
    detectedAt: Number(row.detected_at),
    resolvedAt: row.resolved_at === null ? null : Number(row.resolved_at),
  }
}

export class PostgresSyncRepository<TPayload> implements SyncRepository<TPayload> {
  private readonly pool: Pool

  constructor(options: PostgresSyncRepositoryOptions) {
    this.pool = new Pool({
      connectionString: options.connectionString,
      ssl: options.ssl ? { rejectUnauthorized: false } : undefined,
    })
  }

  async initialize(): Promise<void> {
    await this.pool.query(`
      create table if not exists workspaces (
        id text primary key,
        user_id text not null,
        name text not null,
        created_at bigint not null,
        updated_at bigint not null
      );
      create table if not exists devices (
        id text primary key,
        user_id text not null,
        workspace_id text not null,
        label text not null,
        platform text not null,
        last_seen_at bigint not null
      );
      create table if not exists sync_heads (
        workspace_id text not null,
        entity_type text not null,
        entity_id text not null,
        user_id text not null,
        device_id text not null,
        version integer not null,
        base_version integer,
        content_hash text not null,
        payload_json jsonb,
        updated_at bigint not null,
        deleted_at bigint,
        primary key (workspace_id, entity_type, entity_id)
      );
      create table if not exists sync_snapshots (
        workspace_id text not null,
        entity_type text not null,
        entity_id text not null,
        version integer not null,
        record_json jsonb not null,
        created_at bigint not null,
        primary key (workspace_id, entity_type, entity_id, version)
      );
      create table if not exists workspace_change_log (
        cursor bigserial primary key,
        workspace_id text not null,
        entity_type text not null,
        entity_id text not null,
        action text not null,
        record_json jsonb not null,
        created_at bigint not null
      );
      create table if not exists sync_conflicts (
        id text primary key,
        workspace_id text not null,
        entity_type text not null,
        entity_id text not null,
        device_id text not null,
        local_record jsonb,
        cloud_record jsonb,
        diff_hints jsonb not null,
        detected_at bigint not null,
        resolved_at bigint
      );
      create table if not exists ai_provider_configs (
        workspace_id text not null,
        provider_type text not null,
        config jsonb not null,
        updated_at timestamp not null default now(),
        primary key (workspace_id, provider_type)
      );
      create table if not exists system_prompts (
        id text primary key default 'default',
        business_prompt text not null,
        updated_at bigint not null
      );
    `)
    await this.cleanupGeneratedCopyChains()
  }

  async close(): Promise<void> {
    await this.pool.end()
  }

  private shouldCollapseGeneratedCopyGroup(
    documents: Array<SyncEnvelope<TPayload>>,
    conflicts: Array<SyncConflictRecord<TPayload>>,
  ): boolean {
    const hasGeneratedId =
      documents.some((record) => record.id.includes('_copy_')) ||
      conflicts.some((conflict) => conflict.entityId.includes('_copy_'))

    if (!hasGeneratedId) {
      return false
    }

    const activeDocuments = documents.filter((record) => record.deletedAt === null)
    const activeGeneratedCopies = activeDocuments.filter((record) => record.id.includes('_copy_'))

    return (
      conflicts.length > 0 ||
      activeGeneratedCopies.length > 1 ||
      activeGeneratedCopies.some((record) => getCopyDepth(record.id) > 1)
    )
  }

  private buildCanonicalCopyTitle(
    keepRecord: SyncEnvelope<TPayload>,
    allDocuments: Array<SyncEnvelope<TPayload>>,
    removedIds: Set<string>,
  ): string {
    const currentTitle =
      isRecordObject(keepRecord.payload) && typeof keepRecord.payload.title === 'string'
        ? keepRecord.payload.title
        : null
    const baseTitle = stripGeneratedDuplicateTitle(currentTitle)
    const existingTitles = allDocuments
      .filter(
        (record) =>
          record.deletedAt === null &&
          record.id !== keepRecord.id &&
          !removedIds.has(record.id) &&
          isRecordObject(record.payload) &&
          typeof record.payload.title === 'string',
      )
      .map((record) => String((record.payload as { title: string }).title))

    return generateUniqueTitle(baseTitle, existingTitles)
  }

  private async writeMaintenanceDelete(
    workspaceId: string,
    entityType: SyncEntityType,
    record: SyncEnvelope<TPayload>,
  ): Promise<void> {
    const deletedAt = Date.now()
    await this.writeHead(workspaceId, entityType, 'delete', {
      ...record,
      deviceId: GENERATED_COPY_DEVICE_ID,
      version: record.version + 1,
      baseVersion: record.version,
      contentHash: computeStableContentHash({ deleted: true, entityId: record.id }),
      updatedAt: deletedAt,
      deletedAt,
      syncStatus: 'synced',
    })
  }

  private async writeMaintenanceDocumentUpsert(
    workspaceId: string,
    record: SyncEnvelope<TPayload>,
    title: string,
  ): Promise<void> {
    if (!isRecordObject(record.payload)) {
      return
    }

    const updatedAt = Date.now()
    const payload = {
      ...record.payload,
      id: record.id,
      title,
      updatedAt,
    } as TPayload

    await this.writeHead(workspaceId, 'document', 'upsert', {
      ...record,
      deviceId: GENERATED_COPY_DEVICE_ID,
      version: record.version + 1,
      baseVersion: record.version,
      contentHash: computeStableContentHash(payload),
      updatedAt,
      deletedAt: null,
      syncStatus: 'synced',
      payload,
    })
  }

  private async markConflictResolved(conflictId: string): Promise<void> {
    await this.pool.query(
      `update sync_conflicts
          set resolved_at = $2
        where id = $1 and resolved_at is null`,
      [conflictId, Date.now()],
    )
  }

  private async cleanupGeneratedCopyChains(): Promise<void> {
    const workspaceResult = await this.pool.query(`select id from workspaces order by updated_at asc`)

    for (const row of workspaceResult.rows) {
      const workspaceId = String((row as Record<string, unknown>).id)
      const full = await this.getWorkspaceFull(workspaceId)
      if (!full) {
        continue
      }

      const conflicts = await this.listConflicts(workspaceId)
      const documentGroups = new Map<
        string,
        {
          documents: Array<SyncEnvelope<TPayload>>
          conflicts: Array<SyncConflictRecord<TPayload>>
        }
      >()

      for (const document of full.documents) {
        const rootId = getCopyRootId(document.id)
        const current = documentGroups.get(rootId) ?? { documents: [], conflicts: [] }
        current.documents.push(document)
        documentGroups.set(rootId, current)
      }

      for (const conflict of conflicts) {
        if (conflict.entityType !== 'document') {
          continue
        }

        const rootId = getCopyRootId(conflict.entityId)
        const current = documentGroups.get(rootId) ?? { documents: [], conflicts: [] }
        current.conflicts.push(conflict)
        documentGroups.set(rootId, current)
      }

      const cleanedRoots = new Set<string>()

      for (const [rootId, group] of documentGroups.entries()) {
        if (!this.shouldCollapseGeneratedCopyGroup(group.documents, group.conflicts)) {
          continue
        }

        const activeDocuments = group.documents
          .filter((record) => record.deletedAt === null)
          .sort((left, right) => right.updatedAt - left.updatedAt)
        const keepRecord = activeDocuments[0] ?? null
        const removedRecords = activeDocuments.filter((record) => record.id !== keepRecord?.id)
        const removedIds = new Set(removedRecords.map((record) => record.id))

        for (const record of removedRecords) {
          await this.writeMaintenanceDelete(workspaceId, 'document', record)
        }

        if (keepRecord) {
          const nextTitle = this.buildCanonicalCopyTitle(keepRecord, full.documents, removedIds)
          const currentTitle =
            isRecordObject(keepRecord.payload) && typeof keepRecord.payload.title === 'string'
              ? keepRecord.payload.title
              : ''
          if (normalizeDocumentTitle(currentTitle) !== nextTitle) {
            await this.writeMaintenanceDocumentUpsert(workspaceId, keepRecord, nextTitle)
          }
        }

        cleanedRoots.add(rootId)

        for (const conflict of group.conflicts) {
          await this.markConflictResolved(conflict.id)
        }
      }

      const refreshedWorkspace = await this.getWorkspaceFull(workspaceId)
      if (!refreshedWorkspace) {
        continue
      }

      const activeDocumentIds = new Set(
        refreshedWorkspace.documents
          .filter((record) => record.deletedAt === null)
          .map((record) => record.id),
      )
      const deletedConversationIds = new Set<string>()

      for (const conversation of refreshedWorkspace.conversations) {
        if (conversation.deletedAt !== null) {
          continue
        }

        const documentId = getConversationDocumentIdFromEnvelope(conversation)
        if (documentId && !activeDocumentIds.has(documentId)) {
          await this.writeMaintenanceDelete(workspaceId, 'conversation', conversation)
          deletedConversationIds.add(conversation.id)
        }
      }

      const remainingConflicts = await this.listConflicts(workspaceId)
      for (const conflict of remainingConflicts) {
        if (conflict.entityType === 'document') {
          if (cleanedRoots.has(getCopyRootId(conflict.entityId)) || !activeDocumentIds.has(conflict.entityId)) {
            await this.markConflictResolved(conflict.id)
          }
          continue
        }

        const localDocumentId = getConversationDocumentIdFromEnvelope(conflict.localRecord)
        const cloudDocumentId = getConversationDocumentIdFromEnvelope(conflict.cloudRecord)
        const referencesMissingDocument =
          (localDocumentId !== null && !activeDocumentIds.has(localDocumentId)) ||
          (cloudDocumentId !== null && !activeDocumentIds.has(cloudDocumentId))

        if (
          deletedConversationIds.has(conflict.entityId) ||
          conflict.entityId.includes('_copy_') ||
          referencesMissingDocument
        ) {
          await this.markConflictResolved(conflict.id)
        }
      }
    }
  }

  async getOrCreateWorkspace(
    userId: string,
    workspaceName?: string,
    targetWorkspaceId?: string,
  ): Promise<SyncWorkspaceSummary> {
    if (targetWorkspaceId) {
      const existing = await this.pool.query(
        `select * from workspaces where id = $1 limit 1`,
        [targetWorkspaceId],
      )
      if (existing.rowCount) {
        return mapWorkspace(existing.rows[0] as Record<string, unknown>)
      }

      const targetWorkspace: SyncWorkspaceSummary = {
        id: targetWorkspaceId,
        userId,
        name: workspaceName?.trim() || 'Default Workspace',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      await this.pool.query(
        `insert into workspaces (id, user_id, name, created_at, updated_at) values ($1, $2, $3, $4, $5)`,
        [
          targetWorkspace.id,
          targetWorkspace.userId,
          targetWorkspace.name,
          targetWorkspace.createdAt,
          targetWorkspace.updatedAt,
        ],
      )
      return targetWorkspace
    }

    const name = workspaceName?.trim() || 'Default Workspace'
    const existingByName = await this.pool.query(
      `select * from workspaces where user_id = $1 and name = $2 limit 1`,
      [userId, name],
    )
    if (existingByName.rowCount) {
      return mapWorkspace(existingByName.rows[0] as Record<string, unknown>)
    }

    const workspace: SyncWorkspaceSummary = {
      id: targetWorkspaceId ?? `workspace_${Math.random().toString(36).slice(2, 10)}`,
      userId,
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await this.pool.query(
      `insert into workspaces (id, user_id, name, created_at, updated_at) values ($1, $2, $3, $4, $5)`,
      [workspace.id, workspace.userId, workspace.name, workspace.createdAt, workspace.updatedAt],
    )
    return workspace
  }

  async bootstrap(
    input: BootstrapInput<TPayload>,
  ): Promise<WorkspaceFullResult<TPayload> & { bootstrappedAt: number }> {
    const workspace = await this.getOrCreateWorkspace(input.userId, input.workspaceName, input.targetWorkspaceId)
    const existingHeads = await this.pool.query(
      `select count(*)::int as count from sync_heads where workspace_id = $1`,
      [workspace.id],
    )
    if (Number(existingHeads.rows[0]?.count ?? 0) > 0) {
      throw new Error('Bootstrap is only allowed for a new or empty workspace.')
    }

    for (const document of input.documents) {
      await this.writeHead(workspace.id, 'document', document.deletedAt ? 'delete' : 'upsert', {
        ...document,
        workspaceId: workspace.id,
        userId: input.userId,
        deviceId: input.deviceId,
        version: 1,
        baseVersion: null,
        syncStatus: 'synced',
        updatedAt: Date.now(),
      })
    }
    for (const conversation of input.conversations) {
      await this.writeHead(workspace.id, 'conversation', conversation.deletedAt ? 'delete' : 'upsert', {
        ...conversation,
        workspaceId: workspace.id,
        userId: input.userId,
        deviceId: input.deviceId,
        version: 1,
        baseVersion: null,
        syncStatus: 'synced',
        updatedAt: Date.now(),
      })
    }

    const full = await this.getWorkspaceFull(workspace.id)
    if (!full) {
      throw new Error('Failed to read bootstrapped workspace.')
    }
    return {
      ...full,
      bootstrappedAt: Date.now(),
    }
  }

  async applyMutation(input: ApplyMutationInput<TPayload>): Promise<ApplyMutationResult<TPayload>> {
    const current = await this.getHead(input.workspaceId, input.entityType, input.entityId)
    const currentVersion = current?.version ?? null
    if (currentVersion !== input.baseVersion) {
      throw new Error('VERSION_CONFLICT')
    }

    const authoritativeRecord: SyncEnvelope<TPayload> = {
      id: input.entityId,
      userId: input.userId,
      workspaceId: input.workspaceId,
      deviceId: input.deviceId,
      version: (current?.version ?? 0) + 1,
      baseVersion: input.baseVersion,
      contentHash:
        input.action === 'delete'
          ? computeStableContentHash({ deleted: true, entityId: input.entityId })
          : input.contentHash,
      updatedAt: Date.now(),
      deletedAt: input.action === 'delete' ? Date.now() : null,
      syncStatus: 'synced',
      payload: (input.payload ?? current?.payload ?? null) as TPayload,
    }

    const cursor = await this.writeHead(input.workspaceId, input.entityType, input.action, authoritativeRecord)
    return {
      authoritativeRecord,
      cursor,
    }
  }

  async listChanges(
    workspaceId: string,
    afterCursor: number,
    limit: number,
  ): Promise<Array<{ cursor: number; entityType: SyncEntityType; action: 'upsert' | 'delete'; authoritativeRecord: SyncEnvelope<TPayload> }>> {
    const result = await this.pool.query(
      `select cursor, entity_type, action, record_json
       from workspace_change_log
       where workspace_id = $1 and cursor > $2
       order by cursor asc
       limit $3`,
      [workspaceId, afterCursor, limit],
    )
    return result.rows.map((row: Record<string, unknown>) => ({
      cursor: Number(row.cursor),
      entityType: String(row.entity_type) as SyncEntityType,
      action: String(row.action) as 'upsert' | 'delete',
      authoritativeRecord: row.record_json as SyncEnvelope<TPayload>,
    }))
  }

  async getWorkspaceFull(workspaceId: string): Promise<WorkspaceFullResult<TPayload> | null> {
    const workspaceResult = await this.pool.query(`select * from workspaces where id = $1 limit 1`, [workspaceId])
    if (!workspaceResult.rowCount) {
      return null
    }
    const headResult = await this.pool.query(
      `select * from sync_heads where workspace_id = $1 order by entity_type asc, updated_at desc`,
      [workspaceId],
    )
    const documents = headResult.rows
      .filter((row: Record<string, unknown>) => row.entity_type === 'document')
      .map((row: Record<string, unknown>) => mapEnvelope<TPayload>(row))
    const conversations = headResult.rows
      .filter((row: Record<string, unknown>) => row.entity_type === 'conversation')
      .map((row: Record<string, unknown>) => mapEnvelope<TPayload>(row))
    const cursorResult = await this.pool.query(
      `select coalesce(max(cursor), 0) as cursor from workspace_change_log where workspace_id = $1`,
      [workspaceId],
    )
    return {
      workspace: mapWorkspace(workspaceResult.rows[0] as Record<string, unknown>),
      documents,
      conversations,
      cursor: Number(cursorResult.rows[0]?.cursor ?? 0),
    }
  }

  async restoreWorkspace(
    input: RestoreInput<TPayload>,
  ): Promise<WorkspaceFullResult<TPayload> & { restoredAt: number }> {
    const workspace = await this.getOrCreateWorkspace(input.userId, undefined, input.workspaceId)
    if (input.mode === 'replace') {
      await this.pool.query(`delete from sync_heads where workspace_id = $1`, [workspace.id])
      await this.pool.query(`delete from sync_snapshots where workspace_id = $1`, [workspace.id])
      await this.pool.query(`delete from workspace_change_log where workspace_id = $1`, [workspace.id])
    }

    for (const record of input.documents) {
      await this.writeHead(workspace.id, 'document', record.deletedAt ? 'delete' : 'upsert', {
        ...record,
        workspaceId: workspace.id,
        userId: input.userId,
        syncStatus: 'synced',
        updatedAt: Date.now(),
      })
    }
    for (const record of input.conversations) {
      await this.writeHead(workspace.id, 'conversation', record.deletedAt ? 'delete' : 'upsert', {
        ...record,
        workspaceId: workspace.id,
        userId: input.userId,
        syncStatus: 'synced',
        updatedAt: Date.now(),
      })
    }

    const full = await this.getWorkspaceFull(workspace.id)
    if (!full) {
      throw new Error('Failed to restore workspace.')
    }
    return {
      ...full,
      restoredAt: Date.now(),
    }
  }

  async createConflict(
    workspaceId: string,
    entityType: SyncEntityType,
    entityId: string,
    deviceId: string,
    localRecord: SyncEnvelope<TPayload> | null,
    cloudRecord: SyncEnvelope<TPayload> | null,
    diffHints: SyncConflictRecord<TPayload>['diffHints'],
  ): Promise<SyncConflictRecord<TPayload>> {
    const existing = await this.getActiveConflictByEntity(workspaceId, entityType, entityId)
    if (existing) {
      const updated: SyncConflictRecord<TPayload> = {
        ...existing,
        deviceId,
        localRecord,
        cloudRecord,
        localPayload: localRecord?.payload ?? null,
        cloudPayload: cloudRecord?.payload ?? null,
        diffHints,
        detectedAt: Date.now(),
      }
      await this.pool.query(
        `update sync_conflicts
         set device_id = $2,
             local_record = $3::jsonb,
             cloud_record = $4::jsonb,
             diff_hints = $5::jsonb,
             detected_at = $6
         where id = $1`,
        [
          existing.id,
          updated.deviceId,
          JSON.stringify(updated.localRecord),
          JSON.stringify(updated.cloudRecord),
          JSON.stringify(updated.diffHints),
          updated.detectedAt,
        ],
      )
      return updated
    }

    const conflict: SyncConflictRecord<TPayload> = {
      id: `conflict_${Math.random().toString(36).slice(2, 10)}`,
      workspaceId,
      entityType,
      entityId,
      deviceId,
      localRecord,
      cloudRecord,
      localPayload: localRecord?.payload ?? null,
      cloudPayload: cloudRecord?.payload ?? null,
      diffHints,
      analysisStatus: 'pending',
      analysisSource: null,
      recommendedResolution: null,
      confidence: null,
      summary: null,
      reasons: [],
      actionableResolutions: [],
      mergedPayload: null,
      analyzedAt: null,
      analysisNote: null,
      detectedAt: Date.now(),
      resolvedAt: null,
    }
    await this.pool.query(
      `insert into sync_conflicts (id, workspace_id, entity_type, entity_id, device_id, local_record, cloud_record, diff_hints, detected_at, resolved_at)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, null)`,
      [
        conflict.id,
        conflict.workspaceId,
        conflict.entityType,
        conflict.entityId,
        conflict.deviceId,
        JSON.stringify(conflict.localRecord),
        JSON.stringify(conflict.cloudRecord),
        JSON.stringify(conflict.diffHints),
        conflict.detectedAt,
      ],
    )
    return conflict
  }

  async getConflict(conflictId: string): Promise<SyncConflictRecord<TPayload> | null> {
    const result = await this.pool.query(`select * from sync_conflicts where id = $1 limit 1`, [conflictId])
    return result.rowCount ? mapConflict<TPayload>(result.rows[0] as Record<string, unknown>) : null
  }

  async listConflicts(workspaceId: string): Promise<Array<SyncConflictRecord<TPayload>>> {
    const result = await this.pool.query(
      `select * from sync_conflicts where workspace_id = $1 and resolved_at is null order by detected_at desc`,
      [workspaceId],
    )
    return result.rows.map((row: Record<string, unknown>) => mapConflict<TPayload>(row))
  }

  async resolveConflict(input: ResolveConflictInput<TPayload>): Promise<ResolveConflictResult<TPayload>> {
    const conflict = await this.getConflict(input.conflictId)
    if (!conflict || conflict.workspaceId !== input.workspaceId) {
      throw new Error('Conflict not found.')
    }

    if (input.resolution === 'use_cloud') {
      if (!conflict.cloudRecord) {
        throw new Error('Cloud record is missing.')
      }
      await this.pool.query(`update sync_conflicts set resolved_at = $2 where id = $1`, [input.conflictId, Date.now()])
      const cursorResult = await this.pool.query(
        `select coalesce(max(cursor), 0) as cursor from workspace_change_log where workspace_id = $1`,
        [input.workspaceId],
      )
      return {
        resolvedRecord: conflict.cloudRecord,
        cursor: Number(cursorResult.rows[0]?.cursor ?? 0),
      }
    }

    if (input.resolution === 'save_local_copy') {
      if (!conflict.localRecord) {
        throw new Error('Local record is missing.')
      }
      const copyRecord = buildSaveLocalCopyRecord(
        conflict.entityType,
        conflict.localRecord,
        {
          deviceId: input.deviceId,
        },
      )
      const cursor = await this.writeHead(input.workspaceId, conflict.entityType, 'upsert', copyRecord)
      await this.pool.query(`update sync_conflicts set resolved_at = $2 where id = $1`, [input.conflictId, Date.now()])
      return {
        resolvedRecord: conflict.cloudRecord ?? conflict.localRecord,
        extraCreatedRecord: copyRecord,
        cursor,
      }
    }

    if (!input.mergedPayload) {
      throw new Error('Merged payload is required.')
    }
    const current = conflict.cloudRecord ?? conflict.localRecord
    if (!current) {
      throw new Error('Conflict has no current record.')
    }
    const mergedRecord: SyncEnvelope<TPayload> = {
      ...current,
      version: current.version + 1,
      baseVersion: current.version,
      deviceId: input.deviceId,
      updatedAt: Date.now(),
      deletedAt: null,
      syncStatus: 'synced',
      payload: input.mergedPayload,
      contentHash: computeStableContentHash(input.mergedPayload),
    }
    const cursor = await this.writeHead(input.workspaceId, conflict.entityType, 'upsert', mergedRecord)
    await this.pool.query(`update sync_conflicts set resolved_at = $2 where id = $1`, [input.conflictId, Date.now()])
    return {
      resolvedRecord: mergedRecord,
      cursor,
    }
  }

  private async getHead(
    workspaceId: string,
    entityType: SyncEntityType,
    entityId: string,
  ): Promise<SyncEnvelope<TPayload> | null> {
    const result = await this.pool.query(
      `select * from sync_heads where workspace_id = $1 and entity_type = $2 and entity_id = $3 limit 1`,
      [workspaceId, entityType, entityId],
    )
    return result.rowCount ? mapEnvelope<TPayload>(result.rows[0] as Record<string, unknown>) : null
  }

  private async getActiveConflictByEntity(
    workspaceId: string,
    entityType: SyncEntityType,
    entityId: string,
  ): Promise<SyncConflictRecord<TPayload> | null> {
    const result = await this.pool.query(
      `select *
       from sync_conflicts
       where workspace_id = $1 and entity_type = $2 and entity_id = $3 and resolved_at is null
       order by detected_at desc
       limit 1`,
      [workspaceId, entityType, entityId],
    )
    return result.rowCount ? mapConflict<TPayload>(result.rows[0] as Record<string, unknown>) : null
  }

  private async writeHead(
    workspaceId: string,
    entityType: SyncEntityType,
    action: 'upsert' | 'delete',
    record: SyncEnvelope<TPayload>,
  ): Promise<number> {
    await this.pool.query(
      `insert into sync_heads (
        workspace_id, entity_type, entity_id, user_id, device_id, version, base_version, content_hash, payload_json, updated_at, deleted_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
      on conflict (workspace_id, entity_type, entity_id)
      do update set
        user_id = excluded.user_id,
        device_id = excluded.device_id,
        version = excluded.version,
        base_version = excluded.base_version,
        content_hash = excluded.content_hash,
        payload_json = excluded.payload_json,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at`,
      [
        workspaceId,
        entityType,
        record.id,
        record.userId,
        record.deviceId,
        record.version,
        record.baseVersion,
        record.contentHash,
        JSON.stringify(record.payload),
        record.updatedAt,
        record.deletedAt,
      ],
    )
    await this.pool.query(
      `insert into sync_snapshots (workspace_id, entity_type, entity_id, version, record_json, created_at)
       values ($1, $2, $3, $4, $5::jsonb, $6)
       on conflict do nothing`,
      [workspaceId, entityType, record.id, record.version, JSON.stringify(record), Date.now()],
    )
    const changeResult = await this.pool.query(
      `insert into workspace_change_log (workspace_id, entity_type, entity_id, action, record_json, created_at)
       values ($1, $2, $3, $4, $5::jsonb, $6)
       returning cursor`,
      [workspaceId, entityType, record.id, action, JSON.stringify(record), Date.now()],
    )
    await this.pool.query(
      `update workspaces set updated_at = $2 where id = $1`,
      [workspaceId, Date.now()],
    )
    return Number(changeResult.rows[0]?.cursor ?? 0)
  }

  // AI Provider Config methods
  async getAiProviderConfig(workspaceId: string, providerType: string): Promise<{ apiKey?: string; model?: string; baseUrl?: string } | null> {
    const result = await this.pool.query(
      `SELECT config FROM ai_provider_configs 
       WHERE workspace_id = $1 AND provider_type = $2`,
      [workspaceId, providerType]
    )
    
    if (result.rows.length === 0) {
      return null
    }
    
    return result.rows[0].config as { apiKey?: string; model?: string; baseUrl?: string }
  }

  async setAiProviderConfig(
    workspaceId: string, 
    providerType: string, 
    config: { apiKey?: string; model?: string; baseUrl?: string }
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO ai_provider_configs (workspace_id, provider_type, config, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (workspace_id, provider_type) 
       DO UPDATE SET config = $3, updated_at = NOW()`,
      [workspaceId, providerType, JSON.stringify(config)]
    )
  }

  async deleteAiProviderConfig(workspaceId: string, providerType: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM ai_provider_configs 
       WHERE workspace_id = $1 AND provider_type = $2`,
      [workspaceId, providerType]
    )
  }

  // System Prompt methods
  async getSystemPrompt(): Promise<{ businessPrompt: string; updatedAt: number } | null> {
    const result = await this.pool.query(
      `SELECT business_prompt, updated_at FROM system_prompts WHERE id = 'default'`
    )
    
    if (result.rows.length === 0) {
      return null
    }
    
    return {
      businessPrompt: result.rows[0].business_prompt,
      updatedAt: Number(result.rows[0].updated_at),
    }
  }

  async saveSystemPrompt(businessPrompt: string): Promise<{ businessPrompt: string; updatedAt: number }> {
    const updatedAt = Date.now()
    
    await this.pool.query(
      `INSERT INTO system_prompts (id, business_prompt, updated_at)
       VALUES ('default', $1, $2)
       ON CONFLICT (id) 
       DO UPDATE SET business_prompt = $1, updated_at = $2`,
      [businessPrompt, updatedAt]
    )
    
    return { businessPrompt, updatedAt }
  }

  async deleteSystemPrompt(): Promise<void> {
    await this.pool.query(
      `DELETE FROM system_prompts WHERE id = 'default'`
    )
  }
}
