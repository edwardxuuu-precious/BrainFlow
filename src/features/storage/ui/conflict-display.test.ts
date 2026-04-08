import { describe, expect, it } from 'vitest'
import type { StorageConflictRecord } from '../domain/sync-records'
import { createPendingConflictAnalysis } from '../domain/sync-records'
import { buildConflictDisplayItems } from './conflict-display'

function createConflict(
  id: string,
  entityId: string,
  title: string,
  detectedAt: number,
): StorageConflictRecord {
  return {
    ...createPendingConflictAnalysis<{ title: string }>(),
    id,
    workspaceId: 'workspace_1',
    entityType: 'document',
    entityId,
    deviceId: 'device_1',
    localRecord: null,
    cloudRecord: null,
    localPayload: { title },
    cloudPayload: null,
    diffHints: {
      updatedAtDeltaMs: null,
      sameContentHash: false,
    },
    detectedAt,
    resolvedAt: null,
  } as unknown as StorageConflictRecord
}

describe('buildConflictDisplayItems', () => {
  it('groups duplicate conflicts by entity and keeps the latest record', () => {
    const items = buildConflictDisplayItems([
      createConflict('conflict_old', 'doc_1', 'Roadmap', 100),
      createConflict('conflict_new', 'doc_1', 'Roadmap latest', 200),
      createConflict('conflict_other', 'doc_2', 'Spec', 150),
    ])

    expect(items).toHaveLength(2)
    expect(items[0]).toEqual(
      expect.objectContaining({
        key: 'document:doc_1',
        title: 'Roadmap latest',
        duplicateCount: 1,
      }),
    )
    expect(items[1]).toEqual(
      expect.objectContaining({
        key: 'document:doc_2',
        title: 'Spec',
        duplicateCount: 0,
      }),
    )
  })
})
