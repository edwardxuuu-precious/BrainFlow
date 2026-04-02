import { describe, expect, it } from 'vitest'
import { createMindMapDocument } from '../documents/document-factory'
import { buildAiContext } from './ai-context'

describe('buildAiContext', () => {
  it('only serializes selected topics with their local context', () => {
    const document = createMindMapDocument('测试脑图')
    const root = document.topics[document.rootTopicId]
    const firstBranchId = root.childIds[0]
    const secondBranchId = root.childIds[1]

    document.topics[firstBranchId].note = '分支备注'

    const context = buildAiContext(document, [firstBranchId], firstBranchId)

    expect(context.documentTitle).toBe('测试脑图')
    expect(context.activeTopicId).toBe(firstBranchId)
    expect(context.selectedTopicIds).toEqual([firstBranchId])
    expect(context.topics).toEqual([
      expect.objectContaining({
        topicId: firstBranchId,
        title: document.topics[firstBranchId].title,
        note: '分支备注',
        ancestorTitles: [document.topics[document.rootTopicId].title],
      }),
    ])
    expect(context.topics[0]?.childTitles).not.toContain(document.topics[secondBranchId].title)
  })

  it('skips missing topic ids instead of leaking other document content', () => {
    const document = createMindMapDocument('测试脑图')

    const context = buildAiContext(document, ['missing-topic'], null)
    expect(context.selectedTopicIds).toEqual([])
    expect(context.topics).toEqual([])
  })
})
