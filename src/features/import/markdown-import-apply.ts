import type {
  AiCanvasOperation,
  AiCanvasProposal,
  MarkdownImportResponse,
} from '../../../shared/ai-contract'

function stripImportOperationMetadata(
  operation: MarkdownImportResponse['operations'][number],
): AiCanvasOperation {
  const { id: _id, risk: _risk, conflictId: _conflictId, reason: _reason, ...canvasOperation } =
    operation
  return canvasOperation
}

export function createProposalFromImportPreview(
  response: MarkdownImportResponse,
  approvedConflictIds: Iterable<string>,
): AiCanvasProposal {
  const approved = new Set(approvedConflictIds)
  const operations = response.operations
    .filter((operation) => operation.risk === 'low' || (operation.conflictId && approved.has(operation.conflictId)))
    .map(stripImportOperationMetadata)

  return {
    id: `import_preview_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    summary: response.summary,
    baseDocumentUpdatedAt: response.baseDocumentUpdatedAt,
    operations,
  }
}

export function getInitialApprovedConflictIds(response: MarkdownImportResponse): string[] {
  return response.operations
    .filter((operation) => operation.risk === 'low' && operation.conflictId)
    .map((operation) => operation.conflictId as string)
}
