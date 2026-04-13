import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SyncEnvelope } from '../../../../shared/sync-contract'
import type { AiConversation } from '../../../../shared/ai-contract'
import { writeAuthSessionCache } from '../../auth/auth-session-cache'
import { createMindMapDocument } from '../../documents/document-factory'
import type { MindMapDocumentContent } from '../../documents/types'
import { documentService as legacyDocumentService } from '../adapters/indexeddb/legacy-document-local-service'
import type { StorageConflictRecord } from '../domain/sync-records'
import { createPendingConflictAnalysis } from '../domain/sync-records'
import { cloudSyncIdb } from '../local/cloud-sync-idb'
import { CloudSyncOrchestrator } from './cloud-sync-orchestrator'

function readStoredString(key: string): string {
  const raw = localStorage.getItem(key)
  if (!raw) {
    throw new Error(`Missing localStorage key: ${key}`)
  }
  return JSON.parse(raw) as string
}

function readStoredTimestamp(key: string): number {
  const raw = localStorage.getItem(key)
  if (!raw) {
    throw new Error(`Missing localStorage key: ${key}`)
  }
  return Number(raw)
}

function createDocumentEnvelope(
  workspaceId: string,
  deviceId: string,
  documentId: string,
  title: string,
  version: number,
): SyncEnvelope<MindMapDocumentContent> {
  const document = createMindMapDocument(title)
  const { viewport: _viewport, workspace: _workspace, ...content } = document

  return {
    id: documentId,
    userId: 'user_stub_default',
    workspaceId,
    deviceId,
    version,
    baseVersion: version - 1,
    contentHash: `hash_${documentId}_${version}`,
    updatedAt: 100 + version,
    deletedAt: null,
    syncStatus: 'synced',
    payload: {
      ...content,
      id: documentId,
      title,
      updatedAt: 100 + version,
    },
  }
}

function createConversationEnvelope(
  workspaceId: string,
  deviceId: string,
  sessionId: string,
  documentId: string,
  title: string,
  version: number,
): SyncEnvelope<AiConversation> {
  return {
    id: sessionId,
    userId: 'user_stub_default',
    workspaceId,
    deviceId,
    version,
    baseVersion: version - 1,
    contentHash: `hash_${sessionId}_${version}`,
    updatedAt: 200 + version,
    deletedAt: null,
    syncStatus: 'synced',
    payload: {
      id: sessionId,
      sessionId,
      documentId,
      documentTitle: title,
      title,
      messages: [],
      updatedAt: 200 + version,
      archivedAt: null,
    },
  }
}

function createConflictRecord(
  workspaceId: string,
  deviceId: string,
  documentId: string,
  title: string,
  id: string,
): StorageConflictRecord {
  const localRecord = createDocumentEnvelope(workspaceId, deviceId, documentId, `${title} local`, 2)
  const cloudRecord = createDocumentEnvelope(workspaceId, 'device_cloud', documentId, `${title} cloud`, 3)

  return {
    ...createPendingConflictAnalysis<MindMapDocumentContent>(),
    id,
    workspaceId,
    entityType: 'document',
    entityId: documentId,
    deviceId,
    localRecord,
    cloudRecord,
    localPayload: localRecord.payload,
    cloudPayload: cloudRecord.payload,
    diffHints: {
      updatedAtDeltaMs: cloudRecord.updatedAt - localRecord.updatedAt,
      sameContentHash: false,
    },
    detectedAt: 500,
    resolvedAt: null,
  } as StorageConflictRecord
}

