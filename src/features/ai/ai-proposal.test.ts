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

    expect(() => validateAiProposal(document, proposal)).toThrow('当前脑图已发生变化')
  })

  it('creates, updates, moves, and deletes topics locally in one batch with temp refs', () => {
    const document = createMindMapDocument()
    const root = document.topics[document.rootTopicId]
    const firstBranchId = root.childIds[0]
    const secondBranchId = root.childIds[1]
    const result = applyAiProposal(document, {
      ...createProposal(document.updatedAt),
      summary: '移动并删除节点',
      operations: [
        {
          type: 'update_topic',
          target: `topic:${firstBranchId}`,
          note: '更新后的备注',
        },
        {
          type: 'create_child',
          parent: `topic:${firstBranchId}`,
          title: 'GTM 定价',
          note: '定价策略骨架',
          resultRef: 'tmp_gtm_pricing',
        },
        {
          type: 'create_child',
          parent: 'ref:tmp_gtm_pricing',
          title: '目标用户',
          note: '聚焦核心客群',
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
    const createdParent = Object.values(result.document.topics).find((topic) => topic.title === 'GTM 定价')
    const createdChild = Object.values(result.document.topics).find((topic) => topic.title === '目标用户')

    expect(createdParent).toBeTruthy()
    expect(createdChild).toBeTruthy()
    expect(result.document.topics[createdParent!.id]?.parentId).toBe(secondBranchId)
    expect(result.document.topics[createdChild!.id]?.parentId).toBe(createdParent!.id)
    expect(result.document.topics[firstBranchId]).toBeUndefined()
    expect(result.selectedTopicId).toBe(document.rootTopicId)
    expect(result.appliedCount).toBe(5)
    expect(result.skippedCount).toBe(0)
    expect(result.appliedSummary).toContain('移动并删除节点')
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
          title: '不应被修改',
        },
        {
          type: 'create_child',
          parent: `topic:${firstBranchId}`,
          title: '允许新增的子主题',
        },
      ],
    } satisfies AiCanvasProposal

    const result = applyAiProposal(document, proposal)

    expect(result.appliedCount).toBe(1)
    expect(result.skippedCount).toBe(1)
    expect(result.warnings.join(' ')).toContain('节点已锁定')
    expect(
      Object.values(result.document.topics).some((topic) => topic.title === '允许新增的子主题'),
    ).toBe(true)
    expect(result.document.topics[firstBranchId].title).toBe('分支一')
  })
})
