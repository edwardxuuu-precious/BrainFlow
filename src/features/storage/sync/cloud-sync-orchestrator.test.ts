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
})
