import { type Edge, Position, type XYPosition, type Node } from '@xyflow/react'
import type { MindMapDocument, TopicMetadata, TopicNode, TopicStyle } from '../documents/types'
import { normalizeTopicMetadata, normalizeTopicStyle } from '../documents/topic-defaults'
import { getTopicNotePreview } from '../documents/topic-rich-text'
import {
  getRootChildForTopic,
  getTopicDepth,
  getTopicLayout,
  resolveRootBranchSides,
  resolveTopicSide,
  type ResolvedBranchSide,
} from './tree-operations'
import {
  getTopicTitleTypography,
  measureTopicTitle,
  measureWeightedTitleWidth,
} from './topic-title-display'

const ROOT_HORIZONTAL_GAP = 208
const CHILD_HORIZONTAL_GAP = 168
const VERTICAL_GAP = 30
const ROOT_HORIZONTAL_PADDING = 40
const NODE_HORIZONTAL_PADDING = 28
const ROOT_VERTICAL_PADDING = 32
const NODE_VERTICAL_PADDING = 20
const CONTENT_ROW_GAP = 4
const STATUS_BAR_HEIGHT = 22
const META_ROW_HEIGHT = 22
const DETAIL_PREVIEW_FONT_SIZE = 12
const DETAIL_PREVIEW_ROOT_FONT_SIZE = 13
const DETAIL_PREVIEW_LINE_HEIGHT = 1.45
const DETAIL_PREVIEW_LINE_LIMIT = 2
const DETAIL_PREVIEW_ROOT_LINE_LIMIT = 3
const DETAIL_PREVIEW_VERTICAL_PADDING = 14
const DETAIL_PREVIEW_ROOT_VERTICAL_PADDING = 18
const DETAIL_PREVIEW_HORIZONTAL_PADDING = 20
const DETAIL_PREVIEW_ROOT_HORIZONTAL_PADDING = 24
const DETAIL_PREVIEW_WIDTH_BOOST = 24
const DETAIL_PREVIEW_ROOT_WIDTH_BOOST = 18

interface NodeMetrics {
  width: number
  height: number
  subtreeHeight: number
}

interface Bounds {
  left: number
  top: number
  right: number
  bottom: number
}

export interface TopicRenderData extends Record<string, unknown> {
  topicId: string
  title: string
  note: string
  notePreview: string
  aiLocked: boolean
  metadata: TopicMetadata
  style: TopicStyle
  depth: number
  isRoot: boolean
  isCollapsed: boolean
  childCount: number
  branchColor: string
  side: ResolvedBranchSide
}

export type MindMapFlowNode = Node<TopicRenderData, 'topic'>

export interface LayoutResult {
  renderNodes: MindMapFlowNode[]
  renderEdges: Edge[]
  subtreeBounds: Record<string, { x: number; y: number; width: number; height: number }>
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max))
}

function hasTopicStatusBar(topic: TopicNode): boolean {
  return topic.aiLocked || (!!topic.metadata.type && topic.metadata.type !== 'normal')
}

function hasTopicMetaRow(metadata: TopicMetadata): boolean {
  return (
    metadata.labels.length > 0 ||
    metadata.markers.length > 0 ||
    (metadata.stickers?.length ?? 0) > 0
  )
}

function getTopicDetailPreview(topic: TopicNode, isRoot: boolean): string {
  return getTopicNotePreview(topic.noteRich, topic.note, isRoot ? 144 : 96)
}

