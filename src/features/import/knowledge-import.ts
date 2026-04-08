import type {
  AiImportOperation,
  KnowledgeImportBundle,
  KnowledgeSemanticNodeType,
  KnowledgeViewProjection,
  KnowledgeViewType,
  TextImportNodePlan,
  TextImportPreviewItem,
  TextImportResponse,
} from '../../../shared/ai-contract'
import {
  compileTextImportNodePlans,
  deriveTextImportNodePlansFromPreviewNodes,
} from '../../../shared/text-import-semantics'
import { buildTextImportPreviewTree } from './text-import-preview-tree'
import { createDefaultTopicMetadata, createDefaultTopicStyle } from '../documents/topic-defaults'
import { createTopicRichTextFromPlainText } from '../documents/topic-rich-text'
import type { MindMapDocument, TopicNode } from '../documents/types'

interface ProjectionSelection {
  viewId: string
  viewType: KnowledgeViewType
  projection: KnowledgeViewProjection
}

interface MountedProjectionResult {
  document: MindMapDocument
  mountedRootTopicId: string | null
}

interface SwitchKnowledgeViewResult {
  document: MindMapDocument
  selectedTopicId: string | null
}

function cloneDocument(document: MindMapDocument): MindMapDocument {
  return structuredClone(document)
}

function touchDocument(document: MindMapDocument): MindMapDocument {
  document.updatedAt = Date.now()
  return document
}

