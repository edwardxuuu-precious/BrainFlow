import type {
  AiApplySummary,
  AiCanvasOperation,
  AiCanvasProposal,
  AiCanvasTarget,
  AiSkippedOperation,
} from '../../../shared/ai-contract'
import type { MindMapDocument } from '../documents/types'
import {
  addChild,
  addSibling,
  moveTopic,
  removeTopic,
  renameTopic,
  updateTopicMetadata,
  updateTopicNote,
  updateTopicStyle,
} from '../editor/tree-operations'

export interface AiProposalApplyResult {
  document: MindMapDocument
  selectedTopicId: string | null
  appliedSummary: string
  warnings: string[]
  appliedCount: number
  skippedCount: number
  skippedOperations: AiSkippedOperation[]
}

interface ProposalExecutionState {
  document: MindMapDocument
  tempRefs: Map<string, string>
  selectedTopicId: string | null
  appliedCount: number
  skippedOperations: AiSkippedOperation[]
}

function normalizeTitle(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed || '新主题'
}

function normalizeRef(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed || undefined
}

function hasMetadataPatch(operation: Extract<AiCanvasOperation, { metadata?: unknown }>): boolean {
  return operation.metadata !== undefined
}

function hasStylePatch(operation: Extract<AiCanvasOperation, { style?: unknown }>): boolean {
  return operation.style !== undefined
}

function isLocked(document: MindMapDocument, topicId: string): boolean {
  return document.topics[topicId]?.aiLocked === true
}

function createSkip(
  execution: ProposalExecutionState,
  index: number,
  operation: AiCanvasOperation,
  reason: string,
): ProposalExecutionState {
  execution.skippedOperations.push({
    index,
    type: operation.type,
    reason,
  })
  return execution
}

function resolveTargetId(
  document: MindMapDocument,
  tempRefs: Map<string, string>,
  target: AiCanvasTarget | string,
): string | null {
  const rawTarget = target.trim()

  if (rawTarget.startsWith('topic:')) {
    const topicId = rawTarget.slice('topic:'.length)
    return document.topics[topicId] ? topicId : null
  }

  if (rawTarget.startsWith('ref:')) {
    return tempRefs.get(rawTarget.slice('ref:'.length)) ?? null
  }

  if (document.topics[rawTarget]) {
    return rawTarget
  }

  return tempRefs.get(rawTarget) ?? null
}

function registerResultRef(
  execution: ProposalExecutionState,
  resultRef: string | undefined,
  topicId: string | undefined,
): void {
  const normalizedRef = normalizeRef(resultRef)
  if (!normalizedRef || !topicId) {
    return
  }

  execution.tempRefs.set(normalizedRef, topicId)
}

function createApplySummary(
  proposal: AiCanvasProposal,
  appliedCount: number,
  skippedCount: number,
): string {
  const parts = [`${proposal.summary}`.trim() || `已执行 ${appliedCount} 项改动`]

  if (appliedCount > 0) {
    parts.push(`已应用 ${appliedCount} 项`)
  }

  if (skippedCount > 0) {
    parts.push(`跳过 ${skippedCount} 项`)
  }

  return parts.join('，')
}

export function validateAiProposal(
  document: MindMapDocument,
  proposal: AiCanvasProposal | null | undefined,
): AiCanvasProposal {
  if (!proposal) {
    throw new Error('没有可应用的 AI 提案。')
  }

  if (proposal.baseDocumentUpdatedAt !== document.updatedAt) {
    throw new Error('当前脑图已发生变化，请重新生成 AI 改动。')
  }

  if (!Array.isArray(proposal.operations) || proposal.operations.length === 0) {
    throw new Error('AI 提案中没有可执行的操作。')
  }

  return proposal
}

