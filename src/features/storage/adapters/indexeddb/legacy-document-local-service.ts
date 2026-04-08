import { createMindMapDocument } from '../../../documents/document-factory'
import { defaultTheme, normalizeMindMapTheme } from '../../../documents/theme'
import { normalizeTopicMetadata, normalizeTopicStyle } from '../../../documents/topic-defaults'
import {
  extractPlainTextFromTopicRichText,
  normalizeTopicRichText,
} from '../../../documents/topic-rich-text'
import type {
  AiImportOperation,
  KnowledgeImportBundle,
  KnowledgeSemanticEdge,
  KnowledgeSemanticNode,
  KnowledgeSemanticTaskFields,
  KnowledgeSource,
  KnowledgeSourceRef,
  KnowledgeView,
  KnowledgeViewProjection,
  KnowledgeViewType,
  TextImportNodePlan,
  TextImportPreviewItem,
} from '../../../../../shared/ai-contract'
import type {
  DocumentService,
  DocumentSummary,
  MindMapDocument,
  MindMapTheme,
  MindMapEditorChromeState,
  MindMapViewport,
  MindMapWorkspaceState,
  TopicNode,
} from '../../../documents/types'
import { compileSemanticLayerViews, PRIMARY_KNOWLEDGE_VIEW_TYPE } from '../../../../../shared/text-import-layering'

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

function normalizeKnowledgeViewType(value: unknown): KnowledgeViewType | null {
  return value === 'archive_view' || value === 'thinking_view' || value === 'execution_view'
    ? value
    : null
}

function normalizeKnowledgeSourceRef(value: Partial<KnowledgeSourceRef> | undefined): KnowledgeSourceRef | null {
  if (!value || typeof value.sourceId !== 'string' || !value.sourceId.trim()) {
    return null
  }

  return {
    sourceId: value.sourceId,
    lineStart: typeof value.lineStart === 'number' ? value.lineStart : 0,
    lineEnd: typeof value.lineEnd === 'number' ? value.lineEnd : 0,
    pathTitles: Array.isArray(value.pathTitles)
      ? value.pathTitles.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [],
  }
}

function normalizeKnowledgeSource(value: Partial<KnowledgeSource> | undefined): KnowledgeSource | null {
  if (!value || typeof value.id !== 'string' || !value.id.trim()) {
    return null
  }

  return {
    id: value.id,
    type: value.type === 'paste' ? 'paste' : 'file',
    title: typeof value.title === 'string' && value.title.trim().length > 0 ? value.title : 'Imported source',
    raw_content: typeof value.raw_content === 'string' ? value.raw_content : '',
    metadata:
      value.metadata && typeof value.metadata === 'object' && !Array.isArray(value.metadata)
        ? (value.metadata as Record<string, unknown>)
        : {},
  }
}

function normalizeKnowledgeTaskFields(
  value: Partial<KnowledgeSemanticTaskFields> | null | undefined,
): KnowledgeSemanticTaskFields | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  return {
    status:
      value.status === 'in_progress' || value.status === 'blocked' || value.status === 'done'
        ? value.status
        : 'todo',
    owner: typeof value.owner === 'string' && value.owner.trim().length > 0 ? value.owner : null,
    due_date:
      typeof value.due_date === 'string' && value.due_date.trim().length > 0 ? value.due_date : null,
    priority:
      value.priority === 'low' || value.priority === 'medium' || value.priority === 'high'
        ? value.priority
        : null,
    depends_on: Array.isArray(value.depends_on)
      ? value.depends_on.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [],
    source_refs: Array.isArray(value.source_refs)
      ? value.source_refs
          .map((item) => normalizeKnowledgeSourceRef(item))
          .filter((item): item is KnowledgeSourceRef => item !== null)
      : [],
    definition_of_done:
      typeof value.definition_of_done === 'string' && value.definition_of_done.trim().length > 0
        ? value.definition_of_done
        : null,
  }
}