function measureNode(
  topic: TopicNode,
  isRoot: boolean,
  options?: { priority?: 'primary' | 'secondary' | 'supporting' | null; topicType?: TopicMetadata['type'] },
): Pick<NodeMetrics, 'width' | 'height'> {
  const notePreview = getTopicDetailPreview(topic, isRoot)
  const hasDetailPreview = notePreview.length > 0
  const baseWidth = isRoot ? 248 : 148
  const maxWidth = isRoot ? 420 : 320
  const priorityBoost =
    options?.priority === 'primary' ? 28 : options?.priority === 'supporting' ? -12 : 0
  const typeBoost = options?.topicType === 'milestone' ? 10 : options?.topicType === 'task' ? 16 : 0
  const titleKind = isRoot ? 'root' : 'regular'
  const titleTypography = getTopicTitleTypography(topic.title, titleKind)
  const horizontalPadding = isRoot ? ROOT_HORIZONTAL_PADDING : NODE_HORIZONTAL_PADDING
  const verticalPadding = isRoot ? ROOT_VERTICAL_PADDING : NODE_VERTICAL_PADDING
  const detailWidthBoost = hasDetailPreview
    ? isRoot
      ? DETAIL_PREVIEW_ROOT_WIDTH_BOOST
      : DETAIL_PREVIEW_WIDTH_BOOST
    : 0
  const minimumWidth = baseWidth + priorityBoost + typeBoost + detailWidthBoost
  const estimatedTitleWidth =
    measureWeightedTitleWidth(
      topic.title,
      titleTypography.fontSize,
      titleTypography.letterSpacing,
    ) + horizontalPadding
  const width = clamp(Math.ceil(Math.max(minimumWidth, estimatedTitleWidth)), baseWidth, maxWidth)
  const titleMeasurement = measureTopicTitle(topic.title, {
    kind: titleKind,
    availableWidth: width - horizontalPadding,
  })
  const hasStatusBar = hasTopicStatusBar(topic)
  const hasMetaRow = hasTopicMetaRow(topic.metadata)
  const detailFontSize = isRoot ? DETAIL_PREVIEW_ROOT_FONT_SIZE : DETAIL_PREVIEW_FONT_SIZE
  const detailLineLimit = isRoot ? DETAIL_PREVIEW_ROOT_LINE_LIMIT : DETAIL_PREVIEW_LINE_LIMIT
  const detailVerticalPadding = isRoot
    ? DETAIL_PREVIEW_ROOT_VERTICAL_PADDING
    : DETAIL_PREVIEW_VERTICAL_PADDING
  const detailHorizontalPadding = isRoot
    ? DETAIL_PREVIEW_ROOT_HORIZONTAL_PADDING
    : DETAIL_PREVIEW_HORIZONTAL_PADDING
  const detailMeasurement = hasDetailPreview
    ? Math.min(
        detailLineLimit,
        Math.max(
          1,
          Math.ceil(
            measureWeightedTitleWidth(notePreview, detailFontSize) /
              Math.max(1, width - horizontalPadding - detailHorizontalPadding),
          ),
        ),
      ) *
        detailFontSize *
        DETAIL_PREVIEW_LINE_HEIGHT +
      detailVerticalPadding
    : 0
  const contentRowCount = 1 + Number(hasStatusBar) + Number(hasDetailPreview) + Number(hasMetaRow)
  const contentHeight =
    titleMeasurement.height +
    (hasStatusBar ? STATUS_BAR_HEIGHT : 0) +
    detailMeasurement +
    (hasMetaRow ? META_ROW_HEIGHT : 0) +
    Math.max(0, contentRowCount - 1) * CONTENT_ROW_GAP

  return {
    width,
    height: Math.max(
      isRoot ? 82 : options?.priority === 'primary' ? 58 : 54,
      Math.ceil(contentHeight + verticalPadding),
    ),
  }
}

function buildMetrics(doc: MindMapDocument, topicId: string, cache: Map<string, NodeMetrics>): NodeMetrics {
  const cached = cache.get(topicId)
  if (cached) {
    return cached
  }

  const topic = doc.topics[topicId]
  const isRoot = topicId === doc.rootTopicId
  const topicLayout = getTopicLayout(topic)
  const { width, height } = measureNode(topic, isRoot, {
    priority: topicLayout.priority,
    topicType: topic.metadata.type,
  })
  const childIds = topic.isCollapsed ? [] : topic.childIds

  if (childIds.length === 0) {
    const metrics = { width, height, subtreeHeight: height }
    cache.set(topicId, metrics)
    return metrics
  }

  const childHeight = childIds.reduce((sum, childId, index) => {
    const childMetrics = buildMetrics(doc, childId, cache)
    const previousChildId = index > 0 ? childIds[index - 1] : null
    const previousLayout = previousChildId ? getTopicLayout(doc.topics[previousChildId]) : null
    const currentLayout = getTopicLayout(doc.topics[childId])
    const groupGap =
      index > 0 && previousLayout?.semanticGroupKey !== currentLayout.semanticGroupKey
        ? 18
        : 0
    return sum + childMetrics.subtreeHeight + (index > 0 ? VERTICAL_GAP + groupGap : 0)
  }, 0)

  const metrics = {
    width,
    height,
    subtreeHeight: Math.max(height, childHeight),
  }

  cache.set(topicId, metrics)
  return metrics
}

function mergeBounds(bounds: Bounds, next: Bounds): Bounds {
  return {
    left: Math.min(bounds.left, next.left),
    top: Math.min(bounds.top, next.top),
    right: Math.max(bounds.right, next.right),
    bottom: Math.max(bounds.bottom, next.bottom),
  }
}

function createBounds(centerX: number, centerY: number, width: number, height: number): Bounds {
  return {
    left: centerX - width / 2,
    top: centerY - height / 2,
    right: centerX + width / 2,
    bottom: centerY + height / 2,
  }
}

