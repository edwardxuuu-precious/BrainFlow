import type { AiCanvasOperation, AiCanvasProposal } from '../../../shared/ai-contract'
import type { MindMapDocument } from '../documents/types'
import { addChild, addSibling, renameTopic, updateTopicNote } from '../editor/tree-operations'

export interface AiProposalApplyResult {
  document: MindMapDocument
  selectedTopicId: string | null
}

function normalizeTitle(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }

  return value.trim() || '新主题'
}

function normalizeOperation(
  document: MindMapDocument,
  operation: AiCanvasOperation,
): AiCanvasOperation {
  switch (operation.type) {
    case 'create_child': {
      if (!document.topics[operation.parentTopicId]) {
        throw new Error(`提案中的父节点不存在：${operation.parentTopicId}`)
      }

      return {
        ...operation,
        title: normalizeTitle(operation.title) ?? '新主题',
      }
    }

    case 'create_sibling': {
      const target = document.topics[operation.targetTopicId]
      if (!target || !target.parentId) {
        throw new Error(`提案中的同级目标无效：${operation.targetTopicId}`)
      }

      return {
        ...operation,
        title: normalizeTitle(operation.title) ?? '新主题',
      }
    }

    case 'update_topic': {
      if (!document.topics[operation.topicId]) {
        throw new Error(`提案中的更新节点不存在：${operation.topicId}`)
      }

      const normalizedTitle = normalizeTitle(operation.title)
      if (normalizedTitle === undefined && operation.note === undefined) {
        throw new Error('更新节点提案至少要包含标题或备注')
      }

      return {
        ...operation,
        title: normalizedTitle,
      }
    }
  }
}

export function validateAiProposal(
  document: MindMapDocument,
  proposal: AiCanvasProposal | null | undefined,
): AiCanvasProposal {
  if (!proposal) {
    throw new Error('没有可应用的提案')
  }

  if (proposal.baseDocumentUpdatedAt !== document.updatedAt) {
    throw new Error('当前脑图已变化，请重新生成 AI 提案')
  }

  return {
    ...proposal,
    operations: proposal.operations.map((operation) =>
      normalizeOperation(document, operation),
    ),
  }
}

export function applyAiProposal(
  document: MindMapDocument,
  proposal: AiCanvasProposal,
): AiProposalApplyResult {
  const normalizedProposal = validateAiProposal(document, proposal)
  let nextDocument = document
  let selectedTopicId: string | null = null

  normalizedProposal.operations.forEach((operation) => {
    switch (operation.type) {
      case 'create_child': {
        const result = addChild(nextDocument, operation.parentTopicId)
        nextDocument = result.document
        if (result.topicId) {
          nextDocument = renameTopic(nextDocument, result.topicId, operation.title)
          if (operation.note !== undefined) {
            nextDocument = updateTopicNote(nextDocument, result.topicId, operation.note)
          }
          selectedTopicId = result.topicId
        }
        break
      }

      case 'create_sibling': {
        const result = addSibling(nextDocument, operation.targetTopicId)
        nextDocument = result.document
        if (result.topicId) {
          nextDocument = renameTopic(nextDocument, result.topicId, operation.title)
          if (operation.note !== undefined) {
            nextDocument = updateTopicNote(nextDocument, result.topicId, operation.note)
          }
          selectedTopicId = result.topicId
        }
        break
      }

      case 'update_topic': {
        if (operation.title !== undefined) {
          nextDocument = renameTopic(nextDocument, operation.topicId, operation.title)
        }

        if (operation.note !== undefined) {
          nextDocument = updateTopicNote(nextDocument, operation.topicId, operation.note)
        }

        selectedTopicId = operation.topicId
        break
      }
    }
  })

  return {
    document: nextDocument,
    selectedTopicId,
  }
}
