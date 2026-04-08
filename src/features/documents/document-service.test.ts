import { beforeEach, describe, expect, it } from 'vitest'
import { layoutMindMap } from '../editor/layout'
import { createMindMapDocument } from './document-factory'
import {
  documentService,
  getRecentDocumentId,
  setRecentDocumentId,
} from './document-service'
import { defaultTheme, normalizeMindMapTheme } from './theme'

const DB_NAME = 'brainflow-documents-v1'
const STORE_NAME = 'documents'

async function resetDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
    request.onblocked = () => resolve()
  })
}

async function writeRawDocument(value: unknown): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onerror = () => reject(request.error)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => {
      const db = request.result
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      store.put(value)
      transaction.oncomplete = () => {
        db.close()
        resolve()
      }
      transaction.onerror = () => reject(transaction.error)
    }
  })
}

async function readRawDocument(id: string): Promise<Record<string, unknown> | null> {
  return new Promise<Record<string, unknown> | null>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onerror = () => reject(request.error)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => {
      const db = request.result
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const getRequest = store.get(id)
      getRequest.onerror = () => reject(getRequest.error)
      getRequest.onsuccess = () => {
        db.close()
        resolve((getRequest.result as Record<string, unknown> | undefined) ?? null)
      }
    }
  })
}

