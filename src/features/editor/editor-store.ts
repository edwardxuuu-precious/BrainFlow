import { create } from 'zustand'
import type {
  BranchSide,
  MindMapDocument,
  MindMapViewport,
  TopicMarker,
  TopicMetadataPatch,
  TopicRichTextDocument,
  TopicSticker,
  TopicStylePatch,
} from '../documents/types'
import {
  addChild,
  addSibling,
  applyDocumentTheme,
  expandHierarchyPath,
  moveTopic,
  removeTopics,
  renameDocumentTitle,
  renameTopic,
  resetTopicOffset,
  setBranchSide,
  setTopicAiLocked,
  setTopicsAiLocked,
  setTopicOffset,
  updateTopicMetadata,
  updateDocumentTheme,
  updateTopicStyle,
  updateTopicsStyle,
  toggleTopicsMarker,
  toggleTopicsSticker,
  toggleHierarchyBranch,
  toggleCollapse,
  updateTopicNote,
  updateTopicNoteRich,
  updateViewport,
  updateWorkspaceChrome,
  updateWorkspaceHierarchyCollapsed,
  updateWorkspaceSelection,
} from './tree-operations'

const HISTORY_LIMIT = 50

export type EditingSurface = 'canvas' | 'inspector'
export type SidebarSide = 'left' | 'right'

interface EditorState {
  document: MindMapDocument | null
  activeTopicId: string | null
  selectedTopicIds: string[]
  editingTopicId: string | null
  editingSurface: EditingSurface | null
  history: MindMapDocument[]
  future: MindMapDocument[]
  isDirty: boolean
  hasPendingWorkspaceSave: boolean
  lastSavedAt: number | null
  setDocument: (doc: MindMapDocument) => void
  setSelection: (topicIds: string[], activeTopicId?: string | null) => void
  toggleTopicSelection: (topicId: string) => void
  clearSelection: () => void
  selectAll: () => void
  toggleHierarchyBranch: (topicId: string) => void
  expandHierarchyPath: (topicId: string) => void
  setSidebarOpen: (side: SidebarSide, open: boolean) => void
  toggleSidebar: (side: SidebarSide) => void
  startEditing: (topicId: string, surface?: EditingSurface) => void
  stopEditing: () => void
  renameDocument: (title: string) => void
  setTopicAiLocked: (topicId: string, aiLocked: boolean) => void
  setTopicsAiLocked: (topicIds: string[], aiLocked: boolean) => void
  addChild: (topicId: string) => void
  addSibling: (topicId: string) => void
  renameTopic: (topicId: string, title: string) => void
  updateNote: (topicId: string, note: string) => void
  updateNoteRich: (topicId: string, noteRich: TopicRichTextDocument | null) => void
  updateTopicMetadata: (topicId: string, patch: TopicMetadataPatch) => void
  updateTopicStyle: (topicId: string, patch: TopicStylePatch) => void
  updateTopicsStyle: (topicIds: string[], patch: TopicStylePatch) => void
  toggleTopicMarker: (topicIds: string[], marker: TopicMarker) => void
  toggleTopicSticker: (topicIds: string[], sticker: TopicSticker) => void
  updateDocumentTheme: (patch: Partial<MindMapDocument['theme']>) => void
  applyDocumentTheme: (themeId: string) => void
  removeTopic: (topicId: string) => void
  removeTopics: (topicIds: string[]) => void
  toggleCollapse: (topicId: string) => void
  moveTopic: (topicId: string, targetParentId: string, targetIndex: number) => void
  setBranchSide: (topicId: string, side: BranchSide) => void
  setTopicOffset: (topicId: string, offsetX: number, offsetY: number) => void
  resetTopicOffset: (topicId: string) => void
  setViewport: (viewport: MindMapViewport) => void
  applyExternalDocument: (doc: MindMapDocument, activeTopicId?: string | null) => void
  undo: () => void
  redo: () => void
  markSaved: () => void
}

type EditorStateUpdate = EditorState | Partial<EditorState>

interface NormalizedSelection {
  activeTopicId: string | null
  selectedTopicIds: string[]
}

