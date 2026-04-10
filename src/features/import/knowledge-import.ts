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
  compileSemanticLayerViews,
  deriveSemanticGraphFromPreviewNodes,
  inferDocumentStructureTypeFromSemanticGraph,
  normalizeDocumentStructureType,
  PRIMARY_KNOWLEDGE_VIEW_TYPE,
} from '../../../shared/text-import-layering'
import {
  compileTextImportNodePlans,
  deriveTextImportNodePlansFromPreviewNodes,
  resolveTextImportPlanningOptions,
} from '../../../shared/text-import-semantics'
import { buildAiContext } from '../ai/ai-context'
import { buildTextImportPreviewTree } from './text-import-preview-tree'
import {
  createLocalTextImportBatchPreview,
  createLocalTextImportPreview,
} from './local-text-import-core'
import { preprocessTextToImportHints } from './text-import-preprocess'
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

export interface LegacyGtmRepairAvailability {
  isLegacyGtmBundle: boolean
  canRepair: boolean
  reason: string | null
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

function getPrimaryViewId(bundleId: string): string {
  return `${bundleId}_thinking`
}

function getPrimaryProjection(bundle: KnowledgeImportBundle): KnowledgeViewProjection | null {
  const thinkingViewId = bundle.views.find((view) => view.type === PRIMARY_KNOWLEDGE_VIEW_TYPE)?.id ?? null
  return (thinkingViewId ? bundle.viewProjections[thinkingViewId] : null) ?? Object.values(bundle.viewProjections)[0] ?? null
}

function hasRepeatedTitlePrefix(title: string, note: string | null | undefined): boolean {
  const normalizedTitle = title.trim()
  const normalizedNote = note?.trim() ?? ''
  if (!normalizedTitle || !normalizedNote) {
    return false
  }

  const repeatedPrefix = `${normalizedTitle} ${normalizedTitle} ${normalizedTitle} ${normalizedTitle}`
  return normalizedNote.startsWith(repeatedPrefix)
}

export function getLegacyGtmRepairAvailability(bundle: KnowledgeImportBundle | null | undefined): LegacyGtmRepairAvailability {
  if (!bundle) {
    return {
      isLegacyGtmBundle: false,
      canRepair: false,
      reason: null,
    }
  }

  const hasLegacySemanticNodeIds = bundle.semanticNodes.some((node) => node.id.startsWith('semantic_gtm_'))
  const primaryProjection = getPrimaryProjection(bundle)
  const topLevelTitles = new Set(
    (primaryProjection?.previewNodes ?? [])
      .filter((node) => node.parentId === null)
      .map((node) => node.title.trim()),
  )
  const hasLegacyTopLevelShape =
    topLevelTitles.has('第一波应该先打谁') ||
    ['谁最痛', '谁最容易现在买', '谁最容易触达', '谁最容易形成案例扩散'].every((title) =>
      bundle.semanticNodes.some((node) => node.title === title),
    )
  const hasRepeatedSummaryNote = (primaryProjection?.previewNodes ?? []).some((node) =>
    hasRepeatedTitlePrefix(node.title, node.note),
  )
  const isLegacyGtmBundle = hasLegacySemanticNodeIds || hasLegacyTopLevelShape || hasRepeatedSummaryNote

  if (!isLegacyGtmBundle) {
    return {
      isLegacyGtmBundle: false,
      canRepair: false,
      reason: null,
    }
  }

  const hasRepairableSources = bundle.sources.every((source) => typeof source.raw_content === 'string' && source.raw_content.trim().length > 0)
  return {
    isLegacyGtmBundle: true,
    canRepair: hasRepairableSources,
    reason: hasRepairableSources ? null : '当前旧导入缺少可重建的原始 source，只能重新导入。',
  }
}

function createLegacyPrimaryProjection(bundle: KnowledgeImportBundle): KnowledgeViewProjection | null {
  const legacyProjection = getPrimaryProjection(bundle)
  if (!legacyProjection) {
    return null
  }

  return {
    ...legacyProjection,
    viewId: getPrimaryViewId(bundle.id),
    viewType: PRIMARY_KNOWLEDGE_VIEW_TYPE,
  }
}

function resolveBundleDocumentType(bundle: KnowledgeImportBundle) {
  return inferDocumentStructureTypeFromSemanticGraph({
    bundleTitle: bundle.title,
    sourceTitles: bundle.sources.map((source) => source.title),
    semanticNodes: bundle.semanticNodes,
    semanticEdges: bundle.semanticEdges,
  })
}

function compilePrimaryBundleViews(
  bundle: KnowledgeImportBundle,
  fallbackInsertionParentTopicId: string,
): {
  views: KnowledgeImportBundle['views']
  viewProjections: KnowledgeImportBundle['viewProjections']
  defaultViewId: string
  activeViewId: string
} {
  if (bundle.semanticNodes.length > 0) {
    return compileSemanticLayerViews({
      bundleId: bundle.id,
      bundleTitle: bundle.title,
      sources: bundle.sources,
      semanticNodes: bundle.semanticNodes,
      semanticEdges: bundle.semanticEdges,
      fallbackInsertionParentTopicId,
      documentType: resolveBundleDocumentType(bundle),
    })
  }

  const legacyProjection = createLegacyPrimaryProjection(bundle)
  const viewId = legacyProjection?.viewId ?? getPrimaryViewId(bundle.id)

  return {
    views: [
      {
        id: viewId,
        type: PRIMARY_KNOWLEDGE_VIEW_TYPE,
        visible_node_ids: legacyProjection?.previewNodes.map((node) => node.id) ?? [],
        layout_type: 'mindmap',
      },
    ],
    viewProjections: legacyProjection ? { [viewId]: legacyProjection } : {},
    defaultViewId: viewId,
    activeViewId: viewId,
  }
}

function resolveProjection(
  bundle: KnowledgeImportBundle,
  fallbackInsertionParentTopicId: string,
): ProjectionSelection | null {
  const compiled = compilePrimaryBundleViews(bundle, fallbackInsertionParentTopicId)
  const resolvedViewId = compiled.activeViewId
  const projection = compiled.viewProjections[resolvedViewId]
  if (!projection) {
    return null
  }

  return {
    viewId: resolvedViewId,
    viewType: PRIMARY_KNOWLEDGE_VIEW_TYPE,
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
    aiLocked: item.locked ?? false,
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
    title: bundle.title,
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
        (topic.childIds.length > 0 ? 'section' : inferSemanticTypeFromTopic(topic) === 'task' ? 'task' : 'claim'),
      semanticType: previousNode?.semanticType ?? inferSemanticTypeFromTopic(topic),
      confidence: previousNode?.confidence ?? 'medium',
      sourceAnchors: cloneSourceAnchors(previousNode?.sourceAnchors),
      templateSlot: previousNode?.templateSlot ?? null,
      structureRole: previousNode?.structureRole ?? null,
      locked: previousNode?.locked ?? topic.aiLocked,
      sourceModuleId: previousNode?.sourceModuleId ?? null,
      proposedReorder: previousNode?.proposedReorder ?? null,
      proposedReparent: previousNode?.proposedReparent ?? null,
      taskDependsOn: previousNode?.taskDependsOn ? [...previousNode.taskDependsOn] : [],
      inferredOutput:
        typeof previousNode?.inferredOutput === 'boolean' ? previousNode.inferredOutput : null,
      mirroredTaskId: previousNode?.mirroredTaskId ?? null,
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
    viewType: PRIMARY_KNOWLEDGE_VIEW_TYPE,
    summary: selection.projection.summary,
    nodePlans,
    previewNodes: compiled.previewNodes,
    operations: compiled.operations,
  }
}

function hydrateBundleFromSemanticGraph(
  bundle: KnowledgeImportBundle,
  semanticNodes: KnowledgeImportBundle['semanticNodes'],
  semanticEdges: KnowledgeImportBundle['semanticEdges'],
  fallbackInsertionParentTopicId: string,
  documentType?: ReturnType<typeof normalizeDocumentStructureType>,
): KnowledgeImportBundle {
  const compiled = compileSemanticLayerViews({
    bundleId: bundle.id,
    bundleTitle: bundle.title,
    sources: bundle.sources,
    semanticNodes,
    semanticEdges,
    fallbackInsertionParentTopicId,
    documentType:
      documentType ??
      inferDocumentStructureTypeFromSemanticGraph({
        bundleTitle: bundle.title,
        sourceTitles: bundle.sources.map((source) => source.title),
        semanticNodes,
        semanticEdges,
      }),
  })

  return {
    ...bundle,
    semanticNodes,
    semanticEdges,
    views: compiled.views,
    viewProjections: compiled.viewProjections,
    defaultViewId: compiled.defaultViewId,
    activeViewId: compiled.activeViewId,
  }
}

export function syncTextImportResponseActiveProjection(
  response: TextImportResponse,
  projection: KnowledgeViewProjection,
): TextImportResponse {
  const nextBundle = response.bundle ? structuredClone(response.bundle) : null
  if (!nextBundle) {
    return {
      ...response,
      nodePlans: projection.nodePlans,
      previewNodes: projection.previewNodes,
      operations: projection.operations,
    }
  }

  const fallbackInsertionParentTopicId =
    response.anchorTopicId ?? nextBundle.anchorTopicId ?? 'topic_root'
  const semanticGraph = deriveSemanticGraphFromPreviewNodes({
    previewNodes: projection.previewNodes,
    existingNodes: response.semanticNodes.length > 0 ? response.semanticNodes : nextBundle.semanticNodes,
    existingEdges: response.semanticEdges.length > 0 ? response.semanticEdges : nextBundle.semanticEdges,
  })
  const hydratedBundle = hydrateBundleFromSemanticGraph(
    nextBundle,
    semanticGraph.semanticNodes,
    semanticGraph.semanticEdges,
    fallbackInsertionParentTopicId,
    normalizeDocumentStructureType(response.classification.archetype),
  )
  const primaryProjection = hydratedBundle.viewProjections[hydratedBundle.activeViewId]

  return {
    ...response,
    bundle: hydratedBundle,
    semanticNodes: hydratedBundle.semanticNodes,
    semanticEdges: hydratedBundle.semanticEdges,
    views: hydratedBundle.views,
    viewProjections: hydratedBundle.viewProjections,
    defaultViewId: hydratedBundle.defaultViewId,
    activeViewId: hydratedBundle.activeViewId,
    nodePlans: primaryProjection?.nodePlans ?? projection.nodePlans,
    previewNodes: primaryProjection?.previewNodes ?? projection.previewNodes,
    operations: primaryProjection?.operations ?? projection.operations,
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

  const selection = resolveProjection(bundle, bundle.anchorTopicId ?? document.rootTopicId)
  if (!selection) {
    return document
  }

  const serialized = serializeProjectionFromMountedSubtree(document, bundle, selection)
  const semanticGraph = deriveSemanticGraphFromPreviewNodes({
    previewNodes: serialized.previewNodes,
    existingNodes: bundle.semanticNodes,
    existingEdges: bundle.semanticEdges,
  })
  const nextDocument = cloneDocument(document)
  nextDocument.knowledgeImports[activeBundleId] = hydrateBundleFromSemanticGraph(
    bundle,
    semanticGraph.semanticNodes,
    semanticGraph.semanticEdges,
    bundle.anchorTopicId ?? nextDocument.rootTopicId,
    resolveBundleDocumentType(bundle),
  )
  nextDocument.workspace.activeKnowledgeViewId = PRIMARY_KNOWLEDGE_VIEW_TYPE
  return nextDocument
}

function resolveBundleSourceName(source: KnowledgeImportBundle['sources'][number]): string {
  const metadataSourceName = source.metadata?.sourceName
  if (typeof metadataSourceName === 'string' && metadataSourceName.trim()) {
    return metadataSourceName.trim()
  }

  return source.title.trim() || 'Imported source'
}

function rebuildLegacyBundleResponse(
  document: MindMapDocument,
  bundle: KnowledgeImportBundle,
): TextImportResponse | null {
  const availability = getLegacyGtmRepairAvailability(bundle)
  if (!availability.isLegacyGtmBundle || !availability.canRepair) {
    return null
  }

  const anchorTopicId =
    bundle.anchorTopicId && document.topics[bundle.anchorTopicId] ? bundle.anchorTopicId : document.rootTopicId
  const context = buildAiContext(document, [anchorTopicId], anchorTopicId)

  if (bundle.sources.length === 1) {
    const source = bundle.sources[0]
    const sourceName = resolveBundleSourceName(source)
    const rawText = source.raw_content
    const preprocessedHints = preprocessTextToImportHints(rawText)
    const planning = resolveTextImportPlanningOptions({
      sourceName,
      sourceType: source.type,
      preprocessedHints,
    })
    const rebuilt = createLocalTextImportPreview({
      documentId: document.id,
      documentTitle: document.title,
      baseDocumentUpdatedAt: document.updatedAt,
      context,
      anchorTopicId,
      sourceName,
      sourceType: source.type,
      intent: planning.intent,
      archetype: planning.resolvedArchetype,
      archetypeMode: 'auto',
      contentProfile: planning.contentProfile,
      nodeBudget: planning.nodeBudget,
      rawText,
      preprocessedHints,
      semanticHints: planning.semanticHints,
    }, {
      preparedArtifacts: planning.preparedArtifacts,
    })

    return rebuilt.response
  }

  const rebuilt = createLocalTextImportBatchPreview({
    documentId: document.id,
    documentTitle: document.title,
    baseDocumentUpdatedAt: document.updatedAt,
    context,
    anchorTopicId,
    batchTitle: bundle.title,
    files: bundle.sources.map((source) => {
      const sourceName = resolveBundleSourceName(source)
      const rawText = source.raw_content
      const preprocessedHints = preprocessTextToImportHints(rawText)
      const planning = resolveTextImportPlanningOptions({
        sourceName,
        sourceType: source.type,
        preprocessedHints,
      })

      return {
        sourceName,
        sourceType: source.type,
        rawText,
        preprocessedHints,
        semanticHints: planning.semanticHints,
        intent: planning.intent,
        archetype: planning.resolvedArchetype,
        archetypeMode: 'auto' as const,
        contentProfile: planning.contentProfile,
        nodeBudget: planning.nodeBudget,
        preparedArtifacts: planning.preparedArtifacts,
      }
    }),
  })

  return rebuilt.response
}

function rekeyBundleResponse(
  response: TextImportResponse,
  bundleId: string,
  anchorTopicId: string | null,
): TextImportResponse {
  if (!response.bundle) {
    return response
  }

  return {
    ...response,
    anchorTopicId,
    bundle: {
      ...response.bundle,
      id: bundleId,
      anchorTopicId,
    },
  }
}

export function repairKnowledgeImportBundle(
  document: MindMapDocument,
  bundleId: string,
): SwitchKnowledgeViewResult | null {
  const bundle = document.knowledgeImports[bundleId]
  if (!bundle) {
    return null
  }

  const rebuiltResponse = rebuildLegacyBundleResponse(document, bundle)
  if (!rebuiltResponse) {
    return null
  }

  const anchorTopicId =
    bundle.anchorTopicId && document.topics[bundle.anchorTopicId] ? bundle.anchorTopicId : document.rootTopicId
  return applyKnowledgeBundleToDocument(document, rekeyBundleResponse(rebuiltResponse, bundleId, anchorTopicId))
}

function buildBundleFromResponse(response: TextImportResponse): KnowledgeImportBundle | null {
  if (!response.bundle) {
    return null
  }

  const baseBundle = structuredClone(response.bundle)
  const bundle: KnowledgeImportBundle = {
    ...baseBundle,
    sources: response.sources.length > 0 ? response.sources : baseBundle.sources,
    semanticNodes: response.semanticNodes.length > 0 ? response.semanticNodes : baseBundle.semanticNodes,
    semanticEdges: response.semanticEdges.length > 0 ? response.semanticEdges : baseBundle.semanticEdges,
  }

  return hydrateBundleFromSemanticGraph(
    bundle,
    bundle.semanticNodes,
    bundle.semanticEdges,
    response.anchorTopicId ?? bundle.anchorTopicId ?? 'topic_root',
    normalizeDocumentStructureType(response.classification.archetype),
  )
}

export function applyKnowledgeBundleToDocument(
  document: MindMapDocument,
  response: TextImportResponse,
): SwitchKnowledgeViewResult | null {
  const bundle = buildBundleFromResponse(response)
  if (!bundle) {
    return null
  }

  const selection = resolveProjection(bundle, bundle.anchorTopicId ?? document.rootTopicId)
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
  appliedDocument.workspace.activeKnowledgeViewId = PRIMARY_KNOWLEDGE_VIEW_TYPE
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
  if (targetViewType !== PRIMARY_KNOWLEDGE_VIEW_TYPE) {
    return null
  }

  const activeBundleId = document.workspace.activeImportBundleId
  if (!activeBundleId) {
    return null
  }

  const syncedDocument = syncActiveKnowledgeViewProjection(document)
  const syncedBundle = syncedDocument.knowledgeImports[activeBundleId]
  if (!syncedBundle) {
    return null
  }

  const selection = resolveProjection(syncedBundle, syncedBundle.anchorTopicId ?? syncedDocument.rootTopicId)
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
  switchedDocument.workspace.activeKnowledgeViewId = PRIMARY_KNOWLEDGE_VIEW_TYPE
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
