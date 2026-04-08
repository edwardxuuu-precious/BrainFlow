import type {
  SyncAnalyzeConflictRequest,
  SyncBootstrapRequest,
  SyncConflictResolution,
  SyncEnvelope,
  SyncResolveConflictRequest,
} from '../../../../shared/sync-contract'
import type { AiConversation } from '../../../../shared/ai-contract'
import { computeContentHash } from '../core/content-hash'
import { SyncApiClient, CloudSyncConflictError } from '../cloud/sync-api'
import { cloudSyncIdb } from '../local/cloud-sync-idb'
import { readLegacyWorkspaceSnapshot } from '../local/legacy-reader'
import type {
  CloudSyncStatus,
  StoragePendingOp,
  DeviceInfoRecord,
  DocumentPendingOp,
  StorageConflictRecord,
  ConversationPendingOp,
  SyncedConversationRecord,
  SyncedDocumentRecord,
  SyncStateRecord,
} from '../domain/sync-records'
import {
  createPendingConflictAnalysis,
  mergeDocumentWithDeviceState,
  normalizeStorageConflictRecord,
  normalizeConversationId,
  toDeviceDocumentState,
  toDocumentContent,
} from '../domain/sync-records'
import type { MindMapDocument } from '../../documents/types'
import {
  analyzeConflictHeuristics,
  buildHeuristicFallbackAnalysis,
} from './conflict-analysis'

type Listener = (status: CloudSyncStatus) => void

const WORKSPACE_ID_KEY = 'brainflow-cloud-workspace-id'
const WORKSPACE_SUMMARY_KEY = 'brainflow-cloud-workspace-summary'
const LOCAL_SAVED_AT_KEY = 'brainflow-cloud-local-saved-at'
const CLOUD_SYNCED_AT_KEY = 'brainflow-cloud-synced-at'
const SYNC_INTERVAL_MS = 30_000
const IS_TEST_ENV =
  (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') ||
  (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent))

