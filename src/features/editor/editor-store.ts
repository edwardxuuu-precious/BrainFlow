import { create } from 'zustand'
import type {
  BranchSide,
  MindMapDocument,
  MindMapViewport,
  TopicMetadataPatch,
  TopicRichTextDocument,
  TopicStylePatch,
} from '../documents/types'
import {
  addChild,
  addSibling,
  expandHierarchyPath,
  moveTopic,
  removeTopic,
  renameDocumentTitle,
  renameTopic,
  resetTopicOffset,
  setBranchSide,
  setTopicAiLocked,
  setTopicsAiLocked,
  setTopicOffset,
  updateTopicMetadata,
  updateTopicStyle,
  updateTopicsStyle,
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
  removeTopic: (topicId: string) => void
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

interface NormalizedSelection {
  activeTopicId: string | null
  selectedTopicIds: string[]
}

function uniqueTopicIds(topicIds: string[]): string[] {
  return Array.from(new Set(topicIds.filter(Boolean)))
}

function normalizeSelection(
  document: MindMapDocument,
  selectedTopicIds: string[],
  activeTopicId: string | null,
): NormalizedSelection {
  const filteredIds = uniqueTopicIds(selectedTopicIds).filter((topicId) => document.topics[topicId])
  let nextActive = activeTopicId && document.topics[activeTopicId] ? activeTopicId : filteredIds.at(-1) ?? null

  if (nextActive && !filteredIds.includes(nextActive)) {
    filteredIds.push(nextActive)
  }

  if (!nextActive && filteredIds.length === 1) {
    nextActive = filteredIds[0]
  }

  return {
    activeTopicId: nextActive,
    selectedTopicIds: filteredIds,
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
): Partial<EditorState> {
  const selection = normalizeSelection(
    nextDocument,
    options?.selectedTopicIds ?? state.selectedTopicIds,
    options?.activeTopicId ?? state.activeTopicId,
  )
  const nextEditingTopicId = options?.editingTopicId ?? state.editingTopicId
  const nextEditingSurface = options?.editingSurface ?? state.editingSurface
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
    return {}
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
): Partial<EditorState> {
  const selection = normalizeSelection(
    nextDocument,
    options?.selectedTopicIds ?? state.selectedTopicIds,
    options?.activeTopicId ?? state.activeTopicId,
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
    return {}
  }

  return {
    document: documentWithSelection,
    activeTopicId: selection.activeTopicId,
    selectedTopicIds: selection.selectedTopicIds,
    isDirty: state.isDirty,
    hasPendingWorkspaceSave: true,
  }
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
      if (!state.document) {
        const uniqueIds = uniqueTopicIds(topicIds)
        return {
          activeTopicId: activeTopicId ?? uniqueIds.at(-1) ?? null,
          selectedTopicIds: uniqueIds,
        }
      }

      const nextDocument = updateWorkspaceSelection(state.document, activeTopicId ?? null)
      return commitWorkspaceDocument(state, nextDocument, {
        activeTopicId: activeTopicId ?? null,
        selectedTopicIds: topicIds,
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
        return {
          activeTopicId: null,
          selectedTopicIds: [],
        }
      }

      const nextDocument = updateWorkspaceSelection(state.document, null)
      return commitWorkspaceDocument(state, nextDocument, {
        activeTopicId: null,
        selectedTopicIds: [],
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

  removeTopic: (topicId) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      const fallbackSelection = state.document.topics[topicId]?.parentId ?? state.document.rootTopicId
      return commitContentDocument(state, removeTopic(state.document, topicId), {
        activeTopicId: fallbackSelection,
        selectedTopicIds: [fallbackSelection],
        editingTopicId: null,
        editingSurface: null,
        expandActivePath: false,
      })
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
