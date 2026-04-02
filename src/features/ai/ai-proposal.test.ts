import { describe, expect, it } from 'vitest'
import type { AiCanvasProposal } from '../../../shared/ai-contract'
import { createMindMapDocument } from '../documents/document-factory'
import { applyAiProposal, validateAiProposal } from './ai-proposal'

function createProposal(documentUpdatedAt: number): AiCanvasProposal {
  return {
    id: 'proposal_test',
    summary: '测试提案',
    baseDocumentUpdatedAt: documentUpdatedAt,
    operations: [],
  }
}

describe('AI proposal helpers', () => {
  it('rejects stale proposals', () => {
    const document = createMindMapDocument()
    const proposal = createProposal(document.updatedAt - 1)

    expect(() => validateAiProposal(document, proposal)).toThrow('当前脑图已变化')
  })

  it('creates child and sibling topics and updates notes locally', () => {
    const document = createMindMapDocument()
    const root = document.topics[document.rootTopicId]
    const anchorId = root.childIds[0]
    const siblingAnchorId = root.childIds[1]

    const proposal: AiCanvasProposal = {
      ...createProposal(document.updatedAt),
      operations: [
        {
          type: 'create_child',
          parentTopicId: anchorId,
          title: 'AI 子主题',
          note: '子主题备注',
        },
        {
          type: 'create_sibling',
          targetTopicId: siblingAnchorId,
          title: 'AI 同级主题',
        },
        {
          type: 'update_topic',
          topicId: anchorId,
          note: '更新后的备注',
        },
      ],
    }

    const result = applyAiProposal(document, proposal)
    const createdChild = Object.values(result.document.topics).find((topic) => topic.title === 'AI 子主题')
    const createdSibling = Object.values(result.document.topics).find(
      (topic) => topic.title === 'AI 同级主题',
    )

    expect(createdChild).toBeTruthy()
    expect(createdChild?.parentId).toBe(anchorId)
    expect(createdChild?.note).toBe('子主题备注')
    expect(createdSibling).toBeTruthy()
    expect(result.document.topics[anchorId]?.note).toBe('更新后的备注')
    expect(result.selectedTopicId).toBe(anchorId)
  })

  it('rejects unsupported target references', () => {
    const document = createMindMapDocument()
    const proposal: AiCanvasProposal = {
      ...createProposal(document.updatedAt),
      operations: [
        {
          type: 'create_child',
          parentTopicId: 'missing-topic',
          title: '不应通过',
        },
      ],
    }

    expect(() => validateAiProposal(document, proposal)).toThrow('父节点不存在')
  })
})
