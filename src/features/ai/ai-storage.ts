import type { AiConversation, AiSessionSummary } from '../../../shared/ai-contract'

const AI_DB_NAME = 'brainflow-ai-v1'
const CONVERSATION_STORE = 'conversations'

interface StoredConversation extends AiConversation {
  key: string
  conversationId?: string
}

function createSessionId(): string {
  return `session_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function deriveConversationTitle(messages: AiConversation['messages']): string {
  const firstUserMessage = messages.find((message) => message.role === 'user')?.content?.trim()
  if (!firstUserMessage) {
    return '新对话'
  }

  return firstUserMessage.length > 16
    ? `${firstUserMessage.slice(0, 16).trimEnd()}…`
    : firstUserMessage
}

function normalizeConversation(record: Partial<StoredConversation>): AiConversation {
  const sessionId = record.sessionId ?? record.conversationId ?? createSessionId()
  const messages = Array.isArray(record.messages) ? record.messages : []

  return {
    documentId: record.documentId ?? 'unknown-document',
    documentTitle: record.documentTitle ?? '未命名脑图',
    sessionId,
    title: record.title?.trim() || deriveConversationTitle(messages),
    messages,
    updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : Date.now(),
    archivedAt: typeof record.archivedAt === 'number' ? record.archivedAt : null,
  }
}

function toSessionSummary(conversation: AiConversation): AiSessionSummary {
  return {
    documentId: conversation.documentId,
    documentTitle: conversation.documentTitle,
    sessionId: conversation.sessionId,
    title: conversation.title,
    updatedAt: conversation.updatedAt,
    archivedAt: conversation.archivedAt,
  }
}

function toStoredConversation(conversation: AiConversation): StoredConversation {
  return {
    ...conversation,
    key: getConversationStorageKey(conversation.documentId, conversation.sessionId),
  }
}

function openAiDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(AI_DB_NAME, 1)

    request.onerror = () => reject(request.error)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(CONVERSATION_STORE)) {
        database.createObjectStore(CONVERSATION_STORE, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openAiDatabase()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(CONVERSATION_STORE, mode)
    const store = transaction.objectStore(CONVERSATION_STORE)
    const request = handler(store)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => reject(transaction.error)
  })
}

async function getAllConversations(): Promise<AiConversation[]> {
  const stored = (await withStore('readonly', (store) => store.getAll())) as StoredConversation[] | undefined
  return (stored ?? []).map(normalizeConversation)
}

export function getConversationStorageKey(documentId: string, sessionId: string): string {
  return `${documentId}:${sessionId}`
}

export function createEmptyConversation(
  documentId: string,
  documentTitle: string,
  sessionId = createSessionId(),
): AiConversation {
  return {
    documentId,
    documentTitle,
    sessionId,
    title: '新对话',
    messages: [],
    updatedAt: Date.now(),
    archivedAt: null,
  }
}

export async function getAiConversation(
  documentId: string,
  sessionId: string,
): Promise<AiConversation | null> {
  const key = getConversationStorageKey(documentId, sessionId)
  const stored = (await withStore('readonly', (store) => store.get(key))) as StoredConversation | undefined
  return stored ? normalizeConversation(stored) : null
}

export async function listAiSessions(
  documentId: string,
  options?: { includeArchived?: boolean },
): Promise<AiSessionSummary[]> {
  const includeArchived = options?.includeArchived ?? false
  const conversations = await getAllConversations()

  return conversations
    .filter(
      (conversation) =>
        conversation.documentId === documentId &&
        (includeArchived || conversation.archivedAt === null),
    )
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .map(toSessionSummary)
}

export async function listArchivedAiSessions(): Promise<AiSessionSummary[]> {
  const conversations = await getAllConversations()
  return conversations
    .filter((conversation) => conversation.archivedAt !== null)
    .sort((left, right) => (right.archivedAt ?? 0) - (left.archivedAt ?? 0))
    .map(toSessionSummary)
}

export async function saveAiConversation(conversation: AiConversation): Promise<void> {
  await withStore('readwrite', (store) => store.put(toStoredConversation(conversation)))
}

export async function archiveAiConversation(
  documentId: string,
  sessionId: string,
): Promise<AiConversation | null> {
  const current = await getAiConversation(documentId, sessionId)
  if (!current) {
    return null
  }

  const nextConversation: AiConversation = {
    ...current,
    archivedAt: Date.now(),
    updatedAt: Date.now(),
  }
  await saveAiConversation(nextConversation)
  return nextConversation
}

export async function restoreAiConversation(
  documentId: string,
  sessionId: string,
): Promise<AiConversation | null> {
  const current = await getAiConversation(documentId, sessionId)
  if (!current) {
    return null
  }

  const nextConversation: AiConversation = {
    ...current,
    archivedAt: null,
    updatedAt: Date.now(),
  }
  await saveAiConversation(nextConversation)
  return nextConversation
}

export async function deleteAiConversation(documentId: string, sessionId: string): Promise<void> {
  const key = getConversationStorageKey(documentId, sessionId)
  await withStore('readwrite', (store) => store.delete(key))
}