function createDeviceId(): string {
  return `device_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function createOpId(): string {
  return `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function readJsonStorage<T>(key: string): T | null {
  if (typeof localStorage === 'undefined') {
    return null
  }
  const raw = localStorage.getItem(key)
  if (!raw) {
    return null
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function writeJsonStorage(key: string, value: unknown): void {
  if (typeof localStorage === 'undefined') {
    return
  }
  localStorage.setItem(key, JSON.stringify(value))
}

function readTimestampStorage(key: string): number | null {
  if (typeof localStorage === 'undefined') {
    return null
  }
  const raw = localStorage.getItem(key)
  return raw ? Number(raw) : null
}

function writeTimestampStorage(key: string, value: number): void {
  if (typeof localStorage === 'undefined') {
    return
  }
  localStorage.setItem(key, String(value))
}

function createDefaultSyncState(workspaceId: string): SyncStateRecord {
  return {
    workspaceId,
    lastPulledCursor: 0,
    lastPullAt: null,
    lastPushAt: null,
    isSyncing: false,
    lastError: null,
    hasConflicts: false,
    bootstrapCompletedAt: null,
  }
}

export class CloudSyncOrchestrator {
  private readonly listeners = new Set<Listener>()
  private readonly api = new SyncApiClient<unknown>()
  private deviceId: string | null = null
  private status: CloudSyncStatus = {
    workspace: null,
    state: null,
    localSavedAt: null,
    cloudSyncedAt: null,
    isOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
    isSyncing: false,
    conflicts: [],
  }
  private initialized = false
  private initPromise: Promise<void> | null = null
  private syncTimer: number | null = null
  private syncInFlight = false
  private readonly conflictsBeingAnalyzed = new Set<string>()

  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }
    if (this.initPromise) {
      return this.initPromise
    }

    this.initPromise = (async () => {
      this.deviceId = await this.ensureDevice()
      await this.seedCacheFromLegacyIfNeeded()
      await this.refreshStatus()
      void this.backfillConflictAnalyses()
      this.setupBrowserTriggers()
      this.initialized = true
      await this.triggerSync('startup')
    })()

    return this.initPromise
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.status)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getStatus(): CloudSyncStatus {
    return this.status
  }

  async listDocuments(): Promise<MindMapDocument[]> {
    const [records, deviceInfo] = await Promise.all([
      cloudSyncIdb.listDocuments(),
      this.getDeviceInfo(),
    ])
    return records
      .filter((record) => record.deletedAt === null)
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map((record) => mergeDocumentWithDeviceState(record.payload, deviceInfo?.documents[record.id] ?? null))
  }

  async getDocument(id: string): Promise<MindMapDocument | null> {
    const [record, deviceInfo] = await Promise.all([
      cloudSyncIdb.getDocument(id),
      this.getDeviceInfo(),
    ])
    if (!record || record.deletedAt !== null) {
      return null
    }
    return mergeDocumentWithDeviceState(record.payload, deviceInfo?.documents[id] ?? null)
  }

  async saveDocument(document: MindMapDocument): Promise<void> {
    await this.initialize()
    const deviceId = this.requireDeviceId()
    const workspaceId = await this.ensureWorkspaceId()
    const [existing, deviceInfo] = await Promise.all([
      cloudSyncIdb.getDocument(document.id),
      this.getDeviceInfo(),
    ])
    const content = toDocumentContent(document)
    const contentHash = await computeContentHash(content)
    const updatedAt = Date.now()

    const nextDeviceInfo: DeviceInfoRecord = {
      ...(deviceInfo ?? {
        deviceId,
        deviceLabel: 'This device',
        platform: typeof navigator === 'undefined' ? 'unknown' : navigator.platform || 'web',
        lastSeenAt: updatedAt,
        documents: {},
      }),
      lastSeenAt: updatedAt,
      documents: {
        ...(deviceInfo?.documents ?? {}),
        [document.id]: toDeviceDocumentState(document),
      },
    }
    await cloudSyncIdb.saveDeviceInfo(nextDeviceInfo)

    const contentChanged =
      !existing ||
      existing.deletedAt !== null ||
      existing.contentHash !== contentHash

    if (contentChanged) {
      const record: SyncedDocumentRecord = {
        id: document.id,
        userId: this.getUserId(),
        workspaceId,
        deviceId,
        version: existing?.version ?? 0,
        baseVersion: existing?.version ?? null,
        contentHash,
        updatedAt,
        deletedAt: null,
        syncStatus: 'local_saved_pending_sync',
        payload: content,
      }
      await cloudSyncIdb.saveDocument(record)
      await this.upsertPendingOp({
        opId: createOpId(),
        workspaceId,
        deviceId,
        entityType: 'document',
        entityId: record.id,
        action: 'upsert',
        baseVersion: record.baseVersion,
        payload: record.payload,
        contentHash: record.contentHash,
        clientUpdatedAt: updatedAt,
        status: 'pending',
        attemptCount: 0,
        lastError: null,
        createdAt: updatedAt,
      })
    }

    writeTimestampStorage(LOCAL_SAVED_AT_KEY, updatedAt)
    await this.refreshStatus()
    void this.triggerSync('document_saved')
  }

  async deleteDocument(id: string): Promise<void> {
    await this.initialize()
    const existing = await cloudSyncIdb.getDocument(id)
    if (!existing) {
      return
    }
    const updatedAt = Date.now()
    const record: SyncedDocumentRecord = {
      ...existing,
      updatedAt,
      deletedAt: updatedAt,
      syncStatus: 'local_saved_pending_sync',
    }
    await cloudSyncIdb.saveDocument(record)
      await this.upsertPendingOp({
        opId: createOpId(),
        workspaceId: record.workspaceId,
        deviceId: this.requireDeviceId(),
      entityType: 'document',
      entityId: record.id,
      action: 'delete',
      baseVersion: existing.version,
      payload: null,
      contentHash: record.contentHash,
      clientUpdatedAt: updatedAt,
      status: 'pending',
      attemptCount: 0,
      lastError: null,
      createdAt: updatedAt,
    })
    writeTimestampStorage(LOCAL_SAVED_AT_KEY, updatedAt)
    await this.refreshStatus()
    void this.triggerSync('document_deleted')
  }

  async listConversations(documentId?: string): Promise<AiConversation[]> {
    const conversations = documentId
      ? await cloudSyncIdb.listConversationsByDocument(documentId)
      : await cloudSyncIdb.listConversations()
    return conversations
      .filter((record) => record.deletedAt === null)
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map((record) => ({
        ...record.payload,
        id: record.id,
      }))
  }

  async getConversation(documentId: string, sessionId: string): Promise<AiConversation | null> {
    const conversations = await cloudSyncIdb.listConversationsByDocument(documentId)
    const record = conversations.find(
      (entry) => entry.id === sessionId || entry.payload.sessionId === sessionId,
    )
    if (!record || record.deletedAt !== null) {
      return null
    }
    return {
      ...record.payload,
      id: record.id,
    }
  }

  async saveConversation(conversation: AiConversation): Promise<void> {
    await this.initialize()
    const deviceId = this.requireDeviceId()
    const workspaceId = await this.ensureWorkspaceId()
    const normalizedId = normalizeConversationId(conversation)
    const existing = await cloudSyncIdb.getConversation(normalizedId)
    const updatedAt = Date.now()
    const payload: AiConversation = {
      ...conversation,
      id: normalizedId,
      sessionId: conversation.sessionId || normalizedId,
      updatedAt,
    }
    const contentHash = await computeContentHash(payload)
    const record: SyncedConversationRecord = {
      id: normalizedId,
      userId: this.getUserId(),
      workspaceId,
      deviceId,
      version: existing?.version ?? 0,
      baseVersion: existing?.version ?? null,
      contentHash,
      updatedAt,
      deletedAt: null,
      syncStatus: 'local_saved_pending_sync',
      payload,
    }
    await cloudSyncIdb.saveConversation(record)
    await this.upsertPendingOp({
      opId: createOpId(),
      workspaceId,
      deviceId,
      entityType: 'conversation',
      entityId: normalizedId,
      action: 'upsert',
      baseVersion: record.baseVersion,
      payload,
      contentHash,
      clientUpdatedAt: updatedAt,
      status: 'pending',
      attemptCount: 0,
      lastError: null,
      createdAt: updatedAt,
    })
    writeTimestampStorage(LOCAL_SAVED_AT_KEY, updatedAt)
    await this.refreshStatus()
    void this.triggerSync('conversation_saved')
  }

  async deleteConversation(documentId: string, sessionId: string): Promise<void> {
    await this.initialize()
    const existing = await this.getConversation(documentId, sessionId)
    if (!existing) {
      return
    }
    const normalizedId = normalizeConversationId(existing)
    const current = await cloudSyncIdb.getConversation(normalizedId)
    if (!current) {
      return
    }
    const updatedAt = Date.now()
    await cloudSyncIdb.saveConversation({
      ...current,
      updatedAt,
      deletedAt: updatedAt,
      syncStatus: 'local_saved_pending_sync',
    })
    await this.upsertPendingOp({
      opId: createOpId(),
      workspaceId: current.workspaceId,
      deviceId: this.requireDeviceId(),
      entityType: 'conversation',
      entityId: normalizedId,
      action: 'delete',
      baseVersion: current.version,
      payload: null,
      contentHash: current.contentHash,
      clientUpdatedAt: updatedAt,
      status: 'pending',
      attemptCount: 0,
      lastError: null,
      createdAt: updatedAt,
    })
    writeTimestampStorage(LOCAL_SAVED_AT_KEY, updatedAt)
    await this.refreshStatus()
    void this.triggerSync('conversation_deleted')
  }

  async triggerSync(_reason: string): Promise<void> {
    if (this.syncInFlight || !this.status.isOnline) {
      return
    }
    this.syncInFlight = true
    const workspaceId = await this.ensureWorkspaceId()
    const state = (await cloudSyncIdb.getSyncState(workspaceId)) ?? createDefaultSyncState(workspaceId)
    await cloudSyncIdb.saveSyncState({ ...state, isSyncing: true, lastError: null })
    await this.refreshStatus()

    try {
      const currentState = (await cloudSyncIdb.getSyncState(workspaceId)) ?? createDefaultSyncState(workspaceId)
      if (!currentState.bootstrapCompletedAt) {
        await this.bootstrapCurrentCache(workspaceId)
      } else {
        await this.pushPendingOps(workspaceId)
        await this.pullChanges(workspaceId)
      }
      const nextState = (await cloudSyncIdb.getSyncState(workspaceId)) ?? createDefaultSyncState(workspaceId)
      await cloudSyncIdb.saveSyncState({
        ...nextState,
        isSyncing: false,
        lastError: null,
      })
    } catch (error) {
      const nextState = (await cloudSyncIdb.getSyncState(workspaceId)) ?? createDefaultSyncState(workspaceId)
      await cloudSyncIdb.saveSyncState({
        ...nextState,
        isSyncing: false,
        lastError: error instanceof Error ? error.message : 'Sync failed.',
      })
    } finally {
      this.syncInFlight = false
      await this.refreshStatus()
    }
  }

  async migrateLegacyToCloud(workspaceName?: string): Promise<void> {
    await this.initialize()
    const snapshot = await readLegacyWorkspaceSnapshot()
    const workspaceId = await this.ensureWorkspaceId()
    const documents = await Promise.all(
      snapshot.documents.map(async (document) => ({
        id: document.id,
        userId: this.getUserId(),
        workspaceId,
        deviceId: this.requireDeviceId(),
        version: 0,
        baseVersion: null,
        contentHash: await computeContentHash(toDocumentContent(document)),
        updatedAt: document.updatedAt,
        deletedAt: null,
        syncStatus: 'local_saved_pending_sync' as const,
        payload: toDocumentContent(document),
      })),
    )
    const conversations = await Promise.all(
      snapshot.conversations.map(async (conversation) => {
        const id = normalizeConversationId(conversation)
        const payload: AiConversation = { ...conversation, id, sessionId: conversation.sessionId || id }
        return {
          id,
          userId: this.getUserId(),
          workspaceId,
          deviceId: this.requireDeviceId(),
          version: 0,
          baseVersion: null,
          contentHash: await computeContentHash(payload),
          updatedAt: payload.updatedAt,
          deletedAt: null,
          syncStatus: 'local_saved_pending_sync' as const,
          payload,
        }
      }),
    )
    const request: SyncBootstrapRequest<unknown> = {
      workspaceName,
      targetWorkspaceId: workspaceId,
      deviceId: this.requireDeviceId(),
      documents,
      conversations,
      sourceOrigin: snapshot.sourceOrigin,
      sourceSchemaVersion: snapshot.sourceSchemaVersion,
    }
    const response = await this.api.bootstrap(request)
    await this.applyWorkspaceSnapshot(response.workspace.id, response.documents as SyncedDocumentRecord[], response.conversations as SyncedConversationRecord[])
    writeJsonStorage(WORKSPACE_SUMMARY_KEY, response.workspace)
    writeJsonStorage(WORKSPACE_ID_KEY, response.workspace.id)
    await cloudSyncIdb.saveSyncState({
      workspaceId: response.workspace.id,
      lastPulledCursor: response.cursor,
      lastPullAt: Date.now(),
      lastPushAt: Date.now(),
      isSyncing: false,
      lastError: null,
      hasConflicts: false,
      bootstrapCompletedAt: response.bootstrappedAt,
    })
    writeTimestampStorage(CLOUD_SYNCED_AT_KEY, Date.now())
    await this.refreshStatus()
  }

  async resolveConflict(
    conflictId: string,
    resolution: SyncConflictResolution,
    mergedPayload?: unknown,
  ): Promise<void> {
    const conflict = await cloudSyncIdb.getConflict(conflictId)
    if (!conflict) {
      return
    }
    const request: SyncResolveConflictRequest<unknown> = {
      conflictId,
      workspaceId: conflict.workspaceId,
      deviceId: this.requireDeviceId(),
      resolution,
      mergedPayload,
    }
    const response = await this.api.resolveConflict(request)
    await this.applyAuthoritativeRecord(response.resolvedRecord)
    if (response.extraCreatedRecord) {
      await this.applyAuthoritativeRecord(response.extraCreatedRecord)
    }
    await cloudSyncIdb.deleteConflictsByEntity(conflict.workspaceId, conflict.entityType, conflict.entityId)
    await cloudSyncIdb.deletePendingOpsByEntity(conflict.workspaceId, conflict.entityType, conflict.entityId)
    const state = (await cloudSyncIdb.getSyncState(conflict.workspaceId)) ?? createDefaultSyncState(conflict.workspaceId)
    const remainingConflicts = await cloudSyncIdb.listConflictsByWorkspace(conflict.workspaceId)
    await cloudSyncIdb.saveSyncState({
      ...state,
      hasConflicts: remainingConflicts.length > 0,
      lastPulledCursor: response.cursor,
      lastPullAt: Date.now(),
      lastPushAt: Date.now(),
    })
    writeTimestampStorage(CLOUD_SYNCED_AT_KEY, Date.now())
    await this.refreshStatus()
  }

  private async bootstrapCurrentCache(workspaceId: string): Promise<void> {
    const [documents, conversations] = await Promise.all([
      cloudSyncIdb.listDocuments(),
      cloudSyncIdb.listConversations(),
    ])
    if (documents.length === 0 && conversations.length === 0) {
      return
    }
    const response = await this.api.bootstrap({
      targetWorkspaceId: workspaceId,
      deviceId: this.requireDeviceId(),
      documents,
      conversations,
      sourceOrigin: typeof window === 'undefined' ? 'unknown-origin' : window.location.origin,
      sourceSchemaVersion: 'cloud-cache-v2',
    })
    await this.applyWorkspaceSnapshot(response.workspace.id, response.documents as SyncedDocumentRecord[], response.conversations as SyncedConversationRecord[])
    writeJsonStorage(WORKSPACE_SUMMARY_KEY, response.workspace)
    writeJsonStorage(WORKSPACE_ID_KEY, response.workspace.id)
    await cloudSyncIdb.saveSyncState({
      workspaceId: response.workspace.id,
      lastPulledCursor: response.cursor,
      lastPullAt: Date.now(),
      lastPushAt: Date.now(),
      isSyncing: true,
      lastError: null,
      hasConflicts: false,
      bootstrapCompletedAt: response.bootstrappedAt,
    })
    writeTimestampStorage(CLOUD_SYNCED_AT_KEY, Date.now())
  }

  private async pushPendingOps(workspaceId: string): Promise<void> {
    const pendingOps = (await cloudSyncIdb.listPendingOpsByWorkspace(workspaceId)).filter(
      (op) => op.status === 'pending' || op.status === 'failed',
    )
    if (pendingOps.length === 0) {
      return
    }

    for (const op of pendingOps) {
      await cloudSyncIdb.savePendingOp({
        ...op,
        status: 'syncing',
        attemptCount: op.attemptCount + 1,
      })
      try {
        const response = await this.api.push({
          workspaceId,
          deviceId: this.requireDeviceId(),
          ops: [
            {
              opId: op.opId,
              entityType: op.entityType,
              entityId: op.entityId,
              action: op.action,
              baseVersion: op.baseVersion,
              payload: op.payload,
              contentHash: op.contentHash,
              clientUpdatedAt: op.clientUpdatedAt,
            },
          ],
        })
        for (const applied of response.applied) {
          await this.applyAuthoritativeRecord(applied.authoritativeRecord)
          await cloudSyncIdb.deletePendingOp(applied.opId)
        }
        const state = (await cloudSyncIdb.getSyncState(workspaceId)) ?? createDefaultSyncState(workspaceId)
        await cloudSyncIdb.saveSyncState({
          ...state,
          lastPulledCursor: Math.max(state.lastPulledCursor, response.cursor),
          lastPushAt: response.serverTime,
        })
        writeTimestampStorage(CLOUD_SYNCED_AT_KEY, response.serverTime)
      } catch (error) {
        if (error instanceof CloudSyncConflictError) {
          const conflict = this.buildConflictRecord(workspaceId, op, error)
          await cloudSyncIdb.deleteConflictsByEntity(workspaceId, op.entityType, op.entityId)
          await cloudSyncIdb.saveConflict(conflict)
          await this.refreshStatus()
          void this.analyzeConflictRecord(conflict)
          await this.upsertPendingOp({
            ...op,
            status: 'conflict',
            lastError: 'Version conflict',
          })
          const state = (await cloudSyncIdb.getSyncState(workspaceId)) ?? createDefaultSyncState(workspaceId)
          await cloudSyncIdb.saveSyncState({
            ...state,
            hasConflicts: true,
          })
          break
        }

        await cloudSyncIdb.savePendingOp({
          ...op,
          status: 'failed',
          lastError: error instanceof Error ? error.message : 'Push failed.',
        })
        throw error
      }
    }
  }

  private async upsertPendingOp(op: StoragePendingOp): Promise<void> {
    const existingOps = await cloudSyncIdb.listPendingOpsByEntity(op.workspaceId, op.entityType, op.entityId)
    if (existingOps.length === 0) {
      await cloudSyncIdb.savePendingOp(op)
      return
    }

    const primary =
      existingOps.find((entry) => entry.status === 'conflict') ??
      existingOps.sort((left, right) => left.createdAt - right.createdAt)[0]

    const nextStatus = primary.status === 'conflict' ? 'conflict' : op.status
    const sharedFields = {
      action: op.action,
      baseVersion: op.baseVersion,
      contentHash: op.contentHash,
      clientUpdatedAt: op.clientUpdatedAt,
      status: nextStatus,
      attemptCount: nextStatus === 'conflict' ? primary.attemptCount : 0,
      lastError: nextStatus === 'conflict' ? 'Version conflict' : null,
    }
    const merged: StoragePendingOp =
      op.entityType === 'document'
        ? {
            ...(primary as DocumentPendingOp),
            ...sharedFields,
            payload: op.payload as DocumentPendingOp['payload'],
          }
        : {
            ...(primary as ConversationPendingOp),
            ...sharedFields,
            payload: op.payload as ConversationPendingOp['payload'],
          }

    await cloudSyncIdb.savePendingOp(merged)
    await Promise.all(
      existingOps
        .filter((entry) => entry.opId !== merged.opId)
        .map((entry) => cloudSyncIdb.deletePendingOp(entry.opId)),
    )
  }

  private buildConflictRecord(
    workspaceId: string,
    op: DocumentPendingOp | ConversationPendingOp,
    error: CloudSyncConflictError<unknown>,
  ): StorageConflictRecord {
    if (op.entityType === 'document') {
      const localRecord: SyncedDocumentRecord | null = op.payload
        ? {
            id: op.entityId,
            userId: this.getUserId(),
            workspaceId,
            deviceId: this.requireDeviceId(),
            version: op.baseVersion ?? 0,
            baseVersion: op.baseVersion,
            contentHash: op.contentHash,
            updatedAt: op.clientUpdatedAt,
            deletedAt: op.action === 'delete' ? op.clientUpdatedAt : null,
            syncStatus: 'conflict' as const,
            payload: op.payload as SyncedDocumentRecord['payload'],
          }
        : null
      return {
        ...createPendingConflictAnalysis<SyncedDocumentRecord['payload']>(),
        id: error.payload.conflictId,
        workspaceId,
        entityType: 'document',
        entityId: op.entityId,
        deviceId: this.requireDeviceId(),
        localRecord,
        cloudRecord: error.payload.cloudRecord as SyncedDocumentRecord | null,
        localPayload: localRecord?.payload ?? null,
        cloudPayload: (error.payload.cloudRecord as SyncedDocumentRecord | null)?.payload ?? null,
        diffHints: error.payload.diffHints,
        detectedAt: Date.now(),
        resolvedAt: null,
      }
    }

    const localRecord: SyncedConversationRecord | null = op.payload
      ? {
          id: op.entityId,
          userId: this.getUserId(),
          workspaceId,
          deviceId: this.requireDeviceId(),
          version: op.baseVersion ?? 0,
          baseVersion: op.baseVersion,
          contentHash: op.contentHash,
          updatedAt: op.clientUpdatedAt,
          deletedAt: op.action === 'delete' ? op.clientUpdatedAt : null,
          syncStatus: 'conflict' as const,
          payload: op.payload as SyncedConversationRecord['payload'],
        }
      : null
    return {
      ...createPendingConflictAnalysis<SyncedConversationRecord['payload']>(),
      id: error.payload.conflictId,
      workspaceId,
      entityType: 'conversation',
      entityId: op.entityId,
      deviceId: this.requireDeviceId(),
      localRecord,
      cloudRecord: error.payload.cloudRecord as SyncedConversationRecord | null,
      localPayload: localRecord?.payload ?? null,
      cloudPayload: (error.payload.cloudRecord as SyncedConversationRecord | null)?.payload ?? null,
      diffHints: error.payload.diffHints,
      detectedAt: Date.now(),
      resolvedAt: null,
    }
  }

  private async backfillConflictAnalyses(): Promise<void> {
    const conflicts = await cloudSyncIdb.listConflicts()
    await Promise.all(
      conflicts
        .filter((conflict) => conflict.analysisStatus !== 'ready')
        .map((conflict) => this.analyzeConflictRecord(conflict)),
    )
  }

  private async analyzeConflictRecord(conflict: StorageConflictRecord): Promise<void> {
    const normalized = normalizeStorageConflictRecord(conflict as never) as StorageConflictRecord
    if (normalized.analysisStatus === 'ready' || this.conflictsBeingAnalyzed.has(normalized.id)) {
      return
    }

    this.conflictsBeingAnalyzed.add(normalized.id)

    try {
      const heuristicDecision = analyzeConflictHeuristics(normalized as never)
      await this.saveConflictAnalysis(normalized.id, heuristicDecision.analysis)

      if (heuristicDecision.kind === 'resolved') {
        return
      }

      const response = await this.api.analyzeConflict({
        conflict: normalized,
      } satisfies SyncAnalyzeConflictRequest<unknown>)

      await this.saveConflictAnalysis(normalized.id, {
        analysisStatus: 'ready',
        analysisSource: response.analysisSource,
        recommendedResolution: response.recommendedResolution,
        confidence: response.confidence,
        summary: response.summary,
        reasons: response.reasons,
        actionableResolutions: response.actionableResolutions,
        mergedPayload: (response.mergedPayload ?? null) as unknown,
        analyzedAt: response.analyzedAt,
        analysisNote: response.analysisNote ?? null,
      })
    } catch (error) {
      const note =
        error instanceof Error
          ? `AI 不可用，已回退为规则建议：${error.message}`
          : 'AI 不可用，已回退为规则建议。'
      await this.saveConflictAnalysis(
        normalized.id,
        buildHeuristicFallbackAnalysis(normalized as never, note),
      )
    } finally {
      this.conflictsBeingAnalyzed.delete(normalized.id)
    }
  }

  private async saveConflictAnalysis(
    conflictId: string,
    analysis: {
      analysisStatus: StorageConflictRecord['analysisStatus']
      analysisSource: StorageConflictRecord['analysisSource']
      recommendedResolution: StorageConflictRecord['recommendedResolution']
      confidence: StorageConflictRecord['confidence']
      summary: StorageConflictRecord['summary']
      reasons: StorageConflictRecord['reasons']
      actionableResolutions: StorageConflictRecord['actionableResolutions']
      mergedPayload?: unknown | null
      analyzedAt: StorageConflictRecord['analyzedAt']
      analysisNote?: StorageConflictRecord['analysisNote']
    },
  ): Promise<void> {
    const current = await cloudSyncIdb.getConflict(conflictId)
    if (!current) {
      return
    }

    await cloudSyncIdb.saveConflict({ ...current, ...analysis } as StorageConflictRecord)
    await this.refreshStatus()
  }

  private async pullChanges(workspaceId: string): Promise<void> {
    const state = (await cloudSyncIdb.getSyncState(workspaceId)) ?? createDefaultSyncState(workspaceId)
    const response = await this.api.pull(workspaceId, state.lastPulledCursor)
    for (const change of response.changes) {
      await this.applyAuthoritativeRecord(change.authoritativeRecord)
    }
    await cloudSyncIdb.saveSyncState({
      ...state,
      lastPulledCursor: response.nextCursor,
      lastPullAt: Date.now(),
    })
    if (response.changes.length > 0) {
      writeTimestampStorage(CLOUD_SYNCED_AT_KEY, Date.now())
    }
  }

  private async applyWorkspaceSnapshot(
    workspaceId: string,
    documents: SyncedDocumentRecord[],
    conversations: SyncedConversationRecord[],
  ): Promise<void> {
    for (const document of documents) {
      await cloudSyncIdb.saveDocument({
        ...document,
        workspaceId,
        syncStatus: 'synced',
      })
    }
    for (const conversation of conversations) {
      await cloudSyncIdb.saveConversation({
        ...conversation,
        workspaceId,
        syncStatus: 'synced',
      })
    }
    const pending = await cloudSyncIdb.listPendingOpsByWorkspace(workspaceId)
    await Promise.all(pending.map((op) => cloudSyncIdb.deletePendingOp(op.opId)))
  }

  private async applyAuthoritativeRecord(record: SyncEnvelope<unknown>): Promise<void> {
    if ('documentId' in (record.payload as Record<string, unknown>)) {
      await cloudSyncIdb.saveConversation(record as SyncedConversationRecord)
      return
    }
    await cloudSyncIdb.saveDocument(record as SyncedDocumentRecord)
  }

  private async seedCacheFromLegacyIfNeeded(): Promise<void> {
    const [documents, conversations] = await Promise.all([
      cloudSyncIdb.listDocuments(),
      cloudSyncIdb.listConversations(),
    ])
    if (documents.length > 0 || conversations.length > 0) {
      return
    }

    const workspaceId = await this.ensureWorkspaceId()
    const legacy = await readLegacyWorkspaceSnapshot()
    for (const document of legacy.documents) {
      await cloudSyncIdb.saveDocument({
        id: document.id,
        userId: this.getUserId(),
        workspaceId,
        deviceId: this.requireDeviceId(),
        version: 0,
        baseVersion: null,
        contentHash: await computeContentHash(toDocumentContent(document)),
        updatedAt: document.updatedAt,
        deletedAt: null,
        syncStatus: 'local_saved_pending_sync',
        payload: toDocumentContent(document),
      })
      const deviceInfo = await this.getDeviceInfo()
      await cloudSyncIdb.saveDeviceInfo({
        ...(deviceInfo ?? {
          deviceId: this.requireDeviceId(),
          deviceLabel: 'This device',
          platform: typeof navigator === 'undefined' ? 'unknown' : navigator.platform || 'web',
          lastSeenAt: Date.now(),
          documents: {},
        }),
        documents: {
          ...(deviceInfo?.documents ?? {}),
          [document.id]: toDeviceDocumentState(document),
        },
        lastSeenAt: Date.now(),
      })
    }
    for (const conversation of legacy.conversations) {
      const id = normalizeConversationId(conversation)
      const payload: AiConversation = { ...conversation, id, sessionId: conversation.sessionId || id }
      await cloudSyncIdb.saveConversation({
        id,
        userId: this.getUserId(),
        workspaceId,
        deviceId: this.requireDeviceId(),
        version: 0,
        baseVersion: null,
        contentHash: await computeContentHash(payload),
        updatedAt: payload.updatedAt,
        deletedAt: null,
        syncStatus: 'local_saved_pending_sync',
        payload,
      })
    }

    const state = await cloudSyncIdb.getSyncState(workspaceId)
    if (!state) {
      await cloudSyncIdb.saveSyncState(createDefaultSyncState(workspaceId))
    }
  }

  private async ensureDevice(): Promise<string> {
    const existing = readJsonStorage<string>('brainflow-device-id')
    const deviceId = existing || createDeviceId()
    writeJsonStorage('brainflow-device-id', deviceId)
    const current = await cloudSyncIdb.getDeviceInfo(deviceId)
    if (!current) {
      await cloudSyncIdb.saveDeviceInfo({
        deviceId,
        deviceLabel: 'This device',
        platform: typeof navigator === 'undefined' ? 'unknown' : navigator.platform || 'web',
        lastSeenAt: Date.now(),
        documents: {},
      })
    }
    return deviceId
  }

  private async ensureWorkspaceId(): Promise<string> {
    const existing = readJsonStorage<string>(WORKSPACE_ID_KEY)
    if (existing) {
      return existing
    }
    const workspaceId = `workspace_local_${Math.random().toString(36).slice(2, 10)}`
    writeJsonStorage(WORKSPACE_ID_KEY, workspaceId)
    if (!(await cloudSyncIdb.getSyncState(workspaceId))) {
      await cloudSyncIdb.saveSyncState(createDefaultSyncState(workspaceId))
    }
    return workspaceId
  }

  private async refreshStatus(): Promise<void> {
    const workspaceId = readJsonStorage<string>(WORKSPACE_ID_KEY) ?? null
    const [state, conflicts] = workspaceId
      ? await Promise.all([
          cloudSyncIdb.getSyncState(workspaceId),
          cloudSyncIdb.listConflictsByWorkspace(workspaceId),
        ])
      : [null, []]
    this.status = {
      workspace: readJsonStorage(WORKSPACE_SUMMARY_KEY),
      state,
      localSavedAt: readTimestampStorage(LOCAL_SAVED_AT_KEY),
      cloudSyncedAt: readTimestampStorage(CLOUD_SYNCED_AT_KEY),
      isOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
      isSyncing: state?.isSyncing ?? false,
      conflicts,
    }
    this.listeners.forEach((listener) => listener(this.status))
  }

  private async getDeviceInfo(): Promise<DeviceInfoRecord | null> {
    return this.deviceId ? cloudSyncIdb.getDeviceInfo(this.deviceId) : null
  }

  private requireDeviceId(): string {
    if (!this.deviceId) {
      throw new Error('Device is not initialized.')
    }
    return this.deviceId
  }

  private getUserId(): string {
    return 'user_stub_default'
  }

  private setupBrowserTriggers(): void {
    if (typeof window === 'undefined' || IS_TEST_ENV) {
      return
    }
    window.addEventListener('focus', () => {
      void this.triggerSync('focus')
    })
    window.addEventListener('online', () => {
      void this.refreshStatus()
      void this.triggerSync('online')
    })
    window.addEventListener('offline', () => {
      void this.refreshStatus()
    })
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        void this.triggerSync('visibility')
      }
    })
    if (this.syncTimer !== null) {
      window.clearInterval(this.syncTimer)
    }
    this.syncTimer = window.setInterval(() => {
      void this.triggerSync('interval')
    }, SYNC_INTERVAL_MS)
  }
}

export const cloudSyncOrchestrator = new CloudSyncOrchestrator()
