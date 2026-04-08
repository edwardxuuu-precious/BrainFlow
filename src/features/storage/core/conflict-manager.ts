import type { AiConversation } from '../../../../shared/ai-contract'
import type { MindMapDocument } from '../../documents/types'
import type { SyncConflict, SyncResourceType } from './sync-types'

interface CreateConflictInput {
  resourceType: SyncResourceType
  documentId: string
  sessionId: string | null
  localUpdatedAt: number | null
  targetUpdatedAt: number | null
  localHash: string | null
  targetHash: string | null
  localDocument?: MindMapDocument
  targetDocument?: MindMapDocument
  localConversation?: AiConversation
  targetConversation?: AiConversation
}

export function buildResourceId(
  resourceType: SyncResourceType,
  documentId: string,
  sessionId: string | null,
): string {
  return resourceType === 'document' ? documentId : `${documentId}:${sessionId ?? 'unknown'}`
}

export function createSyncConflict(input: CreateConflictInput): SyncConflict {
  const resourceId = buildResourceId(input.resourceType, input.documentId, input.sessionId)
  const suggestedWinner =
    (input.targetUpdatedAt ?? 0) > (input.localUpdatedAt ?? 0) ? 'target' : 'local'

  return {
    id: `conflict:${input.resourceType}:${resourceId}`,
    resourceType: input.resourceType,
    resourceId,
    documentId: input.documentId,
    sessionId: input.sessionId,
    localUpdatedAt: input.localUpdatedAt,
    targetUpdatedAt: input.targetUpdatedAt,
    localHash: input.localHash,
    targetHash: input.targetHash,
    suggestedWinner,
    detectedAt: Date.now(),
    localDocument: input.localDocument,
    targetDocument: input.targetDocument,
    localConversation: input.localConversation,
    targetConversation: input.targetConversation,
  }
}
