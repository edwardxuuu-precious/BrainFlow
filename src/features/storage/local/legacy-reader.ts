import type { AiConversation } from '../../../../shared/ai-contract'
import type { MindMapDocument } from '../../documents/types'
import { documentService as legacyDocumentService } from '../adapters/indexeddb/legacy-document-local-service'
import { getAllConversations as getAllLegacyConversations } from '../adapters/indexeddb/legacy-ai-local-storage'

export interface LegacyWorkspaceSnapshot {
  documents: MindMapDocument[]
  conversations: AiConversation[]
  sourceOrigin: string
  sourceSchemaVersion: string
}

export interface LegacyWorkspaceSnapshotSummary {
  documentCount: number
  conversationCount: number
  hasLegacyData: boolean
  sourceOrigin: string
  sourceSchemaVersion: string
}

export async function readLegacyWorkspaceSnapshotSummary(): Promise<LegacyWorkspaceSnapshotSummary> {
  const [summaries, conversations] = await Promise.all([
    legacyDocumentService.listDocuments(),
    getAllLegacyConversations(),
  ])

  return {
    documentCount: summaries.length,
    conversationCount: conversations.length,
    hasLegacyData: summaries.length > 0 || conversations.length > 0,
    sourceOrigin: typeof window !== 'undefined' ? window.location.origin : 'unknown-origin',
    sourceSchemaVersion: 'legacy-local-v1',
  }
}

export async function readLegacyWorkspaceSnapshot(): Promise<LegacyWorkspaceSnapshot> {
  const [summaries, conversations] = await Promise.all([
    legacyDocumentService.listDocuments(),
    getAllLegacyConversations(),
  ])
  const documents = await Promise.all(
    summaries.map((summary) => legacyDocumentService.getDocument(summary.id)),
  )

  return {
    documents: documents.filter((document): document is MindMapDocument => document !== null),
    conversations,
    sourceOrigin: typeof window !== 'undefined' ? window.location.origin : 'unknown-origin',
    sourceSchemaVersion: 'legacy-local-v1',
  }
}
