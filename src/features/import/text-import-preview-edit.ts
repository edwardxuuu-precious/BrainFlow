import type {
  TextImportNodePlan,
  TextImportPreviewItem,
  TextImportPreviewNode,
  TextImportResponse,
} from '../../../shared/ai-contract'
import {
  buildTextImportQualityWarnings,
  compileTextImportNodePlans,
  deriveTextImportNodePlansFromPreviewNodes,
} from '../../../shared/text-import-semantics'
import { buildTextImportPreviewTree } from './text-import-preview-tree'

export type TextImportPreviewEditAction =
  | { type: 'rename'; nodeId: string; title: string }
  | { type: 'promote'; nodeId: string }
  | { type: 'demote'; nodeId: string }
  | { type: 'delete'; nodeId: string }

function cloneNodes(nodes: TextImportPreviewNode[]): TextImportPreviewNode[] {
  return nodes.map((node) => ({
    ...node,
    sourceAnchors: node.sourceAnchors?.map((anchor) => ({ ...anchor })),
    children: cloneNodes(node.children),
  }))
}

function buildDraftItemsFromNodePlans(nodePlans: TextImportNodePlan[]): TextImportPreviewItem[] {
  return nodePlans.map((plan) => ({
    id: plan.id,
    parentId: plan.parentId,
    order: plan.order,
    title: plan.title,
    note: plan.note,
    relation: 'new',
    matchedTopicId: null,
    reason: null,
    semanticRole: plan.semanticRole,
    confidence: plan.confidence,
    sourceAnchors: plan.sourceAnchors.map((anchor) => ({ ...anchor })),
    templateSlot: plan.templateSlot ?? null,
  }))
}

function getNodePlans(response: TextImportResponse): TextImportNodePlan[] {
  if (response.nodePlans.length > 0) {
    return response.nodePlans
  }

  return deriveTextImportNodePlansFromPreviewNodes({
    previewNodes: response.previewNodes,
  })
}

export function buildTextImportDraftTree(response: TextImportResponse): TextImportPreviewNode[] {
  return buildTextImportPreviewTree(buildDraftItemsFromNodePlans(getNodePlans(response)))
}

function normalizeTree(nodes: TextImportPreviewNode[], parentId: string | null = null): void {
  nodes.forEach((node, index) => {
    node.parentId = parentId
    node.order = index
    normalizeTree(node.children, node.id)
  })
}

function findNode(
  nodes: TextImportPreviewNode[],
  nodeId: string,
  parent: TextImportPreviewNode | null = null,
): { node: TextImportPreviewNode; parent: TextImportPreviewNode | null; siblings: TextImportPreviewNode[]; index: number } | null {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]
    if (node.id === nodeId) {
      return { node, parent, siblings: nodes, index }
    }

    const nested = findNode(node.children, nodeId, node)
    if (nested) {
      return nested
    }
  }

  return null
}

function flattenDraftNodes(
  nodes: TextImportPreviewNode[],
  planMetadataById: Map<
    string,
    Pick<TextImportNodePlan, 'groupKey' | 'priority' | 'collapsedByDefault'>
  >,
): TextImportNodePlan[] {
  const plans: TextImportNodePlan[] = []

  const visit = (node: TextImportPreviewNode): void => {
    const metadata = planMetadataById.get(node.id)
    plans.push({
      id: node.id,
      parentId: node.parentId,
      order: node.order,
      title: node.title,
      note: node.note,
      semanticRole: node.semanticRole ?? (node.parentId === null || node.children.length > 0 ? 'section' : 'summary'),
      confidence: node.confidence ?? (node.parentId === null ? 'high' : 'medium'),
      sourceAnchors: node.sourceAnchors?.map((anchor) => ({ ...anchor })) ?? [],
      groupKey: metadata?.groupKey ?? null,
      priority:
        metadata?.priority ??
        (node.parentId === null ? 'primary' : node.children.length > 0 ? 'secondary' : null),
      collapsedByDefault: metadata?.collapsedByDefault ?? null,
      templateSlot: node.templateSlot ?? null,
    })
    node.children.forEach(visit)
  }

  nodes.forEach(visit)
  return plans
}

export function recompileTextImportDraft(response: TextImportResponse): TextImportResponse {
  const insertionParentTopicId = response.anchorTopicId
  if (!insertionParentTopicId) {
    return response
  }

  const nodePlans = getNodePlans(response)
  const compiled = compileTextImportNodePlans({
    insertionParentTopicId,
    nodePlans,
  })
  const qualityWarnings = buildTextImportQualityWarnings({
    previewNodes: compiled.previewNodes,
  })

  return {
    ...response,
    nodePlans,
    previewNodes: compiled.previewNodes,
    operations: compiled.operations,
    warnings: [...new Set([...(response.warnings ?? []), ...qualityWarnings])],
  }
}

export function applyTextImportPreviewEdit(
  response: TextImportResponse,
  action: TextImportPreviewEditAction,
): TextImportResponse {
  const insertionParentTopicId = response.anchorTopicId
  if (!insertionParentTopicId) {
    return response
  }

  const nodePlans = getNodePlans(response)
  const roots = cloneNodes(buildTextImportPreviewTree(buildDraftItemsFromNodePlans(nodePlans)))
  const found = findNode(roots, action.nodeId)
  if (!found) {
    return response
  }

  switch (action.type) {
    case 'rename': {
      const nextTitle = action.title.trim()
      if (!nextTitle) {
        return response
      }
      found.node.title = nextTitle
      break
    }
    case 'delete': {
      found.siblings.splice(found.index, 1)
      break
    }
    case 'promote': {
      if (!found.parent) {
        return response
      }
      const parentLocation = findNode(roots, found.parent.id)
      if (!parentLocation) {
        return response
      }
      found.siblings.splice(found.index, 1)
      parentLocation.siblings.splice(parentLocation.index + 1, 0, found.node)
      break
    }
    case 'demote': {
      if (found.index === 0) {
        return response
      }
      const previousSibling = found.siblings[found.index - 1]
      if (!previousSibling) {
        return response
      }
      found.siblings.splice(found.index, 1)
      previousSibling.children.push(found.node)
      break
    }
  }

  normalizeTree(roots, null)
  const planMetadataById = new Map(
    nodePlans.map((plan) => [
      plan.id,
      {
        groupKey: plan.groupKey ?? null,
        priority: plan.priority ?? null,
        collapsedByDefault: plan.collapsedByDefault ?? null,
      },
    ]),
  )
  const nextNodePlans = flattenDraftNodes(roots, planMetadataById)
  const compiled = compileTextImportNodePlans({
    insertionParentTopicId,
    nodePlans: nextNodePlans,
  })
  const qualityWarnings = buildTextImportQualityWarnings({
    previewNodes: compiled.previewNodes,
  })
  const warnings = Array.from(
    new Set([
      ...(response.warnings ?? []),
      ...qualityWarnings,
      'The structure draft was edited manually. Previous merge suggestions were cleared; regenerate if you need fresh merge review.',
    ]),
  )

  return {
    ...response,
    nodePlans: nextNodePlans,
    previewNodes: compiled.previewNodes,
    operations: compiled.operations,
    conflicts: [],
    mergeSuggestions: [],
    crossFileMergeSuggestions: [],
    warnings,
  }
}
