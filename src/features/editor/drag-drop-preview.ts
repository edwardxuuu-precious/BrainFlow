import type { MindMapDocument } from '../documents/types'
import type { LayoutResult, MindMapFlowNode } from './layout'

const PARENT_DROP_ZONE_PADDING_X = 36
const PARENT_DROP_ZONE_PADDING_Y = 24
const CHILD_LANE_PADDING_X = 28
const CHILD_LANE_PADDING_Y = 24
const EMPTY_CHILD_LANE_WIDTH = 236
const EMPTY_CHILD_LANE_HEIGHT = 156
const EMPTY_CHILD_LANE_GAP = 40

export interface TopicRect {
  x: number
  y: number
  width: number
  height: number
}

export interface TopicDropPreview {
  targetParentId: string
  targetIndex: number
  isStructuralMove: boolean
}

function toFiniteSize(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function getFlowNodeRect(
  node: Pick<MindMapFlowNode, 'position' | 'style'>,
): TopicRect {
  return {
    x: node.position.x,
    y: node.position.y,
    width: toFiniteSize(node.style?.width),
    height: toFiniteSize(node.style?.height),
  }
}

function getRectCenter(rect: TopicRect) {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  }
}

function expandRect(rect: TopicRect, paddingX: number, paddingY: number): TopicRect {
  return {
    x: rect.x - paddingX,
    y: rect.y - paddingY,
    width: rect.width + paddingX * 2,
    height: rect.height + paddingY * 2,
  }
}

function pointInRect(point: { x: number; y: number }, rect: TopicRect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  )
}

function distanceSquared(left: { x: number; y: number }, right: { x: number; y: number }): number {
  const deltaX = left.x - right.x
  const deltaY = left.y - right.y
  return deltaX * deltaX + deltaY * deltaY
}

function unionRects(rects: TopicRect[]): TopicRect | null {
  const firstRect = rects[0]
  if (!firstRect) {
    return null
  }

  let left = firstRect.x
  let top = firstRect.y
  let right = firstRect.x + firstRect.width
  let bottom = firstRect.y + firstRect.height

  for (let index = 1; index < rects.length; index += 1) {
    const rect = rects[index]
    left = Math.min(left, rect.x)
    top = Math.min(top, rect.y)
    right = Math.max(right, rect.x + rect.width)
    bottom = Math.max(bottom, rect.y + rect.height)
  }

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }
}

function collectSubtreeIds(document: MindMapDocument, topicId: string): Set<string> {
  const ids = new Set<string>()
  const queue = [topicId]

  while (queue.length > 0) {
    const currentId = queue.shift()
    if (!currentId || ids.has(currentId)) {
      continue
    }

    ids.add(currentId)
    queue.push(...(document.topics[currentId]?.childIds ?? []))
  }

  return ids
}

function getEmptyChildLaneRect(
  parentRect: TopicRect,
  side: 'left' | 'right',
): TopicRect {
  const parentCenter = getRectCenter(parentRect)
  const laneHeight = Math.max(EMPTY_CHILD_LANE_HEIGHT, parentRect.height + 72)

  return side === 'right'
    ? {
        x: parentRect.x + parentRect.width + EMPTY_CHILD_LANE_GAP,
        y: parentCenter.y - laneHeight / 2,
        width: EMPTY_CHILD_LANE_WIDTH,
        height: laneHeight,
      }
    : {
        x: parentRect.x - EMPTY_CHILD_LANE_GAP - EMPTY_CHILD_LANE_WIDTH,
        y: parentCenter.y - laneHeight / 2,
        width: EMPTY_CHILD_LANE_WIDTH,
        height: laneHeight,
      }
}