function normalizeKnowledgeSemanticNode(
  value: Partial<KnowledgeSemanticNode> | undefined,
): KnowledgeSemanticNode | null {
  if (!value || typeof value.id !== 'string' || !value.id.trim() || typeof value.type !== 'string') {
    return null
  }

  const validTypeSet = new Set([
    'topic',
    'criterion',
    'insight',
    'question',
    'evidence',
    'decision',
    'goal',
    'project',
    'task',
    'review',
  ])
  if (!validTypeSet.has(value.type)) {
    return null
  }

  return {
    id: value.id,
    type: value.type,
    title: typeof value.title === 'string' && value.title.trim().length > 0 ? value.title : 'Untitled',
    summary: typeof value.summary === 'string' ? value.summary : '',
    detail: typeof value.detail === 'string' ? value.detail : '',
    source_refs: Array.isArray(value.source_refs)
      ? value.source_refs
          .map((item) => normalizeKnowledgeSourceRef(item))
          .filter((item): item is KnowledgeSourceRef => item !== null)
      : [],
    confidence:
      value.confidence === 'high' || value.confidence === 'medium' || value.confidence === 'low'
        ? value.confidence
        : 'low',
    task: normalizeKnowledgeTaskFields(value.task),
  }
}

function normalizeKnowledgeSemanticEdge(
  value: Partial<KnowledgeSemanticEdge> | undefined,
): KnowledgeSemanticEdge | null {
  if (
    !value ||
    typeof value.from !== 'string' ||
    typeof value.to !== 'string' ||
    typeof value.type !== 'string'
  ) {
    return null
  }

  const validTypeSet = new Set([
    'belongs_to',
    'supports',
    'contradicts',
    'leads_to',
    'depends_on',
    'derived_from',
  ])
  if (!validTypeSet.has(value.type)) {
    return null
  }

  return {
    from: value.from,
    to: value.to,
    type: value.type,
    label: typeof value.label === 'string' ? value.label : null,
    source_refs: Array.isArray(value.source_refs)
      ? value.source_refs
          .map((item) => normalizeKnowledgeSourceRef(item))
          .filter((item): item is KnowledgeSourceRef => item !== null)
      : [],
    confidence:
      value.confidence === 'high' || value.confidence === 'medium' || value.confidence === 'low'
        ? value.confidence
        : 'low',
  }
}

function normalizePreviewNode(value: Partial<TextImportPreviewItem> | undefined): TextImportPreviewItem | null {
  if (!value || typeof value.id !== 'string' || !value.id.trim()) {
    return null
  }

  return {
    id: value.id,
    parentId: typeof value.parentId === 'string' ? value.parentId : null,
    order: typeof value.order === 'number' ? value.order : 0,
    title: typeof value.title === 'string' && value.title.trim().length > 0 ? value.title : 'Untitled',
    note: typeof value.note === 'string' ? value.note : null,
    relation:
      value.relation === 'merge' || value.relation === 'conflict' ? value.relation : 'new',
    matchedTopicId: typeof value.matchedTopicId === 'string' ? value.matchedTopicId : null,
    reason: typeof value.reason === 'string' ? value.reason : null,
    semanticRole:
      value.semanticRole === 'section' ||
      value.semanticRole === 'summary' ||
      value.semanticRole === 'decision' ||
      value.semanticRole === 'action' ||
      value.semanticRole === 'risk' ||
      value.semanticRole === 'question' ||
      value.semanticRole === 'metric' ||
      value.semanticRole === 'timeline' ||
      value.semanticRole === 'evidence'
        ? value.semanticRole
        : undefined,
    semanticType:
      value.semanticType === 'topic' ||
      value.semanticType === 'criterion' ||
      value.semanticType === 'insight' ||
      value.semanticType === 'question' ||
      value.semanticType === 'evidence' ||
      value.semanticType === 'decision' ||
      value.semanticType === 'goal' ||
      value.semanticType === 'project' ||
      value.semanticType === 'task' ||
      value.semanticType === 'review'
        ? value.semanticType
        : null,
    confidence:
      value.confidence === 'high' || value.confidence === 'medium' || value.confidence === 'low'
        ? value.confidence
        : undefined,
    sourceAnchors: Array.isArray(value.sourceAnchors)
      ? value.sourceAnchors
          .map((anchor) =>
            anchor &&
            typeof anchor.lineStart === 'number' &&
            typeof anchor.lineEnd === 'number'
              ? { lineStart: anchor.lineStart, lineEnd: anchor.lineEnd }
              : null,
          )
          .filter((anchor): anchor is { lineStart: number; lineEnd: number } => anchor !== null)
      : [],
    templateSlot: typeof value.templateSlot === 'string' ? value.templateSlot : null,
  }
}

