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

interface StoredWorkspace {
  summary: SyncWorkspaceSummary
  lastCursor: number
}

interface StoredChange<TPayload> {
  cursor: number
  entityType: SyncEntityType
  action: 'upsert' | 'delete'
  authoritativeRecord: SyncEnvelope<TPayload>
}

export class InMemorySyncRepository<TPayload> implements SyncRepository<TPayload> {
  private readonly workspaces = new Map<string, StoredWorkspace>()
  private readonly documentHeads = new Map<string, SyncEnvelope<TPayload>>()
  private readonly conversationHeads = new Map<string, SyncEnvelope<TPayload>>()
  private readonly changes = new Map<string, StoredChange<TPayload>[]>()
  private readonly conflicts = new Map<string, SyncConflictRecord<TPayload>>()

  async initialize(): Promise<void> {
    return undefined
  }

  async getOrCreateWorkspace(
    userId: string,
    workspaceName?: string,
    targetWorkspaceId?: string,
  ): Promise<SyncWorkspaceSummary> {
    const existing =
      (targetWorkspaceId ? this.workspaces.get(targetWorkspaceId) : undefined)?.summary ??
      Array.from(this.workspaces.values()).find((entry) => entry.summary.userId === userId && entry.summary.name === (workspaceName || 'Default Workspace'))?.summary

    if (existing) {
      return existing
    }

    const workspace: SyncWorkspaceSummary = {
      id: targetWorkspaceId ?? `workspace_${Math.random().toString(36).slice(2, 10)}`,
      userId,
      name: workspaceName?.trim() || 'Default Workspace',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    this.workspaces.set(workspace.id, { summary: workspace, lastCursor: 0 })
    this.changes.set(workspace.id, [])
    return workspace
  }

  async bootstrap(
    input: BootstrapInput<TPayload>,
  ): Promise<WorkspaceFullResult<TPayload> & { bootstrappedAt: number }> {
    const workspace = await this.getOrCreateWorkspace(input.userId, input.workspaceName, input.targetWorkspaceId)
    const workspaceEntry = this.workspaces.get(workspace.id)
    if (!workspaceEntry) {
      throw new Error('Workspace bootstrap failed.')
    }

    const hasExistingData =
      Array.from(this.documentHeads.values()).some((record) => record.workspaceId === workspace.id) ||
      Array.from(this.conversationHeads.values()).some((record) => record.workspaceId === workspace.id)
    if (hasExistingData) {
      throw new Error('Bootstrap is only allowed for a new or empty workspace.')
    }

    for (const document of input.documents) {
      await this.writeHead({
        workspaceId: workspace.id,
        entityType: 'document',
        action: document.deletedAt ? 'delete' : 'upsert',
        record: {
          ...document,
          workspaceId: workspace.id,
          userId: input.userId,
          deviceId: input.deviceId,
          version: 1,
          baseVersion: null,
          syncStatus: 'synced',
          updatedAt: Date.now(),
        },
      })
    }

    for (const conversation of input.conversations) {
      await this.writeHead({
        workspaceId: workspace.id,
        entityType: 'conversation',
        action: conversation.deletedAt ? 'delete' : 'upsert',
        record: {
          ...conversation,
          workspaceId: workspace.id,
          userId: input.userId,
          deviceId: input.deviceId,
          version: 1,
          baseVersion: null,
          syncStatus: 'synced',
          updatedAt: Date.now(),
        },
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
    const current = this.getHead(input.workspaceId, input.entityType, input.entityId)
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

    const cursor = await this.writeHead({
      workspaceId: input.workspaceId,
      entityType: input.entityType,
      action: input.action,
      record: authoritativeRecord,
    })

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
    return (this.changes.get(workspaceId) ?? [])
      .filter((change) => change.cursor > afterCursor)
      .slice(0, limit)
  }

  async getWorkspaceFull(workspaceId: string): Promise<WorkspaceFullResult<TPayload> | null> {
    const workspace = this.workspaces.get(workspaceId)?.summary ?? null
    if (!workspace) {
      return null
    }

    const documents = Array.from(this.documentHeads.values()).filter((record) => record.workspaceId === workspaceId)
    const conversations = Array.from(this.conversationHeads.values()).filter((record) => record.workspaceId === workspaceId)
    const cursor = this.workspaces.get(workspaceId)?.lastCursor ?? 0

    return {
      workspace,
      documents,
      conversations,
      cursor,
    }
  }

  async restoreWorkspace(
    input: RestoreInput<TPayload>,
  ): Promise<WorkspaceFullResult<TPayload> & { restoredAt: number }> {
    const workspace = await this.getOrCreateWorkspace(input.userId, undefined, input.workspaceId)
    if (input.mode === 'replace') {
      for (const key of Array.from(this.documentHeads.keys())) {
        if (key.startsWith(`${workspace.id}:`)) {
          this.documentHeads.delete(key)
        }
      }
      for (const key of Array.from(this.conversationHeads.keys())) {
        if (key.startsWith(`${workspace.id}:`)) {
          this.conversationHeads.delete(key)
        }
      }
      this.changes.set(workspace.id, [])
      const workspaceEntry = this.workspaces.get(workspace.id)
      if (workspaceEntry) {
        workspaceEntry.lastCursor = 0
      }
    }

    const seedVersion = input.mode === 'replace' ? 1 : 0

    for (const document of input.documents) {
      await this.writeHead({
        workspaceId: workspace.id,
        entityType: 'document',
        action: document.deletedAt ? 'delete' : 'upsert',
        record: {
          ...document,
          version: document.version > 0 ? document.version : seedVersion + 1,
          baseVersion: document.baseVersion ?? null,
          userId: input.userId,
          workspaceId: workspace.id,
          syncStatus: 'synced',
          updatedAt: Date.now(),
        },
      })
    }
    for (const conversation of input.conversations) {
      await this.writeHead({
        workspaceId: workspace.id,
        entityType: 'conversation',
        action: conversation.deletedAt ? 'delete' : 'upsert',
        record: {
          ...conversation,
          version: conversation.version > 0 ? conversation.version : seedVersion + 1,
          baseVersion: conversation.baseVersion ?? null,
          userId: input.userId,
          workspaceId: workspace.id,
          syncStatus: 'synced',
          updatedAt: Date.now(),
        },
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
    const existing = this.findActiveConflictByEntity(workspaceId, entityType, entityId)
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
      this.conflicts.set(existing.id, updated)
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
    this.conflicts.set(conflict.id, conflict)
    return conflict
  }

  async getConflict(conflictId: string): Promise<SyncConflictRecord<TPayload> | null> {
    return this.conflicts.get(conflictId) ?? null
  }

  async listConflicts(workspaceId: string): Promise<Array<SyncConflictRecord<TPayload>>> {
    return Array.from(this.conflicts.values()).filter(
      (conflict) => conflict.workspaceId === workspaceId && conflict.resolvedAt === null,
    )
  }

  async resolveConflict(input: ResolveConflictInput<TPayload>): Promise<ResolveConflictResult<TPayload>> {
    const conflict = this.conflicts.get(input.conflictId)
    if (!conflict || conflict.workspaceId !== input.workspaceId) {
      throw new Error('Conflict not found.')
    }

    if (input.resolution === 'use_cloud') {
      if (!conflict.cloudRecord) {
        throw new Error('Cloud record is missing.')
      }
      conflict.resolvedAt = Date.now()
      return {
        resolvedRecord: conflict.cloudRecord,
        cursor: this.workspaces.get(input.workspaceId)?.lastCursor ?? 0,
      }
    }

    if (input.resolution === 'save_local_copy') {
      if (!conflict.localRecord) {
        throw new Error('Local record is missing.')
      }
      const copyRecord: SyncEnvelope<TPayload> = {
        ...conflict.localRecord,
        id: `${conflict.localRecord.id}_copy_${Math.random().toString(36).slice(2, 7)}`,
        version: 1,
        baseVersion: null,
        updatedAt: Date.now(),
        contentHash: computeStableContentHash(conflict.localRecord.payload),
      }
      const cursor = await this.writeHead({
        workspaceId: input.workspaceId,
        entityType: conflict.entityType,
        action: 'upsert',
        record: copyRecord,
      })
      conflict.resolvedAt = Date.now()
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
    const cursor = await this.writeHead({
      workspaceId: input.workspaceId,
      entityType: conflict.entityType,
      action: 'upsert',
      record: mergedRecord,
    })
    conflict.resolvedAt = Date.now()
    return {
      resolvedRecord: mergedRecord,
      cursor,
    }
  }

  private getHead(
    workspaceId: string,
    entityType: SyncEntityType,
    entityId: string,
  ): SyncEnvelope<TPayload> | null {
    const key = this.makeHeadKey(workspaceId, entityId)
    return entityType === 'document'
      ? (this.documentHeads.get(key) ?? null)
      : (this.conversationHeads.get(key) ?? null)
  }

  private async writeHead({
    workspaceId,
    entityType,
    action,
    record,
  }: {
    workspaceId: string
    entityType: SyncEntityType
    action: 'upsert' | 'delete'
    record: SyncEnvelope<TPayload>
  }): Promise<number> {
    const workspace = this.workspaces.get(workspaceId)
    if (!workspace) {
      throw new Error('Workspace not found.')
    }

    const key = this.makeHeadKey(workspaceId, record.id)
    if (entityType === 'document') {
      this.documentHeads.set(key, record)
    } else {
      this.conversationHeads.set(key, record)
    }

    workspace.lastCursor += 1
    workspace.summary.updatedAt = Date.now()
    const change: StoredChange<TPayload> = {
      cursor: workspace.lastCursor,
      entityType,
      action,
      authoritativeRecord: record,
    }
    const changes = this.changes.get(workspaceId) ?? []
    changes.push(change)
    this.changes.set(workspaceId, changes)
    return workspace.lastCursor
  }

  private makeHeadKey(workspaceId: string, entityId: string): string {
    return `${workspaceId}:${entityId}`
  }

  private findActiveConflictByEntity(
    workspaceId: string,
    entityType: SyncEntityType,
    entityId: string,
  ): SyncConflictRecord<TPayload> | null {
    return (
      Array.from(this.conflicts.values()).find(
        (conflict) =>
          conflict.workspaceId === workspaceId &&
          conflict.entityType === entityType &&
          conflict.entityId === entityId &&
          conflict.resolvedAt === null,
      ) ?? null
    )
  }
}