function uniqueTopicIds(topicIds: string[]): string[] {
  return Array.from(new Set(topicIds.filter(Boolean)))
}

function hasOwnOption(options: object | undefined, key: string): boolean {
  return Boolean(options) && Object.prototype.hasOwnProperty.call(options, key)
}

function orderTopicIdsByDocument(document: MindMapDocument, topicIds: string[]): string[] {
  const topicOrder = new Map(
    Object.keys(document.topics).map((topicId, index) => [topicId, index]),
  )

  return [...topicIds].sort((left, right) => {
    const leftOrder = topicOrder.get(left) ?? Number.MAX_SAFE_INTEGER
    const rightOrder = topicOrder.get(right) ?? Number.MAX_SAFE_INTEGER
    return leftOrder - rightOrder
  })
}

function normalizeSelection(
  document: MindMapDocument,
  selectedTopicIds: string[],
  activeTopicId: string | null,
): NormalizedSelection {
  const filteredIds = orderTopicIdsByDocument(
    document,
    uniqueTopicIds(selectedTopicIds).filter((topicId) => document.topics[topicId]),
  )
  let nextActive = activeTopicId && document.topics[activeTopicId] ? activeTopicId : filteredIds.at(-1) ?? null

  if (nextActive && !filteredIds.includes(nextActive)) {
    filteredIds.push(nextActive)
  }

  if (!nextActive && filteredIds.length === 1) {
    nextActive = filteredIds[0]
  }

  return {
    activeTopicId: nextActive,
    selectedTopicIds: orderTopicIdsByDocument(document, filteredIds),
  }
}

function isTopicWithinBranch(
  document: MindMapDocument,
  topicId: string | null,
  branchId: string,
): boolean {
  if (!topicId || topicId === branchId) {
    return false
  }

  let cursor = document.topics[topicId]

  while (cursor?.parentId) {
    if (cursor.parentId === branchId) {
      return true
    }

    cursor = document.topics[cursor.parentId]
  }

  return false
}

function syncWorkspaceSelection(
  document: MindMapDocument,
  activeTopicId: string | null,
  expandActivePath = false,
): MindMapDocument {
  const documentWithSelection = updateWorkspaceSelection(document, activeTopicId)
  return expandActivePath ? expandHierarchyPath(documentWithSelection, activeTopicId) : documentWithSelection
}

function preserveWorkspaceState(
  currentDocument: MindMapDocument,
  nextDocument: MindMapDocument,
  activeTopicId: string | null,
): MindMapDocument {
  const safeActive =
    activeTopicId && nextDocument.topics[activeTopicId]
      ? activeTopicId
      : nextDocument.rootTopicId

  const withSelection = updateWorkspaceSelection(nextDocument, safeActive)
  const withCollapsedTree = updateWorkspaceHierarchyCollapsed(
    withSelection,
    currentDocument.workspace.hierarchyCollapsedTopicIds,
  )

  return {
    ...withCollapsedTree,
    viewport: currentDocument.viewport,
    workspace: {
      ...withCollapsedTree.workspace,
      selectedTopicId: safeActive,
      chrome: currentDocument.workspace.chrome,
    },
  }
}

