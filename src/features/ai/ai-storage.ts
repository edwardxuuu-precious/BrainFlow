import type { AiConversation, AiSessionSummary } from '../../../shared/ai-contract'
import { workspaceStorageService } from '../storage/services/workspace-storage-service'

const repository = workspaceStorageService.conversationRepository

export function getConversationStorageKey(documentId: string, sessionId: string): string {
  return repository.getConversationStorageKey(documentId, sessionId)
}

export function createEmptyConversation(
  documentId: string,
  documentTitle: string,
  sessionId?: string,
): AiConversation {
  return repository.createEmptyConversation(documentId, documentTitle, sessionId)
}

export function getAiConversation(
  documentId: string,
  sessionId: string,
): Promise<AiConversation | null> {
  return repository.getSession(documentId, sessionId)
}

export function listAiSessions(
  documentId: string,
  options?: { includeArchived?: boolean },
): Promise<AiSessionSummary[]> {
  return repository.listSessions(documentId, options)
}

export function listArchivedAiSessions(): Promise<AiSessionSummary[]> {
  return repository.listArchivedSessions()
}

export function saveAiConversation(conversation: AiConversation): Promise<void> {
  return repository.saveSession(conversation)
}

export function archiveAiConversation(
  documentId: string,
  sessionId: string,
): Promise<AiConversation | null> {
  return repository.archiveSession(documentId, sessionId)
}

export function restoreAiConversation(
  documentId: string,
  sessionId: string,
): Promise<AiConversation | null> {
  return repository.restoreSession(documentId, sessionId)
}

export function deleteAiConversation(documentId: string, sessionId: string): Promise<void> {
  return repository.deleteSession(documentId, sessionId)
}
