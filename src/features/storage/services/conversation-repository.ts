import type { AiConversation, AiSessionSummary } from '../../../../shared/ai-contract'
import { cloudSyncOrchestrator } from '../sync/cloud-sync-orchestrator'

function createSessionId(): string {
  return `session_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function deriveConversationTitle(messages: AiConversation['messages']): string {
  const firstUserMessage = messages.find((message) => message.role === 'user')?.content?.trim()
  if (!firstUserMessage) {
    return '新对话'
  }

  return firstUserMessage.length > 16
    ? `${firstUserMessage.slice(0, 16).trimEnd()}...`
    : firstUserMessage
}

function toSessionSummary(conversation: AiConversation): AiSessionSummary {
  return {
    id: conversation.id ?? conversation.sessionId,
    documentId: conversation.documentId,
    documentTitle: conversation.documentTitle,
    sessionId: conversation.sessionId,
    title: conversation.title,
    updatedAt: conversation.updatedAt,
    archivedAt: conversation.archivedAt,
  }
}

export class ConversationRepository {
  createEmptyConversation(
    documentId: string,
    documentTitle: string,
    sessionId = createSessionId(),
  ): AiConversation {
    return {
      id: sessionId,
      documentId,
      documentTitle,
      sessionId,
      title: '新对话',
      messages: [],
      updatedAt: Date.now(),
      archivedAt: null,
    }
  }

  getConversationStorageKey(documentId: string, sessionId: string): string {
    return `${documentId}:${sessionId}`
  }

  getSession(documentId: string, sessionId: string): Promise<AiConversation | null> {
    return cloudSyncOrchestrator.getConversation(documentId, sessionId)
  }

  async listSessions(
    documentId: string,
    options?: { includeArchived?: boolean },
  ): Promise<AiSessionSummary[]> {
    const sessions = await cloudSyncOrchestrator.listConversations(documentId)
    return sessions
      .filter((session) => options?.includeArchived || session.archivedAt === null)
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map(toSessionSummary)
  }

  async listArchivedSessions(): Promise<AiSessionSummary[]> {
    const sessions = await cloudSyncOrchestrator.listConversations()
    return sessions
      .filter((session) => session.archivedAt !== null)
      .sort((left, right) => (right.archivedAt ?? 0) - (left.archivedAt ?? 0))
      .map(toSessionSummary)
  }

  async saveSession(session: AiConversation): Promise<void> {
    const normalized: AiConversation = {
      ...session,
      id: session.id ?? session.sessionId,
      title: session.title?.trim() || deriveConversationTitle(session.messages),
      updatedAt: typeof session.updatedAt === 'number' ? session.updatedAt : Date.now(),
      archivedAt: typeof session.archivedAt === 'number' ? session.archivedAt : null,
    }

    await cloudSyncOrchestrator.saveConversation(normalized)
  }

  async archiveSession(documentId: string, sessionId: string): Promise<AiConversation | null> {
    const current = await this.getSession(documentId, sessionId)
    if (!current) {
      return null
    }

    const nextConversation: AiConversation = {
      ...current,
      archivedAt: Date.now(),
      updatedAt: Date.now(),
    }
    await this.saveSession(nextConversation)
    return nextConversation
  }

  async restoreSession(documentId: string, sessionId: string): Promise<AiConversation | null> {
    const current = await this.getSession(documentId, sessionId)
    if (!current) {
      return null
    }

    const nextConversation: AiConversation = {
      ...current,
      archivedAt: null,
      updatedAt: Date.now(),
    }
    await this.saveSession(nextConversation)
    return nextConversation
  }

  deleteSession(documentId: string, sessionId: string): Promise<void> {
    return cloudSyncOrchestrator.deleteConversation(documentId, sessionId)
  }

  listAllSessions(options?: { includeArchived?: boolean }): Promise<AiConversation[]> {
    return cloudSyncOrchestrator.listConversations().then((sessions) =>
      options?.includeArchived ? sessions : sessions.filter((session) => session.archivedAt === null),
    )
  }
}