describe('documentService', () => {
  beforeEach(async () => {
    await resetDatabase()
    localStorage.clear()
  })

  it('creates documents, persists them, and lists them by latest update', async () => {
    const first = await documentService.createDocument('第一张')
    const second = await documentService.createDocument('第二张')

    const loaded = await documentService.getDocument(second.id)
    const list = await documentService.listDocuments()

    expect(loaded?.title).toBe('第二张')
    expect(list[0].id).toBe(second.id)
    expect(list[1].id).toBe(first.id)
  })

  it('repairs the local index from IndexedDB when localStorage is invalid', async () => {
    const doc = await documentService.createDocument('修复索引')
    localStorage.setItem('brainflow:document-index:v1', 'broken-json')

    const list = await documentService.listDocuments()

    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(doc.id)
  })

  it('normalizes legacy theme data while preserving explicit colors', async () => {
    const legacy = createMindMapDocument('旧主题文档')
    legacy.theme = {
      ...legacy.theme,
      accent: '#b76522',
      canvas: '#f3ecdf',
      surface: '#fffaf1',
      panel: '#f7f1e7',
      text: '#2d231a',
      mutedText: '#73624e',
      grid: 'rgba(183, 101, 34, 0.1)',
      branchPalette: ['#b76522', '#b88a19', '#6c7f2d', '#277c75', '#3366b2', '#8b4ec2'],
    }

    await documentService.saveDocument(legacy)

    const loaded = await documentService.getDocument(legacy.id)
    const list = await documentService.listDocuments()

    const normalizedTheme = normalizeMindMapTheme(legacy.theme)

    expect(loaded?.theme).toEqual(normalizedTheme)
    expect(list[0]?.previewColor).toBe(defaultTheme.accent)
  })

  it('repairs missing workspace data and falls back invalid selections to the root topic', async () => {
    const legacy = createMindMapDocument('工作台兼容修复')
    const rootId = legacy.rootTopicId
    const legacyWithoutWorkspace = structuredClone(legacy) as unknown as Record<string, unknown>
    Reflect.deleteProperty(legacyWithoutWorkspace, 'workspace')

    await documentService.saveDocument(legacyWithoutWorkspace as unknown as typeof legacy)

    const loadedWithoutWorkspace = await documentService.getDocument(legacy.id)
    expect(loadedWithoutWorkspace?.workspace.selectedTopicId).toBe(rootId)
    expect(loadedWithoutWorkspace?.workspace.chrome).toEqual({
      leftSidebarOpen: true,
      rightSidebarOpen: true,
    })
    expect(loadedWithoutWorkspace?.workspace.hierarchyCollapsedTopicIds).toEqual([])

    await documentService.saveDocument({
      ...legacy,
      workspace: {
        selectedTopicId: 'missing-topic',
        chrome: {
          leftSidebarOpen: false,
          rightSidebarOpen: true,
        },
        hierarchyCollapsedTopicIds: [legacy.rootTopicId],
        activeImportBundleId: null,
        activeKnowledgeViewId: null,
      },
    })

    const loadedInvalidSelection = await documentService.getDocument(legacy.id)
    expect(loadedInvalidSelection?.workspace.selectedTopicId).toBe(rootId)
    expect(loadedInvalidSelection?.workspace.chrome.leftSidebarOpen).toBe(false)
    expect(loadedInvalidSelection?.workspace.hierarchyCollapsedTopicIds).toEqual([legacy.rootTopicId])
  })

  it('drops legacy task, link, and attachment metadata when loading and saving old documents', async () => {
    const legacy = createMindMapDocument('旧元数据兼容')
    const branchId = legacy.topics[legacy.rootTopicId].childIds[0]
    const legacyPayload = structuredClone(legacy) as unknown as Record<string, unknown>
    const legacyTopics = legacyPayload.topics as Record<string, Record<string, unknown>>
    const branch = legacyTopics[branchId]
    const metadata = branch.metadata as Record<string, unknown>

    metadata.task = {
      status: 'todo',
      priority: 'high',
      dueDate: '2026-04-06',
    }
    metadata.links = [
      {
        id: 'legacy_link_1',
        type: 'web',
        label: 'Legacy link',
        href: 'https://example.com',
      },
    ]
    metadata.attachments = [
      {
        id: 'legacy_attachment_1',
        name: 'Legacy attachment',
        uri: 'https://example.com/file',
        source: 'url',
      },
    ]

    await writeRawDocument(legacyPayload)

    const loaded = await documentService.getDocument(legacy.id)
    const loadedMetadata = loaded?.topics[branchId].metadata as Record<string, unknown> | undefined

    expect(loaded).not.toBeNull()
    expect(loadedMetadata).not.toBeNull()
    expect('task' in (loadedMetadata ?? {})).toBe(false)
    expect('links' in (loadedMetadata ?? {})).toBe(false)
    expect('attachments' in (loadedMetadata ?? {})).toBe(false)

    await documentService.saveDocument(loaded!)

    const rawStored = await readRawDocument(legacy.id)
    const rawTopics = rawStored?.topics as Record<string, Record<string, unknown>> | undefined
    const rawMetadata = rawTopics?.[branchId]?.metadata as Record<string, unknown> | undefined

    expect(rawMetadata).not.toBeNull()
    expect('task' in (rawMetadata ?? {})).toBe(false)
    expect('links' in (rawMetadata ?? {})).toBe(false)
    expect('attachments' in (rawMetadata ?? {})).toBe(false)
  })

  it('preserves updatedAt when only workspace state changes', async () => {
    const doc = await documentService.createDocument('工作台持久化')
    const selectedTopicId = doc.topics[doc.rootTopicId].childIds[0]

    await documentService.saveDocument({
      ...doc,
      viewport: { x: 120, y: -48, zoom: 1.35 },
      workspace: {
        selectedTopicId,
        chrome: {
          leftSidebarOpen: false,
          rightSidebarOpen: true,
        },
        hierarchyCollapsedTopicIds: [selectedTopicId],
        activeImportBundleId: null,
        activeKnowledgeViewId: null,
      },
    })

    const loaded = await documentService.getDocument(doc.id)

    expect(loaded?.updatedAt).toBe(doc.updatedAt)
    expect(loaded?.viewport).toEqual({ x: 120, y: -48, zoom: 1.35 })
    expect(loaded?.workspace).toEqual({
      selectedTopicId,
      chrome: {
        leftSidebarOpen: false,
        rightSidebarOpen: true,
      },
      hierarchyCollapsedTopicIds: [],
      activeImportBundleId: null,
      activeKnowledgeViewId: null,
    })
  })

  it('duplicates workspace state and viewport together with the document', async () => {
    const original = await documentService.createDocument('复制工作台')
    const selectedTopicId = original.topics[original.rootTopicId].childIds[1]

    await documentService.saveDocument({
      ...original,
      viewport: { x: -88, y: 64, zoom: 1.2 },
      workspace: {
        selectedTopicId,
        chrome: {
          leftSidebarOpen: true,
          rightSidebarOpen: false,
        },
        hierarchyCollapsedTopicIds: [selectedTopicId],
        activeImportBundleId: null,
        activeKnowledgeViewId: null,
      },
    })

    const duplicateId = await documentService.duplicateDocument(original.id)
    const duplicate = await documentService.getDocument(duplicateId)

    expect(duplicate?.viewport).toEqual({ x: -88, y: 64, zoom: 1.2 })
    expect(duplicate?.workspace).toEqual({
      selectedTopicId,
      chrome: {
        leftSidebarOpen: true,
        rightSidebarOpen: false,
      },
      hierarchyCollapsedTopicIds: [],
      activeImportBundleId: null,
      activeKnowledgeViewId: null,
    })
  })

  it('filters invalid collapsed ids while preserving valid hierarchy collapse state', async () => {
    const document = await documentService.createDocument('树折叠状态')
    const branchId = document.topics[document.rootTopicId].childIds[0]
    const childId = 'topic_persisted_tree_child'
    document.topics[branchId].childIds.push(childId)
    document.topics[childId] = {
      id: childId,
      parentId: branchId,
      childIds: [],
      title: '子节点',
      note: '',
      noteRich: null,
      aiLocked: false,
      isCollapsed: false,
      branchSide: 'auto',
      layout: {
        offsetX: 0,
        offsetY: 0,
      },
      metadata: {
        labels: [],
        markers: [],
        stickers: [],
      },
      style: {
        emphasis: 'normal',
        variant: 'default',
      },
    }

    await documentService.saveDocument({
      ...document,
      workspace: {
        ...document.workspace,
        hierarchyCollapsedTopicIds: [branchId, 'missing-topic'],
      },
    })

    const loaded = await documentService.getDocument(document.id)

    expect(loaded?.workspace.hierarchyCollapsedTopicIds).toEqual([branchId])
  })

  it('repairs broken topic references so stored documents still render', async () => {
    const document = createMindMapDocument('Repair broken tree')
    const rootId = document.rootTopicId
    const [leftBranchId, rightBranchId] = document.topics[rootId].childIds
    const nestedId = 'topic_broken_nested'
    const detachedId = 'topic_broken_detached'

    document.topics[leftBranchId].childIds = ['missing-topic', rootId, nestedId, nestedId]
    document.topics[nestedId] = {
      id: nestedId,
      parentId: 'ghost-parent',
      childIds: [leftBranchId],
      title: 'Nested orphan',
      note: '',
      noteRich: null,
      aiLocked: false,
      isCollapsed: false,
      branchSide: 'auto',
      layout: {
        offsetX: 0,
        offsetY: 0,
      },
      metadata: {
        labels: [],
        markers: [],
        stickers: [],
      },
      style: {
        emphasis: 'normal',
        variant: 'default',
      },
    }
    document.topics[detachedId] = {
      id: detachedId,
      parentId: 'ghost-parent',
      childIds: [],
      title: 'Detached orphan',
      note: '',
      noteRich: null,
      aiLocked: false,
      isCollapsed: false,
      branchSide: 'left',
      layout: {
        offsetX: 0,
        offsetY: 0,
      },
      metadata: {
        labels: [],
        markers: [],
        stickers: [],
      },
      style: {
        emphasis: 'normal',
        variant: 'default',
      },
    }

    await writeRawDocument(document)

    const loaded = await documentService.getDocument(document.id)

    expect(loaded).not.toBeNull()
    expect(loaded?.topics[leftBranchId].childIds).toEqual([nestedId])
    expect(loaded?.topics[nestedId].parentId).toBe(leftBranchId)
    expect(loaded?.topics[nestedId].childIds).toEqual([])
    expect(loaded?.topics[rootId].childIds).toEqual([leftBranchId, rightBranchId, detachedId])
    expect(loaded?.topics[detachedId].parentId).toBe(rootId)
    expect(() => layoutMindMap(loaded!)).not.toThrow()
  })

  it('deletes documents and updates the recent pointer', async () => {
    const doc = await documentService.createDocument('待删除')
    setRecentDocumentId(doc.id)

    await documentService.deleteDocument(doc.id)

    expect(await documentService.getDocument(doc.id)).toBeNull()
    expect(getRecentDocumentId()).toBeNull()
  })
})
