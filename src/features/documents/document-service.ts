import { createMindMapDocument } from './document-factory'
import type { DocumentService, DocumentSummary, MindMapDocument } from './types'

const DB_NAME = 'brainflow-documents-v1'
const STORE_NAME = 'documents'
const INDEX_KEY = 'brainflow:document-index:v1'
const RECENT_KEY = 'brainflow:recent-document:v1'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)

    request.onerror = () => reject(request.error)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode)
    const store = transaction.objectStore(STORE_NAME)
    const request = handler(store)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    transaction.oncomplete = () => db.close()
    transaction.onerror = () => reject(transaction.error)
  })
}

function loadIndex(): DocumentSummary[] {
  const raw = localStorage.getItem(INDEX_KEY)
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw) as DocumentSummary[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveIndex(index: DocumentSummary[]): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(index))
}

function topicCount(doc: MindMapDocument): number {
  return Object.keys(doc.topics).length
}

function toSummary(doc: MindMapDocument): DocumentSummary {
  return {
    id: doc.id,
    title: doc.title,
    updatedAt: doc.updatedAt,
    topicCount: topicCount(doc),
    previewColor: doc.theme.accent,
  }
}

function sortSummaries(index: DocumentSummary[]): DocumentSummary[] {
  return [...index].sort((left, right) => right.updatedAt - left.updatedAt)
}

function mergeSummary(summary: DocumentSummary): void {
  const current = loadIndex().filter((entry) => entry.id !== summary.id)
  current.push(summary)
  saveIndex(sortSummaries(current))
}

async function listAllDocumentsFromDatabase(): Promise<MindMapDocument[]> {
  const result = await withStore('readonly', (store) => store.getAll())
  return (result ?? []) as MindMapDocument[]
}

export function getRecentDocumentId(): string | null {
  return localStorage.getItem(RECENT_KEY)
}

export function setRecentDocumentId(id: string | null): void {
  if (!id) {
    localStorage.removeItem(RECENT_KEY)
    return
  }

  localStorage.setItem(RECENT_KEY, id)
}

export const documentService: DocumentService = {
  async createDocument(title) {
    const doc = createMindMapDocument(title)
    await this.saveDocument(doc)
    setRecentDocumentId(doc.id)
    return doc
  },

  async listDocuments() {
    const index = sortSummaries(loadIndex())
    if (index.length > 0) {
      return index
    }

    const docs = await listAllDocumentsFromDatabase()
    const repaired = sortSummaries(docs.map(toSummary))
    saveIndex(repaired)
    return repaired
  },

  async getDocument(id) {
    const result = await withStore('readonly', (store) => store.get(id))
    if (!result) {
      return null
    }

    return result as MindMapDocument
  },

  async saveDocument(doc) {
    const normalizedDoc = {
      ...doc,
      updatedAt: Date.now(),
    }

    await withStore('readwrite', (store) => store.put(normalizedDoc))
    mergeSummary(toSummary(normalizedDoc))
  },

  async deleteDocument(id) {
    await withStore('readwrite', (store) => store.delete(id))
    const nextIndex = loadIndex().filter((entry) => entry.id !== id)
    saveIndex(sortSummaries(nextIndex))

    if (getRecentDocumentId() === id) {
      setRecentDocumentId(nextIndex[0]?.id ?? null)
    }
  },

  async duplicateDocument(id) {
    const original = await this.getDocument(id)
    if (!original) {
      throw new Error('Document not found')
    }

    const duplicated: MindMapDocument = {
      ...structuredClone(original),
      id: createMindMapDocument().id,
      title: `${original.title} 副本`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    await this.saveDocument(duplicated)
    return duplicated.id
  },
}
