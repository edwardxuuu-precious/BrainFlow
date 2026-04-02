import type { AiConversation } from '../../../shared/ai-contract'

const AI_DB_NAME = 'brainflow-ai-v1'
const CONVERSATION_STORE = 'conversations'

interface StoredConversation extends AiConversation {
  key: string
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

export function getConversationStorageKey(documentId: string, conversationId: string): string {
  return `${documentId}:${conversationId}`
}

export function createEmptyConversation(documentId: string, conversationId: string): AiConversation {
  return {
    documentId,
    conversationId,
    messages: [],
    pendingProposal: null,
    updatedAt: Date.now(),
  }
}

export async function getAiConversation(
  documentId: string,
  conversationId: string,
): Promise<AiConversation> {
  const key = getConversationStorageKey(documentId, conversationId)
  const stored = await withStore('readonly', (store) => store.get(key))

  if (!stored) {
    return createEmptyConversation(documentId, conversationId)
  }

  const conversation = stored as StoredConversation
  return {
    documentId: conversation.documentId,
    conversationId: conversation.conversationId,
    messages: conversation.messages,
    pendingProposal: conversation.pendingProposal,
    updatedAt: conversation.updatedAt,
  }
}

export async function saveAiConversation(conversation: AiConversation): Promise<void> {
  const record: StoredConversation = {
    ...conversation,
    key: getConversationStorageKey(conversation.documentId, conversation.conversationId),
  }

  await withStore('readwrite', (store) => store.put(record))
}