function createTopicId(): string {
  return `topic_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function findBundleViewIdByType(
  bundle: KnowledgeImportBundle,
  viewType: KnowledgeViewType,
): string | null {
  return bundle.views.find((view) => view.type === viewType)?.id ?? null
}

function inferViewTypeFromId(viewId: string | null | undefined): KnowledgeViewType | null {
  if (!viewId) {
    return null
  }
  if (viewId.endsWith('_archive')) {
    return 'archive_view'
  }
  if (viewId.endsWith('_execution')) {
    return 'execution_view'
  }
  if (viewId.endsWith('_thinking')) {
    return 'thinking_view'
  }
  return null
}

function resolveProjection(
  bundle: KnowledgeImportBundle,
  viewId: string | null | undefined,
): ProjectionSelection | null {
  const resolvedViewId =
    (viewId && bundle.viewProjections[viewId] ? viewId : null) ??
    (bundle.activeViewId && bundle.viewProjections[bundle.activeViewId] ? bundle.activeViewId : null) ??
    (bundle.defaultViewId && bundle.viewProjections[bundle.defaultViewId] ? bundle.defaultViewId : null) ??
    Object.keys(bundle.viewProjections)[0] ??
    null

  if (!resolvedViewId) {
    return null
  }

  const viewType =
    bundle.views.find((view) => view.id === resolvedViewId)?.type ??
    inferViewTypeFromId(resolvedViewId)

  if (!viewType) {
    return null
  }

  const projection = bundle.viewProjections[resolvedViewId]
  if (!projection) {
    return null
  }

  return {
    viewId: resolvedViewId,
    viewType,
    projection,
  }
}

function createTopicFromPreviewItem(
  parentId: string,
  item: TextImportPreviewItem,
  planById: Map<string, TextImportNodePlan>,
): TopicNode {
  const plan = planById.get(item.id)
  const metadata = createDefaultTopicMetadata()
  if (item.semanticType === 'task') {
    metadata.type = 'task'
  }

  return {
    id: createTopicId(),
    parentId,
    childIds: [],
    title: item.title.trim() || 'New topic',
    note: item.note ?? '',
    noteRich: createTopicRichTextFromPlainText(item.note ?? ''),
    aiLocked: false,
    isCollapsed: false,
    branchSide: 'auto',
    layout: {
      offsetX: 0,
      offsetY: 0,
      semanticGroupKey: plan?.groupKey ?? null,
      priority: plan?.priority ?? null,
    },
    metadata,
    style: createDefaultTopicStyle(),
  }
}

function removeMountedSubtreeInPlace(document: MindMapDocument, mountedRootTopicId: string | null): void {
  if (!mountedRootTopicId || mountedRootTopicId === document.rootTopicId || !document.topics[mountedRootTopicId]) {
    return
  }

  const mountedRoot = document.topics[mountedRootTopicId]
  if (mountedRoot.parentId && document.topics[mountedRoot.parentId]) {
    document.topics[mountedRoot.parentId].childIds = document.topics[mountedRoot.parentId].childIds.filter(
      (childId) => childId !== mountedRootTopicId,
    )
  }

  const queue = [mountedRootTopicId]
  while (queue.length > 0) {
    const currentId = queue.shift()
    if (!currentId || !document.topics[currentId]) {
      continue
    }

    queue.push(...document.topics[currentId].childIds)
    delete document.topics[currentId]
  }
}

function createSyntheticProjectionRootTitle(
  projection: KnowledgeViewProjection,
  bundle: KnowledgeImportBundle,
): string {
  switch (projection.viewType) {
    case 'archive_view':
      return '来源归档'
    case 'execution_view':
      return '执行闭环'
    case 'thinking_view':
    default:
      return bundle.title
  }
}

function mountProjectionIntoDocument(
  document: MindMapDocument,
  bundle: KnowledgeImportBundle,
  projection: KnowledgeViewProjection,
  anchorTopicId: string,
): MountedProjectionResult {
  const nextDocument = cloneDocument(document)
  const anchorTopic = nextDocument.topics[anchorTopicId] ? anchorTopicId : nextDocument.rootTopicId
  const previewRoots = projection.previewNodes
    .filter((node) => node.parentId === null)
    .sort((left, right) => left.order - right.order)
  const childrenByParent = new Map<string | null, TextImportPreviewItem[]>()
  projection.previewNodes.forEach((node) => {
    const siblings = childrenByParent.get(node.parentId) ?? []
    siblings.push(node)
    childrenByParent.set(node.parentId, siblings)
  })
  const planById = new Map(projection.nodePlans.map((plan) => [plan.id, plan]))

  if (previewRoots.length === 0) {
    return { document: nextDocument, mountedRootTopicId: null }
  }

  const createSubtree = (previewItem: TextImportPreviewItem, parentId: string): string => {
    const topic = createTopicFromPreviewItem(parentId, previewItem, planById)
    nextDocument.topics[topic.id] = topic
    nextDocument.topics[parentId].childIds.push(topic.id)
    nextDocument.topics[parentId].isCollapsed = false

    const children = (childrenByParent.get(previewItem.id) ?? []).sort((left, right) => left.order - right.order)
    children.forEach((child) => {
      createSubtree(child, topic.id)
    })
    return topic.id
  }

  if (previewRoots.length === 1) {
    return {
      document: nextDocument,
      mountedRootTopicId: createSubtree(previewRoots[0], anchorTopic),
    }
  }

  const syntheticRoot: TopicNode = {
    id: createTopicId(),
    parentId: anchorTopic,
    childIds: [],
    title: createSyntheticProjectionRootTitle(projection, bundle),
    note: '',
    noteRich: null,
    aiLocked: false,
    isCollapsed: false,
    branchSide: 'auto',
    layout: {
      offsetX: 0,
      offsetY: 0,
      semanticGroupKey: null,
      priority: 'primary',
    },
    metadata: createDefaultTopicMetadata(),
    style: createDefaultTopicStyle(),
  }
  nextDocument.topics[syntheticRoot.id] = syntheticRoot
  nextDocument.topics[anchorTopic].childIds.push(syntheticRoot.id)
  nextDocument.topics[anchorTopic].isCollapsed = false

  previewRoots.forEach((previewRoot) => {
    createSubtree(previewRoot, syntheticRoot.id)
  })

  return {
    document: nextDocument,
    mountedRootTopicId: syntheticRoot.id,
  }
}

function inferSemanticTypeFromTopic(topic: TopicNode): KnowledgeSemanticNodeType | null {
  if (topic.metadata.type === 'task') {
    return 'task'
  }
  return null
}

function cloneSourceAnchors(
  anchors: TextImportPreviewItem['sourceAnchors'] | undefined,
): NonNullable<TextImportPreviewItem['sourceAnchors']> {
  return anchors?.map((anchor) => ({ ...anchor })) ?? []
}

function serializeProjectionFromMountedSubtree(
  document: MindMapDocument,
  bundle: KnowledgeImportBundle,
  selection: ProjectionSelection,
): KnowledgeViewProjection {
  const mountedRootTopicId = bundle.mountedRootTopicId
  if (!mountedRootTopicId || !document.topics[mountedRootTopicId]) {
    return selection.projection
  }

  const previousRoots = selection.projection.previewNodes.filter((node) => node.parentId === null)
  const mountedRootTopic = document.topics[mountedRootTopicId]
  const startingTopicIds =
    previousRoots.length > 1 ? mountedRootTopic.childIds.filter((topicId) => document.topics[topicId]) : [mountedRootTopicId]
  const previousRootsTree = buildTextImportPreviewTree(selection.projection.previewNodes)
  const previewNodes: TextImportPreviewItem[] = []

  const visit = (
    topicId: string,
    parentId: string | null,
    order: number,
    previousNode: ReturnType<typeof buildTextImportPreviewTree>[number] | undefined,
  ): void => {
    const topic = document.topics[topicId]
    if (!topic) {
      return
    }

    previewNodes.push({
      id: previousNode?.id ?? topic.id,
      parentId,
      order,
      title: topic.title,
      note: topic.note.trim() ? topic.note : null,
      relation: 'new',
      matchedTopicId: null,
      reason: null,
      semanticRole:
        previousNode?.semanticRole ??
        (topic.childIds.length > 0 ? 'section' : inferSemanticTypeFromTopic(topic) === 'task' ? 'action' : 'summary'),
      semanticType: previousNode?.semanticType ?? inferSemanticTypeFromTopic(topic),
      confidence: previousNode?.confidence ?? 'medium',
      sourceAnchors: cloneSourceAnchors(previousNode?.sourceAnchors),
      templateSlot: previousNode?.templateSlot ?? null,
    })

    topic.childIds.forEach((childId, childIndex) => {
      visit(childId, previousNode?.id ?? topic.id, childIndex, previousNode?.children[childIndex])
    })
  }

  startingTopicIds.forEach((topicId, index) => {
    visit(topicId, null, index, previousRootsTree[index])
  })

  const nodePlans = deriveTextImportNodePlansFromPreviewNodes({ previewNodes })
  const compiled = compileTextImportNodePlans({
    insertionParentTopicId: bundle.anchorTopicId ?? document.rootTopicId,
    nodePlans,
  })

  return {
    viewId: selection.viewId,
    viewType: selection.viewType,
    summary: selection.projection.summary,
    nodePlans,
    previewNodes: compiled.previewNodes,
    operations: compiled.operations,
  }
}

export function syncTextImportResponseActiveProjection(
  response: TextImportResponse,
  projection: KnowledgeViewProjection,
): TextImportResponse {
  const activeViewId = response.activeViewId ?? projection.viewId
  const nextBundle = response.bundle ? structuredClone(response.bundle) : null
  if (nextBundle) {
    nextBundle.activeViewId = activeViewId
    nextBundle.viewProjections[activeViewId] = projection
  }

  return {
    ...response,
    bundle: nextBundle,
    viewProjections: {
      ...response.viewProjections,
      [activeViewId]: projection,
    },
    activeViewId,
    nodePlans: projection.nodePlans,
    previewNodes: projection.previewNodes,
    operations: projection.operations,
  }
}

export function syncActiveKnowledgeViewProjection(document: MindMapDocument): MindMapDocument {
  const activeBundleId = document.workspace.activeImportBundleId
  if (!activeBundleId) {
    return document
  }

  const bundle = document.knowledgeImports[activeBundleId]
  if (!bundle) {
    return document
  }

  const selection = resolveProjection(
    bundle,
    findBundleViewIdByType(bundle, document.workspace.activeKnowledgeViewId ?? 'thinking_view'),
  )
  if (!selection) {
    return document
  }

  const serialized = serializeProjectionFromMountedSubtree(document, bundle, selection)
  const nextDocument = cloneDocument(document)
  nextDocument.knowledgeImports[activeBundleId] = {
    ...bundle,
    viewProjections: {
      ...bundle.viewProjections,
      [selection.viewId]: serialized,
    },
  }
  return nextDocument
}

function buildBundleFromResponse(response: TextImportResponse): KnowledgeImportBundle | null {
  if (!response.bundle) {
    return null
  }

  const bundle = structuredClone(response.bundle)
  bundle.sources = response.sources.length > 0 ? response.sources : bundle.sources
  bundle.semanticNodes = response.semanticNodes.length > 0 ? response.semanticNodes : bundle.semanticNodes
  bundle.semanticEdges = response.semanticEdges.length > 0 ? response.semanticEdges : bundle.semanticEdges
  bundle.views = response.views.length > 0 ? response.views : bundle.views
  bundle.viewProjections = {
    ...bundle.viewProjections,
    ...response.viewProjections,
  }
  if (response.defaultViewId) {
    bundle.defaultViewId = response.defaultViewId
  }
  if (response.activeViewId) {
    bundle.activeViewId = response.activeViewId
  }
  const activeSelection = resolveProjection(bundle, response.activeViewId)
  if (activeSelection) {
    bundle.viewProjections[activeSelection.viewId] = {
      viewId: activeSelection.viewId,
      viewType: activeSelection.viewType,
      summary: activeSelection.projection.summary,
      nodePlans: response.nodePlans.length > 0 ? response.nodePlans : activeSelection.projection.nodePlans,
      previewNodes:
        response.previewNodes.length > 0 ? response.previewNodes : activeSelection.projection.previewNodes,
      operations: response.operations.length > 0 ? response.operations : activeSelection.projection.operations,
    }
  }
  return bundle
}

export function applyKnowledgeBundleToDocument(
  document: MindMapDocument,
  response: TextImportResponse,
): SwitchKnowledgeViewResult | null {
  const bundle = buildBundleFromResponse(response)
  if (!bundle) {
    return null
  }

  const selection = resolveProjection(bundle, bundle.activeViewId)
  if (!selection) {
    return null
  }

  const nextDocument = cloneDocument(document)
  const existingBundle = nextDocument.knowledgeImports[bundle.id]
  removeMountedSubtreeInPlace(nextDocument, existingBundle?.mountedRootTopicId ?? bundle.mountedRootTopicId)

  const anchorTopicId =
    (response.anchorTopicId && nextDocument.topics[response.anchorTopicId] && response.anchorTopicId) ??
    (bundle.anchorTopicId && nextDocument.topics[bundle.anchorTopicId] && bundle.anchorTopicId) ??
    nextDocument.rootTopicId
  const mounted = mountProjectionIntoDocument(nextDocument, bundle, selection.projection, anchorTopicId)
  const appliedDocument = mounted.document

  appliedDocument.knowledgeImports[bundle.id] = {
    ...bundle,
    anchorTopicId,
    activeViewId: selection.viewId,
    mountedRootTopicId: mounted.mountedRootTopicId,
  }
  appliedDocument.workspace.activeImportBundleId = bundle.id
  appliedDocument.workspace.activeKnowledgeViewId = selection.viewType
  appliedDocument.workspace.selectedTopicId = mounted.mountedRootTopicId ?? anchorTopicId

  return {
    document: touchDocument(appliedDocument),
    selectedTopicId: mounted.mountedRootTopicId ?? anchorTopicId,
  }
}

export function switchKnowledgeView(
  document: MindMapDocument,
  targetViewType: KnowledgeViewType,
): SwitchKnowledgeViewResult | null {
  const activeBundleId = document.workspace.activeImportBundleId
  if (!activeBundleId) {
    return null
  }

  const activeBundle = document.knowledgeImports[activeBundleId]
  if (!activeBundle) {
    return null
  }

  const syncedDocument = syncActiveKnowledgeViewProjection(document)
  const syncedBundle = syncedDocument.knowledgeImports[activeBundleId]
  const targetViewId = findBundleViewIdByType(syncedBundle, targetViewType)
  if (!targetViewId) {
    return null
  }

  const selection = resolveProjection(syncedBundle, targetViewId)
  if (!selection) {
    return null
  }

  const nextDocument = cloneDocument(syncedDocument)
  removeMountedSubtreeInPlace(nextDocument, syncedBundle.mountedRootTopicId)

  const anchorTopicId =
    syncedBundle.anchorTopicId && nextDocument.topics[syncedBundle.anchorTopicId]
      ? syncedBundle.anchorTopicId
      : nextDocument.rootTopicId
  const mounted = mountProjectionIntoDocument(nextDocument, syncedBundle, selection.projection, anchorTopicId)
  const switchedDocument = mounted.document

  switchedDocument.knowledgeImports[activeBundleId] = {
    ...syncedBundle,
    anchorTopicId,
    activeViewId: selection.viewId,
    mountedRootTopicId: mounted.mountedRootTopicId,
  }
  switchedDocument.workspace.activeKnowledgeViewId = targetViewType
  switchedDocument.workspace.selectedTopicId = mounted.mountedRootTopicId ?? anchorTopicId

  return {
    document: touchDocument(switchedDocument),
    selectedTopicId: mounted.mountedRootTopicId ?? anchorTopicId,
  }
}

export function collectApprovedNonStructuralOperations(
  document: MindMapDocument,
  response: TextImportResponse,
  approvedConflictIds: Set<string>,
  warnings: string[],
): AiImportOperation[] {
  return response.operations.filter((operation) => {
    if (!(operation.risk === 'low' || (operation.conflictId && approvedConflictIds.has(operation.conflictId)))) {
      return false
    }

    if (operation.type === 'create_child') {
      return false
    }

    if (operation.type !== 'update_topic') {
      return true
    }

    const targetTopicId =
      typeof operation.target === 'string' && operation.target.startsWith('topic:')
        ? operation.target.slice('topic:'.length)
        : null
    if (!targetTopicId) {
      return true
    }

    if (!operation.targetFingerprint) {
      return true
    }

    const targetTopic = document.topics[targetTopicId]
    if (!targetTopic) {
      warnings.push(`Skipped semantic merge for missing topic target ${String(operation.target)}.`)
      return false
    }

    const fingerprint = JSON.stringify({
      title: targetTopic.title,
      note: targetTopic.note,
      parentId: targetTopic.parentId,
      metadata: targetTopic.metadata,
      style: targetTopic.style,
    })
    if (fingerprint !== operation.targetFingerprint) {
      warnings.push(
        `Skipped semantic merge for "${targetTopic.title}" because the topic changed after preview generation.`,
      )
      return false
    }

    return true
  })
}