function commitContentDocument(
  state: EditorState,
  nextDocument: MindMapDocument,
  options?: {
    activeTopicId?: string | null
    selectedTopicIds?: string[]
    editingTopicId?: string | null
    editingSurface?: EditingSurface | null
    history?: boolean
    expandActivePath?: boolean
  },
): EditorStateUpdate {
  const nextSelectedTopicIds = hasOwnOption(options, 'selectedTopicIds')
    ? (options?.selectedTopicIds ?? [])
    : state.selectedTopicIds
  const nextActiveTopicId = hasOwnOption(options, 'activeTopicId')
    ? (options?.activeTopicId ?? null)
    : state.activeTopicId
  const nextEditingTopicId = hasOwnOption(options, 'editingTopicId')
    ? (options?.editingTopicId ?? null)
    : state.editingTopicId
  const nextEditingSurface = hasOwnOption(options, 'editingSurface')
    ? (options?.editingSurface ?? null)
    : state.editingSurface
  const selection = normalizeSelection(
    nextDocument,
    nextSelectedTopicIds,
    nextActiveTopicId,
  )
  const documentWithSelection = syncWorkspaceSelection(
    nextDocument,
    selection.activeTopicId,
    options?.expandActivePath ?? false,
  )

  if (
    documentWithSelection === state.document &&
    selection.activeTopicId === state.activeTopicId &&
    selection.selectedTopicIds.join('|') === state.selectedTopicIds.join('|') &&
    nextEditingTopicId === state.editingTopicId &&
    nextEditingSurface === state.editingSurface
  ) {
    return state
  }

  const shouldTrackHistory = options?.history ?? true
  const nextHistory =
    shouldTrackHistory && state.document
      ? [...state.history, structuredClone(state.document)].slice(-HISTORY_LIMIT)
      : state.history

  return {
    document: documentWithSelection,
    history: nextHistory,
    future: shouldTrackHistory ? [] : state.future,
    activeTopicId: selection.activeTopicId,
    selectedTopicIds: selection.selectedTopicIds,
    editingTopicId: nextEditingTopicId,
    editingSurface: nextEditingSurface,
    isDirty: true,
    hasPendingWorkspaceSave: state.hasPendingWorkspaceSave,
  }
}

function commitWorkspaceDocument(
  state: EditorState,
  nextDocument: MindMapDocument,
  options?: {
    activeTopicId?: string | null
    selectedTopicIds?: string[]
    expandActivePath?: boolean
  },
): EditorStateUpdate {
  const nextSelectedTopicIds = hasOwnOption(options, 'selectedTopicIds')
    ? (options?.selectedTopicIds ?? [])
    : state.selectedTopicIds
  const nextActiveTopicId = hasOwnOption(options, 'activeTopicId')
    ? (options?.activeTopicId ?? null)
    : state.activeTopicId
  const selection = normalizeSelection(
    nextDocument,
    nextSelectedTopicIds,
    nextActiveTopicId,
  )
  const documentWithSelection = syncWorkspaceSelection(
    nextDocument,
    selection.activeTopicId,
    options?.expandActivePath ?? false,
  )

  if (
    documentWithSelection === state.document &&
    selection.activeTopicId === state.activeTopicId &&
    selection.selectedTopicIds.join('|') === state.selectedTopicIds.join('|')
  ) {
    return state
  }

  return {
    document: documentWithSelection,
    activeTopicId: selection.activeTopicId,
    selectedTopicIds: selection.selectedTopicIds,
    isDirty: state.isDirty,
    hasPendingWorkspaceSave: true,
  }
}

function commitTopicRemoval(
  state: EditorState,
  nextDocument: MindMapDocument,
): EditorStateUpdate {
  if (nextDocument === state.document) {
    return state
  }

  const survivingSelection = state.selectedTopicIds.filter(
    (currentTopicId) => nextDocument.topics[currentTopicId],
  )
  const nextActiveTopicId =
    state.activeTopicId && nextDocument.topics[state.activeTopicId]
      ? state.activeTopicId
      : survivingSelection.at(-1) ?? nextDocument.rootTopicId
  const nextSelectedTopicIds =
    survivingSelection.length > 0 ? survivingSelection : [nextActiveTopicId]

  return commitContentDocument(state, nextDocument, {
    activeTopicId: nextActiveTopicId,
    selectedTopicIds: nextSelectedTopicIds,
    editingTopicId: null,
    editingSurface: null,
    expandActivePath: false,
  })
}

