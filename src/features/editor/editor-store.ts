import { create } from 'zustand'
import type { BranchSide, MindMapDocument, MindMapViewport } from '../documents/types'
import {
  addChild,
  addSibling,
  moveTopic,
  removeTopic,
  renameDocumentTitle,
  renameTopic,
  resetTopicOffset,
  setBranchSide,
  setTopicOffset,
  toggleCollapse,
  updateTopicNote,
  updateViewport,
} from './tree-operations'

const HISTORY_LIMIT = 50

interface EditorState {
  document: MindMapDocument | null
  selectedTopicId: string | null
  editingTopicId: string | null
  history: MindMapDocument[]
  future: MindMapDocument[]
  isDirty: boolean
  lastSavedAt: number | null
  setDocument: (doc: MindMapDocument) => void
  setSelectedTopicId: (topicId: string | null) => void
  startEditing: (topicId: string) => void
  stopEditing: () => void
  renameDocument: (title: string) => void
  addChild: (topicId: string) => void
  addSibling: (topicId: string) => void
  renameTopic: (topicId: string, title: string) => void
  updateNote: (topicId: string, note: string) => void
  removeTopic: (topicId: string) => void
  toggleCollapse: (topicId: string) => void
  moveTopic: (topicId: string, targetParentId: string, targetIndex: number) => void
  setBranchSide: (topicId: string, side: BranchSide) => void
  setTopicOffset: (topicId: string, offsetX: number, offsetY: number) => void
  resetTopicOffset: (topicId: string) => void
  setViewport: (viewport: MindMapViewport) => void
  undo: () => void
  redo: () => void
  markSaved: () => void
}

function commitDocument(
  state: EditorState,
  nextDocument: MindMapDocument,
  options?: { selectedTopicId?: string | null; editingTopicId?: string | null; history?: boolean },
): Partial<EditorState> {
  const shouldTrackHistory = options?.history ?? true
  const nextHistory =
    shouldTrackHistory && state.document
      ? [...state.history, structuredClone(state.document)].slice(-HISTORY_LIMIT)
      : state.history

  return {
    document: nextDocument,
    history: nextHistory,
    future: shouldTrackHistory ? [] : state.future,
    selectedTopicId: options?.selectedTopicId ?? state.selectedTopicId,
    editingTopicId: options?.editingTopicId ?? null,
    isDirty: true,
  }
}

export const useEditorStore = create<EditorState>((set) => ({
  document: null,
  selectedTopicId: null,
  editingTopicId: null,
  history: [],
  future: [],
  isDirty: false,
  lastSavedAt: null,

  setDocument: (doc) =>
    set({
      document: doc,
      selectedTopicId: doc.rootTopicId,
      editingTopicId: null,
      history: [],
      future: [],
      isDirty: false,
      lastSavedAt: doc.updatedAt,
    }),

  setSelectedTopicId: (topicId) => set({ selectedTopicId: topicId }),
  startEditing: (topicId) => set({ editingTopicId: topicId, selectedTopicId: topicId }),
  stopEditing: () => set({ editingTopicId: null }),

  renameDocument: (title) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      return commitDocument(state, renameDocumentTitle(state.document, title), { history: false })
    }),

  addChild: (topicId) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      const result = addChild(state.document, topicId)
      return commitDocument(state, result.document, {
        selectedTopicId: result.topicId,
        editingTopicId: result.topicId,
      })
    }),

  addSibling: (topicId) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      const result = addSibling(state.document, topicId)
      return commitDocument(state, result.document, {
        selectedTopicId: result.topicId,
        editingTopicId: result.topicId,
      })
    }),

  renameTopic: (topicId, title) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      return commitDocument(state, renameTopic(state.document, topicId, title), {
        selectedTopicId: topicId,
        history: false,
      })
    }),

  updateNote: (topicId, note) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      return commitDocument(state, updateTopicNote(state.document, topicId, note), {
        selectedTopicId: topicId,
        history: false,
      })
    }),

  removeTopic: (topicId) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      const fallbackSelection = state.document.topics[topicId]?.parentId ?? state.document.rootTopicId
      return commitDocument(state, removeTopic(state.document, topicId), {
        selectedTopicId: fallbackSelection,
      })
    }),

  toggleCollapse: (topicId) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      return commitDocument(state, toggleCollapse(state.document, topicId), {
        selectedTopicId: topicId,
      })
    }),

  moveTopic: (topicId, targetParentId, targetIndex) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      return commitDocument(state, moveTopic(state.document, topicId, targetParentId, targetIndex), {
        selectedTopicId: topicId,
      })
    }),

  setBranchSide: (topicId, side) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      return commitDocument(state, setBranchSide(state.document, topicId, side), {
        selectedTopicId: topicId,
      })
    }),

  setTopicOffset: (topicId, offsetX, offsetY) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      return commitDocument(state, setTopicOffset(state.document, topicId, offsetX, offsetY), {
        selectedTopicId: topicId,
      })
    }),

  resetTopicOffset: (topicId) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      return commitDocument(state, resetTopicOffset(state.document, topicId), {
        selectedTopicId: topicId,
      })
    }),

  setViewport: (viewport) =>
    set((state) => {
      if (!state.document) {
        return {}
      }

      return commitDocument(state, updateViewport(state.document, viewport), { history: false })
    }),

  undo: () =>
    set((state) => {
      if (state.history.length === 0 || !state.document) {
        return {}
      }

      const previous = state.history[state.history.length - 1]
      const nextSelected =
        state.selectedTopicId && previous.topics[state.selectedTopicId]
          ? state.selectedTopicId
          : previous.rootTopicId

      return {
        document: structuredClone(previous),
        history: state.history.slice(0, -1),
        future: [structuredClone(state.document), ...state.future].slice(0, HISTORY_LIMIT),
        selectedTopicId: nextSelected,
        editingTopicId: null,
        isDirty: true,
      }
    }),

  redo: () =>
    set((state) => {
      if (state.future.length === 0 || !state.document) {
        return {}
      }

      const [nextDocument, ...rest] = state.future
      const nextSelected =
        state.selectedTopicId && nextDocument.topics[state.selectedTopicId]
          ? state.selectedTopicId
          : nextDocument.rootTopicId

      return {
        document: structuredClone(nextDocument),
        history: [...state.history, structuredClone(state.document)].slice(-HISTORY_LIMIT),
        future: rest,
        selectedTopicId: nextSelected,
        editingTopicId: null,
        isDirty: true,
      }
    }),

  markSaved: () => set({ isDirty: false, lastSavedAt: Date.now() }),
}))

export function resetEditorStore(): void {
  useEditorStore.setState({
    document: null,
    selectedTopicId: null,
    editingTopicId: null,
    history: [],
    future: [],
    isDirty: false,
    lastSavedAt: null,
  })
}

export function getEditorSnapshot(): EditorState {
  return useEditorStore.getState()
}
