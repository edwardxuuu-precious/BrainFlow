import type {
  SyncBootstrapRequest,
  SyncConflictResolution,
  SyncEnvelope,
  SyncResolveConflictRequest,
} from '../../../../shared/sync-contract'
import type { AiConversation } from '../../../../shared/ai-contract'
import { computeContentHash } from '../core/content-hash'
import { SyncApiClient, CloudSyncConflictError, SyncApiError } from '../cloud/sync-api'
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
import { readAuthSessionCache } from '../../auth/auth-session-cache'
import { analyzeConflictHeuristics } from './conflict-analysis'
import { storageAdminApiClient } from '../cloud/storage-admin-api'
import {
  DUPLICATE_TITLE_SUFFIX_PATTERN,
  generateUniqueTitle,
  normalizeDocumentTitle,
} from '../../documents/document-title'

type Listener = (status: CloudSyncStatus) => void

const WORKSPACE_ID_KEY = 'brainflow-cloud-workspace-id'
const WORKSPACE_SUMMARY_KEY = 'brainflow-cloud-workspace-summary'
const LOCAL_SAVED_AT_KEY = 'brainflow-cloud-local-saved-at'
const CLOUD_SYNCED_AT_KEY = 'brainflow-cloud-synced-at'
const LEGACY_MIGRATION_COMPLETED_KEY = 'brainflow-legacy-migration-completed-v1'
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

function createLocalCopyId(sourceId: string): string {
  return `${sourceId}_copy_${Math.random().toString(36).slice(2, 7)}`
}

function getCopyRootId(id: string): string {
  return id.split('_copy_')[0]
}

function getCopyDepth(id: string): number {
  return id.includes('_copy_') ? id.split('_copy_').length - 1 : 0
}

