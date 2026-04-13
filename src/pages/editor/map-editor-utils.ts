import type { MindMapDocument } from '../../features/documents/types'
import type { MindMapFlowNode } from '../../features/editor/layout'

export const SAVE_DEBOUNCE_MS = 320
export const DESKTOP_BREAKPOINT = 1200
export const TABLET_BREAKPOINT = 780
export const HOVER_SUBMENU_MEDIA_QUERY = '(hover: hover) and (pointer: fine)'
export const RIGHT_SIDEBAR_ID = 'editor-right-sidebar'
export const RIGHT_PANEL_MODE_STORAGE_KEY = 'brainflow-editor-right-panel-mode'

export type ViewportMode = 'desktop' | 'tablet' | 'mobile'
export type RightPanelMode = 'outline' | 'details' | 'markers' | 'format' | 'ai'
export type MarkerSubtab = 'markers' | 'stickers'
export type FormatSubtab = 'topic' | 'canvas'

export interface DragSnapshot {
  topicId: string
  positions: Map<string, { x: number; y: number }>
  movingIds: Set<string>
  dropPreview: import('../../features/editor/drag-drop-preview').TopicDropPreview | null
}

export interface RenameDraft {
  topicId: string | null
  value: string
}

export interface BoxSelectionSession {
  isBoxSelecting: boolean
  selectionStartedAt: number
  baseSelectedTopicIds: string[]
  baseActiveTopicId: string | null
  isAdditive: boolean
  pendingSelectedTopicIds: string[]
  pendingActiveTopicId: string | null
}

export function areFlowNodesEquivalent(
  currentNode: MindMapFlowNode,
  nextNode: MindMapFlowNode,
): boolean {
  return (
    currentNode.id === nextNode.id &&
    currentNode.type === nextNode.type &&
    currentNode.selected === nextNode.selected &&
    currentNode.position.x === nextNode.position.x &&
    currentNode.position.y === nextNode.position.y &&
    currentNode.draggable === nextNode.draggable &&
    currentNode.sourcePosition === nextNode.sourcePosition &&
    currentNode.targetPosition === nextNode.targetPosition &&
    currentNode.style?.width === nextNode.style?.width &&
    currentNode.style?.height === nextNode.style?.height &&
    currentNode.data.topicId === nextNode.data.topicId &&
    currentNode.data.title === nextNode.data.title &&
    currentNode.data.note === nextNode.data.note &&
    currentNode.data.notePreview === nextNode.data.notePreview &&
    currentNode.data.isCollapsed === nextNode.data.isCollapsed &&
    currentNode.data.childCount === nextNode.data.childCount &&
    currentNode.data.branchColor === nextNode.data.branchColor &&
    currentNode.data.side === nextNode.data.side &&
    currentNode.data.depth === nextNode.data.depth &&
    currentNode.data.isRoot === nextNode.data.isRoot &&
    currentNode.data.dropTarget === nextNode.data.dropTarget &&
    currentNode.data.aiLocked === nextNode.data.aiLocked &&
    JSON.stringify(currentNode.data.metadata) === JSON.stringify(nextNode.data.metadata) &&
    JSON.stringify(currentNode.data.style) === JSON.stringify(nextNode.data.style)
  )
}

export function isTypingElement(element: EventTarget | null): boolean {
  if (!(element instanceof HTMLElement)) {
    return false
  }

  if (element.isContentEditable) {
    return true
  }

  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)
}

export function hasMultiSelectModifier(event: MouseEvent | React.MouseEvent): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey
}

export function mergeTopicSelection(currentTopicIds: string[], nextTopicIds: string[]): string[] {
  return Array.from(new Set([...currentTopicIds, ...nextTopicIds]))
}

export function haveSameTopicIdSet(currentTopicIds: string[], nextTopicIds: string[]): boolean {
  if (currentTopicIds.length !== nextTopicIds.length) {
    return false
  }

  const nextTopicIdSet = new Set(nextTopicIds)
  return currentTopicIds.every((topicId) => nextTopicIdSet.has(topicId))
}

export function resolveCanvasSelection(
  baseSelectedTopicIds: string[],
  baseActiveTopicId: string | null,
  selectedFromCanvas: string[],
  isAdditiveSelection: boolean,
) {
  const nextSelectedTopicIds = isAdditiveSelection
    ? mergeTopicSelection(baseSelectedTopicIds, selectedFromCanvas)
    : selectedFromCanvas
  const nextActiveTopicId = nextSelectedTopicIds.includes(baseActiveTopicId ?? '')
    ? baseActiveTopicId
    : selectedFromCanvas.at(-1) ?? null

  return {
    nextSelectedTopicIds,
    nextActiveTopicId,
  }
}

export function isSameViewport(
  current: MindMapDocument['viewport'] | null,
  next: MindMapDocument['viewport'],
): boolean {
  if (!current) {
    return false
  }

  return (
    Math.abs(current.x - next.x) < 0.5 &&
    Math.abs(current.y - next.y) < 0.5 &&
    Math.abs(current.zoom - next.zoom) < 0.001
  )
}

export function getViewportMode(width: number): ViewportMode {
  if (width >= DESKTOP_BREAKPOINT) {
    return 'desktop'
  }

  if (width >= TABLET_BREAKPOINT) {
    return 'tablet'
  }

  return 'mobile'
}

export function canUseHoverSubmenu(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(HOVER_SUBMENU_MEDIA_QUERY).matches
  )
}

export function isRightPanelMode(value: string | null): value is RightPanelMode {
  return value === 'outline' || value === 'details' || value === 'markers' || value === 'format' || value === 'ai'
}

export function getStoredRightPanelMode(): RightPanelMode {
  if (typeof localStorage === 'undefined') {
    return 'details'
  }

  const storedValue = localStorage.getItem(RIGHT_PANEL_MODE_STORAGE_KEY)
  return isRightPanelMode(storedValue) ? storedValue : 'details'
}

export function collectSubtreeIds(document: MindMapDocument, topicId: string) {
  const queue = [topicId]
  const ids = new Set<string>()

  while (queue.length > 0) {
    const currentId = queue.shift()
    if (!currentId || ids.has(currentId)) {
      continue
    }

    ids.add(currentId)
    queue.push(...document.topics[currentId].childIds)
  }

  return ids
}
