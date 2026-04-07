import { describe, expect, it } from 'vitest'
import { createMindMapDocument } from '../documents/document-factory'
import { buildAiContext } from './ai-context'

describe('buildAiContext', () => {
  it('serializes the whole graph and keeps the merged focus as metadata', () => {
    const document = createMindMapDocument('测试脑图')
    const root = document.topics[document.rootTopicId]
    const firstBranchId = root.childIds[0]
    const secondBranchId = root.childIds[1]

    document.topics[firstBranchId].note = '分支备注'

    const context = buildAiContext(document, [firstBranchId], firstBranchId, {
      useFullDocument: true,
      manualContextTopicIds: [secondBranchId],
    })

    expect(context.documentTitle).toBe('测试脑图')
    expect(context.rootTopicId).toBe(document.rootTopicId)
    expect(context.scope).toBe('full_document')
    expect(context.topicCount).toBe(Object.keys(document.topics).length)
    expect(context.focus).toEqual({
      activeTopicId: firstBranchId,
      selectedTopicIds: [secondBranchId, firstBranchId],
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

    const context = buildAiContext(document, ['missing-topic'], null, {
      useFullDocument: true,
    })

    expect(context.scope).toBe('full_document')
    expect(context.focus.selectedTopicIds).toEqual([])
    expect(context.focus.activeTopicId).toBeNull()
    expect(context.topics).toHaveLength(Object.keys(document.topics).length)
  })

  it('clips context to focus nodes and their ancestors when full document mode is off', () => {
    const document = createMindMapDocument('Focused map')
    const root = document.topics[document.rootTopicId]
    const firstBranchId = root.childIds[0]
    const secondBranchId = root.childIds[1]

    const context = buildAiContext(document, [firstBranchId], firstBranchId, {
      useFullDocument: false,
      manualContextTopicIds: [secondBranchId],
    })

    expect(context.scope).toBe('focused_subset')
    expect(context.focus.activeTopicId).toBe(firstBranchId)
    expect(context.focus.selectedTopicIds).toEqual([secondBranchId, firstBranchId])
    expect(context.topics.map((topic) => topic.topicId)).toEqual(
      expect.arrayContaining([document.rootTopicId, firstBranchId, secondBranchId]),
    )
    expect(context.topics).toHaveLength(3)

    const rootTopic = context.topics.find((topic) => topic.topicId === document.rootTopicId)
    expect(rootTopic?.childTopicIds).toEqual(expect.arrayContaining([firstBranchId, secondBranchId]))
  })

  it('allows empty subset mode by sending only the root shell', () => {
    const document = createMindMapDocument('Focused map')

    const context = buildAiContext(document, [], null, {
      useFullDocument: false,
    })

    expect(context.scope).toBe('empty')
    expect(context.topicCount).toBe(1)
    expect(context.topics.map((topic) => topic.topicId)).toEqual([document.rootTopicId])
    expect(context.topics[0]?.childTopicIds).toEqual([])
    expect(context.focus).toEqual({
      activeTopicId: null,
      selectedTopicIds: [],
      relationSummary: [],
    })
  })
})
