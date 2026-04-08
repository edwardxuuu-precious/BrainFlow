import type { AiConversation } from '../../../../../shared/ai-contract'
import {
  deleteAiConversation as deleteLegacyConversation,
  getAiConversation as getLegacyConversation,
  getAllConversations as getAllLegacyConversations,
  listArchivedAiSessions as listArchivedLegacySessions,
  listAiSessions as listLegacySessions,
  saveAiConversation as saveLegacyConversation,
} from './legacy-ai-local-storage'
import type { ConversationStorageAdapter } from '../../core/storage-types'

export class IndexedDbConversationStorageAdapter implements ConversationStorageAdapter {
  async listSessions(
    documentId?: string,
    options?: { includeArchived?: boolean },
  ): Promise<AiConversation[]> {
    if (!documentId) {
      const sessions = await getAllLegacyConversations()
      if (options?.includeArchived) {
        return sessions
      }

      return sessions.filter((session) => session.archivedAt === null)
    }

    const summaries = options?.includeArchived
      ? [
          ...(await listLegacySessions(documentId, { includeArchived: true })),
          ...(await listArchivedLegacySessions()).filter((item) => item.documentId === documentId),
        ]
      : await listLegacySessions(documentId, options)

    const sessions = await Promise.all(
      summaries.map((summary) => getLegacyConversation(summary.documentId, summary.sessionId)),
    )
    return sessions.filter((session): session is AiConversation => session !== null)
  }

  getSession(documentId: string, sessionId: string): Promise<AiConversation | null> {
    return getLegacyConversation(documentId, sessionId)
  }

  saveSession(session: AiConversation): Promise<void> {
    return saveLegacyConversation(session)
  }

  deleteSession(documentId: string, sessionId: string): Promise<void> {
    return deleteLegacyConversation(documentId, sessionId)
  }
}