function getChildLaneRect(
  document: MindMapDocument,
  nodeLookup: Map<string, MindMapFlowNode>,
  parentId: string,
  movingIds: Set<string>,
): TopicRect | null {
  const parent = document.topics[parentId]
  const parentNode = nodeLookup.get(parentId)
  if (!parent || !parentNode) {
    return null
  }

  const parentRect = getFlowNodeRect(parentNode)
  const side = parentNode.data.side
  if (side !== 'left' && side !== 'right') {
    return null
  }

  if (parent.isCollapsed) {
    return getEmptyChildLaneRect(parentRect, side)
  }

  const visibleChildRects = parent.childIds
    .filter((childId) => !movingIds.has(childId))
    .map((childId) => nodeLookup.get(childId))
    .filter((childNode): childNode is MindMapFlowNode => !!childNode)
    .map((childNode) => getFlowNodeRect(childNode))

  if (visibleChildRects.length === 0) {
    return getEmptyChildLaneRect(parentRect, side)
  }

  const childUnionRect = unionRects(visibleChildRects)
  return childUnionRect
    ? expandRect(childUnionRect, CHILD_LANE_PADDING_X, CHILD_LANE_PADDING_Y)
    : getEmptyChildLaneRect(parentRect, side)
}

function resolveInsertIndex(
  document: MindMapDocument,
  nodeLookup: Map<string, MindMapFlowNode>,
  targetParentId: string,
  dropCenterY: number,
  movingIds: Set<string>,
): number {
  const targetParent = document.topics[targetParentId]
  if (!targetParent || targetParent.isCollapsed) {
    return 0
  }

  const siblingCenters = targetParent.childIds
    .filter((childId) => !movingIds.has(childId))
    .map((childId) => nodeLookup.get(childId))
    .filter((childNode): childNode is MindMapFlowNode => !!childNode)
    .map((childNode) => getRectCenter(getFlowNodeRect(childNode)).y)

  if (siblingCenters.length === 0) {
    return 0
  }

  let closestIndex = 0
  let closestDistance = Math.abs(dropCenterY - siblingCenters[0])

  for (let index = 1; index < siblingCenters.length; index += 1) {
    const nextDistance = Math.abs(dropCenterY - siblingCenters[index])
    if (nextDistance < closestDistance) {
      closestIndex = index
      closestDistance = nextDistance
    }
  }

  return dropCenterY < siblingCenters[closestIndex] ? closestIndex : closestIndex + 1
}

function isStructuralMove(
  document: MindMapDocument,
  topicId: string,
  targetParentId: string,
  targetIndex: number,
): boolean {
  const topic = document.topics[topicId]
  if (!topic?.parentId) {
    return false
  }

  if (topic.parentId !== targetParentId) {
    return true
  }

  return document.topics[targetParentId]?.childIds.indexOf(topicId) !== targetIndex
}

export function findTopicDropPreview(options: {
  document: MindMapDocument
  layout: LayoutResult
  topicId: string
  topicRect: TopicRect
}): TopicDropPreview | null {
  const { document, layout, topicId, topicRect } = options
  const movingIds = collectSubtreeIds(document, topicId)
  const nodeLookup = new Map(layout.renderNodes.map((node) => [node.id, node]))
  const dragCenter = getRectCenter(topicRect)
  let bestPreview: TopicDropPreview | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (const [candidateId] of Object.entries(document.topics)) {
    if (candidateId === document.rootTopicId || movingIds.has(candidateId)) {
      continue
    }

    const candidateNode = nodeLookup.get(candidateId)
    if (!candidateNode) {
      continue
    }

    const candidateRect = getFlowNodeRect(candidateNode)
    const cardZone = expandRect(
      candidateRect,
      PARENT_DROP_ZONE_PADDING_X,
      PARENT_DROP_ZONE_PADDING_Y,
    )
    const childLaneRect = getChildLaneRect(document, nodeLookup, candidateId, movingIds)

    if (
      !pointInRect(dragCenter, cardZone) &&
      !(childLaneRect && pointInRect(dragCenter, childLaneRect))
    ) {
      continue
    }

    if (!childLaneRect) {
      continue
    }

    const targetIndex = resolveInsertIndex(
      document,
      nodeLookup,
      candidateId,
      dragCenter.y,
      movingIds,
    )
    const nextPreview: TopicDropPreview = {
      targetParentId: candidateId,
      targetIndex,
      isStructuralMove: isStructuralMove(document, topicId, candidateId, targetIndex),
    }
    const previewScore = distanceSquared(dragCenter, getRectCenter(childLaneRect))

    if (previewScore < bestScore) {
      bestPreview = nextPreview
      bestScore = previewScore
    }
  }

  return bestPreview
}