export function applyAiProposal(
  document: MindMapDocument,
  proposal: AiCanvasProposal,
): AiProposalApplyResult {
  const normalizedProposal = validateAiProposal(document, proposal)
  const execution: ProposalExecutionState = {
    document,
    tempRefs: new Map<string, string>(),
    selectedTopicId: null,
    appliedCount: 0,
    skippedOperations: [],
  }

  normalizedProposal.operations.forEach((operation, index) => {
    switch (operation.type) {
      case 'create_child': {
        const parentId = resolveTargetId(execution.document, execution.tempRefs, operation.parent)
        if (!parentId) {
          createSkip(execution, index, operation, `提案中的父节点不存在: ${operation.parent}`)
          return
        }

        const result = addChild(execution.document, parentId)
        if (!result.topicId) {
          createSkip(execution, index, operation, `无法在节点 ${parentId} 下创建子节点`)
          return
        }

        execution.document = renameTopic(
          execution.document === result.document ? execution.document : result.document,
          result.topicId,
          normalizeTitle(operation.title) ?? '新主题',
        )
        if (operation.note !== undefined) {
          execution.document = updateTopicNote(execution.document, result.topicId, operation.note)
        }
        if (hasMetadataPatch(operation)) {
          execution.document = updateTopicMetadata(execution.document, result.topicId, operation.metadata ?? {})
        }
        if (hasStylePatch(operation)) {
          execution.document = updateTopicStyle(execution.document, result.topicId, operation.style ?? {})
        }
        registerResultRef(execution, operation.resultRef, result.topicId)
        execution.selectedTopicId = result.topicId
        execution.appliedCount += 1
        return
      }

      case 'create_sibling': {
        const anchorId = resolveTargetId(execution.document, execution.tempRefs, operation.anchor)
        if (!anchorId) {
          createSkip(execution, index, operation, `提案中的同级锚点不存在: ${operation.anchor}`)
          return
        }

        const anchor = execution.document.topics[anchorId]
        if (!anchor?.parentId) {
          createSkip(execution, index, operation, '中心主题不能直接创建同级节点')
          return
        }

        const result = addSibling(execution.document, anchorId)
        if (!result.topicId) {
          createSkip(execution, index, operation, `无法基于节点 ${anchorId} 创建同级节点`)
          return
        }

        execution.document = renameTopic(
          execution.document === result.document ? execution.document : result.document,
          result.topicId,
          normalizeTitle(operation.title) ?? '新主题',
        )
        if (operation.note !== undefined) {
          execution.document = updateTopicNote(execution.document, result.topicId, operation.note)
        }
        if (hasMetadataPatch(operation)) {
          execution.document = updateTopicMetadata(execution.document, result.topicId, operation.metadata ?? {})
        }
        if (hasStylePatch(operation)) {
          execution.document = updateTopicStyle(execution.document, result.topicId, operation.style ?? {})
        }
        registerResultRef(execution, operation.resultRef, result.topicId)
        execution.selectedTopicId = result.topicId
        execution.appliedCount += 1
        return
      }

      case 'update_topic': {
        const targetId = resolveTargetId(execution.document, execution.tempRefs, operation.target)
        if (!targetId) {
          createSkip(execution, index, operation, `提案中的更新节点不存在: ${operation.target}`)
          return
        }

        if (isLocked(execution.document, targetId)) {
          createSkip(execution, index, operation, `节点已锁定，AI 不能修改: ${execution.document.topics[targetId].title}`)
          return
        }

        const title = normalizeTitle(operation.title)
        if (
          title === undefined &&
          operation.note === undefined &&
          !hasMetadataPatch(operation) &&
          !hasStylePatch(operation)
        ) {
          createSkip(execution, index, operation, 'update_topic 至少需要 title、note、metadata 或 style')
          return
        }

        if (title !== undefined) {
          execution.document = renameTopic(execution.document, targetId, title)
        }
        if (operation.note !== undefined) {
          execution.document = updateTopicNote(execution.document, targetId, operation.note)
        }
        if (hasMetadataPatch(operation)) {
          execution.document = updateTopicMetadata(execution.document, targetId, operation.metadata ?? {})
        }
        if (hasStylePatch(operation)) {
          execution.document = updateTopicStyle(execution.document, targetId, operation.style ?? {})
        }

        execution.selectedTopicId = targetId
        execution.appliedCount += 1
        return
      }

      case 'move_topic': {
        const targetId = resolveTargetId(execution.document, execution.tempRefs, operation.target)
        const parentId = resolveTargetId(execution.document, execution.tempRefs, operation.newParent)

        if (!targetId) {
          createSkip(execution, index, operation, `提案中的移动节点不存在: ${operation.target}`)
          return
        }

        if (!parentId) {
          createSkip(execution, index, operation, `提案中的目标父节点不存在: ${operation.newParent}`)
          return
        }

        if (targetId === execution.document.rootTopicId) {
          createSkip(execution, index, operation, '中心主题不能被 AI 移动')
          return
        }

        if (isLocked(execution.document, targetId)) {
          createSkip(execution, index, operation, `节点已锁定，AI 不能移动: ${execution.document.topics[targetId].title}`)
          return
        }

        if (isLocked(execution.document, parentId)) {
          createSkip(execution, index, operation, `目标父节点已锁定，AI 不能重挂载到该节点下: ${execution.document.topics[parentId].title}`)
          return
        }

        execution.document = moveTopic(
          execution.document,
          targetId,
          parentId,
          operation.targetIndex ?? execution.document.topics[parentId].childIds.length,
        )
        execution.selectedTopicId = targetId
        execution.appliedCount += 1
        return
      }

      case 'delete_topic': {
        const targetId = resolveTargetId(execution.document, execution.tempRefs, operation.target)
        if (!targetId) {
          createSkip(execution, index, operation, `提案中的删除节点不存在: ${operation.target}`)
          return
        }

        if (targetId === execution.document.rootTopicId) {
          createSkip(execution, index, operation, '中心主题不能被 AI 删除')
          return
        }

        if (isLocked(execution.document, targetId)) {
          createSkip(execution, index, operation, `节点已锁定，AI 不能删除: ${execution.document.topics[targetId].title}`)
          return
        }

        const fallbackTopicId =
          execution.document.topics[targetId]?.parentId ?? execution.document.rootTopicId
        execution.document = removeTopic(execution.document, targetId)
        execution.selectedTopicId = fallbackTopicId
        execution.appliedCount += 1
        return
      }
    }
  })

  if (execution.appliedCount === 0) {
    const firstReason = execution.skippedOperations[0]?.reason ?? 'AI 提案没有可执行的改动。'
    throw new Error(firstReason)
  }

  const applySummary: AiApplySummary = {
    summary: createApplySummary(
      normalizedProposal,
      execution.appliedCount,
      execution.skippedOperations.length,
    ),
    appliedCount: execution.appliedCount,
    skippedCount: execution.skippedOperations.length,
    warnings: execution.skippedOperations.map((item) => item.reason),
  }

  return {
    document: execution.document,
    selectedTopicId: execution.selectedTopicId,
    appliedSummary: applySummary.summary,
    warnings: applySummary.warnings,
    appliedCount: applySummary.appliedCount,
    skippedCount: applySummary.skippedCount,
    skippedOperations: execution.skippedOperations,
  }
}
