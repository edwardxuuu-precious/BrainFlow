import type {
  BranchSide,
  MindMapDocument,
  MindMapEditorChromeState,
  MindMapViewport,
  TopicLayout,
  TopicNode,
} from '../documents/types'

export type ResolvedBranchSide = 'left' | 'right' | 'center'

export interface TopicMutationResult {
  document: MindMapDocument
  topicId?: string
}

function cloneDocument(doc: MindMapDocument): MindMapDocument {
  return structuredClone(doc)
}

function touchDocument(doc: MindMapDocument): MindMapDocument {
  doc.updatedAt = Date.now()
  return doc
}

function createTopicId(): string {
  return `topic_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function createTopic(parentId: string): TopicNode {
  return {
    id: createTopicId(),
    parentId,
    childIds: [],
    title: '新主题',
    note: '',
    aiLocked: false,
    isCollapsed: false,
    branchSide: 'auto',
    layout: {
      offsetX: 0,
      offsetY: 0,
    },
    style: {},
  }
}

export function getTopicLayout(topic: TopicNode): TopicLayout {
  return topic.layout ?? { offsetX: 0, offsetY: 0 }
}

export function getTopicDepth(doc: MindMapDocument, topicId: string): number {
  let depth = 0
  let cursor = doc.topics[topicId]

  while (cursor?.parentId) {
    depth += 1
    cursor = doc.topics[cursor.parentId]
  }

  return depth
}

export function resolveRootBranchSides(doc: MindMapDocument): Record<string, 'left' | 'right'> {
  const root = doc.topics[doc.rootTopicId]
  return root.childIds.reduce<Record<string, 'left' | 'right'>>((accumulator, childId, index) => {
    const branchSide = doc.topics[childId]?.branchSide
    if (branchSide === 'left' || branchSide === 'right') {
      accumulator[childId] = branchSide
      return accumulator
    }

    accumulator[childId] = index % 2 === 0 ? 'right' : 'left'
    return accumulator
  }, {})
}

export function getRootChildForTopic(doc: MindMapDocument, topicId: string): string | null {
  if (topicId === doc.rootTopicId) {
    return null
  }

  let cursor = doc.topics[topicId]

  while (cursor && cursor.parentId && cursor.parentId !== doc.rootTopicId) {
    cursor = doc.topics[cursor.parentId]
  }

  return cursor?.id ?? null
}

export function resolveTopicSide(doc: MindMapDocument, topicId: string): ResolvedBranchSide {
  if (topicId === doc.rootTopicId) {
    return 'center'
  }

  const rootChildId = getRootChildForTopic(doc, topicId)
  if (!rootChildId) {
    return 'right'
  }

  return resolveRootBranchSides(doc)[rootChildId] ?? 'right'
}

export function getTopicAncestorIds(doc: MindMapDocument, topicId: string): string[] {
  const ancestors: string[] = []
  let cursor = doc.topics[topicId]

  while (cursor?.parentId) {
    ancestors.push(cursor.parentId)
    cursor = doc.topics[cursor.parentId]
  }

  return ancestors
}

function isDescendant(doc: MindMapDocument, candidateId: string, ancestorId: string): boolean {
  let cursor = doc.topics[candidateId]

  while (cursor?.parentId) {
    if (cursor.parentId === ancestorId) {
      return true
    }
    cursor = doc.topics[cursor.parentId]
  }

  return false
}

export function addChild(doc: MindMapDocument, parentId: string): TopicMutationResult {
  const nextDoc = cloneDocument(doc)
  const parent = nextDoc.topics[parentId]

  if (!parent) {
    return { document: doc }
  }

  const topic = createTopic(parentId)
  parent.childIds.push(topic.id)
  parent.isCollapsed = false
  nextDoc.topics[topic.id] = topic

  return {
    document: touchDocument(nextDoc),
    topicId: topic.id,
  }
}

export function addSibling(doc: MindMapDocument, topicId: string): TopicMutationResult {
  const current = doc.topics[topicId]
  if (!current?.parentId) {
    return { document: doc }
  }

  const nextDoc = cloneDocument(doc)
  const parent = nextDoc.topics[current.parentId]
  const currentIndex = parent.childIds.indexOf(topicId)
  const topic = createTopic(parent.id)

  parent.childIds.splice(currentIndex + 1, 0, topic.id)
  nextDoc.topics[topic.id] = topic

  return {
    document: touchDocument(nextDoc),
    topicId: topic.id,
  }
}

export function renameTopic(doc: MindMapDocument, topicId: string, title: string): MindMapDocument {
  const topic = doc.topics[topicId]
  const normalizedTitle = title.trim() || '新主题'

  if (!topic || topic.title === normalizedTitle) {
    return doc
  }

  const nextDoc = cloneDocument(doc)
  nextDoc.topics[topicId].title = normalizedTitle
  return touchDocument(nextDoc)
}

export function updateTopicNote(doc: MindMapDocument, topicId: string, note: string): MindMapDocument {
  const topic = doc.topics[topicId]

  if (!topic || topic.note === note) {
    return doc
  }

  const nextDoc = cloneDocument(doc)
  nextDoc.topics[topicId].note = note
  return touchDocument(nextDoc)
}

export function setTopicAiLocked(
  doc: MindMapDocument,
  topicId: string,
  aiLocked: boolean,
): MindMapDocument {
  const topic = doc.topics[topicId]

  if (!topic || topic.aiLocked === aiLocked) {
    return doc
  }

  const nextDoc = cloneDocument(doc)
  nextDoc.topics[topicId].aiLocked = aiLocked
  return touchDocument(nextDoc)
}

export function setTopicsAiLocked(
  doc: MindMapDocument,
  topicIds: string[],
  aiLocked: boolean,
): MindMapDocument {
  const normalizedTopicIds = Array.from(new Set(topicIds)).filter((topicId) => {
    const topic = doc.topics[topicId]
    return topic && topic.aiLocked !== aiLocked
  })

  if (normalizedTopicIds.length === 0) {
    return doc
  }

  const nextDoc = cloneDocument(doc)
  for (const topicId of normalizedTopicIds) {
    nextDoc.topics[topicId].aiLocked = aiLocked
  }

  return touchDocument(nextDoc)
}

export function removeTopic(doc: MindMapDocument, topicId: string): MindMapDocument {
  const topic = doc.topics[topicId]
  if (!topic || topicId === doc.rootTopicId || !topic.parentId) {
    return doc
  }

  const nextDoc = cloneDocument(doc)
  const parent = nextDoc.topics[topic.parentId]
  parent.childIds = parent.childIds.filter((childId) => childId !== topicId)

  const queue = [topicId]
  while (queue.length > 0) {
    const currentId = queue.shift()
    if (!currentId) {
      continue
    }

    const current = nextDoc.topics[currentId]
    if (!current) {
      continue
    }

    queue.push(...current.childIds)
    delete nextDoc.topics[currentId]
  }

  return touchDocument(nextDoc)
}

export function toggleCollapse(doc: MindMapDocument, topicId: string): MindMapDocument {
  const topic = doc.topics[topicId]
  if (!topic || topic.childIds.length === 0) {
    return doc
  }

  const nextDoc = cloneDocument(doc)
  nextDoc.topics[topicId].isCollapsed = !topic.isCollapsed
  return touchDocument(nextDoc)
}

export function moveTopic(
  doc: MindMapDocument,
  topicId: string,
  targetParentId: string,
  targetIndex: number,
): MindMapDocument {
  const topic = doc.topics[topicId]
  const targetParent = doc.topics[targetParentId]

  if (!topic || !targetParent || !topic.parentId || topicId === doc.rootTopicId) {
    return doc
  }

  if (targetParentId === topicId || isDescendant(doc, targetParentId, topicId)) {
    return doc
  }

  const nextDoc = cloneDocument(doc)
  const currentTopic = nextDoc.topics[topicId]
  const previousParent = nextDoc.topics[currentTopic.parentId as string]
  previousParent.childIds = previousParent.childIds.filter((childId) => childId !== topicId)

  const nextParent = nextDoc.topics[targetParentId]
  const clampedIndex = Math.max(0, Math.min(targetIndex, nextParent.childIds.length))
  nextParent.childIds.splice(clampedIndex, 0, topicId)
  nextParent.isCollapsed = false
  currentTopic.parentId = targetParentId

  if (targetParentId !== doc.rootTopicId) {
    currentTopic.branchSide = 'auto'
  }

  return touchDocument(nextDoc)
}

export function setBranchSide(doc: MindMapDocument, topicId: string, side: BranchSide): MindMapDocument {
  const topic = doc.topics[topicId]
  if (!topic || topic.branchSide === side) {
    return doc
  }

  const nextDoc = cloneDocument(doc)
  nextDoc.topics[topicId].branchSide = side
  return touchDocument(nextDoc)
}

export function renameDocumentTitle(doc: MindMapDocument, title: string): MindMapDocument {
  const normalizedTitle = title.trim() || '未命名脑图'
  if (doc.title === normalizedTitle) {
    return doc
  }

  const nextDoc = cloneDocument(doc)
  nextDoc.title = normalizedTitle
  return touchDocument(nextDoc)
}

export function updateViewport(doc: MindMapDocument, viewport: MindMapViewport): MindMapDocument {
  if (doc.viewport.x === viewport.x && doc.viewport.y === viewport.y && doc.viewport.zoom === viewport.zoom) {
    return doc
  }

  const nextDoc = cloneDocument(doc)
  nextDoc.viewport = viewport
  return nextDoc
}

export function updateWorkspaceSelection(
  doc: MindMapDocument,
  selectedTopicId: string | null,
): MindMapDocument {
  if (doc.workspace.selectedTopicId === selectedTopicId) {
    return doc
  }

  const nextDoc = cloneDocument(doc)
  nextDoc.workspace.selectedTopicId = selectedTopicId
  return nextDoc
}

export function updateWorkspaceChrome(
  doc: MindMapDocument,
  side: keyof MindMapEditorChromeState,
  open: boolean,
): MindMapDocument {
  if (doc.workspace.chrome[side] === open) {
    return doc
  }

  const nextDoc = cloneDocument(doc)
  nextDoc.workspace.chrome[side] = open
  return nextDoc
}

export function updateWorkspaceHierarchyCollapsed(
  doc: MindMapDocument,
  hierarchyCollapsedTopicIds: string[],
): MindMapDocument {
  const normalizedTopicIds = Array.from(new Set(hierarchyCollapsedTopicIds)).filter((topicId) => {
    const topic = doc.topics[topicId]
    return !!topic && topic.childIds.length > 0
  })

  if (
    normalizedTopicIds.length === doc.workspace.hierarchyCollapsedTopicIds.length &&
    normalizedTopicIds.every(
      (topicId, index) => topicId === doc.workspace.hierarchyCollapsedTopicIds[index],
    )
  ) {
    return doc
  }

  const nextDoc = cloneDocument(doc)
  nextDoc.workspace.hierarchyCollapsedTopicIds = normalizedTopicIds
  return nextDoc
}

export function toggleHierarchyBranch(doc: MindMapDocument, topicId: string): MindMapDocument {
  const topic = doc.topics[topicId]
  if (!topic || topic.childIds.length === 0) {
    return doc
  }

  const isCollapsed = doc.workspace.hierarchyCollapsedTopicIds.includes(topicId)
  const nextCollapsedTopicIds = isCollapsed
    ? doc.workspace.hierarchyCollapsedTopicIds.filter((currentTopicId) => currentTopicId !== topicId)
    : [...doc.workspace.hierarchyCollapsedTopicIds, topicId]

  return updateWorkspaceHierarchyCollapsed(doc, nextCollapsedTopicIds)
}

export function expandHierarchyPath(doc: MindMapDocument, topicId: string | null): MindMapDocument {
  if (!topicId || !doc.topics[topicId]) {
    return doc
  }

  const visibleTopicIds = new Set(getTopicAncestorIds(doc, topicId))
  if (
    doc.workspace.hierarchyCollapsedTopicIds.every(
      (collapsedTopicId) => !visibleTopicIds.has(collapsedTopicId),
    )
  ) {
    return doc
  }

  return updateWorkspaceHierarchyCollapsed(
    doc,
    doc.workspace.hierarchyCollapsedTopicIds.filter(
      (collapsedTopicId) => !visibleTopicIds.has(collapsedTopicId),
    ),
  )
}

export function setTopicOffset(
  doc: MindMapDocument,
  topicId: string,
  offsetX: number,
  offsetY: number,
): MindMapDocument {
  const topic = doc.topics[topicId]
  if (!topic) {
    return doc
  }

  const layout = getTopicLayout(topic)
  if (layout.offsetX === offsetX && layout.offsetY === offsetY) {
    return doc
  }

  const nextDoc = cloneDocument(doc)
  nextDoc.topics[topicId].layout = { offsetX, offsetY }
  return touchDocument(nextDoc)
}

export function resetTopicOffset(doc: MindMapDocument, topicId: string): MindMapDocument {
  return setTopicOffset(doc, topicId, 0, 0)
}
