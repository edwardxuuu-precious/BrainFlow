import { describe, expect, it } from 'vitest'
import { InMemorySyncRepository } from './in-memory-sync-repository.js'

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
})
