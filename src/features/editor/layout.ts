import { type Edge, Position, type XYPosition, type Node } from '@xyflow/react'
import type { MindMapDocument } from '../documents/types'
import {
  getRootChildForTopic,
  getTopicDepth,
  getTopicLayout,
  resolveRootBranchSides,
  resolveTopicSide,
  type ResolvedBranchSide,
} from './tree-operations'

const ROOT_HORIZONTAL_GAP = 208
const CHILD_HORIZONTAL_GAP = 168
const VERTICAL_GAP = 30

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

function measureNode(title: string, isRoot: boolean): Pick<NodeMetrics, 'width' | 'height'> {
  const baseWidth = isRoot ? 172 : 132
  const maxWidth = isRoot ? 320 : 260
  const characterWidth = isRoot ? 14 : 11
  const width = clamp(baseWidth + title.trim().length * characterWidth, baseWidth, maxWidth)

  return {
    width,
    height: isRoot ? 58 : 44,
  }
}

function buildMetrics(doc: MindMapDocument, topicId: string, cache: Map<string, NodeMetrics>): NodeMetrics {
  const cached = cache.get(topicId)
  if (cached) {
    return cached
  }

  const topic = doc.topics[topicId]
  const isRoot = topicId === doc.rootTopicId
  const { width, height } = measureNode(topic.title, isRoot)
  const childIds = topic.isCollapsed ? [] : topic.childIds

  if (childIds.length === 0) {
    const metrics = { width, height, subtreeHeight: height }
    cache.set(topicId, metrics)
    return metrics
  }

  const childHeight = childIds.reduce((sum, childId, index) => {
    const childMetrics = buildMetrics(doc, childId, cache)
    return sum + childMetrics.subtreeHeight + (index > 0 ? VERTICAL_GAP : 0)
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

      directionalChildIds.forEach((childId) => {
        const childMetrics = buildMetrics(doc, childId, metricsCache)
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
          type: 'smoothstep',
          sourceHandle: branchDirection === 'left' ? 'source-left' : 'source-right',
          targetHandle: branchDirection === 'left' ? 'target-right' : 'target-left',
          style: {
            stroke: getBranchColor(childId),
            strokeWidth: topicId === doc.rootTopicId ? 2 : 1.5,
            opacity: topicId === doc.rootTopicId ? 0.92 : 0.7,
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