export const useEditorStore = create<EditorState>((set) => ({
  document: null,
  activeTopicId: null,
  selectedTopicIds: [],
  editingTopicId: null,
  editingSurface: null,
  history: [],
  future: [],
  isDirty: false,
  hasPendingWorkspaceSave: false,
  lastSavedAt: null,

  setDocument: (doc) =>
    set({
      document: doc,
      activeTopicId: doc.workspace.selectedTopicId,
      selectedTopicIds: doc.workspace.selectedTopicId ? [doc.workspace.selectedTopicId] : [],
      editingTopicId: null,
      editingSurface: null,
      history: [],
      future: [],
      isDirty: false,
      hasPendingWorkspaceSave: false,
      lastSavedAt: doc.updatedAt,
    }),

  setSelection: (topicIds, activeTopicId) =>
    set((state) => {
      const uniqueIds = uniqueTopicIds(topicIds)
      const nextActiveTopicId = activeTopicId ?? uniqueIds.at(-1) ?? null

      if (!state.document) {
        if (
          state.activeTopicId === nextActiveTopicId &&
          state.selectedTopicIds.join('|') === uniqueIds.join('|')
        ) {
          return state
        }

        return {
          activeTopicId: nextActiveTopicId,
          selectedTopicIds: uniqueIds,
        }
      }

      const nextSelection = normalizeSelection(state.document, uniqueIds, nextActiveTopicId)
      if (
        nextSelection.activeTopicId === state.activeTopicId &&
        nextSelection.selectedTopicIds.join('|') === state.selectedTopicIds.join('|') &&
        state.document.workspace.selectedTopicId === nextSelection.activeTopicId
      ) {
        return state
      }

      const nextDocument = updateWorkspaceSelection(state.document, nextSelection.activeTopicId)
      return commitWorkspaceDocument(state, nextDocument, {
        activeTopicId: nextSelection.activeTopicId,
        selectedTopicIds: nextSelection.selectedTopicIds,
        expandActivePath: false,
      })
    }),

  toggleTopicSelection: (topicId) =>
    set((state) => {
      if (!state.document || !state.document.topics[topicId]) {
        return {}
      }

      const isSelected = state.selectedTopicIds.includes(topicId)
      const nextSelectedTopicIds = isSelected
        ? state.selectedTopicIds.filter((currentId) => currentId !== topicId)
        : [...state.selectedTopicIds, topicId]
      const nextActiveTopicId = isSelected
        ? state.activeTopicId === topicId
          ? nextSelectedTopicIds.at(-1) ?? null
          : state.activeTopicId
        : topicId
      const nextDocument = updateWorkspaceSelection(state.document, nextActiveTopicId)

      return commitWorkspaceDocument(state, nextDocument, {
        activeTopicId: nextActiveTopicId,
        selectedTopicIds: nextSelectedTopicIds,
        expandActivePath: false,
      })
    }),

  clearSelection: () =>
    set((state) => {
      if (!state.document) {
        if (state.activeTopicId === null && state.selectedTopicIds.length === 0) {
          return {}
        }

        return {
          activeTopicId: null,
          selectedTopicIds: [],
        }
      }

      if (
        state.activeTopicId === null &&
        state.selectedTopicIds.length === 0 &&
        state.document.workspace.selectedTopicId === null
      ) {
        return {}
      }

      const nextDocument = updateWorkspaceSelection(state.document, null)
      return commitWorkspaceDocument(state, nextDocument, {
        activeTopicId: null,
        selectedTopicIds: [],
      })
    }),

  selectAll: () =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      const allTopicIds = Object.keys(state.document.topics)
      const nextActiveTopicId =
        state.activeTopicId && state.document.topics[state.activeTopicId]
          ? state.activeTopicId
          : allTopicIds.at(-1) ?? null
      const nextDocument = updateWorkspaceSelection(state.document, nextActiveTopicId)

      return commitWorkspaceDocument(state, nextDocument, {
        activeTopicId: nextActiveTopicId,
        selectedTopicIds: allTopicIds,
        expandActivePath: false,
      })
    }),

  toggleHierarchyBranch: (topicId) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      const willCollapse = !state.document.workspace.hierarchyCollapsedTopicIds.includes(topicId)
      const nextDocument = toggleHierarchyBranch(state.document, topicId)
      if (nextDocument === state.document) {
        return {}
      }

      const nextActiveTopicId =
        willCollapse && isTopicWithinBranch(state.document, state.activeTopicId, topicId)
          ? topicId
          : state.activeTopicId
      const nextSelectedTopicIds =
        nextActiveTopicId === topicId ? [topicId] : state.selectedTopicIds

      return commitWorkspaceDocument(state, nextDocument, {
        activeTopicId: nextActiveTopicId,
        selectedTopicIds: nextSelectedTopicIds,
        expandActivePath: false,
      })
    }),

  expandHierarchyPath: (topicId) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      const nextDocument = expandHierarchyPath(state.document, topicId)
      if (nextDocument === state.document) {
        return {}
      }

      return commitWorkspaceDocument(state, nextDocument)
    }),

  setSidebarOpen: (side, open) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      const nextDocument = updateWorkspaceChrome(
        state.document,
        side === 'left' ? 'leftSidebarOpen' : 'rightSidebarOpen',
        open,
      )
      if (nextDocument === state.document) {
        return {}
      }

      return commitWorkspaceDocument(state, nextDocument, {
        expandActivePath: false,
      })
    }),

  toggleSidebar: (side) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      const chromeKey = side === 'left' ? 'leftSidebarOpen' : 'rightSidebarOpen'
      const nextDocument = updateWorkspaceChrome(
        state.document,
        chromeKey,
        !state.document.workspace.chrome[chromeKey],
      )

      return commitWorkspaceDocument(state, nextDocument, {
        expandActivePath: false,
      })
    }),

  startEditing: (topicId, surface = 'canvas') =>
    set((state) => {
      if (!state.document) {
        return {
          activeTopicId: topicId,
          selectedTopicIds: [topicId],
          editingTopicId: topicId,
          editingSurface: surface,
        }
      }

      const nextDocument = updateWorkspaceSelection(state.document, topicId)

      return {
        document: nextDocument,
        activeTopicId: topicId,
        selectedTopicIds: [topicId],
        editingTopicId: topicId,
        editingSurface: surface,
        isDirty: state.isDirty,
        hasPendingWorkspaceSave:
          state.hasPendingWorkspaceSave || nextDocument !== state.document,
      }
    }),

  stopEditing: () => set({ editingTopicId: null, editingSurface: null }),

  renameDocument: (title) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      return commitContentDocument(state, renameDocumentTitle(state.document, title), { history: false })
    }),

  setTopicAiLocked: (topicId, aiLocked) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      const selectedTopicIds = state.selectedTopicIds.includes(topicId)
        ? state.selectedTopicIds
        : [topicId]

      return commitContentDocument(state, setTopicAiLocked(state.document, topicId, aiLocked), {
        activeTopicId: topicId,
        selectedTopicIds,
        history: false,
        expandActivePath: false,
      })
    }),

  setTopicsAiLocked: (topicIds, aiLocked) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      const selectedTopicIds = uniqueTopicIds(topicIds).filter((topicId) => state.document?.topics[topicId])
      if (selectedTopicIds.length === 0) {
        return {}
      }

      const nextDocument = setTopicsAiLocked(state.document, selectedTopicIds, aiLocked)
      if (nextDocument === state.document) {
        return {}
      }

      const nextActiveTopicId = selectedTopicIds.includes(state.activeTopicId ?? '')
        ? state.activeTopicId
        : selectedTopicIds.at(-1) ?? null

      return commitContentDocument(state, nextDocument, {
        activeTopicId: nextActiveTopicId,
        selectedTopicIds,
        expandActivePath: false,
      })
    }),

  addChild: (topicId) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      const result = addChild(state.document, topicId)
      return commitContentDocument(state, result.document, {
        activeTopicId: result.topicId,
        selectedTopicIds: result.topicId ? [result.topicId] : [],
        editingTopicId: result.topicId,
        editingSurface: 'canvas',
        expandActivePath: false,
      })
    }),

  addSibling: (topicId) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      const result = addSibling(state.document, topicId)
      return commitContentDocument(state, result.document, {
        activeTopicId: result.topicId,
        selectedTopicIds: result.topicId ? [result.topicId] : [],
        editingTopicId: result.topicId,
        editingSurface: 'canvas',
        expandActivePath: false,
      })
    }),

  renameTopic: (topicId, title) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      const selectedTopicIds = state.selectedTopicIds.includes(topicId)
        ? state.selectedTopicIds
        : [topicId]

      return commitContentDocument(state, renameTopic(state.document, topicId, title), {
        activeTopicId: topicId,
        selectedTopicIds,
        history: false,
        expandActivePath: false,
      })
    }),

  updateNote: (topicId, note) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      const selectedTopicIds = state.selectedTopicIds.includes(topicId)
        ? state.selectedTopicIds
        : [topicId]

      return commitContentDocument(state, updateTopicNote(state.document, topicId, note), {
        activeTopicId: topicId,
        selectedTopicIds,
        history: false,
        expandActivePath: false,
      })
    }),

  updateNoteRich: (topicId, noteRich) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      const selectedTopicIds = state.selectedTopicIds.includes(topicId)
        ? state.selectedTopicIds
        : [topicId]

      return commitContentDocument(state, updateTopicNoteRich(state.document, topicId, noteRich), {
        activeTopicId: topicId,
        selectedTopicIds,
        history: false,
        expandActivePath: false,
      })
    }),

  updateTopicMetadata: (topicId, patch) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      const selectedTopicIds = state.selectedTopicIds.includes(topicId)
        ? state.selectedTopicIds
        : [topicId]

      return commitContentDocument(state, updateTopicMetadata(state.document, topicId, patch), {
        activeTopicId: topicId,
        selectedTopicIds,
        history: false,
        expandActivePath: false,
      })
    }),

  updateTopicStyle: (topicId, patch) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      const selectedTopicIds = state.selectedTopicIds.includes(topicId)
        ? state.selectedTopicIds
        : [topicId]

      return commitContentDocument(state, updateTopicStyle(state.document, topicId, patch), {
        activeTopicId: topicId,
        selectedTopicIds,
        history: false,
        expandActivePath: false,
      })
    }),

  updateTopicsStyle: (topicIds, patch) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      const selectedTopicIds = uniqueTopicIds(topicIds).filter((topicId) => state.document?.topics[topicId])
      if (selectedTopicIds.length === 0) {
        return {}
      }

      const nextDocument = updateTopicsStyle(state.document, selectedTopicIds, patch)
      if (nextDocument === state.document) {
        return {}
      }

      const nextActiveTopicId = selectedTopicIds.includes(state.activeTopicId ?? '')
        ? state.activeTopicId
        : selectedTopicIds.at(-1) ?? null

      return commitContentDocument(state, nextDocument, {
        activeTopicId: nextActiveTopicId,
        selectedTopicIds,
        expandActivePath: false,
      })
    }),

  toggleTopicMarker: (topicIds, marker) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      const selectedTopicIds = uniqueTopicIds(topicIds).filter((topicId) => state.document?.topics[topicId])
      if (selectedTopicIds.length === 0) {
        return {}
      }

      const nextDocument = toggleTopicsMarker(state.document, selectedTopicIds, marker)
      if (nextDocument === state.document) {
        return {}
      }

      return commitContentDocument(state, nextDocument, {
        activeTopicId: state.activeTopicId,
        selectedTopicIds,
        expandActivePath: false,
      })
    }),

  toggleTopicSticker: (topicIds, sticker) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      const selectedTopicIds = uniqueTopicIds(topicIds).filter((topicId) => state.document?.topics[topicId])
      if (selectedTopicIds.length === 0) {
        return {}
      }

      const nextDocument = toggleTopicsSticker(state.document, selectedTopicIds, sticker)
      if (nextDocument === state.document) {
        return {}
      }

      return commitContentDocument(state, nextDocument, {
        activeTopicId: state.activeTopicId,
        selectedTopicIds,
        expandActivePath: false,
      })
    }),

  updateDocumentTheme: (patch) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      return commitContentDocument(state, updateDocumentTheme(state.document, patch), {
        history: false,
      })
    }),

  applyDocumentTheme: (themeId) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      return commitContentDocument(state, applyDocumentTheme(state.document, themeId), {
        history: false,
      })
    }),

  removeTopic: (topicId) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      return commitTopicRemoval(
        state,
        removeTopics(state.document, [topicId]),
      )
    }),

  removeTopics: (topicIds) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      return commitTopicRemoval(state, removeTopics(state.document, topicIds))
    }),

  toggleCollapse: (topicId) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      return commitContentDocument(state, toggleCollapse(state.document, topicId), {
        activeTopicId: topicId,
        expandActivePath: false,
      })
    }),

  moveTopic: (topicId, targetParentId, targetIndex) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      return commitContentDocument(state, moveTopic(state.document, topicId, targetParentId, targetIndex), {
        activeTopicId: topicId,
        expandActivePath: false,
      })
    }),

  setBranchSide: (topicId, side) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      return commitContentDocument(state, setBranchSide(state.document, topicId, side), {
        activeTopicId: topicId,
        expandActivePath: false,
      })
    }),

  setTopicOffset: (topicId, offsetX, offsetY) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      return commitContentDocument(state, setTopicOffset(state.document, topicId, offsetX, offsetY), {
        activeTopicId: topicId,
        expandActivePath: false,
      })
    }),

  resetTopicOffset: (topicId) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      return commitContentDocument(state, resetTopicOffset(state.document, topicId), {
        activeTopicId: topicId,
        expandActivePath: false,
      })
    }),

  setViewport: (viewport) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      const nextDocument = updateViewport(state.document, viewport)
      if (nextDocument === state.document) {
        return {}
      }

      return commitWorkspaceDocument(state, nextDocument, {
        expandActivePath: false,
      })
    }),

  applyExternalDocument: (doc, activeTopicId) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      const nextActiveTopicId = activeTopicId ?? state.activeTopicId
      return commitContentDocument(state, doc, {
        activeTopicId: nextActiveTopicId,
        selectedTopicIds: nextActiveTopicId ? [nextActiveTopicId] : [],
        editingTopicId: null,
        editingSurface: null,
        expandActivePath: false,
      })
    }),

  undo: () =>
    set((state) => {
      if (state.history.length === 0 || !state.document) {
        return {}
      }

      const previous = state.history[state.history.length - 1]
      const nextActive =
        state.activeTopicId && previous.topics[state.activeTopicId]
          ? state.activeTopicId
          : previous.rootTopicId
      const previousWithWorkspace = preserveWorkspaceState(
        state.document,
        structuredClone(previous),
        nextActive,
      )

      return {
        document: previousWithWorkspace,
        history: state.history.slice(0, -1),
        future: [structuredClone(state.document), ...state.future].slice(0, HISTORY_LIMIT),
        activeTopicId: nextActive,
        selectedTopicIds: nextActive ? [nextActive] : [],
        editingTopicId: null,
        editingSurface: null,
        isDirty: true,
        hasPendingWorkspaceSave: state.hasPendingWorkspaceSave,
      }
    }),

  redo: () =>
    set((state) => {
      if (state.future.length === 0 || !state.document) {
        return {}
      }

      const [nextDocument, ...rest] = state.future
      const nextActive =
        state.activeTopicId && nextDocument.topics[state.activeTopicId]
          ? state.activeTopicId
          : nextDocument.rootTopicId
      const redoneDocument = preserveWorkspaceState(
        state.document,
        structuredClone(nextDocument),
        nextActive,
      )

      return {
        document: redoneDocument,
        history: [...state.history, structuredClone(state.document)].slice(-HISTORY_LIMIT),
        future: rest,
        activeTopicId: nextActive,
        selectedTopicIds: nextActive ? [nextActive] : [],
        editingTopicId: null,
        editingSurface: null,
        isDirty: true,
        hasPendingWorkspaceSave: state.hasPendingWorkspaceSave,
      }
    }),

  markSaved: () => set({ isDirty: false, hasPendingWorkspaceSave: false, lastSavedAt: Date.now() }),
}))

export function resetEditorStore(): void {
  useEditorStore.setState({
    document: null,
    activeTopicId: null,
    selectedTopicIds: [],
    editingTopicId: null,
    editingSurface: null,
    history: [],
    future: [],
    isDirty: false,
    hasPendingWorkspaceSave: false,
    lastSavedAt: null,
  })
}

export function getEditorSnapshot(): EditorState {
  return useEditorStore.getState()
}