function normalizeNodePlan(value: Partial<TextImportNodePlan> | undefined): TextImportNodePlan | null {
  if (!value || typeof value.id !== 'string' || !value.id.trim()) {
    return null
  }

  return {
    id: value.id,
    parentId: typeof value.parentId === 'string' ? value.parentId : null,
    order: typeof value.order === 'number' ? value.order : 0,
    title: typeof value.title === 'string' && value.title.trim().length > 0 ? value.title : 'Untitled',
    note: typeof value.note === 'string' ? value.note : null,
    semanticRole:
      value.semanticRole === 'section' ||
      value.semanticRole === 'summary' ||
      value.semanticRole === 'decision' ||
      value.semanticRole === 'action' ||
      value.semanticRole === 'risk' ||
      value.semanticRole === 'question' ||
      value.semanticRole === 'metric' ||
      value.semanticRole === 'timeline' ||
      value.semanticRole === 'evidence'
        ? value.semanticRole
        : 'summary',
    semanticType:
      value.semanticType === 'topic' ||
      value.semanticType === 'criterion' ||
      value.semanticType === 'insight' ||
      value.semanticType === 'question' ||
      value.semanticType === 'evidence' ||
      value.semanticType === 'decision' ||
      value.semanticType === 'goal' ||
      value.semanticType === 'project' ||
      value.semanticType === 'task' ||
      value.semanticType === 'review'
        ? value.semanticType
        : null,
    confidence:
      value.confidence === 'high' || value.confidence === 'medium' || value.confidence === 'low'
        ? value.confidence
        : 'low',
    sourceAnchors: Array.isArray(value.sourceAnchors)
      ? value.sourceAnchors
          .map((anchor) =>
            anchor &&
            typeof anchor.lineStart === 'number' &&
            typeof anchor.lineEnd === 'number'
              ? { lineStart: anchor.lineStart, lineEnd: anchor.lineEnd }
              : null,
          )
          .filter((anchor): anchor is { lineStart: number; lineEnd: number } => anchor !== null)
      : [],
    groupKey: typeof value.groupKey === 'string' ? value.groupKey : null,
    priority:
      value.priority === 'primary' || value.priority === 'secondary' || value.priority === 'supporting'
        ? value.priority
        : null,
    collapsedByDefault: typeof value.collapsedByDefault === 'boolean' ? value.collapsedByDefault : null,
    templateSlot: typeof value.templateSlot === 'string' ? value.templateSlot : null,
  }
}

function normalizeImportOperation(value: Partial<AiImportOperation> | undefined): AiImportOperation | null {
  if (!value || typeof value.id !== 'string' || !value.id.trim() || typeof value.type !== 'string') {
    return null
  }

  return value as AiImportOperation
}

