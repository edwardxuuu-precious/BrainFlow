import type {
  AiApplySummary,
  AiCanvasOperation,
  AiCanvasProposal,
  AiCanvasTarget,
  AiSkippedOperation,
} from '../../../shared/ai-contract'
import { sanitizeAiWritableMetadataPatch } from '../../../shared/ai-metadata-patch'
import {
  applyTopicMetadataPatch,
  applyTopicStylePatch,
  createDefaultTopicMetadata,
  createDefaultTopicStyle,
  normalizeTopicMetadata,
  normalizeTopicStyle,
} from '../documents/topic-defaults'
import { createTopicRichTextFromPlainText, normalizeTopicRichText } from '../documents/topic-rich-text'
import type { MindMapDocument, TopicNode } from '../documents/types'

export interface AiProposalApplyResult {
  document: MindMapDocument
  selectedTopicId: string | null
  appliedSummary: string
  warnings: string[]
  appliedCount: number
  skippedCount: number
  skippedOperations: AiSkippedOperation[]
}

export interface AiProposalApplyProgress {
  processedCount: number
  totalOperations: number
  currentOperation: AiCanvasOperation
  currentLabel: string
  batchIndex: number
  batchCount: number
}

interface ApplyAiProposalAsyncOptions {
  batchSize?: number
  onProgress?: (progress: AiProposalApplyProgress) => void
  yieldAfterBatch?: () => Promise<void>
}

interface ProposalExecutionState {
  document: MindMapDocument
  tempRefs: Map<string, string>
  selectedTopicId: string | null
  appliedCount: number
  skippedOperations: AiSkippedOperation[]
}

function cloneDocument(doc: MindMapDocument): MindMapDocument {
  return structuredClone(doc)
}

function touchDocument(doc: MindMapDocument): MindMapDocument {
  doc.updatedAt = Date.now()
  return doc
}

