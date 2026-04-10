import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SyncEnvelope } from '../../../../shared/sync-contract'
import { createMindMapDocument } from '../../documents/document-factory'
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

function createDocumentEnvelope(
  workspaceId: string,
  deviceId: string,
  documentId: string,
  title: string,
  version: number,
): SyncEnvelope<{ title: string }> {
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
    payload: { title },
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
    ...createPendingConflictAnalysis<{ title: string }>(),
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
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: false,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
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

  it('keeps the created copy and clears stale queues after save_local_copy resolution', async () => {
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
    const extraCreatedRecord = createDocumentEnvelope(workspaceId, deviceId, `${document.id}_copy_new`, `${document.title} copy`, 1)
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

    expect(await cloudSyncIdb.listPendingOpsByEntity(workspaceId, 'document', document.id)).toHaveLength(0)
    expect(await cloudSyncIdb.listConflictsByEntity(workspaceId, 'document', document.id)).toHaveLength(0)
    expect(await cloudSyncIdb.getDocument(extraCreatedRecord.id)).toEqual(extraCreatedRecord)
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
})