function normalizeKnowledgeViewProjection(
  value: Partial<KnowledgeViewProjection> | undefined,
): KnowledgeViewProjection | null {
  const viewType = normalizeKnowledgeViewType(value?.viewType)
  if (!value || typeof value.viewId !== 'string' || !value.viewId.trim() || !viewType) {
    return null
  }

  return {
    viewId: value.viewId,
    viewType,
    summary: typeof value.summary === 'string' ? value.summary : '',
    nodePlans: Array.isArray(value.nodePlans)
      ? value.nodePlans
          .map((item) => normalizeNodePlan(item))
          .filter((item): item is TextImportNodePlan => item !== null)
      : [],
    previewNodes: Array.isArray(value.previewNodes)
      ? value.previewNodes
          .map((item) => normalizePreviewNode(item))
          .filter((item): item is TextImportPreviewItem => item !== null)
      : [],
    operations: Array.isArray(value.operations)
      ? value.operations
          .map((item) => normalizeImportOperation(item))
          .filter((item): item is AiImportOperation => item !== null)
      : [],
  }
}

function normalizeKnowledgeView(value: Partial<KnowledgeView> | undefined): KnowledgeView | null {
  const viewType = normalizeKnowledgeViewType(value?.type)
  if (!value || typeof value.id !== 'string' || !value.id.trim() || !viewType) {
    return null
  }

  return {
    id: value.id,
    type: viewType,
    visible_node_ids: Array.isArray(value.visible_node_ids)
      ? value.visible_node_ids.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [],
    layout_type:
      value.layout_type === 'archive' || value.layout_type === 'execution' ? value.layout_type : 'mindmap',
  }
}

function normalizeKnowledgeImportBundle(
  value: Partial<KnowledgeImportBundle> | undefined,
): KnowledgeImportBundle | null {
  if (!value || typeof value.id !== 'string' || !value.id.trim()) {
    return null
  }

  const views = Array.isArray(value.views)
    ? value.views
        .map((item) => normalizeKnowledgeView(item))
        .filter((item): item is KnowledgeView => item !== null)
    : []
  const viewProjections = Object.fromEntries(
    Object.entries(value.viewProjections ?? {}).flatMap(([viewId, projection]) => {
      const normalized = normalizeKnowledgeViewProjection(projection)
      return normalized ? [[viewId, normalized] as const] : []
    }),
  )
  const defaultViewId =
    typeof value.defaultViewId === 'string' && value.defaultViewId.trim().length > 0
      ? value.defaultViewId
      : (views[0]?.id ?? '')
  const activeViewId =
    typeof value.activeViewId === 'string' && value.activeViewId.trim().length > 0
      ? value.activeViewId
      : defaultViewId

  const bundle: KnowledgeImportBundle = {
    id: value.id,
    title: typeof value.title === 'string' && value.title.trim().length > 0 ? value.title : 'Imported knowledge',
    createdAt: typeof value.createdAt === 'number' ? value.createdAt : 0,
    anchorTopicId: typeof value.anchorTopicId === 'string' ? value.anchorTopicId : null,
    defaultViewId,
    activeViewId,
    mountedRootTopicId:
      typeof value.mountedRootTopicId === 'string' && value.mountedRootTopicId.trim().length > 0
        ? value.mountedRootTopicId
        : null,
    sources: Array.isArray(value.sources)
      ? value.sources
          .map((item) => normalizeKnowledgeSource(item))
          .filter((item): item is KnowledgeSource => item !== null)
      : [],
    semanticNodes: Array.isArray(value.semanticNodes)
      ? value.semanticNodes
          .map((item) => normalizeKnowledgeSemanticNode(item))
          .filter((item): item is KnowledgeSemanticNode => item !== null)
      : [],
    semanticEdges: Array.isArray(value.semanticEdges)
      ? value.semanticEdges
          .map((item) => normalizeKnowledgeSemanticEdge(item))
          .filter((item): item is KnowledgeSemanticEdge => item !== null)
      : [],
    views,
    viewProjections,
  }

  if (bundle.semanticNodes.length > 0) {
    const compiled = compileSemanticLayerViews({
      bundleId: bundle.id,
      bundleTitle: bundle.title,
      sources: bundle.sources,
      semanticNodes: bundle.semanticNodes,
      semanticEdges: bundle.semanticEdges,
      fallbackInsertionParentTopicId: bundle.anchorTopicId ?? 'topic_root',
    })

    return {
      ...bundle,
      views: compiled.views,
      viewProjections: compiled.viewProjections,
      defaultViewId: compiled.defaultViewId,
      activeViewId: compiled.activeViewId,
    }
  }

  const legacyProjection =
    (views.find((item) => item.type === PRIMARY_KNOWLEDGE_VIEW_TYPE)
      ? viewProjections[views.find((item) => item.type === PRIMARY_KNOWLEDGE_VIEW_TYPE)?.id as string]
      : null) ??
    Object.values(viewProjections)[0] ??
    null

  return {
    ...bundle,
    defaultViewId: `${bundle.id}_thinking`,
    activeViewId: `${bundle.id}_thinking`,
    views: legacyProjection
      ? [
          {
            id: `${bundle.id}_thinking`,
            type: PRIMARY_KNOWLEDGE_VIEW_TYPE,
            visible_node_ids: legacyProjection.previewNodes.map((item) => item.id),
            layout_type: 'mindmap',
          },
        ]
      : [],
    viewProjections: legacyProjection
      ? {
          [`${bundle.id}_thinking`]: {
            ...legacyProjection,
            viewId: `${bundle.id}_thinking`,
            viewType: PRIMARY_KNOWLEDGE_VIEW_TYPE,
          },
        }
      : {},
  }
}