function createTopicId(): string {
  return `topic_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function createTopic(parentId: string): TopicNode {
  return {
    id: createTopicId(),
    parentId,
    childIds: [],
    title: 'New topic',
    note: '',
    noteRich: null,
    aiLocked: false,
    isCollapsed: false,
    branchSide: 'auto',
    layout: {
      offsetX: 0,
      offsetY: 0,
      semanticGroupKey: null,
      priority: null,
    },
    metadata: createDefaultTopicMetadata(),
    style: createDefaultTopicStyle(),
  }
}

function normalizeTitle(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed || 'New topic'
}

function normalizeRef(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed || undefined
}

function hasMetadataPatch(operation: Extract<AiCanvasOperation, { metadata?: unknown }>): boolean {
  return sanitizeAiWritableMetadataPatch(operation.metadata) !== undefined
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
): void {
  execution.skippedOperations.push({
    index,
    type: operation.type,
    reason,
  })
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
  const parts = [`${proposal.summary}`.trim() || `Applied ${appliedCount} changes`]

  if (appliedCount > 0) {
    parts.push(`Applied ${appliedCount}`)
  }

  if (skippedCount > 0) {
    parts.push(`Skipped ${skippedCount}`)
  }

  return parts.join(' | ')
}

function createExecution(document: MindMapDocument): ProposalExecutionState {
  return {
    document: cloneDocument(document),
    tempRefs: new Map<string, string>(),
    selectedTopicId: null,
    appliedCount: 0,
    skippedOperations: [],
  }
}

function renameTopicInPlace(document: MindMapDocument, topicId: string, title: string): void {
  const topic = document.topics[topicId]
  if (!topic) {
    return
  }

  topic.title = title.trim() || 'New topic'
}

function updateTopicNoteInPlace(document: MindMapDocument, topicId: string, note: string): void {
  const topic = document.topics[topicId]
  if (!topic) {
    return
  }

  const nextNoteRich = createTopicRichTextFromPlainText(note)
  if (
    topic.note === note &&
    JSON.stringify(normalizeTopicRichText(topic.noteRich)) === JSON.stringify(nextNoteRich)
  ) {
    return
  }

  topic.note = note
  topic.noteRich = nextNoteRich
}

function updateTopicMetadataInPlace(
  document: MindMapDocument,
  topicId: string,
  patch: NonNullable<Extract<AiCanvasOperation, { metadata?: unknown }>['metadata']>,
): void {
  const topic = document.topics[topicId]
  if (!topic) {
    return
  }

  const sanitizedPatch = sanitizeAiWritableMetadataPatch(patch)
  if (!sanitizedPatch) {
    return
  }

  topic.metadata = applyTopicMetadataPatch(normalizeTopicMetadata(topic.metadata), sanitizedPatch)
}

function updateTopicStyleInPlace(
  document: MindMapDocument,
  topicId: string,
  patch: NonNullable<Extract<AiCanvasOperation, { style?: unknown }>['style']>,
): void {
  const topic = document.topics[topicId]
  if (!topic) {
    return
  }

  topic.style = applyTopicStylePatch(normalizeTopicStyle(topic.style), patch)
}

function applyTopicPresentationInPlace(
  document: MindMapDocument,
  topicId: string,
  presentation: NonNullable<Extract<AiCanvasOperation, { presentation?: unknown }>['presentation']>,
  options?: { isNewTopic?: boolean },
): void {
  const topic = document.topics[topicId]
  if (!topic) {
    return
  }

  topic.layout = {
    offsetX: topic.layout?.offsetX ?? 0,
    offsetY: topic.layout?.offsetY ?? 0,
    semanticGroupKey:
      'groupKey' in presentation ? presentation.groupKey ?? null : topic.layout?.semanticGroupKey ?? null,
    priority:
      'priority' in presentation ? presentation.priority ?? null : topic.layout?.priority ?? null,
  }

  if (options?.isNewTopic && presentation.collapsedByDefault && topic.childIds.length > 0) {
    topic.isCollapsed = true
  }
}

function createChildInPlace(document: MindMapDocument, parentId: string): string | null {
  const parent = document.topics[parentId]
  if (!parent) {
    return null
  }

  const topic = createTopic(parentId)
  parent.childIds.push(topic.id)
  parent.isCollapsed = false
  document.topics[topic.id] = topic
  return topic.id
}

function createSiblingInPlace(document: MindMapDocument, topicId: string): string | null {
  const current = document.topics[topicId]
  if (!current?.parentId) {
    return null
  }

  const parent = document.topics[current.parentId]
  if (!parent) {
    return null
  }

  const currentIndex = parent.childIds.indexOf(topicId)
  const topic = createTopic(parent.id)
  parent.childIds.splice(currentIndex + 1, 0, topic.id)
  document.topics[topic.id] = topic
  return topic.id
}

function isDescendant(document: MindMapDocument, candidateId: string, ancestorId: string): boolean {
  let cursor = document.topics[candidateId]

  while (cursor?.parentId) {
    if (cursor.parentId === ancestorId) {
      return true
    }
    cursor = document.topics[cursor.parentId]
  }

  return false
}

function moveTopicInPlace(
  document: MindMapDocument,
  topicId: string,
  targetParentId: string,
  targetIndex: number,
): boolean {
  const topic = document.topics[topicId]
  const targetParent = document.topics[targetParentId]

  if (!topic || !targetParent || !topic.parentId || topicId === document.rootTopicId) {
    return false
  }

  if (targetParentId === topicId || isDescendant(document, targetParentId, topicId)) {
    return false
  }

  const previousParent = document.topics[topic.parentId]
  if (!previousParent) {
    return false
  }

  previousParent.childIds = previousParent.childIds.filter((childId) => childId !== topicId)

  const clampedIndex = Math.max(0, Math.min(targetIndex, targetParent.childIds.length))
  targetParent.childIds.splice(clampedIndex, 0, topicId)
  targetParent.isCollapsed = false
  topic.parentId = targetParentId

  if (targetParentId !== document.rootTopicId) {
    topic.branchSide = 'auto'
  }

  return true
}

function removeTopicInPlace(document: MindMapDocument, topicId: string): boolean {
  const topic = document.topics[topicId]
  if (!topic || topicId === document.rootTopicId || !topic.parentId) {
    return false
  }

  const parent = document.topics[topic.parentId]
  if (!parent) {
    return false
  }

  parent.childIds = parent.childIds.filter((childId) => childId !== topicId)

  const queue = [topicId]
  while (queue.length > 0) {
    const currentId = queue.shift()
    if (!currentId) {
      continue
    }

    const current = document.topics[currentId]
    if (!current) {
      continue
    }

    queue.push(...current.childIds)
    delete document.topics[currentId]
  }

  return true
}

function describeOperation(operation: AiCanvasOperation): string {
  switch (operation.type) {
    case 'create_child':
      return `Create child "${operation.title}"`
    case 'create_sibling':
      return `Create sibling "${operation.title}"`
    case 'update_topic':
      return operation.title ? `Update topic "${operation.title}"` : 'Update topic'
    case 'move_topic':
      return 'Move topic'
    case 'delete_topic':
      return 'Delete topic'
    default:
      return 'Apply change'
  }
}

function applyOperation(
  execution: ProposalExecutionState,
  operation: AiCanvasOperation,
  index: number,
): void {
  switch (operation.type) {
    case 'create_child': {
      const parentId = resolveTargetId(execution.document, execution.tempRefs, operation.parent)
      if (!parentId) {
        createSkip(execution, index, operation, `Parent topic does not exist: ${operation.parent}`)
        return
      }

      const topicId = createChildInPlace(execution.document, parentId)
      if (!topicId) {
        createSkip(execution, index, operation, `Cannot create a child under topic ${parentId}`)
        return
      }

      renameTopicInPlace(execution.document, topicId, normalizeTitle(operation.title) ?? 'New topic')
      if (operation.note !== undefined) {
        updateTopicNoteInPlace(execution.document, topicId, operation.note)
      }
      if (hasMetadataPatch(operation)) {
        updateTopicMetadataInPlace(execution.document, topicId, operation.metadata ?? {})
      }
      if (hasStylePatch(operation)) {
        updateTopicStyleInPlace(execution.document, topicId, operation.style ?? {})
      }
      if (operation.presentation) {
        applyTopicPresentationInPlace(execution.document, topicId, operation.presentation, {
          isNewTopic: true,
        })
      }

      registerResultRef(execution, operation.resultRef, topicId)
      execution.selectedTopicId = topicId
      execution.appliedCount += 1
      return
    }

    case 'create_sibling': {
      const anchorId = resolveTargetId(execution.document, execution.tempRefs, operation.anchor)
      if (!anchorId) {
        createSkip(execution, index, operation, `Sibling anchor does not exist: ${operation.anchor}`)
        return
      }

      const anchor = execution.document.topics[anchorId]
      if (!anchor?.parentId) {
        createSkip(execution, index, operation, 'Cannot create a sibling for the root topic')
        return
      }

      const topicId = createSiblingInPlace(execution.document, anchorId)
      if (!topicId) {
        createSkip(execution, index, operation, `Cannot create a sibling next to topic ${anchorId}`)
        return
      }

      renameTopicInPlace(execution.document, topicId, normalizeTitle(operation.title) ?? 'New topic')
      if (operation.note !== undefined) {
        updateTopicNoteInPlace(execution.document, topicId, operation.note)
      }
      if (hasMetadataPatch(operation)) {
        updateTopicMetadataInPlace(execution.document, topicId, operation.metadata ?? {})
      }
      if (hasStylePatch(operation)) {
        updateTopicStyleInPlace(execution.document, topicId, operation.style ?? {})
      }
      if (operation.presentation) {
        applyTopicPresentationInPlace(execution.document, topicId, operation.presentation, {
          isNewTopic: true,
        })
      }

      registerResultRef(execution, operation.resultRef, topicId)
      execution.selectedTopicId = topicId
      execution.appliedCount += 1
      return
    }

    case 'update_topic': {
      const targetId = resolveTargetId(execution.document, execution.tempRefs, operation.target)
      if (!targetId) {
        createSkip(execution, index, operation, `Update target does not exist: ${operation.target}`)
        return
      }

      if (isLocked(execution.document, targetId)) {
        createSkip(execution, index, operation, `Topic is locked and cannot be updated: ${execution.document.topics[targetId].title}`)
        return
      }

      const title = normalizeTitle(operation.title)
      if (
        title === undefined &&
        operation.note === undefined &&
        !hasMetadataPatch(operation) &&
        !hasStylePatch(operation)
      ) {
        createSkip(execution, index, operation, 'update_topic requires at least one patch field')
        return
      }

      if (title !== undefined) {
        renameTopicInPlace(execution.document, targetId, title)
      }
      if (operation.note !== undefined) {
        updateTopicNoteInPlace(execution.document, targetId, operation.note)
      }
      if (hasMetadataPatch(operation)) {
        updateTopicMetadataInPlace(execution.document, targetId, operation.metadata ?? {})
      }
      if (hasStylePatch(operation)) {
        updateTopicStyleInPlace(execution.document, targetId, operation.style ?? {})
      }
      if (operation.presentation) {
        applyTopicPresentationInPlace(execution.document, targetId, operation.presentation)
      }

      execution.selectedTopicId = targetId
      execution.appliedCount += 1
      return
    }

    case 'move_topic': {
      const targetId = resolveTargetId(execution.document, execution.tempRefs, operation.target)
      const parentId = resolveTargetId(execution.document, execution.tempRefs, operation.newParent)

      if (!targetId) {
        createSkip(execution, index, operation, `Move target does not exist: ${operation.target}`)
        return
      }

      if (!parentId) {
        createSkip(execution, index, operation, `Destination parent does not exist: ${operation.newParent}`)
        return
      }

      if (targetId === execution.document.rootTopicId) {
        createSkip(execution, index, operation, 'The root topic cannot be moved')
        return
      }

      if (isLocked(execution.document, targetId)) {
        createSkip(execution, index, operation, `Topic is locked and cannot be moved: ${execution.document.topics[targetId].title}`)
        return
      }

      if (isLocked(execution.document, parentId)) {
        createSkip(execution, index, operation, `Destination parent is locked: ${execution.document.topics[parentId].title}`)
        return
      }

      const moved = moveTopicInPlace(
        execution.document,
        targetId,
        parentId,
        operation.targetIndex ?? execution.document.topics[parentId].childIds.length,
      )
      if (!moved) {
        createSkip(execution, index, operation, 'Move request is invalid for the current tree')
        return
      }

      execution.selectedTopicId = targetId
      execution.appliedCount += 1
      return
    }

    case 'delete_topic': {
      const targetId = resolveTargetId(execution.document, execution.tempRefs, operation.target)
      if (!targetId) {
        createSkip(execution, index, operation, `Delete target does not exist: ${operation.target}`)
        return
      }

      if (targetId === execution.document.rootTopicId) {
        createSkip(execution, index, operation, 'The root topic cannot be deleted')
        return
      }

      if (isLocked(execution.document, targetId)) {
        createSkip(execution, index, operation, `Topic is locked and cannot be deleted: ${execution.document.topics[targetId].title}`)
        return
      }

      const fallbackTopicId =
        execution.document.topics[targetId]?.parentId ?? execution.document.rootTopicId
      const removed = removeTopicInPlace(execution.document, targetId)
      if (!removed) {
        createSkip(execution, index, operation, 'Delete request is invalid for the current tree')
        return
      }

      execution.selectedTopicId = fallbackTopicId
      execution.appliedCount += 1
    }
  }
}

function finalizeExecution(
  proposal: AiCanvasProposal,
  execution: ProposalExecutionState,
): AiProposalApplyResult {
  if (execution.appliedCount === 0) {
    const firstReason = execution.skippedOperations[0]?.reason ?? 'The proposal had no executable changes.'
    throw new Error(firstReason)
  }

  const nextDocument = touchDocument(execution.document)
  const applySummary: AiApplySummary = {
    summary: createApplySummary(
      proposal,
      execution.appliedCount,
      execution.skippedOperations.length,
    ),
    appliedCount: execution.appliedCount,
    skippedCount: execution.skippedOperations.length,
    warnings: execution.skippedOperations.map((item) => item.reason),
  }

  return {
    document: nextDocument,
    selectedTopicId: execution.selectedTopicId,
    appliedSummary: applySummary.summary,
    warnings: applySummary.warnings,
    appliedCount: applySummary.appliedCount,
    skippedCount: applySummary.skippedCount,
    skippedOperations: execution.skippedOperations,
  }
}

async function defaultYieldAfterBatch(): Promise<void> {
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve())
    })
    return
  }

  await Promise.resolve()
}

export function validateAiProposal(
  document: MindMapDocument,
  proposal: AiCanvasProposal | null | undefined,
): AiCanvasProposal {
  if (!proposal) {
    throw new Error('No AI proposal is available to apply.')
  }

  if (proposal.baseDocumentUpdatedAt !== document.updatedAt) {
    throw new Error('The document changed after the AI proposal was generated.')
  }

  if (!Array.isArray(proposal.operations) || proposal.operations.length === 0) {
    throw new Error('The AI proposal does not contain any executable operations.')
  }

  return proposal
}

export function applyAiProposal(
  document: MindMapDocument,
  proposal: AiCanvasProposal,
): AiProposalApplyResult {
  const normalizedProposal = validateAiProposal(document, proposal)
  const execution = createExecution(document)

  normalizedProposal.operations.forEach((operation, index) => {
    applyOperation(execution, operation, index)
  })

  return finalizeExecution(normalizedProposal, execution)
}

export async function applyAiProposalAsync(
  document: MindMapDocument,
  proposal: AiCanvasProposal,
  options?: ApplyAiProposalAsyncOptions,
): Promise<AiProposalApplyResult> {
  const normalizedProposal = validateAiProposal(document, proposal)
  const execution = createExecution(document)
  const totalOperations = normalizedProposal.operations.length
  const batchSize = Math.max(1, options?.batchSize ?? 25)
  const batchCount = Math.max(1, Math.ceil(totalOperations / batchSize))

  for (let index = 0; index < normalizedProposal.operations.length; index += 1) {
    const operation = normalizedProposal.operations[index]
    applyOperation(execution, operation, index)

    options?.onProgress?.({
      processedCount: index + 1,
      totalOperations,
      currentOperation: operation,
      currentLabel: describeOperation(operation),
      batchIndex: Math.floor(index / batchSize) + 1,
      batchCount,
    })

    if ((index + 1) % batchSize === 0 && index < normalizedProposal.operations.length - 1) {
      await (options?.yieldAfterBatch ?? defaultYieldAfterBatch)()
    }
  }

  return finalizeExecution(normalizedProposal, execution)
}
