import { buildResourceId, createSyncConflict } from './conflict-manager'

describe('buildResourceId', () => {
  test('document type returns documentId only', () => {
    expect(buildResourceId('document', 'doc-1', null)).toBe('doc-1')
  })

  test('conversation type with sessionId returns "docId:sessionId"', () => {
    expect(buildResourceId('conversation', 'doc-1', 'sess-1')).toBe('doc-1:sess-1')
  })

  test('conversation type with null sessionId returns "docId:unknown"', () => {
    expect(buildResourceId('conversation', 'doc-1', null)).toBe('doc-1:unknown')
  })
})

describe('createSyncConflict', () => {
  const baseInput = {
    resourceType: 'document' as const,
    documentId: 'doc-1',
    sessionId: null,
    localHash: 'hash-local',
    targetHash: 'hash-target',
  }

  test('target newer → suggestedWinner = target', () => {
    const conflict = createSyncConflict({
      ...baseInput,
      localUpdatedAt: 1000,
      targetUpdatedAt: 2000,
    })
    expect(conflict.suggestedWinner).toBe('target')
  })

  test('local newer → suggestedWinner = local', () => {
    const conflict = createSyncConflict({
      ...baseInput,
      localUpdatedAt: 2000,
      targetUpdatedAt: 1000,
    })
    expect(conflict.suggestedWinner).toBe('local')
  })

  test('equal timestamps → suggestedWinner = local', () => {
    const conflict = createSyncConflict({
      ...baseInput,
      localUpdatedAt: 1000,
      targetUpdatedAt: 1000,
    })
    expect(conflict.suggestedWinner).toBe('local')
  })

  test('both null timestamps → suggestedWinner = local', () => {
    const conflict = createSyncConflict({
      ...baseInput,
      localUpdatedAt: null,
      targetUpdatedAt: null,
    })
    expect(conflict.suggestedWinner).toBe('local')
  })

  test('conflict ID format: "conflict:{resourceType}:{resourceId}"', () => {
    const conflict = createSyncConflict({
      ...baseInput,
      localUpdatedAt: 1000,
      targetUpdatedAt: 2000,
    })
    expect(conflict.id).toBe('conflict:document:doc-1')

    const convConflict = createSyncConflict({
      ...baseInput,
      resourceType: 'conversation',
      sessionId: 'sess-1',
      localUpdatedAt: 1000,
      targetUpdatedAt: 2000,
    })
    expect(convConflict.id).toBe('conflict:conversation:doc-1:sess-1')
  })

  test('document conflict passes through localDocument/targetDocument', () => {
    const localDoc = { id: 'doc-1', title: 'Local' } as any
    const targetDoc = { id: 'doc-1', title: 'Target' } as any

    const conflict = createSyncConflict({
      ...baseInput,
      localUpdatedAt: 1000,
      targetUpdatedAt: 2000,
      localDocument: localDoc,
      targetDocument: targetDoc,
    })
    expect(conflict.localDocument).toBe(localDoc)
    expect(conflict.targetDocument).toBe(targetDoc)
  })

  test('conversation conflict passes through localConversation/targetConversation', () => {
    const localConv = { id: 'conv-1' } as any
    const targetConv = { id: 'conv-2' } as any

    const conflict = createSyncConflict({
      ...baseInput,
      resourceType: 'conversation',
      sessionId: 'sess-1',
      localUpdatedAt: 1000,
      targetUpdatedAt: 2000,
      localConversation: localConv,
      targetConversation: targetConv,
    })
    expect(conflict.localConversation).toBe(localConv)
    expect(conflict.targetConversation).toBe(targetConv)
  })

  test('detectedAt is set to a reasonable timestamp (within 1 second of Date.now())', () => {
    const before = Date.now()
    const conflict = createSyncConflict({
      ...baseInput,
      localUpdatedAt: 1000,
      targetUpdatedAt: 2000,
    })
    const after = Date.now()

    expect(conflict.detectedAt).toBeGreaterThanOrEqual(before)
    expect(conflict.detectedAt).toBeLessThanOrEqual(after + 1000)
  })
})