function normalizeKnowledgeImports(
  knowledgeImports: MindMapDocument['knowledgeImports'] | undefined,
): MindMapDocument['knowledgeImports'] {
  return Object.fromEntries(
    Object.entries(knowledgeImports ?? {}).flatMap(([bundleId, bundle]) => {
      const normalized = normalizeKnowledgeImportBundle(bundle)
      return normalized ? [[bundleId, normalized] as const] : []
    }),
  )
}

function normalizeWorkspace(doc: MindMapDocument): MindMapWorkspaceState {
  const selectedTopicId =
    doc.workspace?.selectedTopicId && doc.topics[doc.workspace.selectedTopicId]
      ? doc.workspace.selectedTopicId
      : doc.rootTopicId
  const knowledgeImports = doc.knowledgeImports ?? {}
  const activeImportBundleId =
    doc.workspace?.activeImportBundleId && knowledgeImports[doc.workspace.activeImportBundleId]
      ? doc.workspace.activeImportBundleId
      : null
  const activeBundle = activeImportBundleId ? knowledgeImports[activeImportBundleId] : null
  const activeKnowledgeViewId =
    activeBundle &&
    activeBundle.views.some(
      (view) =>
        view.type === PRIMARY_KNOWLEDGE_VIEW_TYPE &&
        activeBundle.viewProjections[view.id],
    )
      ? PRIMARY_KNOWLEDGE_VIEW_TYPE
      : null

  return {
    selectedTopicId,
    chrome: normalizeChromeState(doc.workspace?.chrome),
    hierarchyCollapsedTopicIds: normalizeHierarchyCollapsedTopicIds(doc, doc.workspace?.hierarchyCollapsedTopicIds),
    activeImportBundleId,
    activeKnowledgeViewId,
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

export function normalizeDocument(doc: MindMapDocument): MindMapDocument {
  const repairedTree = repairTopicTree(doc.topics, doc.rootTopicId)
  const knowledgeImports = normalizeKnowledgeImports(doc.knowledgeImports)

  return {
    ...doc,
    rootTopicId: repairedTree.rootTopicId,
    topics: repairedTree.topics,
    knowledgeImports,
    viewport: normalizeViewport(doc.viewport),
    workspace: normalizeWorkspace({
      ...doc,
      rootTopicId: repairedTree.rootTopicId,
      topics: repairedTree.topics,
      knowledgeImports,
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