export function layoutMindMap(doc: MindMapDocument): LayoutResult {
  const metricsCache = new Map<string, NodeMetrics>()
  const nodes: MindMapFlowNode[] = []
  const edges: Edge[] = []
  const subtreeBounds = new Map<string, Bounds>()
  const rootSides = resolveRootBranchSides(doc)
  const root = doc.topics[doc.rootTopicId]
  const rootChildIndex = new Map(root.childIds.map((childId, index) => [childId, index]))

  const getBranchColor = (topicId: string): string => {
    const topic = doc.topics[topicId]
    const style = normalizeTopicStyle(topic?.style)
    if (style.branchColor) {
      return style.branchColor
    }

    if (topicId === doc.rootTopicId) {
      return doc.theme.accent
    }

    const rootChildId = getRootChildForTopic(doc, topicId)
    const index = rootChildId ? (rootChildIndex.get(rootChildId) ?? 0) : 0
    return doc.theme.branchPalette[index % doc.theme.branchPalette.length]
  }

  const placeTopic = (topicId: string, baseCenter: XYPosition): Bounds => {
    const topic = doc.topics[topicId]
    const metrics = buildMetrics(doc, topicId, metricsCache)
    const side = resolveTopicSide(doc, topicId)
    const ownOffset = getTopicLayout(topic)
    const finalCenter = {
      x: baseCenter.x + ownOffset.offsetX,
      y: baseCenter.y + ownOffset.offsetY,
    }
    const bounds = createBounds(finalCenter.x, finalCenter.y, metrics.width, metrics.height)

    nodes.push({
      id: topicId,
      type: 'topic',
      position: {
        x: bounds.left,
        y: bounds.top,
      },
      draggable: true,
      sourcePosition: side === 'left' ? Position.Left : Position.Right,
      targetPosition: side === 'left' ? Position.Right : Position.Left,
      style: {
        width: metrics.width,
        height: metrics.height,
      },
      data: {
        topicId,
        title: topic.title,
        note: topic.note,
        notePreview: getTopicDetailPreview(topic, topicId === doc.rootTopicId),
        aiLocked: topic.aiLocked,
        metadata: normalizeTopicMetadata(topic.metadata),
        style: normalizeTopicStyle(topic.style),
        depth: getTopicDepth(doc, topicId),
        isRoot: topicId === doc.rootTopicId,
        isCollapsed: topic.isCollapsed,
        childCount: topic.childIds.length,
        branchColor: getBranchColor(topicId),
        side,
      },
    })

    let nextBounds = bounds
    const childIds = topic.isCollapsed ? [] : topic.childIds
    if (childIds.length === 0) {
      subtreeBounds.set(topicId, nextBounds)
      return nextBounds
    }

    const direction = topicId === doc.rootTopicId ? 'center' : side
    const groups =
      direction === 'center'
        ? {
            left: childIds.filter((childId) => rootSides[childId] === 'left'),
            right: childIds.filter((childId) => rootSides[childId] !== 'left'),
          }
        : {
            [direction]: childIds,
          }

    const placeChildren = (directionalChildIds: string[], branchDirection: 'left' | 'right'): void => {
      if (directionalChildIds.length === 0) {
        return
      }

      const totalHeight = directionalChildIds.reduce((sum, childId, index) => {
        const childMetrics = buildMetrics(doc, childId, metricsCache)
        return sum + childMetrics.subtreeHeight + (index > 0 ? VERTICAL_GAP : 0)
      }, 0)

      let cursor = finalCenter.y - totalHeight / 2

      directionalChildIds.forEach((childId, index) => {
        const childMetrics = buildMetrics(doc, childId, metricsCache)
        if (index > 0) {
          const previousChildId = directionalChildIds[index - 1]
          const previousLayout = getTopicLayout(doc.topics[previousChildId])
          const currentLayout = getTopicLayout(doc.topics[childId])
          if (previousLayout.semanticGroupKey !== currentLayout.semanticGroupKey) {
            cursor += 18
          }
        }
        const horizontalGap = topicId === doc.rootTopicId ? ROOT_HORIZONTAL_GAP : CHILD_HORIZONTAL_GAP
        const childBaseCenter = {
          x:
            finalCenter.x +
            (branchDirection === 'right' ? 1 : -1) *
              (metrics.width / 2 + horizontalGap + childMetrics.width / 2),
          y: cursor + childMetrics.subtreeHeight / 2,
        }

        const childBounds = placeTopic(childId, childBaseCenter)
        cursor += childMetrics.subtreeHeight + VERTICAL_GAP
        nextBounds = mergeBounds(nextBounds, childBounds)

        edges.push({
          id: `${topicId}-${childId}`,
          source: topicId,
          target: childId,
          type: 'default',
          sourceHandle: branchDirection === 'left' ? 'source-left' : 'source-right',
          targetHandle: branchDirection === 'left' ? 'target-right' : 'target-left',
          style: {
            stroke: getBranchColor(childId),
            strokeWidth: topicId === doc.rootTopicId ? 2 : 1.5,
            opacity: topicId === doc.rootTopicId ? 0.82 : 0.58,
          },
        })
      })
    }

    placeChildren(groups.left ?? [], 'left')
    placeChildren(groups.right ?? [], 'right')
    subtreeBounds.set(topicId, nextBounds)
    return nextBounds
  }

  placeTopic(doc.rootTopicId, { x: 0, y: 0 })

  return {
    renderNodes: nodes,
    renderEdges: edges,
    subtreeBounds: Object.fromEntries(
      Array.from(subtreeBounds.entries()).map(([topicId, bounds]) => [
        topicId,
        {
          x: bounds.left,
          y: bounds.top,
          width: bounds.right - bounds.left,
          height: bounds.bottom - bounds.top,
        },
      ]),
    ),
  }
}