function stripGeneratedDuplicateTitle(title: string): string {
  const normalized = normalizeDocumentTitle(title)
  return normalized.replace(DUPLICATE_TITLE_SUFFIX_PATTERN, '').trim() || normalized
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getConversationDocumentIdFromConflict(conflict: StorageConflictRecord): string | null {
  if (conflict.entityType !== 'conversation') {
    return null
  }

  const localPayload = conflict.localRecord?.payload
  if (isRecordObject(localPayload) && 'documentId' in localPayload) {
    return String(localPayload.documentId)
  }

  const cloudPayload = conflict.cloudRecord?.payload
  if (isRecordObject(cloudPayload) && 'documentId' in cloudPayload) {
    return String(cloudPayload.documentId)
  }

  return null
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

function readBooleanStorage(key: string): boolean {
  if (typeof localStorage === 'undefined') {
    return false
  }

  return localStorage.getItem(key) === 'true'
}

function writeBooleanStorage(key: string, value: boolean): void {
  if (typeof localStorage === 'undefined') {
    return
  }

  localStorage.setItem(key, value ? 'true' : 'false')
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

interface WorkspaceRecoveryCandidate {
  id: string
  latestActivityAt: number
  signals: number
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
      const workspaceId = await this.ensureWorkspaceId()
      await this.seedCacheFromLegacyIfNeeded(workspaceId)
      await this.repairMalformedCachedRecords(workspaceId)
      await this.cleanupGeneratedCopyChains(workspaceId)
      await this.refreshStatus()
      await this.backfillConflictAnalyses()
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
    await this.initialize()
    const workspaceId = await this.ensureWorkspaceId()
    const [records, deviceInfo] = await Promise.all([
      cloudSyncIdb.listDocuments(),
      this.getDeviceInfo(),
    ])
    return records
      .filter((record) => record.workspaceId === workspaceId && record.deletedAt === null)
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map((record) => mergeDocumentWithDeviceState(record.payload, deviceInfo?.documents[record.id] ?? null))
  }

  async getDocument(id: string): Promise<MindMapDocument | null> {
    await this.initialize()
    const workspaceId = await this.ensureWorkspaceId()
    const [record, deviceInfo] = await Promise.all([
      cloudSyncIdb.getDocument(id),
      this.getDeviceInfo(),
    ])
    if (!record || record.workspaceId !== workspaceId || record.deletedAt !== null) {
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

    if (!contentChanged) {
      return
    }

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
    await this.initialize()
    const workspaceId = await this.ensureWorkspaceId()
    const conversations = documentId
      ? await cloudSyncIdb.listConversationsByDocument(documentId)
      : await cloudSyncIdb.listConversations()
    return conversations
      .filter((record) => record.workspaceId === workspaceId && record.deletedAt === null)
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map((record) => ({
        ...record.payload,
        id: record.id,
      }))
  }

  async getConversation(documentId: string, sessionId: string): Promise<AiConversation | null> {
    await this.initialize()
    const workspaceId = await this.ensureWorkspaceId()
    const conversations = await cloudSyncIdb.listConversationsByDocument(documentId)
    const record = conversations.find(
      (entry) =>
        entry.workspaceId === workspaceId &&
        (entry.id === sessionId || entry.payload.sessionId === sessionId),
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
    void _reason
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
        if (await this.shouldBootstrapLocalCache(workspaceId)) {
          await this.bootstrapCurrentCache(workspaceId)
        } else {
          await this.pushPendingOps(workspaceId)
          await this.pullChanges(workspaceId)
          await this.markBootstrapCompleted(workspaceId)
        }
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

  async switchWorkspace(workspaceId: string): Promise<void> {
    await this.initialize()

    const [response, existingDeviceInfo] = await Promise.all([
      this.api.getWorkspaceFull(workspaceId),
      this.getDeviceInfo(),
    ])

    await cloudSyncIdb.deleteDatabase()
    await cloudSyncIdb.saveDeviceInfo({
      ...(existingDeviceInfo ?? {
        deviceId: this.requireDeviceId(),
        deviceLabel: 'This device',
        platform: typeof navigator === 'undefined' ? 'unknown' : navigator.platform || 'web',
        lastSeenAt: Date.now(),
        documents: {},
      }),
      deviceId: this.requireDeviceId(),
      lastSeenAt: Date.now(),
      documents: {},
    })

    await this.applyWorkspaceSnapshot(
      response.workspace.id,
      response.documents as SyncedDocumentRecord[],
      response.conversations as SyncedConversationRecord[],
    )

    const latestUpdatedAt = [...response.documents, ...response.conversations]
      .map((record) => record.updatedAt)
      .reduce<number | null>((latest, value) => (latest === null || value > latest ? value : latest), null)
    const syncedAt = Date.now()

    writeJsonStorage(WORKSPACE_SUMMARY_KEY, response.workspace)
    writeJsonStorage(WORKSPACE_ID_KEY, response.workspace.id)
    writeBooleanStorage(LEGACY_MIGRATION_COMPLETED_KEY, true)
    if (latestUpdatedAt !== null) {
      writeTimestampStorage(LOCAL_SAVED_AT_KEY, latestUpdatedAt)
    } else if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LOCAL_SAVED_AT_KEY)
    }
    writeTimestampStorage(CLOUD_SYNCED_AT_KEY, syncedAt)
    await cloudSyncIdb.saveSyncState({
      workspaceId: response.workspace.id,
      lastPulledCursor: response.cursor,
      lastPullAt: syncedAt,
      lastPushAt: syncedAt,
      isSyncing: false,
      lastError: null,
      hasConflicts: false,
      bootstrapCompletedAt: syncedAt,
    })
    await this.refreshStatus()
  }

  async updateCurrentWorkspaceSummary(
    workspaceId: string,
    updates: { name: string },
  ): Promise<void> {
    await this.initialize()
    const currentWorkspace = readJsonStorage<{ id?: string; name?: string }>(WORKSPACE_SUMMARY_KEY)
    if (!currentWorkspace || currentWorkspace.id !== workspaceId) {
      return
    }

    writeJsonStorage(WORKSPACE_SUMMARY_KEY, {
      ...currentWorkspace,
      name: updates.name,
    })
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
    if (resolution === 'save_local_copy' && !conflict.cloudRecord) {
      await this.saveLocalCopyForStaleConflict(conflict)
      return
    }
    const request: SyncResolveConflictRequest<unknown> = {
      conflictId,
      workspaceId: conflict.workspaceId,
      deviceId: this.requireDeviceId(),
      resolution,
      mergedPayload,
    }
    const response = await this.api.resolveConflict(request).catch(async (error) => {
      if (error instanceof SyncApiError && error.status === 404 && resolution === 'save_local_copy') {
        await this.saveLocalCopyForStaleConflict(conflict)
        return null
      }

      if (error instanceof SyncApiError && error.status === 404) {
        const state = (await cloudSyncIdb.getSyncState(conflict.workspaceId)) ?? createDefaultSyncState(conflict.workspaceId)
        const remainingConflicts = await cloudSyncIdb.listConflictsByWorkspace(conflict.workspaceId)
        await cloudSyncIdb.saveSyncState({
          ...state,
          hasConflicts: remainingConflicts.length > 0,
          lastError: error.message,
        })
        await this.refreshStatus()
      }
      throw error
    })
    if (!response) {
      return
    }
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

  async discardLocalConflicts(conflictIds: string[]): Promise<void> {
    await this.initialize()

    const uniqueConflictIds = Array.from(new Set(conflictIds))
    const touchedWorkspaceIds = new Set<string>()
    let mutated = false

    for (const conflictId of uniqueConflictIds) {
      const conflict = await cloudSyncIdb.getConflict(conflictId)
      if (!conflict) {
        continue
      }

      if (conflict.cloudRecord) {
        throw new Error('Main-database record still exists.')
      }

      await this.discardLocalConflictRecords(conflict)
      touchedWorkspaceIds.add(conflict.workspaceId)
      mutated = true
    }

    if (!mutated) {
      await this.refreshStatus()
      return
    }

    for (const workspaceId of touchedWorkspaceIds) {
      await this.reconcileWorkspaceConflictState(workspaceId)
    }

    writeTimestampStorage(LOCAL_SAVED_AT_KEY, Date.now())
    await this.refreshStatus()
  }

  async discardLocalConflict(conflictId: string): Promise<void> {
    await this.discardLocalConflicts([conflictId])
  }

  private async saveLocalCopyForStaleConflict(conflict: StorageConflictRecord): Promise<void> {
    if (!conflict.localRecord) {
      throw new SyncApiError(404, 'Conflict not found.', { message: 'Conflict not found.' })
    }

    const copyId = createLocalCopyId(conflict.localRecord.id)
    const updatedAt = Date.now()

    if (conflict.entityType === 'document') {
      const source = conflict.localRecord as SyncedDocumentRecord
      const payload: SyncedDocumentRecord['payload'] = {
        ...source.payload,
        id: copyId,
        updatedAt,
      }
      const copyRecord: SyncedDocumentRecord = {
        ...source,
        id: copyId,
        deviceId: this.requireDeviceId(),
        version: 0,
        baseVersion: null,
        contentHash: await computeContentHash(payload),
        updatedAt,
        deletedAt: null,
        syncStatus: 'local_saved_pending_sync',
        payload,
      }
      await cloudSyncIdb.saveDocument(copyRecord)
      await this.upsertPendingOp({
        opId: createOpId(),
        workspaceId: copyRecord.workspaceId,
        deviceId: copyRecord.deviceId,
        entityType: 'document',
        entityId: copyRecord.id,
        action: 'upsert',
        baseVersion: null,
        payload: copyRecord.payload,
        contentHash: copyRecord.contentHash,
        clientUpdatedAt: updatedAt,
        status: 'pending',
        attemptCount: 0,
        lastError: null,
        createdAt: updatedAt,
      })
    } else {
      const source = conflict.localRecord as SyncedConversationRecord
      const payload: SyncedConversationRecord['payload'] = {
        ...source.payload,
        id: copyId,
        sessionId: copyId,
        updatedAt,
      }
      const copyRecord: SyncedConversationRecord = {
        ...source,
        id: copyId,
        deviceId: this.requireDeviceId(),
        version: 0,
        baseVersion: null,
        contentHash: await computeContentHash(payload),
        updatedAt,
        deletedAt: null,
        syncStatus: 'local_saved_pending_sync',
        payload,
      }
      await cloudSyncIdb.saveConversation(copyRecord)
      await this.upsertPendingOp({
        opId: createOpId(),
        workspaceId: copyRecord.workspaceId,
        deviceId: copyRecord.deviceId,
        entityType: 'conversation',
        entityId: copyRecord.id,
        action: 'upsert',
        baseVersion: null,
        payload: copyRecord.payload,
        contentHash: copyRecord.contentHash,
        clientUpdatedAt: updatedAt,
        status: 'pending',
        attemptCount: 0,
        lastError: null,
        createdAt: updatedAt,
      })
    }

    await cloudSyncIdb.deleteConflictsByEntity(conflict.workspaceId, conflict.entityType, conflict.entityId)
    await cloudSyncIdb.deletePendingOpsByEntity(conflict.workspaceId, conflict.entityType, conflict.entityId)
    const state = (await cloudSyncIdb.getSyncState(conflict.workspaceId)) ?? createDefaultSyncState(conflict.workspaceId)
    const remainingConflicts = await cloudSyncIdb.listConflictsByWorkspace(conflict.workspaceId)
    await cloudSyncIdb.saveSyncState({
      ...state,
      hasConflicts: remainingConflicts.length > 0,
      lastError: null,
    })
    writeTimestampStorage(LOCAL_SAVED_AT_KEY, updatedAt)
    await this.refreshStatus()
  }

  private async discardLocalConflictRecords(conflict: StorageConflictRecord): Promise<void> {
    await cloudSyncIdb.deletePendingOpsByEntity(conflict.workspaceId, conflict.entityType, conflict.entityId)
    await cloudSyncIdb.deleteConflictsByEntity(conflict.workspaceId, conflict.entityType, conflict.entityId)

    if (conflict.entityType === 'conversation') {
      await cloudSyncIdb.deleteConversation(conflict.entityId)
      return
    }

    await cloudSyncIdb.deleteDocument(conflict.entityId)

    const [conversations, conflicts] = await Promise.all([
      cloudSyncIdb.listConversations(),
      cloudSyncIdb.listConflictsByWorkspace(conflict.workspaceId),
    ])

    const relatedConversations = conversations.filter(
      (record) =>
        record.workspaceId === conflict.workspaceId &&
        record.payload.documentId === conflict.entityId,
    )

    for (const record of relatedConversations) {
      await cloudSyncIdb.deletePendingOpsByEntity(conflict.workspaceId, 'conversation', record.id)
      await cloudSyncIdb.deleteConflictsByEntity(conflict.workspaceId, 'conversation', record.id)
      await cloudSyncIdb.deleteConversation(record.id)
    }

    for (const relatedConflict of conflicts) {
      const documentId = getConversationDocumentIdFromConflict(relatedConflict)
      if (documentId !== conflict.entityId) {
        continue
      }

      await cloudSyncIdb.deletePendingOpsByEntity(conflict.workspaceId, 'conversation', relatedConflict.entityId)
      await cloudSyncIdb.deleteConflict(relatedConflict.id)
    }
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
        if (response.requiresBootstrap) {
          const state = (await cloudSyncIdb.getSyncState(workspaceId)) ?? createDefaultSyncState(workspaceId)
          await cloudSyncIdb.saveSyncState({
            ...state,
            bootstrapCompletedAt: null,
            lastPulledCursor: 0,
            lastError: null,
          })
          await this.bootstrapCurrentCache(workspaceId)
          return
        }
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
          if (error.payload.cloudRecord === null && op.baseVersion !== null) {
            const staleConflict = this.buildConflictRecord(workspaceId, op, error)
            await this.discardLocalConflictRecords(staleConflict)
            await this.reconcileWorkspaceConflictState(workspaceId)
            await this.refreshStatus()
            break
          }

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
      const conflict: StorageConflictRecord = {
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
      return {
        ...conflict,
        ...analyzeConflictHeuristics(conflict).analysis,
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
    const conflict: StorageConflictRecord = {
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
    return {
      ...conflict,
      ...analyzeConflictHeuristics(conflict).analysis,
    }
  }

  private async backfillConflictAnalyses(): Promise<void> {
    const conflicts = await cloudSyncIdb.listConflicts()
    await Promise.all(
      conflicts
        .filter((conflict) => conflict.resolvedAt === null)
        .map((conflict) => this.analyzeConflictRecord(conflict, this.shouldRefreshConflictAnalysis(conflict))),
    )
  }

  private shouldRefreshConflictAnalysis(conflict: StorageConflictRecord): boolean {
    if (conflict.analysisStatus !== 'ready') {
      return true
    }

    return (
      conflict.analysisSource !== 'heuristic' ||
      (typeof conflict.analysisNote === 'string' && /AI|Codex|云端/u.test(conflict.analysisNote)) ||
      (typeof conflict.summary === 'string' && /AI|云端/u.test(conflict.summary)) ||
      conflict.reasons.some((reason) => /AI|Codex|云端/u.test(reason))
    )
  }

  private async analyzeConflictRecord(
    conflict: StorageConflictRecord,
    forceRefresh = false,
  ): Promise<void> {
    const normalized = normalizeStorageConflictRecord(conflict as never) as StorageConflictRecord
    if (!forceRefresh && normalized.analysisStatus === 'ready') {
      return
    }

    if (this.conflictsBeingAnalyzed.has(normalized.id)) {
      return
    }

    this.conflictsBeingAnalyzed.add(normalized.id)

    try {
      const heuristicDecision = analyzeConflictHeuristics(normalized as never)
      await this.saveConflictAnalysis(normalized.id, heuristicDecision.analysis)
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
    let response

    try {
      response = await this.api.pull(workspaceId, state.lastPulledCursor)
    } catch (error) {
      if (error instanceof SyncApiError && error.status === 404) {
        await cloudSyncIdb.saveSyncState({
          ...state,
          bootstrapCompletedAt: null,
          lastPulledCursor: 0,
          lastError: null,
        })
        if (await this.hasWorkspaceCache(workspaceId)) {
          await this.bootstrapCurrentCache(workspaceId)
        } else {
          await this.markBootstrapCompleted(workspaceId)
        }
        return
      }

      throw error
    }

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

  private async shouldBootstrapLocalCache(workspaceId: string): Promise<boolean> {
    const hasWorkspaceCache = await this.hasWorkspaceCache(workspaceId)
    if (!hasWorkspaceCache) {
      return false
    }

    const [documents, conversations] = await Promise.all([
      cloudSyncIdb.listDocuments(),
      cloudSyncIdb.listConversations(),
    ])
    return ![...documents, ...conversations].some(
      (record) => record.workspaceId === workspaceId && record.version > 0,
    )
  }

  private async hasWorkspaceCache(workspaceId: string): Promise<boolean> {
    const [documents, conversations] = await Promise.all([
      cloudSyncIdb.listDocuments(),
      cloudSyncIdb.listConversations(),
    ])
    return [...documents, ...conversations].some((record) => record.workspaceId === workspaceId)
  }

  private async markBootstrapCompleted(workspaceId: string): Promise<void> {
    const state = (await cloudSyncIdb.getSyncState(workspaceId)) ?? createDefaultSyncState(workspaceId)
    if (state.bootstrapCompletedAt) {
      return
    }

    await cloudSyncIdb.saveSyncState({
      ...state,
      bootstrapCompletedAt: state.lastPullAt ?? state.lastPushAt ?? Date.now(),
    })
  }

  private async applyWorkspaceSnapshot(
    workspaceId: string,
    documents: SyncedDocumentRecord[],
    conversations: SyncedConversationRecord[],
  ): Promise<void> {
    const pending = await cloudSyncIdb.listPendingOpsByWorkspace(workspaceId)
    await Promise.all(pending.map((op) => cloudSyncIdb.deletePendingOp(op.opId)))

    for (const document of documents) {
      await this.applyAuthoritativeRecord({
        ...document,
        workspaceId,
        syncStatus: 'synced',
      })
    }
    for (const conversation of conversations) {
      await this.applyAuthoritativeRecord({
        ...conversation,
        workspaceId,
        syncStatus: 'synced',
      })
    }
  }

  private async applyAuthoritativeRecord(record: SyncEnvelope<unknown>): Promise<void> {
    const normalized = await this.normalizeIncomingRecord(record)

    if (normalized.corrected) {
      await this.persistCorrectedRecord(normalized.record)
      return
    }

    await this.saveNormalizedRecord(normalized.record)
  }

  private async saveNormalizedRecord(
    record: SyncedDocumentRecord | SyncedConversationRecord,
  ): Promise<void> {
    if (this.isConversationEnvelope(record)) {
      await cloudSyncIdb.saveConversation(record)
      return
    }

    await cloudSyncIdb.saveDocument(record)
  }

  private async persistCorrectedRecord(
    record: SyncedDocumentRecord | SyncedConversationRecord,
  ): Promise<void> {
    await this.saveNormalizedRecord(record)

    if (this.isConversationEnvelope(record)) {
      await cloudSyncIdb.deleteConflictsByEntity(record.workspaceId, 'conversation', record.id)
      await cloudSyncIdb.deletePendingOpsByEntity(record.workspaceId, 'conversation', record.id)
      await this.upsertPendingOp({
        opId: createOpId(),
        workspaceId: record.workspaceId,
        deviceId: record.deviceId,
        entityType: 'conversation',
        entityId: record.id,
        action: 'upsert',
        baseVersion: record.baseVersion,
        payload: record.payload,
        contentHash: record.contentHash,
        clientUpdatedAt: record.updatedAt,
        status: 'pending',
        attemptCount: 0,
        lastError: null,
        createdAt: record.updatedAt,
      })

      const state = (await cloudSyncIdb.getSyncState(record.workspaceId)) ?? createDefaultSyncState(record.workspaceId)
      const remainingConflicts = await cloudSyncIdb.listConflictsByWorkspace(record.workspaceId)
      await cloudSyncIdb.saveSyncState({
        ...state,
        hasConflicts: remainingConflicts.length > 0,
        lastError: remainingConflicts.length > 0 ? state.lastError : null,
      })
      writeTimestampStorage(LOCAL_SAVED_AT_KEY, record.updatedAt)
      return
    }

    await cloudSyncIdb.deleteConflictsByEntity(record.workspaceId, 'document', record.id)
    await cloudSyncIdb.deletePendingOpsByEntity(record.workspaceId, 'document', record.id)
    await this.upsertPendingOp({
      opId: createOpId(),
      workspaceId: record.workspaceId,
      deviceId: record.deviceId,
      entityType: 'document',
      entityId: record.id,
      action: 'upsert',
      baseVersion: record.baseVersion,
      payload: record.payload,
      contentHash: record.contentHash,
      clientUpdatedAt: record.updatedAt,
      status: 'pending',
      attemptCount: 0,
      lastError: null,
      createdAt: record.updatedAt,
    })

    const state = (await cloudSyncIdb.getSyncState(record.workspaceId)) ?? createDefaultSyncState(record.workspaceId)
    const remainingConflicts = await cloudSyncIdb.listConflictsByWorkspace(record.workspaceId)
    await cloudSyncIdb.saveSyncState({
      ...state,
      hasConflicts: remainingConflicts.length > 0,
      lastError: remainingConflicts.length > 0 ? state.lastError : null,
    })
    writeTimestampStorage(LOCAL_SAVED_AT_KEY, record.updatedAt)
  }

  private isConversationEnvelope(record: SyncEnvelope<unknown>): record is SyncedConversationRecord {
    return isRecordObject(record.payload) && 'documentId' in record.payload
  }

  private async normalizeIncomingRecord(
    record: SyncEnvelope<unknown>,
  ): Promise<
    | { corrected: false; record: SyncedDocumentRecord }
    | { corrected: false; record: SyncedConversationRecord }
    | { corrected: true; record: SyncedDocumentRecord }
    | { corrected: true; record: SyncedConversationRecord }
  > {
    if (this.isConversationEnvelope(record)) {
      const prepared = await this.normalizeConversationRecord(record)
      return prepared
    }

    const prepared = await this.normalizeDocumentRecord(record as SyncedDocumentRecord)
    return prepared
  }

  private async normalizeDocumentRecord(
    record: SyncedDocumentRecord,
  ): Promise<
    | { corrected: false; record: SyncedDocumentRecord }
    | { corrected: true; record: SyncedDocumentRecord }
  > {
    if (record.deletedAt !== null || !isRecordObject(record.payload)) {
      return { corrected: false, record }
    }

    const hasIdentityMismatch = record.payload.id !== record.id
    const needsCorrection =
      hasIdentityMismatch || (record.id.includes('_copy_') && record.syncStatus === 'conflict')

    if (!needsCorrection) {
      return { corrected: false, record }
    }

    const updatedAt = Date.now()
    const payload: SyncedDocumentRecord['payload'] = {
      ...record.payload,
      id: record.id,
      updatedAt,
    }

    return {
      corrected: true,
      record: {
        ...record,
        deviceId: this.requireDeviceId(),
        baseVersion: record.version,
        contentHash: await computeContentHash(payload),
        updatedAt,
        deletedAt: null,
        syncStatus: 'local_saved_pending_sync',
        payload,
      },
    }
  }

  private async normalizeConversationRecord(
    record: SyncedConversationRecord,
  ): Promise<
    | { corrected: false; record: SyncedConversationRecord }
    | { corrected: true; record: SyncedConversationRecord }
  > {
    if (record.deletedAt !== null || !isRecordObject(record.payload)) {
      return { corrected: false, record }
    }

    const hasIdentityMismatch =
      record.payload.id !== record.id || record.payload.sessionId !== record.id
    const needsCorrection =
      hasIdentityMismatch || (record.id.includes('_copy_') && record.syncStatus === 'conflict')

    if (!needsCorrection) {
      return { corrected: false, record }
    }

    const updatedAt = Date.now()
    const payload: SyncedConversationRecord['payload'] = {
      ...record.payload,
      id: record.id,
      sessionId: record.id,
      updatedAt,
    }

    return {
      corrected: true,
      record: {
        ...record,
        deviceId: this.requireDeviceId(),
        baseVersion: record.version,
        contentHash: await computeContentHash(payload),
        updatedAt,
        deletedAt: null,
        syncStatus: 'local_saved_pending_sync',
        payload,
      },
    }
  }

  private async repairMalformedCachedRecords(workspaceId: string): Promise<void> {
    const [documents, conversations] = await Promise.all([
      cloudSyncIdb.listDocuments(),
      cloudSyncIdb.listConversations(),
    ])

    const records: Array<SyncedDocumentRecord | SyncedConversationRecord> = [
      ...documents.filter((record) => record.workspaceId === workspaceId),
      ...conversations.filter((record) => record.workspaceId === workspaceId),
    ]

    for (const record of records) {
      const normalized = await this.normalizeIncomingRecord(record)
      if (!normalized.corrected) {
        continue
      }

      await this.persistCorrectedRecord(normalized.record)
    }
  }

  private shouldCollapseGeneratedCopyGroup(
    documents: SyncedDocumentRecord[],
    conflicts: StorageConflictRecord[],
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
    keepRecord: SyncedDocumentRecord,
    allDocuments: SyncedDocumentRecord[],
    removedIds: Set<string>,
  ): string {
    const baseTitle = stripGeneratedDuplicateTitle(keepRecord.payload.title)
    const existingTitles = allDocuments
      .filter(
        (record) =>
          record.deletedAt === null &&
          record.id !== keepRecord.id &&
          !removedIds.has(record.id),
      )
      .map((record) => record.payload.title)

    return generateUniqueTitle(baseTitle, existingTitles)
  }

  private async promoteCanonicalDocumentCopy(
    source: SyncedDocumentRecord,
    title: string,
  ): Promise<void> {
    const updatedAt = Date.now()
    const payload: SyncedDocumentRecord['payload'] = {
      ...source.payload,
      id: source.id,
      title,
      updatedAt,
    }

    await this.persistCorrectedRecord({
      ...source,
      deviceId: this.requireDeviceId(),
      baseVersion: source.version,
      contentHash: await computeContentHash(payload),
      updatedAt,
      deletedAt: null,
      syncStatus: 'local_saved_pending_sync',
      payload,
    })
  }

  private async deleteDocumentForCleanup(record: SyncedDocumentRecord): Promise<void> {
    await cloudSyncIdb.deleteConflictsByEntity(record.workspaceId, 'document', record.id)
    await cloudSyncIdb.deletePendingOpsByEntity(record.workspaceId, 'document', record.id)

    if (record.version <= 0) {
      await cloudSyncIdb.deleteDocument(record.id)
      return
    }

    const updatedAt = Date.now()
    await cloudSyncIdb.saveDocument({
      ...record,
      deviceId: this.requireDeviceId(),
      updatedAt,
      deletedAt: updatedAt,
      syncStatus: 'local_saved_pending_sync',
    })
    await this.upsertPendingOp({
      opId: createOpId(),
      workspaceId: record.workspaceId,
      deviceId: this.requireDeviceId(),
      entityType: 'document',
      entityId: record.id,
      action: 'delete',
      baseVersion: record.version,
      payload: null,
      contentHash: record.contentHash,
      clientUpdatedAt: updatedAt,
      status: 'pending',
      attemptCount: 0,
      lastError: null,
      createdAt: updatedAt,
    })
    writeTimestampStorage(LOCAL_SAVED_AT_KEY, updatedAt)
  }

  private async deleteConversationForCleanup(record: SyncedConversationRecord): Promise<void> {
    await cloudSyncIdb.deleteConflictsByEntity(record.workspaceId, 'conversation', record.id)
    await cloudSyncIdb.deletePendingOpsByEntity(record.workspaceId, 'conversation', record.id)

    if (record.version <= 0) {
      await cloudSyncIdb.deleteConversation(record.id)
      return
    }

    const updatedAt = Date.now()
    await cloudSyncIdb.saveConversation({
      ...record,
      deviceId: this.requireDeviceId(),
      updatedAt,
      deletedAt: updatedAt,
      syncStatus: 'local_saved_pending_sync',
    })
    await this.upsertPendingOp({
      opId: createOpId(),
      workspaceId: record.workspaceId,
      deviceId: this.requireDeviceId(),
      entityType: 'conversation',
      entityId: record.id,
      action: 'delete',
      baseVersion: record.version,
      payload: null,
      contentHash: record.contentHash,
      clientUpdatedAt: updatedAt,
      status: 'pending',
      attemptCount: 0,
      lastError: null,
      createdAt: updatedAt,
    })
    writeTimestampStorage(LOCAL_SAVED_AT_KEY, updatedAt)
  }

  private async cleanupGeneratedCopyConversations(
    workspaceId: string,
    removedDocumentIds: Set<string>,
  ): Promise<void> {
    if (removedDocumentIds.size === 0) {
      return
    }

    const [conversations, conflicts] = await Promise.all([
      cloudSyncIdb.listConversations(),
      cloudSyncIdb.listConflictsByWorkspace(workspaceId),
    ])

    const removableConversations = conversations.filter(
      (record) =>
        record.workspaceId === workspaceId &&
        record.deletedAt === null &&
        removedDocumentIds.has(record.payload.documentId),
    )

    for (const record of removableConversations) {
      await this.deleteConversationForCleanup(record)
    }

    for (const conflict of conflicts) {
      if (conflict.entityType !== 'conversation') {
        continue
      }

      const documentId = getConversationDocumentIdFromConflict(conflict)
      if (documentId && removedDocumentIds.has(documentId)) {
        await cloudSyncIdb.deleteConflict(conflict.id)
      }
    }
  }

  private async reconcileWorkspaceConflictState(workspaceId: string): Promise<void> {
    const state = (await cloudSyncIdb.getSyncState(workspaceId)) ?? createDefaultSyncState(workspaceId)
    const remainingConflicts = await cloudSyncIdb.listConflictsByWorkspace(workspaceId)
    await cloudSyncIdb.saveSyncState({
      ...state,
      hasConflicts: remainingConflicts.length > 0,
      lastError: remainingConflicts.length > 0 ? state.lastError : null,
    })
  }

  private async cleanupGeneratedCopyChains(workspaceId: string): Promise<void> {
    const [documents, conflicts] = await Promise.all([
      cloudSyncIdb.listDocuments(),
      cloudSyncIdb.listConflictsByWorkspace(workspaceId),
    ])

    const workspaceDocuments = documents.filter((record) => record.workspaceId === workspaceId)
    const documentGroups = new Map<string, { documents: SyncedDocumentRecord[]; conflicts: StorageConflictRecord[] }>()

    for (const record of workspaceDocuments) {
      const rootId = getCopyRootId(record.id)
      const current = documentGroups.get(rootId) ?? { documents: [], conflicts: [] }
      current.documents.push(record)
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

    const removedDocumentIds = new Set<string>()
    let mutated = false

    for (const group of documentGroups.values()) {
      if (!this.shouldCollapseGeneratedCopyGroup(group.documents, group.conflicts)) {
        continue
      }

      const activeDocuments = group.documents
        .filter((record) => record.deletedAt === null)
        .sort((left, right) => right.updatedAt - left.updatedAt)

      const keepRecord = activeDocuments[0] ?? null
      const removedIds = new Set(
        activeDocuments
          .filter((record) => record.id !== keepRecord?.id)
          .map((record) => record.id),
      )

      for (const record of activeDocuments) {
        if (!removedIds.has(record.id)) {
          continue
        }

        await this.deleteDocumentForCleanup(record)
        removedDocumentIds.add(record.id)
        mutated = true
      }

      if (keepRecord) {
        const nextTitle = this.buildCanonicalCopyTitle(keepRecord, workspaceDocuments, removedIds)
        await this.promoteCanonicalDocumentCopy(keepRecord, nextTitle)
        await cloudSyncIdb.deleteConflictsByEntity(workspaceId, 'document', keepRecord.id)
        mutated = true
      }

      for (const conflict of group.conflicts) {
        if (keepRecord && conflict.entityId === keepRecord.id) {
          continue
        }

        await cloudSyncIdb.deleteConflict(conflict.id)
        mutated = true
      }
    }

    if (!mutated) {
      return
    }

    await this.cleanupGeneratedCopyConversations(workspaceId, removedDocumentIds)
    await this.reconcileWorkspaceConflictState(workspaceId)
  }

  private async shouldSkipLegacyAutoSeed(workspaceId: string): Promise<boolean> {
    const serverWorkspace = await this.recoverWorkspaceFromServer()
    if (!serverWorkspace) {
      return false
    }

    try {
      const snapshot = await this.api.getWorkspaceFull(serverWorkspace.id === workspaceId ? workspaceId : serverWorkspace.id)
      return snapshot.documents.length > 0 || snapshot.conversations.length > 0 || snapshot.cursor > 0
    } catch (error) {
      if (error instanceof SyncApiError && error.status === 404) {
        return false
      }
      return false
    }
  }

  private async seedCacheFromLegacyIfNeeded(workspaceId: string): Promise<void> {
    const [documents, conversations] = await Promise.all([
      cloudSyncIdb.listDocuments(),
      cloudSyncIdb.listConversations(),
    ])
    if (documents.length > 0 || conversations.length > 0) {
      return
    }
    if (readBooleanStorage(LEGACY_MIGRATION_COMPLETED_KEY)) {
      return
    }

    const legacy = await readLegacyWorkspaceSnapshot()
    if (legacy.documents.length === 0 && legacy.conversations.length === 0) {
      writeBooleanStorage(LEGACY_MIGRATION_COMPLETED_KEY, true)
      return
    }

    if (await this.shouldSkipLegacyAutoSeed(workspaceId)) {
      writeBooleanStorage(LEGACY_MIGRATION_COMPLETED_KEY, true)
      return
    }

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
    writeBooleanStorage(LEGACY_MIGRATION_COMPLETED_KEY, true)
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
      await this.ensureSyncStateExists(existing)
      return existing
    }

    const storedSummary = readJsonStorage<{ id?: string }>(WORKSPACE_SUMMARY_KEY)
    if (storedSummary?.id) {
      await this.persistWorkspaceSelection(storedSummary.id)
      return storedSummary.id
    }

    const cachedWorkspaceId = await this.recoverWorkspaceIdFromLocalCache()
    if (cachedWorkspaceId) {
      await this.persistWorkspaceSelection(cachedWorkspaceId)
      return cachedWorkspaceId
    }

    const existingServerWorkspace = await this.recoverWorkspaceFromServer()
    if (existingServerWorkspace) {
      await this.persistWorkspaceSelection(existingServerWorkspace.id, existingServerWorkspace)
      return existingServerWorkspace.id
    }

    const workspaceId = `workspace_local_${Math.random().toString(36).slice(2, 10)}`
    await this.persistWorkspaceSelection(workspaceId)
    return workspaceId
  }

  private async ensureSyncStateExists(workspaceId: string): Promise<void> {
    if (await cloudSyncIdb.getSyncState(workspaceId)) {
      return
    }

    await cloudSyncIdb.saveSyncState(createDefaultSyncState(workspaceId))
  }

  private async persistWorkspaceSelection(
    workspaceId: string,
    summary?: { id: string; userId: string; name: string; createdAt: number; updatedAt: number },
  ): Promise<void> {
    writeJsonStorage(WORKSPACE_ID_KEY, workspaceId)
    if (summary) {
      writeJsonStorage(WORKSPACE_SUMMARY_KEY, summary)
    }
    await this.ensureSyncStateExists(workspaceId)
  }

  private async recoverWorkspaceIdFromLocalCache(): Promise<string | null> {
    const [documents, conversations, pendingOps, conflicts, syncStates] = await Promise.all([
      cloudSyncIdb.listDocuments(),
      cloudSyncIdb.listConversations(),
      cloudSyncIdb.listPendingOps(),
      cloudSyncIdb.listConflicts(),
      cloudSyncIdb.listSyncStates(),
    ])

    const candidates = new Map<string, WorkspaceRecoveryCandidate>()
    const updateCandidate = (workspaceId: string | null | undefined, timestamp: number | null | undefined) => {
      if (!workspaceId) {
        return
      }

      const safeTimestamp = typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : 0
      const current = candidates.get(workspaceId) ?? {
        id: workspaceId,
        latestActivityAt: 0,
        signals: 0,
      }
      current.latestActivityAt = Math.max(current.latestActivityAt, safeTimestamp)
      current.signals += 1
      candidates.set(workspaceId, current)
    }

    for (const document of documents) {
      updateCandidate(document.workspaceId, document.updatedAt)
    }
    for (const conversation of conversations) {
      updateCandidate(conversation.workspaceId, conversation.updatedAt)
    }
    for (const pendingOp of pendingOps) {
      updateCandidate(pendingOp.workspaceId, pendingOp.clientUpdatedAt ?? pendingOp.createdAt)
    }
    for (const conflict of conflicts) {
      updateCandidate(conflict.workspaceId, conflict.detectedAt)
    }
    for (const state of syncStates) {
      updateCandidate(
        state.workspaceId,
        Math.max(state.lastPullAt ?? 0, state.lastPushAt ?? 0, state.bootstrapCompletedAt ?? 0),
      )
    }

    const preferredSummary = readJsonStorage<{ id?: string }>(WORKSPACE_SUMMARY_KEY)
    if (preferredSummary?.id && candidates.has(preferredSummary.id)) {
      return preferredSummary.id
    }

    return Array.from(candidates.values())
      .sort(
        (left, right) =>
          right.latestActivityAt - left.latestActivityAt ||
          right.signals - left.signals ||
          left.id.localeCompare(right.id),
      )[0]?.id ?? null
  }

  private async recoverWorkspaceFromServer(): Promise<{
    id: string
    userId: string
    name: string
    createdAt: number
    updatedAt: number
  } | null> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return null
    }

    try {
      const status = await storageAdminApiClient.getStatus()
      const preferred =
        (status.workspace.id
          ? status.workspaces.find((workspace) => workspace.id === status.workspace.id) ?? null
          : null) ??
        status.workspaces[0] ??
        null

      if (!preferred) {
        return null
      }

      return {
        id: preferred.id,
        userId: preferred.userId,
        name: preferred.name,
        createdAt: preferred.createdAt,
        updatedAt: preferred.updatedAt,
      }
    } catch {
      return null
    }
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
    const session = readAuthSessionCache()
    if (session?.authenticated && session.userId) {
      return session.userId
    }
    return 'user_stub_default'
  }

  resetForTesting(): void {
    if (!IS_TEST_ENV) {
      throw new Error('resetForTesting is only available in test environments.')
    }

    if (this.syncTimer !== null && typeof window !== 'undefined') {
      window.clearInterval(this.syncTimer)
    }

    this.listeners.clear()
    this.conflictsBeingAnalyzed.clear()
    this.deviceId = null
    this.status = {
      workspace: null,
      state: null,
      localSavedAt: null,
      cloudSyncedAt: null,
      isOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
      isSyncing: false,
      conflicts: [],
    }
    this.initialized = false
    this.initPromise = null
    this.syncTimer = null
    this.syncInFlight = false
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