describe('CloudSyncOrchestrator', () => {
  beforeEach(() => {
    localStorage.clear()
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: false,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses the authenticated session user id when writing cache records', async () => {
    writeAuthSessionCache({
      authMode: 'external',
      authenticated: true,
      userId: 'user_local_admin',
      username: 'admin',
      canonicalOrigin: 'http://127.0.0.1:4173',
    })
    const orchestrator = new CloudSyncOrchestrator()
    const document = createMindMapDocument('Auth Owned Draft')

    await orchestrator.saveDocument(document)

    const record = await cloudSyncIdb.getDocument(document.id)
    expect(record?.userId).toBe('user_local_admin')
  })

  it('lists documents from the current workspace only', async () => {
    const orchestrator = new CloudSyncOrchestrator()
    const current = createMindMapDocument('Current Workspace')
    await orchestrator.saveDocument(current)

    await cloudSyncIdb.saveDocument({
      id: 'doc_other_workspace',
      userId: 'user_stub_default',
      workspaceId: 'workspace_other',
      deviceId: 'device_other',
      version: 1,
      baseVersion: null,
      contentHash: 'hash_other_workspace',
      updatedAt: current.updatedAt + 100,
      deletedAt: null,
      syncStatus: 'synced',
      payload: createMindMapDocument('Other Workspace'),
    })

    const documents = await orchestrator.listDocuments()

    expect(documents.map((document) => document.id)).toEqual([current.id])
    await expect(orchestrator.getDocument('doc_other_workspace')).resolves.toBeNull()
  })

  it('switches browser cache to a selected workspace snapshot', async () => {
    const orchestrator = new CloudSyncOrchestrator()
    const current = createMindMapDocument('Current Workspace')
    await orchestrator.saveDocument(current)

    const targetDocument = createMindMapDocument('Archive Workspace')
    targetDocument.updatedAt = 2_000

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const requestUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      const url = new URL(requestUrl, 'http://127.0.0.1')

      if (url.pathname === '/api/workspace/full') {
        return new Response(
          JSON.stringify({
            workspace: {
              id: 'workspace_archive',
              userId: 'user_stub_default',
              name: 'Archive Workspace',
              createdAt: 1,
              updatedAt: 2,
            },
            documents: [
              {
                id: targetDocument.id,
                userId: 'user_stub_default',
                workspaceId: 'workspace_archive',
                deviceId: 'device_archive',
                version: 3,
                baseVersion: 2,
                contentHash: 'hash_archive',
                updatedAt: targetDocument.updatedAt,
                deletedAt: null,
                syncStatus: 'synced',
                payload: targetDocument,
              },
            ],
            conversations: [],
            cursor: 18,
            exportedAt: 3,
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        )
      }

      throw new Error(`Unexpected request: ${url.pathname}`)
    })

    await orchestrator.switchWorkspace('workspace_archive')

    const documents = await orchestrator.listDocuments()
    expect(documents.map((document) => document.id)).toEqual([targetDocument.id])
    expect(readStoredString('brainflow-cloud-workspace-id')).toBe('workspace_archive')
    expect((await cloudSyncIdb.getSyncState('workspace_archive'))?.lastPulledCursor).toBe(18)
    expect(await cloudSyncIdb.getDocument(current.id)).toBeFalsy()
  })

  it('restores the workspace id from cached records when browser storage is missing', async () => {
    const bootstrapOrchestrator = new CloudSyncOrchestrator()
    const document = createMindMapDocument('Recovered Workspace')
    await bootstrapOrchestrator.saveDocument(document)

    const originalWorkspaceId = readStoredString('brainflow-cloud-workspace-id')
    localStorage.removeItem('brainflow-cloud-workspace-id')
    localStorage.removeItem('brainflow-cloud-workspace-summary')

    const restartedOrchestrator = new CloudSyncOrchestrator()
    await restartedOrchestrator.initialize()

    expect(readStoredString('brainflow-cloud-workspace-id')).toBe(originalWorkspaceId)
  })

  it('adopts the existing server workspace before creating a new local workspace id', async () => {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: true,
    })

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const requestUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      const url = new URL(requestUrl, 'http://127.0.0.1')

      if (url.pathname === '/api/storage/status') {
        return new Response(
          JSON.stringify({
            mode: 'local_postgres',
            checkedAt: 1,
            api: {
              reachable: true,
              checkedAt: 1,
            },
            database: {
              driver: 'postgres',
              configured: true,
              reachable: true,
              label: 'Local Postgres / brainflow',
              lastError: null,
              backupFormat: 'custom',
              lastBackupAt: null,
            },
            backup: {
              available: false,
              directory: null,
              lastError: null,
            },
            auth: {
              mode: 'stub',
              authenticated: true,
              username: 'admin',
            },
            workspace: {
              id: 'workspace_edward_main',
              name: 'Edward_Main',
            },
            workspaces: [
              {
                id: 'workspace_edward_main',
                userId: 'user_stub_default',
                name: 'Edward_Main',
                createdAt: 11,
                updatedAt: 22,
                documentCount: 2,
                conversationCount: 2,
              },
            ],
            runtime: {
              canonicalOrigin: 'http://127.0.0.1:4173',
            },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        )
      }

      if (url.pathname === '/api/sync/pull') {
        return new Response(
          JSON.stringify({
            changes: [],
            nextCursor: 0,
            hasMore: false,
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        )
      }

      throw new Error(`Unexpected request: ${url.pathname}`)
    })

    const orchestrator = new CloudSyncOrchestrator()
    await orchestrator.initialize()

    expect(readStoredString('brainflow-cloud-workspace-id')).toBe('workspace_edward_main')
    expect(fetchSpy.mock.calls.map(([input]) =>
      new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url,
        'http://127.0.0.1',
      ).pathname,
    )).toEqual(['/api/storage/status', '/api/sync/pull'])
  })

  it('prefers authoritative server data over auto-importing legacy browser data on startup', async () => {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: true,
    })

    const legacyDocument = createMindMapDocument('Legacy Browser Draft')
    legacyDocument.updatedAt = 50
    await legacyDocumentService.saveDocument(legacyDocument)

    const serverDocument = createMindMapDocument('Server Truth')
    serverDocument.updatedAt = 300

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const requestUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      const url = new URL(requestUrl, 'http://127.0.0.1')

      if (url.pathname === '/api/storage/status') {
        return new Response(
          JSON.stringify({
            mode: 'local_postgres',
            checkedAt: 1,
            api: {
              reachable: true,
              checkedAt: 1,
            },
            database: {
              driver: 'postgres',
              configured: true,
              reachable: true,
              label: 'Local Postgres / brainflow',
              lastError: null,
              backupFormat: 'custom',
              lastBackupAt: null,
            },
            backup: {
              available: false,
              directory: null,
              lastError: null,
            },
            auth: {
              mode: 'stub',
              authenticated: true,
              username: 'admin',
            },
            workspace: {
              id: 'workspace_server_main',
              name: 'Server Main',
            },
            workspaces: [
              {
                id: 'workspace_server_main',
                userId: 'user_stub_default',
                name: 'Server Main',
                createdAt: 11,
                updatedAt: 22,
                documentCount: 1,
                conversationCount: 0,
              },
            ],
            runtime: {
              canonicalOrigin: 'http://127.0.0.1:4173',
            },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        )
      }

      if (url.pathname === '/api/workspace/full') {
        return new Response(
          JSON.stringify({
            workspace: {
              id: 'workspace_server_main',
              userId: 'user_stub_default',
              name: 'Server Main',
              createdAt: 11,
              updatedAt: 22,
            },
            documents: [
              {
                id: serverDocument.id,
                userId: 'user_stub_default',
                workspaceId: 'workspace_server_main',
                deviceId: 'device_cloud',
                version: 1,
                baseVersion: null,
                contentHash: `hash_${serverDocument.id}_1`,
                updatedAt: serverDocument.updatedAt,
                deletedAt: null,
                syncStatus: 'synced',
                payload: serverDocument,
              },
            ],
            conversations: [],
            cursor: 7,
            exportedAt: 30,
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        )
      }

      if (url.pathname === '/api/sync/pull') {
        return new Response(
          JSON.stringify({
            changes: [
              {
                cursor: 7,
                entityType: 'document',
                action: 'upsert',
                authoritativeRecord: {
                  id: serverDocument.id,
                  userId: 'user_stub_default',
                  workspaceId: 'workspace_server_main',
                  deviceId: 'device_cloud',
                  version: 1,
                  baseVersion: null,
                  contentHash: `hash_${serverDocument.id}_1`,
                  updatedAt: serverDocument.updatedAt,
                  deletedAt: null,
                  syncStatus: 'synced',
                  payload: serverDocument,
                },
              },
            ],
            nextCursor: 7,
            hasMore: false,
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        )
      }

      throw new Error(`Unexpected request: ${url.pathname}`)
    })

    const orchestrator = new CloudSyncOrchestrator()
    await orchestrator.initialize()

    const documents = await orchestrator.listDocuments()
    const requestPaths = fetchSpy.mock.calls.map(([input]) =>
      new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url,
        'http://127.0.0.1',
      ).pathname,
    )

    expect(documents.map((document) => document.id)).toEqual([serverDocument.id])
    expect(documents.map((document) => document.id)).not.toContain(legacyDocument.id)
    expect(localStorage.getItem('brainflow-legacy-migration-completed-v1')).toBe('true')
    expect(requestPaths).toContain('/api/workspace/full')
    expect(requestPaths).not.toContain('/api/sync/bootstrap')
  })

  it('coalesces repeated document saves into a single pending op', async () => {
    const orchestrator = new CloudSyncOrchestrator()
    const document = createMindMapDocument('Draft')

    for (let index = 0; index < 5; index += 1) {
      await orchestrator.saveDocument({
        ...document,
        title: `Draft ${index}`,
      })
    }

    const workspaceId = readStoredString('brainflow-cloud-workspace-id')
    const ops = await cloudSyncIdb.listPendingOpsByEntity(workspaceId, 'document', document.id)

    expect(ops).toHaveLength(1)
    expect(ops[0]?.status).toBe('pending')
    expect((ops[0]?.payload as { title?: string } | null)?.title).toBe('Draft 4')
  })

  it('skips save status refreshes when only workspace state changed and content is identical', async () => {
    const orchestrator = new CloudSyncOrchestrator()
    const document = createMindMapDocument('Workspace Only')

    await orchestrator.saveDocument(document)

    const firstSavedAt = readStoredTimestamp('brainflow-cloud-local-saved-at')
    const deviceId = readStoredString('brainflow-device-id')
    const workspaceOnlyUpdate = {
      ...document,
      viewport: { x: 120, y: -40, zoom: 1.2 },
      workspace: {
        ...document.workspace,
        selectedTopicId: null,
      },
    }

    await orchestrator.saveDocument(workspaceOnlyUpdate)

    const secondSavedAt = readStoredTimestamp('brainflow-cloud-local-saved-at')
    expect(secondSavedAt).toBe(firstSavedAt)
    expect((await cloudSyncIdb.getDeviceInfo(deviceId))?.documents[document.id]?.viewport).toEqual(
      workspaceOnlyUpdate.viewport,
    )
  })

  it('clears stale pending ops and duplicate conflicts after use_cloud resolution', async () => {
    const orchestrator = new CloudSyncOrchestrator()
    const document = createMindMapDocument('Conflict Doc')
    await orchestrator.saveDocument(document)

    const workspaceId = readStoredString('brainflow-cloud-workspace-id')
    const deviceId = readStoredString('brainflow-device-id')
    const [seedOp] = await cloudSyncIdb.listPendingOpsByEntity(workspaceId, 'document', document.id)
    expect(seedOp).toBeTruthy()

    await cloudSyncIdb.savePendingOp({
      ...seedOp!,
      status: 'conflict',
      lastError: 'Version conflict',
    })
    await cloudSyncIdb.savePendingOp({
      ...seedOp!,
      opId: 'op_duplicate_pending',
      status: 'pending',
      clientUpdatedAt: seedOp!.clientUpdatedAt + 1,
    })

    const primaryConflict = createConflictRecord(workspaceId, deviceId, document.id, document.title, 'conflict_primary')
    const duplicateConflict = {
      ...createConflictRecord(workspaceId, deviceId, document.id, document.title, 'conflict_duplicate'),
      detectedAt: 600,
    }
    await cloudSyncIdb.saveConflict(primaryConflict)
    await cloudSyncIdb.saveConflict(duplicateConflict)

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          resolvedRecord: primaryConflict.cloudRecord,
          cursor: 9,
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    )

    await orchestrator.resolveConflict(primaryConflict.id, 'use_cloud')

    expect(await cloudSyncIdb.listPendingOpsByEntity(workspaceId, 'document', document.id)).toHaveLength(0)
    expect(await cloudSyncIdb.listConflictsByEntity(workspaceId, 'document', document.id)).toHaveLength(0)
    expect((await cloudSyncIdb.getSyncState(workspaceId))?.hasConflicts).toBe(false)
  })

  it('normalizes malformed server-created copies and clears stale queues after save_local_copy resolution', async () => {
    const orchestrator = new CloudSyncOrchestrator()
    const document = createMindMapDocument('Copy Me')
    await orchestrator.saveDocument(document)

    const workspaceId = readStoredString('brainflow-cloud-workspace-id')
    const deviceId = readStoredString('brainflow-device-id')
    const [seedOp] = await cloudSyncIdb.listPendingOpsByEntity(workspaceId, 'document', document.id)
    expect(seedOp).toBeTruthy()

    await cloudSyncIdb.savePendingOp({
      ...seedOp!,
      status: 'conflict',
      lastError: 'Version conflict',
    })

    const conflict = createConflictRecord(workspaceId, deviceId, document.id, document.title, 'conflict_copy')
    const extraCreatedRecord = {
      ...createDocumentEnvelope(workspaceId, deviceId, `${document.id}_copy_new`, `${document.title} copy`, 1),
      syncStatus: 'conflict' as const,
      payload: {
        ...createDocumentEnvelope(workspaceId, deviceId, `${document.id}_copy_new`, `${document.title} copy`, 1).payload,
        id: document.id,
        title: `${document.title} copy`,
        updatedAt: conflict.localRecord?.updatedAt ?? 0,
      },
    }
    await cloudSyncIdb.saveConflict(conflict)

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          resolvedRecord: conflict.cloudRecord,
          extraCreatedRecord,
          cursor: 14,
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    )

    await orchestrator.resolveConflict(conflict.id, 'save_local_copy')

    const copiedRecord = await cloudSyncIdb.getDocument(extraCreatedRecord.id)

    expect(await cloudSyncIdb.listPendingOpsByEntity(workspaceId, 'document', document.id)).toHaveLength(0)
    expect(await cloudSyncIdb.listConflictsByEntity(workspaceId, 'document', document.id)).toHaveLength(0)
    expect(copiedRecord?.id).toBe(extraCreatedRecord.id)
    expect(copiedRecord?.payload.id).toBe(extraCreatedRecord.id)
    expect(copiedRecord?.syncStatus).toBe('local_saved_pending_sync')
    expect(copiedRecord?.payload.updatedAt).toBe(copiedRecord?.updatedAt)
    expect(await cloudSyncIdb.listPendingOpsByEntity(workspaceId, 'document', extraCreatedRecord.id)).toHaveLength(1)
  })

  it('saves a local copy and clears the conflict when the server no longer has the conflict', async () => {
    const orchestrator = new CloudSyncOrchestrator()
    const document = createMindMapDocument('Stale Conflict')
    await orchestrator.saveDocument(document)

    const workspaceId = readStoredString('brainflow-cloud-workspace-id')
    const deviceId = readStoredString('brainflow-device-id')
    const [seedOp] = await cloudSyncIdb.listPendingOpsByEntity(workspaceId, 'document', document.id)
    expect(seedOp).toBeTruthy()

    await cloudSyncIdb.savePendingOp({
      ...seedOp!,
      status: 'conflict',
      lastError: 'Version conflict',
    })

    const conflict = createConflictRecord(workspaceId, deviceId, document.id, document.title, 'conflict_stale')
    await cloudSyncIdb.saveConflict(conflict)

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'Conflict not found.' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await orchestrator.resolveConflict(conflict.id, 'save_local_copy')

    const documents = await cloudSyncIdb.listDocuments()
    const copiedDocument = documents.find((record) => record.id.startsWith(`${document.id}_copy_`))

    expect(await cloudSyncIdb.getConflict(conflict.id)).toBeNull()
    expect(await cloudSyncIdb.listPendingOpsByEntity(workspaceId, 'document', document.id)).toHaveLength(0)
    expect(copiedDocument).toBeTruthy()
    expect(copiedDocument?.payload.id).toBe(copiedDocument?.id)
    expect(copiedDocument?.payload.title).toBe(`${document.title} local`)
    expect(copiedDocument?.syncStatus).toBe('local_saved_pending_sync')
    expect(await cloudSyncIdb.listPendingOpsByEntity(workspaceId, 'document', copiedDocument!.id)).toHaveLength(1)
    expect(await cloudSyncIdb.getSyncState(workspaceId)).toMatchObject({
      hasConflicts: false,
      lastError: null,
    })
  })

  it('saves a local copy without calling the server when the cloud record is missing', async () => {
    const orchestrator = new CloudSyncOrchestrator()
    const document = createMindMapDocument('Cloud Missing')
    await orchestrator.saveDocument(document)

    const workspaceId = readStoredString('brainflow-cloud-workspace-id')
    const deviceId = readStoredString('brainflow-device-id')
    const [seedOp] = await cloudSyncIdb.listPendingOpsByEntity(workspaceId, 'document', document.id)
    expect(seedOp).toBeTruthy()

    await cloudSyncIdb.savePendingOp({
      ...seedOp!,
      status: 'conflict',
      lastError: 'Version conflict',
    })

    const conflict = {
      ...createConflictRecord(workspaceId, deviceId, document.id, document.title, 'conflict_cloud_missing'),
      cloudRecord: null,
      cloudPayload: null,
      recommendedResolution: 'save_local_copy' as const,
      actionableResolutions: ['save_local_copy' as const],
    }
    await cloudSyncIdb.saveConflict(conflict)

    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await orchestrator.resolveConflict(conflict.id, 'save_local_copy')

    const documents = await cloudSyncIdb.listDocuments()
    const copiedDocument = documents.find((record) => record.id.startsWith(`${document.id}_copy_`))

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(await cloudSyncIdb.getConflict(conflict.id)).toBeNull()
    expect(copiedDocument).toBeTruthy()
    expect(copiedDocument?.payload.id).toBe(copiedDocument?.id)
    expect(await cloudSyncIdb.listPendingOpsByEntity(workspaceId, 'document', copiedDocument!.id)).toHaveLength(1)
  })

  it('discards a cloud-missing conversation conflict locally without calling the server', async () => {
    const orchestrator = new CloudSyncOrchestrator()
    const document = createMindMapDocument('Discard Conflict Document')
    await orchestrator.saveDocument(document)

    const workspaceId = readStoredString('brainflow-cloud-workspace-id')
    const deviceId = readStoredString('brainflow-device-id')
    const conversation = createConversationEnvelope(
      workspaceId,
      deviceId,
      'session_discard_local',
      document.id,
      'Discard Me',
      2,
    )

    await cloudSyncIdb.saveConversation({
      ...conversation,
      syncStatus: 'conflict',
    })
    await cloudSyncIdb.savePendingOp({
      opId: 'op_discard_local',
      workspaceId,
      deviceId,
      entityType: 'conversation',
      entityId: conversation.id,
      action: 'upsert',
      baseVersion: conversation.baseVersion,
      payload: conversation.payload,
      contentHash: conversation.contentHash,
      clientUpdatedAt: conversation.updatedAt,
      status: 'conflict',
      attemptCount: 1,
      lastError: 'Version conflict',
      createdAt: conversation.updatedAt,
    })

    const conflict: StorageConflictRecord = {
      ...createPendingConflictAnalysis<AiConversation>(),
      id: 'conflict_discard_local',
      workspaceId,
      entityType: 'conversation',
      entityId: conversation.id,
      deviceId,
      localRecord: {
        ...conversation,
        syncStatus: 'conflict',
      },
      cloudRecord: null,
      localPayload: conversation.payload,
      cloudPayload: null,
      diffHints: {
        updatedAtDeltaMs: null,
        sameContentHash: false,
      },
      analysisStatus: 'ready',
      analysisSource: 'heuristic',
      recommendedResolution: 'save_local_copy',
      confidence: 'high',
      summary: '主库当前没有可采用的版本。',
      reasons: ['主库记录缺失。'],
      actionableResolutions: ['save_local_copy'],
      mergedPayload: null,
      analyzedAt: 600,
      analysisNote: null,
      detectedAt: 700,
      resolvedAt: null,
    }
    await cloudSyncIdb.saveConflict(conflict)

    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await orchestrator.discardLocalConflict(conflict.id)

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(await cloudSyncIdb.getConflict(conflict.id)).toBeNull()
    expect(await cloudSyncIdb.getConversation(conversation.id)).toBeFalsy()
    expect(await cloudSyncIdb.listPendingOpsByEntity(workspaceId, 'conversation', conversation.id)).toHaveLength(0)
    expect(await cloudSyncIdb.getSyncState(workspaceId)).toMatchObject({
      hasConflicts: false,
      lastError: null,
    })
  })

  it('drops stale local conversations when the main-database record is missing during push', async () => {
    const orchestrator = new CloudSyncOrchestrator()
    await orchestrator.initialize()

    const workspaceId = readStoredString('brainflow-cloud-workspace-id')
    const deviceId = readStoredString('brainflow-device-id')
    const document = createDocumentEnvelope(
      workspaceId,
      'device_cloud',
      'doc_parent_server',
      'Server Parent',
      1,
    )
    const conversation = {
      ...createConversationEnvelope(
        workspaceId,
        deviceId,
        'session_cloud_missing',
        document.id,
        'Hello',
        2,
      ),
      baseVersion: 2,
      syncStatus: 'local_saved_pending_sync' as const,
      payload: {
        ...createConversationEnvelope(
          workspaceId,
          deviceId,
          'session_cloud_missing',
          document.id,
          'Hello',
          2,
        ).payload,
        updatedAt: 900,
      },
      updatedAt: 900,
    }

    await cloudSyncIdb.saveDocument(document)
    await cloudSyncIdb.saveConversation(conversation)
    await cloudSyncIdb.savePendingOp({
      opId: 'op_cloud_missing_conversation',
      workspaceId,
      deviceId,
      entityType: 'conversation',
      entityId: conversation.id,
      action: 'upsert',
      baseVersion: 2,
      payload: conversation.payload,
      contentHash: conversation.contentHash,
      clientUpdatedAt: conversation.updatedAt,
      status: 'pending',
      attemptCount: 0,
      lastError: null,
      createdAt: conversation.updatedAt,
    })

    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: true,
    })
    ;(orchestrator as unknown as { status: { isOnline: boolean } }).status.isOnline = true

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const requestUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      const url = new URL(requestUrl, 'http://127.0.0.1')

      if (url.pathname === '/api/sync/push') {
        return new Response(
          JSON.stringify({
            conflictId: 'conflict_cloud_missing_push',
            cloudRecord: null,
            localEcho: {
              ...conversation,
              syncStatus: 'conflict',
            },
            diffHints: {
              updatedAtDeltaMs: null,
              sameContentHash: false,
            },
          }),
          {
            status: 409,
            headers: { 'content-type': 'application/json' },
          },
        )
      }

      if (url.pathname === '/api/sync/pull') {
        return new Response(
          JSON.stringify({
            changes: [],
            nextCursor: 4,
            hasMore: false,
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        )
      }

      throw new Error(`Unexpected request: ${url.pathname}`)
    })

    await orchestrator.triggerSync('manual')

    const requestPaths = fetchSpy.mock.calls.map(([input]) =>
      new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url,
        'http://127.0.0.1',
      ).pathname,
    )

    expect(await cloudSyncIdb.getConversation(conversation.id)).toBeFalsy()
    expect(await cloudSyncIdb.listPendingOpsByEntity(workspaceId, 'conversation', conversation.id)).toHaveLength(0)
    expect(await cloudSyncIdb.listConflictsByEntity(workspaceId, 'conversation', conversation.id)).toHaveLength(0)
    expect(await cloudSyncIdb.getSyncState(workspaceId)).toMatchObject({
      hasConflicts: false,
      lastError: null,
    })
    expect(requestPaths).toEqual(['/api/sync/push', '/api/sync/pull'])
  })

  it('repairs malformed cached copies on startup and queues a corrective sync', async () => {
    const bootstrapOrchestrator = new CloudSyncOrchestrator()
    const document = createMindMapDocument('Startup Cleanup')
    await bootstrapOrchestrator.saveDocument(document)

    const workspaceId = readStoredString('brainflow-cloud-workspace-id')
    const deviceId = readStoredString('brainflow-device-id')
    const pendingOps = await cloudSyncIdb.listPendingOpsByWorkspace(workspaceId)
    await Promise.all(pendingOps.map((op) => cloudSyncIdb.deletePendingOp(op.opId)))

    const malformedCopyId = `${document.id}_copy_broken`
    await cloudSyncIdb.saveDocument({
      ...createDocumentEnvelope(workspaceId, 'device_cloud', malformedCopyId, `${document.title} copy`, 4),
      syncStatus: 'conflict',
      payload: {
        ...createDocumentEnvelope(workspaceId, 'device_cloud', malformedCopyId, `${document.title} copy`, 4).payload,
        id: document.id,
        title: `${document.title} copy`,
        updatedAt: 123,
      },
    })
    await cloudSyncIdb.savePendingOp({
      opId: 'op_malformed_copy_conflict',
      workspaceId,
      deviceId,
      entityType: 'document',
      entityId: malformedCopyId,
      action: 'upsert',
      baseVersion: 4,
      payload: {
        ...createDocumentEnvelope(workspaceId, 'device_cloud', malformedCopyId, `${document.title} copy`, 4).payload,
        id: document.id,
        title: `${document.title} copy`,
        updatedAt: 123,
      },
      contentHash: 'hash_malformed_copy',
      clientUpdatedAt: 123,
      status: 'conflict',
      attemptCount: 2,
      lastError: 'Version conflict',
      createdAt: 123,
    })
    await cloudSyncIdb.saveConflict(createConflictRecord(workspaceId, deviceId, malformedCopyId, `${document.title} copy`, 'conflict_malformed_copy'))
    await cloudSyncIdb.saveSyncState({
      workspaceId,
      lastPulledCursor: 0,
      lastPullAt: null,
      lastPushAt: null,
      isSyncing: false,
      lastError: 'Version conflict',
      hasConflicts: true,
      bootstrapCompletedAt: null,
    })

    const restartedOrchestrator = new CloudSyncOrchestrator()
    await restartedOrchestrator.initialize()

    const repairedRecord = await cloudSyncIdb.getDocument(malformedCopyId)
    const correctiveOps = await cloudSyncIdb.listPendingOpsByEntity(workspaceId, 'document', malformedCopyId)
    const remainingConflicts = await cloudSyncIdb.listConflictsByEntity(workspaceId, 'document', malformedCopyId)
    const syncState = await cloudSyncIdb.getSyncState(workspaceId)
    const listedDocuments = await restartedOrchestrator.listDocuments()

    expect(repairedRecord?.payload.id).toBe(malformedCopyId)
    expect(repairedRecord?.payload.updatedAt).toBe(repairedRecord?.updatedAt)
    expect(repairedRecord?.syncStatus).toBe('local_saved_pending_sync')
    expect(correctiveOps).toHaveLength(1)
    expect(correctiveOps[0]?.baseVersion).toBe(4)
    expect(correctiveOps[0]?.status).toBe('pending')
    expect(correctiveOps[0]?.lastError).toBeNull()
    expect(remainingConflicts).toHaveLength(0)
    expect(syncState?.hasConflicts).toBe(false)
    expect(syncState?.lastError).toBeNull()
    expect(listedDocuments.some((entry) => entry.id === malformedCopyId)).toBe(true)
  })

  it('refreshes legacy ready conflict analyses on startup', async () => {
    const bootstrapOrchestrator = new CloudSyncOrchestrator()
    const document = createMindMapDocument('Legacy Conflict')
    await bootstrapOrchestrator.saveDocument(document)

    const workspaceId = readStoredString('brainflow-cloud-workspace-id')
    const deviceId = readStoredString('brainflow-device-id')
    await cloudSyncIdb.saveConflict({
      ...createConflictRecord(workspaceId, deviceId, document.id, document.title, 'conflict_legacy_ready'),
      analysisStatus: 'ready',
      analysisSource: 'ai',
      recommendedResolution: 'use_cloud',
      confidence: 'low',
      summary: 'AI 当前不可用，已回退为旧建议。',
      reasons: ['AI 不可用，Codex 执行失败。'],
      actionableResolutions: ['use_cloud', 'save_local_copy'],
      analyzedAt: 600,
      analysisNote: 'AI 当前不可用，已回退为旧建议。',
    } as StorageConflictRecord)

    const restartedOrchestrator = new CloudSyncOrchestrator()
    await restartedOrchestrator.initialize()
    await new Promise((resolve) => setTimeout(resolve, 0))

    const refreshedConflict = await cloudSyncIdb.getConflict('conflict_legacy_ready')

    expect(refreshedConflict?.analysisSource).toBe('heuristic')
    expect(refreshedConflict?.summary).toBe('主库更新时间更晚，建议采用主库较新版本。')
    expect(refreshedConflict?.analysisNote).toBe('系统只根据更新时间给出建议，不会自动覆盖任何一侧内容。')
    expect(refreshedConflict?.reasons.some((reason) => reason.includes('AI'))).toBe(false)
  })

  it('collapses generated copy chains on startup and clears related conflicts', async () => {
    const bootstrapOrchestrator = new CloudSyncOrchestrator()
    const document = createMindMapDocument('测试1')
    await bootstrapOrchestrator.saveDocument(document)

    const workspaceId = readStoredString('brainflow-cloud-workspace-id')
    const deviceId = readStoredString('brainflow-device-id')
    const pendingOps = await cloudSyncIdb.listPendingOpsByWorkspace(workspaceId)
    await Promise.all(pendingOps.map((op) => cloudSyncIdb.deletePendingOp(op.opId)))
    await cloudSyncIdb.deleteDocument(document.id)

    const copyRecordOld = createDocumentEnvelope(
      workspaceId,
      'device_cloud',
      `${document.id}_copy_old`,
      '测试1 (4)',
      4,
    )
    const copyRecordNewest = createDocumentEnvelope(
      workspaceId,
      'device_cloud',
      `${document.id}_copy_old_copy_new`,
      '测试1 (6)',
      6,
    )
    const orphanConversation = createConversationEnvelope(
      workspaceId,
      'device_cloud',
      'session_copy_cleanup',
      copyRecordOld.id,
      '新对话',
      3,
    )

    await cloudSyncIdb.saveDocument(copyRecordOld)
    await cloudSyncIdb.saveDocument(copyRecordNewest)
    await cloudSyncIdb.saveConversation(orphanConversation)
    await cloudSyncIdb.saveConflict({
      ...createConflictRecord(workspaceId, deviceId, copyRecordNewest.id, copyRecordNewest.payload.title, 'conflict_copy_latest'),
      localRecord: {
        ...copyRecordNewest,
        updatedAt: copyRecordNewest.updatedAt - 50,
        syncStatus: 'conflict',
        payload: {
          ...copyRecordNewest.payload,
          updatedAt: copyRecordNewest.updatedAt - 50,
        },
      },
      localPayload: {
        ...copyRecordNewest.payload,
        updatedAt: copyRecordNewest.updatedAt - 50,
      },
      cloudRecord: {
        ...copyRecordNewest,
        syncStatus: 'conflict',
      },
      cloudPayload: copyRecordNewest.payload,
      analysisStatus: 'ready',
      analysisSource: 'ai',
      recommendedResolution: 'use_cloud',
      confidence: 'low',
      summary: 'AI 当前不可用，已回退为旧建议。',
      reasons: ['AI 不可用。'],
      actionableResolutions: ['use_cloud', 'save_local_copy'],
      analyzedAt: 900,
      analysisNote: 'AI 当前不可用，已回退为旧建议。',
    } as StorageConflictRecord)
    await cloudSyncIdb.saveConflict({
      ...createConflictRecord(workspaceId, deviceId, document.id, '测试1', 'conflict_copy_root_orphan'),
      cloudRecord: null,
      cloudPayload: null,
      localRecord: createDocumentEnvelope(workspaceId, deviceId, document.id, '测试1', 1),
      localPayload: createDocumentEnvelope(workspaceId, deviceId, document.id, '测试1', 1).payload,
      analysisStatus: 'ready',
      analysisSource: 'ai',
      recommendedResolution: 'save_local_copy',
      confidence: 'low',
      summary: 'AI 当前不可用，已回退为旧建议。',
      reasons: ['AI 不可用。'],
      actionableResolutions: ['save_local_copy'],
      analyzedAt: 901,
      analysisNote: 'AI 当前不可用，已回退为旧建议。',
    } as StorageConflictRecord)
    await cloudSyncIdb.saveConflict({
      ...createPendingConflictAnalysis<AiConversation>(),
      id: 'conflict_orphan_conversation',
      workspaceId,
      entityType: 'conversation',
      entityId: orphanConversation.id,
      deviceId,
      localRecord: {
        ...orphanConversation,
        syncStatus: 'conflict',
      },
      cloudRecord: null,
      localPayload: orphanConversation.payload,
      cloudPayload: null,
      diffHints: {
        updatedAtDeltaMs: null,
        sameContentHash: false,
      },
      detectedAt: 902,
      resolvedAt: null,
    } as StorageConflictRecord)
    await cloudSyncIdb.saveSyncState({
      workspaceId,
      lastPulledCursor: 0,
      lastPullAt: null,
      lastPushAt: null,
      isSyncing: false,
      lastError: 'Version conflict',
      hasConflicts: true,
      bootstrapCompletedAt: null,
    })

    const restartedOrchestrator = new CloudSyncOrchestrator()
    await restartedOrchestrator.initialize()
    await new Promise((resolve) => setTimeout(resolve, 0))

    const documents = await cloudSyncIdb.listDocuments()
    const activeDocuments = documents.filter(
      (record) => record.workspaceId === workspaceId && record.deletedAt === null,
    )
    const deletedCopy = await cloudSyncIdb.getDocument(copyRecordOld.id)
    const keptCopy = await cloudSyncIdb.getDocument(copyRecordNewest.id)
    const orphanConversationAfter = await cloudSyncIdb.getConversation(orphanConversation.id)
    const remainingConflicts = await cloudSyncIdb.listConflictsByWorkspace(workspaceId)
    const deleteOps = await cloudSyncIdb.listPendingOpsByEntity(workspaceId, 'document', copyRecordOld.id)
    const keepOps = await cloudSyncIdb.listPendingOpsByEntity(workspaceId, 'document', copyRecordNewest.id)

    expect(activeDocuments.map((record) => record.id)).toContain(copyRecordNewest.id)
    expect(activeDocuments.map((record) => record.id)).not.toContain(copyRecordOld.id)
    expect(keptCopy?.payload.title).toBe('测试1')
    expect(keptCopy?.syncStatus).toBe('local_saved_pending_sync')
    expect(deletedCopy?.deletedAt).not.toBeNull()
    expect(deleteOps.some((op) => op.action === 'delete')).toBe(true)
    expect(keepOps.some((op) => op.action === 'upsert')).toBe(true)
    expect(orphanConversationAfter?.deletedAt).not.toBeNull()
    expect(remainingConflicts).toHaveLength(0)
  })

  it('pulls instead of bootstrapping when synced cache exists but bootstrap state is missing', async () => {
    const orchestrator = new CloudSyncOrchestrator()
    const document = createMindMapDocument('Recovered From Synced Cache')
    await orchestrator.saveDocument(document)

    const workspaceId = readStoredString('brainflow-cloud-workspace-id')
    const pendingOps = await cloudSyncIdb.listPendingOpsByWorkspace(workspaceId)
    await Promise.all(pendingOps.map((op) => cloudSyncIdb.deletePendingOp(op.opId)))

    const cachedDocument = await cloudSyncIdb.getDocument(document.id)
    expect(cachedDocument).toBeTruthy()
    await cloudSyncIdb.saveDocument({
      ...cachedDocument!,
      version: 2,
      baseVersion: 1,
      syncStatus: 'synced',
    })
    await cloudSyncIdb.saveSyncState({
      workspaceId,
      lastPulledCursor: 0,
      lastPullAt: null,
      lastPushAt: null,
      isSyncing: false,
      lastError: null,
      hasConflicts: false,
      bootstrapCompletedAt: null,
    })

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const requestUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      const url = new URL(requestUrl, 'http://127.0.0.1')

      if (url.pathname === '/api/sync/pull') {
        return new Response(
          JSON.stringify({
            changes: [],
            nextCursor: 9,
            hasMore: false,
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        )
      }

      throw new Error(`Unexpected request: ${url.pathname}`)
    })
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: true,
    })
    ;(orchestrator as unknown as { status: { isOnline: boolean } }).status.isOnline = true

    await orchestrator.triggerSync('startup')

    expect(fetchSpy.mock.calls.map(([input]) =>
      new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url,
        'http://127.0.0.1',
      ).pathname,
    )).toEqual(['/api/sync/pull'])
    expect(await cloudSyncIdb.getSyncState(workspaceId)).toMatchObject({
      bootstrapCompletedAt: expect.any(Number),
      lastError: null,
      lastPulledCursor: 9,
    })
  })

  it('rebootstraps the local cache when the server has lost the workspace', async () => {
    const orchestrator = new CloudSyncOrchestrator()
    const document = createMindMapDocument('Workspace Reboot')
    await orchestrator.saveDocument(document)

    const workspaceId = readStoredString('brainflow-cloud-workspace-id')
    const deviceId = readStoredString('brainflow-device-id')
    await cloudSyncIdb.saveSyncState({
      workspaceId,
      lastPulledCursor: 7,
      lastPullAt: 100,
      lastPushAt: 100,
      isSyncing: false,
      lastError: null,
      hasConflicts: false,
      bootstrapCompletedAt: 100,
    })

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const requestUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      const url = new URL(requestUrl, 'http://127.0.0.1')

      if (url.pathname === '/api/sync/push') {
        return new Response(JSON.stringify({
          applied: [],
          cursor: 0,
          serverTime: 150,
          requiresBootstrap: true,
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      if (url.pathname === '/api/sync/bootstrap') {
        const body = JSON.parse(String(init?.body)) as { documents: Array<SyncEnvelope<{ title: string }>> }
        return new Response(
          JSON.stringify({
            workspace: {
              id: workspaceId,
              userId: 'user_stub_default',
              name: 'Recovered Workspace',
              createdAt: 1,
              updatedAt: 2,
            },
            documents: body.documents.map((record) => ({
              ...record,
              deviceId,
              version: 1,
              baseVersion: null,
              syncStatus: 'synced',
            })),
            conversations: [],
            cursor: 3,
            bootstrappedAt: 200,
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        )
      }

      if (url.pathname === '/api/sync/pull') {
        return new Response(
          JSON.stringify({
            changes: [],
            nextCursor: 3,
            hasMore: false,
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        )
      }

      throw new Error(`Unexpected request: ${url.pathname}`)
    })
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: true,
    })
    ;(orchestrator as unknown as { status: { isOnline: boolean } }).status.isOnline = true

    await orchestrator.triggerSync('startup')

    expect(fetchSpy).toHaveBeenCalledTimes(3)
    expect(fetchSpy.mock.calls.map(([input]) =>
      new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url,
        'http://127.0.0.1',
      ).pathname,
    )).toEqual(['/api/sync/push', '/api/sync/bootstrap', '/api/sync/pull'])
    expect(await cloudSyncIdb.listPendingOpsByWorkspace(workspaceId)).toHaveLength(0)
    expect(await cloudSyncIdb.getSyncState(workspaceId)).toMatchObject({
      bootstrapCompletedAt: 200,
      lastError: null,
      lastPulledCursor: 3,
    })
  })

  it('bootstraps again when pull reports that the workspace is missing', async () => {
    const orchestrator = new CloudSyncOrchestrator()
    const document = createMindMapDocument('Workspace Missing On Pull')
    await orchestrator.saveDocument(document)

    const workspaceId = readStoredString('brainflow-cloud-workspace-id')
    const deviceId = readStoredString('brainflow-device-id')
    const pendingOps = await cloudSyncIdb.listPendingOpsByWorkspace(workspaceId)
    await Promise.all(pendingOps.map((op) => cloudSyncIdb.deletePendingOp(op.opId)))
    await cloudSyncIdb.saveSyncState({
      workspaceId,
      lastPulledCursor: 7,
      lastPullAt: 100,
      lastPushAt: 100,
      isSyncing: false,
      lastError: null,
      hasConflicts: false,
      bootstrapCompletedAt: 100,
    })

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const requestUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      const url = new URL(requestUrl, 'http://127.0.0.1')

      if (url.pathname === '/api/sync/pull') {
        return new Response(JSON.stringify({ message: 'Workspace not found.' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        })
      }

      if (url.pathname === '/api/sync/bootstrap') {
        const body = JSON.parse(String(init?.body)) as { documents: Array<SyncEnvelope<{ title: string }>> }
        return new Response(
          JSON.stringify({
            workspace: {
              id: workspaceId,
              userId: 'user_stub_default',
              name: 'Recovered Workspace',
              createdAt: 1,
              updatedAt: 2,
            },
            documents: body.documents.map((record) => ({
              ...record,
              deviceId,
              version: 1,
              baseVersion: null,
              syncStatus: 'synced',
            })),
            conversations: [],
            cursor: 4,
            bootstrappedAt: 250,
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        )
      }

      throw new Error(`Unexpected request: ${url.pathname}`)
    })

    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: true,
    })
    ;(orchestrator as unknown as { status: { isOnline: boolean } }).status.isOnline = true

    await orchestrator.triggerSync('startup')

    expect(fetchSpy.mock.calls.map(([input]) =>
      new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url,
        'http://127.0.0.1',
      ).pathname,
    )).toEqual(['/api/sync/pull', '/api/sync/bootstrap'])
    expect(await cloudSyncIdb.listPendingOpsByWorkspace(workspaceId)).toHaveLength(0)
    expect(await cloudSyncIdb.getSyncState(workspaceId)).toMatchObject({
      bootstrapCompletedAt: 250,
      lastError: null,
      lastPulledCursor: 4,
    })
  })
})
