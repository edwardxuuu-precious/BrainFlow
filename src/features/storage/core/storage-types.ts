import type { AiConversation } from '../../../../shared/ai-contract'
import type { DocumentSummary, MindMapDocument } from '../../documents/types'

export interface DocumentStorageAdapter {
  listDocuments(): Promise<MindMapDocument[]>
  getDocument(id: string): Promise<MindMapDocument | null>
  saveDocument(doc: MindMapDocument): Promise<void>
  deleteDocument(id: string): Promise<void>
}

export interface ConversationStorageAdapter {
  listSessions(
    documentId?: string,
    options?: { includeArchived?: boolean },
  ): Promise<AiConversation[]>
  getSession(documentId: string, sessionId: string): Promise<AiConversation | null>
  saveSession(session: AiConversation): Promise<void>
  deleteSession(documentId: string, sessionId: string): Promise<void>
}

export interface LocalIndexAdapter {
  loadDocumentIndex(): Promise<DocumentSummary[]>
  saveDocumentIndex(index: DocumentSummary[]): Promise<void>
  getRecentDocumentId(): Promise<string | null>
  setRecentDocumentId(id: string | null): Promise<void>
  rebuildFromDocuments(documents: MindMapDocument[]): Promise<DocumentSummary[]>
}

