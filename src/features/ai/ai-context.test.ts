import { describe, expect, it } from 'vitest'
import { createMindMapDocument } from '../documents/document-factory'
import { buildAiContext } from './ai-context'

describe('buildAiContext', () => {
  it('serializes the whole graph and keeps the current focus as metadata', () => {
    const document = createMindMapDocument('测试脑图')
    const root = document.topics[document.rootTopicId]
    const firstBranchId = root.childIds[0]
    const secondBranchId = root.childIds[1]

    document.topics[firstBranchId].note = '分支备注'

    const context = buildAiContext(document, [firstBranchId], firstBranchId)

    expect(context.documentTitle).toBe('测试脑图')
    expect(context.rootTopicId).toBe(document.rootTopicId)
    expect(context.topicCount).toBe(Object.keys(document.topics).length)
    expect(context.focus).toEqual({
      activeTopicId: firstBranchId,
      selectedTopicIds: [firstBranchId],
      relationSummary: [],
    })
    expect(context.topics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          topicId: firstBranchId,
          title: document.topics[firstBranchId].title,
          note: '分支备注',
          parentTopicId: document.rootTopicId,
        }),
        expect.objectContaining({
          topicId: secondBranchId,
          title: document.topics[secondBranchId].title,
        }),
      ]),
    )
  })

  it('keeps an empty focus while still exposing the full graph', () => {
    const document = createMindMapDocument('测试脑图')

    const context = buildAiContext(document, ['missing-topic'], null)

    expect(context.focus.selectedTopicIds).toEqual([])
    expect(context.focus.activeTopicId).toBeNull()
    expect(context.topics).toHaveLength(Object.keys(document.topics).length)
  })
})
