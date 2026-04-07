import type {
  AiCanvasOperation,
  AiCanvasProposal,
  TextImportResponse,
} from '../../../shared/ai-contract'
import { compileTextImportPreviewNodesToOperations } from '../../../shared/text-import-semantics'
import {
  applyAiProposalAsync,
  type AiProposalApplyProgress,
  type AiProposalApplyResult,
} from '../ai/ai-proposal'
import type { MindMapDocument, TopicNode } from '../documents/types'

function stripImportOperationMetadata(
  operation: TextImportResponse['operations'][number],
): AiCanvasOperation {
  const { id: _id, risk: _risk, conflictId: _conflictId, reason: _reason, ...canvasOperation } =
    operation
  return canvasOperation
}

export function createProposalFromTextImportPreview(
  response: TextImportResponse,
  approvedConflictIds: Iterable<string>,
  options?: {
    baseDocumentUpdatedAt?: number
  },
): AiCanvasProposal {
  const approved = new Set(approvedConflictIds)
  const operations = response.operations
    .filter(
      (operation) =>
        operation.risk === 'low' || (operation.conflictId && approved.has(operation.conflictId)),
    )
    .map(stripImportOperationMetadata)

  return {
    id: `import_preview_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    summary: response.summary,
    baseDocumentUpdatedAt: options?.baseDocumentUpdatedAt ?? response.baseDocumentUpdatedAt,
    operations,
  }
}

export function getInitialApprovedConflictIds(response: TextImportResponse): string[] {
  return response.operations
    .filter((operation) => operation.risk === 'low' && operation.conflictId)
    .map((operation) => operation.conflictId as string)
}

function isRebaseSafeImportOperation(operation: TextImportResponse['operations'][number]): boolean {
  return operation.type === 'create_child' || operation.type === 'update_topic'
}

function createTopicFingerprint(topic: TopicNode): string {
  return JSON.stringify({
    title: topic.title,
    note: topic.note,
    parentId: topic.parentId,
    metadata: topic.metadata,
    style: topic.style,
  })
}

function resolveExistingTopicTargetId(target: string): string | null {
  return target.startsWith('topic:') ? target.slice('topic:'.length) : null
}

function buildStructuralOperationsFromPreview(
  insertionParentTopicId: string,
  response: TextImportResponse,
): TextImportResponse['operations'] {
  return compileTextImportPreviewNodesToOperations({
    insertionParentTopicId,
    previewNodes: response.previewNodes,
  })
}

export async function applyTextImportPreview(
  document: MindMapDocument,
  response: TextImportResponse,
  approvedConflictIds: Iterable<string>,
  options?: {
    onProgress?: (progress: AiProposalApplyProgress) => void
    batchSize?: number
  },
): Promise<AiProposalApplyResult> {
  const approved = new Set(approvedConflictIds)
  const warnings: string[] = []
  const insertionParentTopicId =
    response.anchorTopicId && document.topics[response.anchorTopicId]
      ? response.anchorTopicId
      : document.rootTopicId

  if (response.anchorTopicId && insertionParentTopicId !== response.anchorTopicId) {
    warnings.push('The original import anchor is missing. Applied the import at the document root instead.')
  }

  const structuralOperations = buildStructuralOperationsFromPreview(
    insertionParentTopicId,
    response,
  )
  const rebaseableOperations = response.operations.filter((operation) => {
    if (!(operation.risk === 'low' || (operation.conflictId && approved.has(operation.conflictId)))) {
      return false
    }

    if (operation.type !== 'update_topic') {
      return true
    }

    const targetTopicId =
      typeof operation.target === 'string' ? resolveExistingTopicTargetId(operation.target) : null
    if (!targetTopicId) {
      return true
    }

    if (!operation.targetFingerprint) {
      return false
    }

    if (!document.topics[targetTopicId]) {
      warnings.push(`Skipped semantic merge for missing topic target ${String(operation.target)}.`)
      return false
    }

    const currentFingerprint = createTopicFingerprint(document.topics[targetTopicId])
    if (currentFingerprint !== operation.targetFingerprint) {
      warnings.push(
        `Skipped semantic merge for "${document.topics[targetTopicId].title}" because the topic changed after preview generation.`,
      )
      return false
    }

    return true
  })

  const proposal = createProposalFromTextImportPreview(
    {
      ...response,
      operations: [
        ...structuralOperations,
        ...rebaseableOperations.filter((operation) => operation.type !== 'create_child'),
      ],
    },
    approvedConflictIds,
  )
  const hasUnsafeOperation = response.operations.some(
    (operation) =>
      (operation.risk === 'low' || (operation.conflictId && approved.has(operation.conflictId))) &&
      !isRebaseSafeImportOperation(operation),
  )

  if (hasUnsafeOperation) {
    const result = await applyAiProposalAsync(document, proposal, {
      onProgress: options?.onProgress,
      batchSize: options?.batchSize,
    })
    return {
      ...result,
      warnings: [...result.warnings, ...warnings],
    }
  }

  const result = await applyAiProposalAsync(document, {
    ...proposal,
    baseDocumentUpdatedAt: document.updatedAt,
  }, {
    onProgress: options?.onProgress,
    batchSize: options?.batchSize,
  })
  return {
    ...result,
    warnings: [...result.warnings, ...warnings],
  }
}
