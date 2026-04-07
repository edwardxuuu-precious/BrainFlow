import { createMindMapDocument } from './document-factory'
import { defaultTheme, normalizeMindMapTheme } from './theme'
import { normalizeTopicMetadata, normalizeTopicStyle } from './topic-defaults'
import {
  extractPlainTextFromTopicRichText,
  normalizeTopicRichText,
} from './topic-rich-text'
import type {
  DocumentService,
  DocumentSummary,
  MindMapDocument,
  MindMapTheme,
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

function normalizeHierarchyCollapsedTopicIds(
  doc: MindMapDocument,
  collapsedTopicIds: string[] | undefined,
): string[] {
  return Array.from(new Set(collapsedTopicIds ?? [])).filter((topicId) => {
    const topic = doc.topics[topicId]
    return !!topic && topic.childIds.length > 0
  })
}

function normalizeWorkspace(doc: MindMapDocument): MindMapWorkspaceState {
  const selectedTopicId =
    doc.workspace?.selectedTopicId && doc.topics[doc.workspace.selectedTopicId]
      ? doc.workspace.selectedTopicId
      : doc.rootTopicId

  return {
    selectedTopicId,
    chrome: normalizeChromeState(doc.workspace?.chrome),
    hierarchyCollapsedTopicIds: normalizeHierarchyCollapsedTopicIds(doc, doc.workspace?.hierarchyCollapsedTopicIds),
  }
}

function createFallbackTopic(topicId: string, title: string, parentId: string | null): TopicNode {
  return {
    id: topicId,
    parentId,
    childIds: [],
    title,
    note: '',
    noteRich: null,
    aiLocked: false,
    isCollapsed: false,
    branchSide: 'auto',
    layout: {
      offsetX: 0,
      offsetY: 0,
      semanticGroupKey: null,
      priority: null,
    },
    metadata: normalizeTopicMetadata(),
    style: normalizeTopicStyle(),
  }
}

function normalizeTopic(topicId: string, topic: Partial<TopicNode> | undefined, fallbackTitle: string): TopicNode {
  const noteRich = normalizeTopicRichText(topic?.noteRich)
  const title = typeof topic?.title === 'string' && topic.title.trim().length > 0
    ? topic.title
    : fallbackTitle
  const branchSide =
    topic?.branchSide === 'left' || topic?.branchSide === 'right' || topic?.branchSide === 'auto'
      ? topic.branchSide
      : 'auto'

  return {
    id: topicId,
    parentId: typeof topic?.parentId === 'string' ? topic.parentId : null,
    childIds: Array.isArray(topic?.childIds)
      ? topic.childIds.filter((childId): childId is string => typeof childId === 'string')
      : [],
    title,
    note: noteRich ? extractPlainTextFromTopicRichText(noteRich) : topic?.note ?? '',
    noteRich,
    aiLocked: topic?.aiLocked ?? false,
    isCollapsed: topic?.isCollapsed ?? false,
    branchSide,
    layout: {
      offsetX: topic?.layout?.offsetX ?? 0,
      offsetY: topic?.layout?.offsetY ?? 0,
      semanticGroupKey: topic?.layout?.semanticGroupKey ?? null,
      priority: topic?.layout?.priority ?? null,
    },
    metadata: normalizeTopicMetadata(topic?.metadata),
    style: normalizeTopicStyle(topic?.style),
  }
}

function normalizeTheme(theme: MindMapDocument['theme'] | undefined): MindMapTheme {
  return normalizeMindMapTheme(theme ?? defaultTheme)
}

function repairTopicTree(
  rawTopics: Record<string, Partial<TopicNode> | undefined> | undefined,
  requestedRootTopicId: string | undefined,
): { topics: Record<string, TopicNode>; rootTopicId: string } {
  const topicEntries = Object.entries(rawTopics ?? {}).filter(
    ([topicId, topic]) => topicId.trim().length > 0 && !!topic,
  )
  const normalizedTopics = Object.fromEntries(
    topicEntries.map(([topicId, topic]) => [
      topicId,
      normalizeTopic(topicId, topic, topicId === requestedRootTopicId ? '中心主题' : '新主题'),
    ]),
  ) as Record<string, TopicNode>
  const topicIds = Object.keys(normalizedTopics)
  const fallbackRootTopicId =
    typeof requestedRootTopicId === 'string' && requestedRootTopicId.trim().length > 0
      ? requestedRootTopicId
      : 'topic_recovered_root'
  const rootTopicId = normalizedTopics[fallbackRootTopicId]
    ? fallbackRootTopicId
    : (topicIds[0] ?? fallbackRootTopicId)

  if (!normalizedTopics[rootTopicId]) {
    normalizedTopics[rootTopicId] = createFallbackTopic(rootTopicId, '中心主题', null)
  }

  Object.values(normalizedTopics).forEach((topic) => {
    topic.childIds = Array.from(new Set(topic.childIds)).filter(
      (childId) => childId !== topic.id && !!normalizedTopics[childId],
    )
  })

  const visitQueue = [{ topicId: rootTopicId, parentId: null as string | null }]
  const visited = new Set<string>()

  while (visitQueue.length > 0) {
    const current = visitQueue.shift()
    if (!current) {
      continue
    }

    const topic = normalizedTopics[current.topicId]
    if (!topic || visited.has(current.topicId)) {
      continue
    }

    visited.add(current.topicId)
    topic.parentId = current.parentId
    topic.childIds = topic.childIds.filter((childId) => !visited.has(childId))

    topic.childIds.forEach((childId) => {
      const child = normalizedTopics[childId]
      if (!child) {
        return
      }

      child.parentId = topic.id
      visitQueue.push({ topicId: childId, parentId: topic.id })
    })
  }

  const root = normalizedTopics[rootTopicId]
  Object.keys(normalizedTopics).forEach((topicId) => {
    if (visited.has(topicId)) {
      return
    }

    if (!root.childIds.includes(topicId)) {
      root.childIds.push(topicId)
    }

    visitQueue.push({ topicId, parentId: rootTopicId })

    while (visitQueue.length > 0) {
      const current = visitQueue.shift()
      if (!current) {
        continue
      }

      const topic = normalizedTopics[current.topicId]
      if (!topic || visited.has(current.topicId)) {
        continue
      }

      visited.add(current.topicId)
      topic.parentId = current.parentId
      topic.childIds = topic.childIds.filter((childId) => !visited.has(childId))

      topic.childIds.forEach((childId) => {
        const child = normalizedTopics[childId]
        if (!child) {
          return
        }

        child.parentId = topic.id
        visitQueue.push({ topicId: childId, parentId: topic.id })
      })
    }
  })

  root.parentId = null

  Object.values(normalizedTopics).forEach((topic) => {
    topic.isCollapsed = topic.isCollapsed && topic.childIds.length > 0
  })

  return {
    topics: normalizedTopics,
    rootTopicId,
  }
}

function normalizeDocument(doc: MindMapDocument): MindMapDocument {
  const repairedTree = repairTopicTree(doc.topics, doc.rootTopicId)

  return {
    ...doc,
    rootTopicId: repairedTree.rootTopicId,
    topics: repairedTree.topics,
    viewport: normalizeViewport(doc.viewport),
    workspace: normalizeWorkspace({
      ...doc,
      rootTopicId: repairedTree.rootTopicId,
      topics: repairedTree.topics,
    }),
    theme: normalizeTheme(doc.theme),
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
