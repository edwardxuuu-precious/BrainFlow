import { beforeEach, describe, expect, it } from 'vitest'
import { createMindMapDocument } from '../documents/document-factory'
import { resetEditorStore, useEditorStore } from './editor-store'

describe('editor-store', () => {
  beforeEach(() => {
    resetEditorStore()
  })

  it('tracks the editing surface and clears it when editing stops', () => {
    const document = createMindMapDocument()
    const branchId = document.topics[document.rootTopicId].childIds[0]

    useEditorStore.getState().setDocument(document)
    useEditorStore.getState().startEditing(branchId, 'inspector')

    expect(useEditorStore.getState().editingTopicId).toBe(branchId)
    expect(useEditorStore.getState().editingSurface).toBe('inspector')
    expect(useEditorStore.getState().activeTopicId).toBe(branchId)
    expect(useEditorStore.getState().selectedTopicIds).toEqual([branchId])
    expect(useEditorStore.getState().document?.workspace.selectedTopicId).toBe(branchId)

    useEditorStore.getState().stopEditing()

    expect(useEditorStore.getState().editingTopicId).toBeNull()
    expect(useEditorStore.getState().editingSurface).toBeNull()
  })

  it('persists active topic into workspace without marking content dirty', () => {
    const document = createMindMapDocument()
    const branchId = document.topics[document.rootTopicId].childIds[0]

    useEditorStore.getState().setDocument(document)
    useEditorStore.getState().setSelection([branchId], branchId)

    expect(useEditorStore.getState().activeTopicId).toBe(branchId)
    expect(useEditorStore.getState().selectedTopicIds).toEqual([branchId])
    expect(useEditorStore.getState().document?.workspace.selectedTopicId).toBe(branchId)
    expect(useEditorStore.getState().isDirty).toBe(false)
    expect(useEditorStore.getState().hasPendingWorkspaceSave).toBe(true)
  })

  it('supports additive multi-selection without persisting the whole set', () => {
    const document = createMindMapDocument()
    const [firstId, secondId] = document.topics[document.rootTopicId].childIds

    useEditorStore.getState().setDocument(document)
    useEditorStore.getState().setSelection([firstId], firstId)
    useEditorStore.getState().toggleTopicSelection(secondId)

    expect(useEditorStore.getState().selectedTopicIds).toEqual([firstId, secondId])
    expect(useEditorStore.getState().activeTopicId).toBe(secondId)
    expect(useEditorStore.getState().document?.workspace.selectedTopicId).toBe(secondId)
  })

  it('stores viewport and sidebar chrome as workspace state without adding undo history', () => {
    const document = createMindMapDocument()

    useEditorStore.getState().setDocument(document)
    useEditorStore.getState().setViewport({ x: 42, y: -18, zoom: 1.25 })
    useEditorStore.getState().setSidebarOpen('left', false)
    useEditorStore.getState().toggleSidebar('right')

    expect(useEditorStore.getState().document?.viewport).toEqual({ x: 42, y: -18, zoom: 1.25 })
    expect(useEditorStore.getState().document?.workspace.chrome).toEqual({
      leftSidebarOpen: false,
      rightSidebarOpen: false,
    })
    expect(useEditorStore.getState().document?.workspace.hierarchyCollapsedTopicIds).toEqual([])
    expect(useEditorStore.getState().history).toHaveLength(0)
    expect(useEditorStore.getState().isDirty).toBe(false)
    expect(useEditorStore.getState().hasPendingWorkspaceSave).toBe(true)
  })

  it('keeps workspace state when undoing and redoing content changes', () => {
    const document = createMindMapDocument()
    const branchId = document.topics[document.rootTopicId].childIds[0]

    useEditorStore.getState().setDocument(document)
    useEditorStore.getState().setSelection([branchId], branchId)
    useEditorStore.getState().setViewport({ x: 18, y: -12, zoom: 1.15 })
    useEditorStore.getState().setSidebarOpen('left', false)
    useEditorStore.getState().setTopicOffset(branchId, 36, 14)

    useEditorStore.getState().undo()
    expect(useEditorStore.getState().document?.topics[branchId].layout).toEqual({
      offsetX: 0,
      offsetY: 0,
    })
    expect(useEditorStore.getState().document?.workspace.selectedTopicId).toBe(branchId)
    expect(useEditorStore.getState().document?.workspace.chrome.leftSidebarOpen).toBe(false)
    expect(useEditorStore.getState().document?.workspace.hierarchyCollapsedTopicIds).toEqual([])
    expect(useEditorStore.getState().document?.viewport).toEqual({ x: 18, y: -12, zoom: 1.15 })

    useEditorStore.getState().redo()
    expect(useEditorStore.getState().document?.topics[branchId].layout).toEqual({
      offsetX: 36,
      offsetY: 14,
    })
    expect(useEditorStore.getState().document?.workspace.selectedTopicId).toBe(branchId)
    expect(useEditorStore.getState().document?.workspace.chrome.leftSidebarOpen).toBe(false)
    expect(useEditorStore.getState().document?.workspace.hierarchyCollapsedTopicIds).toEqual([])
    expect(useEditorStore.getState().document?.viewport).toEqual({ x: 18, y: -12, zoom: 1.15 })
  })

  it('toggles hierarchy branches as workspace-only state without touching history', () => {
    const document = createMindMapDocument()
    const branchId = document.topics[document.rootTopicId].childIds[0]

    useEditorStore.getState().setDocument(document)
    useEditorStore.getState().toggleHierarchyBranch(document.rootTopicId)
    useEditorStore.getState().toggleHierarchyBranch(branchId)

    expect(useEditorStore.getState().document?.workspace.hierarchyCollapsedTopicIds).toEqual([
      document.rootTopicId,
    ])
    expect(useEditorStore.getState().history).toHaveLength(0)
    expect(useEditorStore.getState().isDirty).toBe(false)
    expect(useEditorStore.getState().hasPendingWorkspaceSave).toBe(true)
  })

  it('preserves raw hierarchy collapse state when selecting a deep topic', () => {
    const document = createMindMapDocument()
    const branchId = document.topics[document.rootTopicId].childIds[0]
    const childId = `topic_nested_test`
    document.topics[branchId].childIds.push(childId)
    document.topics[childId] = {
      id: childId,
      parentId: branchId,
      childIds: [],
      title: '深层节点',
      note: '',
      noteRich: null,
      aiLocked: false,
      isCollapsed: false,
      branchSide: 'auto',
      layout: {
        offsetX: 0,
        offsetY: 0,
      },
      metadata: {
        labels: [],
        markers: [],
        stickers: [],
        task: null,
        links: [],
        attachments: [],
      },
      style: {
        emphasis: 'normal',
        variant: 'default',
      },
    }
    document.workspace.hierarchyCollapsedTopicIds = [document.rootTopicId, branchId]

    useEditorStore.getState().setDocument(document)
    useEditorStore.getState().setSelection([childId], childId)

    expect(useEditorStore.getState().document?.workspace.hierarchyCollapsedTopicIds).toEqual([
      document.rootTopicId,
      branchId,
    ])
    expect(useEditorStore.getState().activeTopicId).toBe(childId)
  })

  it('batch locks topics and records one undo step', () => {
    const document = createMindMapDocument()
    const [firstId, secondId] = document.topics[document.rootTopicId].childIds

    useEditorStore.getState().setDocument(document)
    useEditorStore.getState().setSelection([firstId], firstId)
    useEditorStore.getState().toggleTopicSelection(secondId)
    useEditorStore.getState().setTopicsAiLocked([firstId, secondId], true)

    expect(useEditorStore.getState().document?.topics[firstId].aiLocked).toBe(true)
    expect(useEditorStore.getState().document?.topics[secondId].aiLocked).toBe(true)
    expect(useEditorStore.getState().history).toHaveLength(1)

    useEditorStore.getState().undo()

    expect(useEditorStore.getState().document?.topics[firstId].aiLocked).toBe(false)
    expect(useEditorStore.getState().document?.topics[secondId].aiLocked).toBe(false)
  })

  it('clears both dirty flags when a save completes', () => {
    const document = createMindMapDocument()
    const branchId = document.topics[document.rootTopicId].childIds[0]

    useEditorStore.getState().setDocument(document)
    useEditorStore.getState().setSelection([branchId], branchId)
    useEditorStore.getState().renameTopic(branchId, '重命名节点')

    expect(useEditorStore.getState().isDirty).toBe(true)
    expect(useEditorStore.getState().hasPendingWorkspaceSave).toBe(true)

    useEditorStore.getState().markSaved()

    expect(useEditorStore.getState().isDirty).toBe(false)
    expect(useEditorStore.getState().hasPendingWorkspaceSave).toBe(false)
  })
})
