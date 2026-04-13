import { describe, expect, it } from 'vitest'
import type { SyncEnvelope } from '../../shared/sync-contract.js'
import { InMemorySyncRepository } from './in-memory-sync-repository.js'

function createDocumentRecord(
  workspaceId: string,
  deviceId: string,
  id: string,
  title: string,
  version: number,
): SyncEnvelope<{ id: string; title: string; updatedAt: number }> {
  return {
    id,
    userId: 'user_1',
    workspaceId,
    deviceId,
    version,
    baseVersion: version - 1,
    contentHash: `hash_${id}_${version}`,
    updatedAt: 100 + version,
    deletedAt: null,
    syncStatus: 'conflict',
    payload: {
      id,
      title,
      updatedAt: 100 + version,
    },
  }
}

function createConversationRecord(
  workspaceId: string,
  deviceId: string,
  id: string,
  documentId: string,
  version: number,
): SyncEnvelope<{
  id: string
  documentId: string
  documentTitle: string
  sessionId: string
  title: string
  messages: []
  updatedAt: number
  archivedAt: null
}> {
  return {
    id,
    userId: 'user_1',
    workspaceId,
    deviceId,
    version,
    baseVersion: version - 1,
    contentHash: `hash_${id}_${version}`,
    updatedAt: 200 + version,
    deletedAt: null,
    syncStatus: 'conflict',
    payload: {
      id,
      documentId,
      documentTitle: 'Doc',
      sessionId: id,
      title: 'Session',
      messages: [],
      updatedAt: 200 + version,
      archivedAt: null,
    },
  }
}

describe('InMemorySyncRepository', () => {
  it('reuses the active conflict for the same entity instead of creating duplicates', async () => {
    const repository = new InMemorySyncRepository<{ title: string }>()
    const first = await repository.createConflict(
      'workspace_1',
      'document',
      'doc_1',
      'device_1',
      null,
      null,
      {
        updatedAtDeltaMs: 10,
        sameContentHash: false,
      },
    )

    const second = await repository.createConflict(
      'workspace_1',
      'document',
      'doc_1',
      'device_1',
      null,
      null,
      {
        updatedAtDeltaMs: 20,
        sameContentHash: true,
      },
    )

    const conflicts = await repository.listConflicts('workspace_1')

    expect(second.id).toBe(first.id)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]?.diffHints).toEqual({
      updatedAtDeltaMs: 20,
      sameContentHash: true,
    })
  })

  it('returns a corrected document copy when resolving save_local_copy', async () => {
    const repository = new InMemorySyncRepository<unknown>()
    await repository.restoreWorkspace({
      workspaceId: 'workspace_1',
      userId: 'user_1',
      mode: 'replace',
      documents: [],
      conversations: [],
    })

    const localRecord = createDocumentRecord('workspace_1', 'device_1', 'doc_1', 'Roadmap', 2)
    const cloudRecord = createDocumentRecord('workspace_1', 'device_cloud', 'doc_1', 'Roadmap cloud', 3)
    const conflict = await repository.createConflict(
      'workspace_1',
      'document',
      'doc_1',
      'device_1',
      localRecord,
      cloudRecord,
      {
        updatedAtDeltaMs: 1,
        sameContentHash: false,
      },
    )

    const result = await repository.resolveConflict({
      workspaceId: 'workspace_1',
      userId: 'user_1',
      deviceId: 'device_1',
      conflictId: conflict.id,
      resolution: 'save_local_copy',
    })

    expect(result.extraCreatedRecord).toBeTruthy()
    expect(result.extraCreatedRecord?.syncStatus).toBe('synced')
    expect(result.extraCreatedRecord?.id).toMatch(/^doc_1_copy_/)
    expect((result.extraCreatedRecord?.payload as { id?: string } | undefined)?.id).toBe(
      result.extraCreatedRecord?.id,
    )
    expect(
      (result.extraCreatedRecord?.payload as { updatedAt?: number } | undefined)?.updatedAt,
    ).toBe(result.extraCreatedRecord?.updatedAt)
  })

  it('returns a corrected conversation copy when resolving save_local_copy', async () => {
    const repository = new InMemorySyncRepository<unknown>()
    await repository.restoreWorkspace({
      workspaceId: 'workspace_1',
      userId: 'user_1',
      mode: 'replace',
      documents: [],
      conversations: [],
    })

    const localRecord = createConversationRecord('workspace_1', 'device_1', 'session_1', 'doc_1', 2)
    const cloudRecord = createConversationRecord('workspace_1', 'device_cloud', 'session_1', 'doc_1', 3)
    const conflict = await repository.createConflict(
      'workspace_1',
      'conversation',
      'session_1',
      'device_1',
      localRecord,
      cloudRecord,
      {
        updatedAtDeltaMs: 1,
        sameContentHash: false,
      },
    )

    const result = await repository.resolveConflict({
      workspaceId: 'workspace_1',
      userId: 'user_1',
      deviceId: 'device_1',
      conflictId: conflict.id,
      resolution: 'save_local_copy',
    })

    expect(result.extraCreatedRecord).toBeTruthy()
    expect(result.extraCreatedRecord?.syncStatus).toBe('synced')
    expect(result.extraCreatedRecord?.id).toMatch(/^session_1_copy_/)
    expect((result.extraCreatedRecord?.payload as { id?: string } | undefined)?.id).toBe(
      result.extraCreatedRecord?.id,
    )
    expect(
      (result.extraCreatedRecord?.payload as { sessionId?: string } | undefined)?.sessionId,
    ).toBe(result.extraCreatedRecord?.id)
    expect(
      (result.extraCreatedRecord?.payload as { updatedAt?: number } | undefined)?.updatedAt,
    ).toBe(result.extraCreatedRecord?.updatedAt)
  })
})
