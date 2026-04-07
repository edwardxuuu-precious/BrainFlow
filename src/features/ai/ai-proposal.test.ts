import { describe, expect, it } from 'vitest'
import type { AiCanvasProposal } from '../../../shared/ai-contract'
import { createMindMapDocument } from '../documents/document-factory'
import { applyAiProposal, applyAiProposalAsync, validateAiProposal } from './ai-proposal'

function createProposal(documentUpdatedAt: number): AiCanvasProposal {
  return {
    id: 'proposal_test',
    summary: 'Test proposal',
    baseDocumentUpdatedAt: documentUpdatedAt,
    operations: [],
  }
}

describe('AI proposal helpers', () => {
  it('rejects stale proposals', () => {
    const document = createMindMapDocument()
    const proposal = createProposal(document.updatedAt - 1)

    expect(() => validateAiProposal(document, proposal)).toThrow(
      'The document changed after the AI proposal was generated.',
    )
  })

  it('creates, updates, moves, and deletes topics locally in one batch with temp refs', () => {
    const document = createMindMapDocument()
    const root = document.topics[document.rootTopicId]
    const firstBranchId = root.childIds[0]
    const secondBranchId = root.childIds[1]

    const result = applyAiProposal(document, {
      ...createProposal(document.updatedAt),
      summary: 'Move and delete imported topics',
      operations: [
        {
          type: 'update_topic',
          target: `topic:${firstBranchId}`,
          note: 'Updated note',
        },
        {
          type: 'create_child',
          parent: `topic:${firstBranchId}`,
          title: 'GTM pricing',
          note: 'Pricing strategy',
          resultRef: 'tmp_gtm_pricing',
        },
        {
          type: 'create_child',
          parent: 'ref:tmp_gtm_pricing',
          title: 'Target users',
          note: 'Core audience',
        },
        {
          type: 'move_topic',
          target: 'ref:tmp_gtm_pricing',
          newParent: `topic:${secondBranchId}`,
          targetIndex: 0,
        },
        {
          type: 'delete_topic',
          target: `topic:${firstBranchId}`,
        },
      ],
    })

    const createdParent = Object.values(result.document.topics).find((topic) => topic.title === 'GTM pricing')
    const createdChild = Object.values(result.document.topics).find((topic) => topic.title === 'Target users')

    expect(createdParent).toBeTruthy()
    expect(createdChild).toBeTruthy()
    expect(result.document.topics[createdParent!.id]?.parentId).toBe(secondBranchId)
    expect(result.document.topics[createdChild!.id]?.parentId).toBe(createdParent!.id)
    expect(result.document.topics[firstBranchId]).toBeUndefined()
    expect(result.selectedTopicId).toBe(document.rootTopicId)
    expect(result.appliedCount).toBe(5)
    expect(result.skippedCount).toBe(0)
    expect(result.appliedSummary).toContain('Applied 5')
  })

  it('skips locked node mutations while still applying safe operations', () => {
    const document = createMindMapDocument()
    const root = document.topics[document.rootTopicId]
    const firstBranchId = root.childIds[0]
    document.topics[firstBranchId].aiLocked = true

    const proposal = {
      ...createProposal(document.updatedAt),
      operations: [
        {
          type: 'update_topic',
          target: `topic:${firstBranchId}`,
          title: 'Should stay locked',
        },
        {
          type: 'create_child',
          parent: `topic:${firstBranchId}`,
          title: 'Allowed child topic',
        },
      ],
    } satisfies AiCanvasProposal

    const result = applyAiProposal(document, proposal)

    expect(result.appliedCount).toBe(1)
    expect(result.skippedCount).toBe(1)
    expect(result.warnings.join(' ')).toContain('locked')
    expect(
      Object.values(result.document.topics).some((topic) => topic.title === 'Allowed child topic'),
    ).toBe(true)
    expect(result.document.topics[firstBranchId].title).toBe('分支一')
  })

  it('applies large proposals asynchronously while reporting batch progress', async () => {
    const document = createMindMapDocument()
    const operations: AiCanvasProposal['operations'] = Array.from({ length: 30 }, (_, index) => ({
      type: 'create_child',
      parent: `topic:${document.rootTopicId}`,
      title: `Imported topic ${index + 1}`,
    }))

    const progressCalls: number[] = []
    const result = await applyAiProposalAsync(
      document,
      {
        ...createProposal(document.updatedAt),
        summary: 'Async import apply',
        operations,
      },
      {
        batchSize: 25,
        onProgress: (progress) => {
          progressCalls.push(progress.processedCount)
        },
      },
    )

    expect(progressCalls.at(-1)).toBe(30)
    expect(result.appliedCount).toBe(30)
    expect(
      Object.values(result.document.topics).filter((topic) => topic.title.startsWith('Imported topic')),
    ).toHaveLength(30)
  })

  it('ignores AI-authored markers and stickers while preserving labels and type', () => {
    const document = createMindMapDocument()
    const root = document.topics[document.rootTopicId]
    const firstBranchId = root.childIds[0]

    const proposal = {
      ...createProposal(document.updatedAt),
      summary: 'Metadata sanitize',
      operations: [
        {
          type: 'create_child',
          parent: `topic:${document.rootTopicId}`,
          title: 'AI generated child',
          metadata: {
            labels: ['action'],
            type: 'task',
            markers: ['warning'],
            stickers: ['rocket'],
          },
        },
        {
          type: 'update_topic',
          target: `topic:${firstBranchId}`,
          metadata: {
            labels: ['summary'],
            type: 'milestone',
            markers: ['decision'],
            stickers: ['target'],
          },
        },
      ],
    } as unknown as AiCanvasProposal

    const result = applyAiProposal(document, proposal)
    const createdChild = Object.values(result.document.topics).find(
      (topic) => topic.title === 'AI generated child',
    )

    expect(createdChild).toBeTruthy()
    expect(createdChild?.metadata).toMatchObject({
      labels: ['action'],
      type: 'task',
      markers: [],
      stickers: [],
    })
    expect(result.document.topics[firstBranchId].metadata).toMatchObject({
      labels: ['summary'],
      type: 'milestone',
      markers: [],
      stickers: [],
    })
  })
})
