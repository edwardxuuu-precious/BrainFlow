import { createMindMapDocument } from './document-factory'
import { defaultTheme, normalizeMindMapTheme } from './theme'
import type {
  DocumentService,
  DocumentSummary,
  MindMapDocument,
  MindMapEditorChromeState,
  MindMapViewport,
  MindMapWorkspaceState,
  TopicNode,
} from './types'

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
    previewColor: normalizeDocument(doc).theme.accent,
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
  return ((result ?? []) as MindMapDocument[]).map(normalizeDocument)
}

function normalizeSummary(summary: DocumentSummary): DocumentSummary {
  return {
    ...summary,
    previewColor: defaultTheme.accent,
  }
}

function normalizeViewport(viewport: MindMapDocument['viewport'] | undefined): MindMapViewport {
  return {
    x: viewport?.x ?? 0,
    y: viewport?.y ?? 0,
    zoom: viewport?.zoom ?? 1,
  }
}

function normalizeChromeState(
  chrome: MindMapWorkspaceState['chrome'] | undefined,
): MindMapEditorChromeState {
  return {
    leftSidebarOpen: chrome?.leftSidebarOpen ?? true,
    rightSidebarOpen: chrome?.rightSidebarOpen ?? true,
  }
}

function normalizeWorkspace(doc: MindMapDocument): MindMapWorkspaceState {
  const selectedTopicId =
    doc.workspace?.selectedTopicId && doc.topics[doc.workspace.selectedTopicId]
      ? doc.workspace.selectedTopicId
      : doc.rootTopicId

  return {
    selectedTopicId,
    chrome: normalizeChromeState(doc.workspace?.chrome),
  }
}

function normalizeTopic(topic: TopicNode): TopicNode {
  return {
    ...topic,
    aiLocked: topic.aiLocked ?? false,
  }
}

function normalizeDocument(doc: MindMapDocument): MindMapDocument {
  return {
    ...doc,
    topics: Object.fromEntries(
      Object.entries(doc.topics).map(([topicId, topic]) => [topicId, normalizeTopic(topic)]),
    ),
    viewport: normalizeViewport(doc.viewport),
    workspace: normalizeWorkspace(doc),
    theme: normalizeMindMapTheme(doc.theme),
  }
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
    const index = sortSummaries(loadIndex()).map(normalizeSummary)
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

    return normalizeDocument(result as MindMapDocument)
  },

  async saveDocument(doc) {
    const normalizedDoc = normalizeDocument(doc)

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
