import { beforeEach, describe, expect, it } from 'vitest'
import { createMindMapDocument } from '../documents/document-factory'
import { createDefaultTopicMetadata, createDefaultTopicStyle } from '../documents/topic-defaults'
import { resetEditorStore, useEditorStore } from './editor-store'

function appendChildTopic(
  document: ReturnType<typeof createMindMapDocument>,
  parentId: string,
  topicId: string,
  title: string,
  options?: {
    aiLocked?: boolean
  },
): string {
  document.topics[parentId].childIds.push(topicId)
  document.topics[topicId] = {
    id: topicId,
    parentId,
    childIds: [],
    title,
    note: '',
    noteRich: null,
    aiLocked: options?.aiLocked ?? false,
    isCollapsed: false,
    branchSide: 'auto',
    layout: {
      offsetX: 0,
      offsetY: 0,
      semanticGroupKey: null,
      priority: null,
    },
    metadata: createDefaultTopicMetadata(),
    style: createDefaultTopicStyle(),
  }

  return topicId
}

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

  it('selects the whole document without changing the current active topic when it still exists', () => {
    const document = createMindMapDocument()
    const branchId = document.topics[document.rootTopicId].childIds[0]

    useEditorStore.getState().setDocument(document)
    useEditorStore.getState().setSelection([branchId], branchId)
    useEditorStore.getState().selectAll()

    expect(useEditorStore.getState().activeTopicId).toBe(branchId)
    expect(useEditorStore.getState().selectedTopicIds).toEqual(Object.keys(document.topics))
  })

  it('treats repeated setSelection calls with the same state as a no-op', () => {
    const document = createMindMapDocument()
    const branchId = document.topics[document.rootTopicId].childIds[0]

    useEditorStore.getState().setDocument(document)
    useEditorStore.getState().setSelection([branchId], branchId)
    const documentAfterSelection = useEditorStore.getState().document

    useEditorStore.getState().setSelection([branchId], branchId)

    expect(useEditorStore.getState().document).toBe(documentAfterSelection)
    expect(useEditorStore.getState().selectedTopicIds).toEqual([branchId])
    expect(useEditorStore.getState().activeTopicId).toBe(branchId)
  })

  it('does not notify subscribers when the same selection arrives in a different order', () => {
    const document = createMindMapDocument()
    const [firstId, secondId] = document.topics[document.rootTopicId].childIds

    useEditorStore.getState().setDocument(document)
    useEditorStore.getState().setSelection([firstId, secondId], firstId)

    let notificationCount = 0
    const unsubscribe = useEditorStore.subscribe(() => {
      notificationCount += 1
    })

    useEditorStore.getState().setSelection([secondId, firstId], firstId)
    unsubscribe()

    expect(notificationCount).toBe(0)
    expect(useEditorStore.getState().selectedTopicIds).toEqual([firstId, secondId])
    expect(useEditorStore.getState().activeTopicId).toBe(firstId)
  })

  it('treats clearing an already empty selection as a no-op', () => {
    const document = createMindMapDocument()

    useEditorStore.getState().setDocument(document)
    useEditorStore.getState().clearSelection()
    const historyLengthAfterClear = useEditorStore.getState().history.length
    const futureLengthAfterClear = useEditorStore.getState().future.length

    useEditorStore.getState().clearSelection()

    expect(useEditorStore.getState().selectedTopicIds).toEqual([])
    expect(useEditorStore.getState().activeTopicId).toBeNull()
    expect(useEditorStore.getState().document?.workspace.selectedTopicId).toBeNull()
    expect(useEditorStore.getState().history).toHaveLength(historyLengthAfterClear)
    expect(useEditorStore.getState().future).toHaveLength(futureLengthAfterClear)
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
      semanticGroupKey: null,
      priority: null,
    })
    expect(useEditorStore.getState().document?.workspace.selectedTopicId).toBe(branchId)
    expect(useEditorStore.getState().document?.workspace.chrome.leftSidebarOpen).toBe(false)
    expect(useEditorStore.getState().document?.workspace.hierarchyCollapsedTopicIds).toEqual([])
    expect(useEditorStore.getState().document?.viewport).toEqual({ x: 18, y: -12, zoom: 1.15 })

    useEditorStore.getState().redo()
    expect(useEditorStore.getState().document?.topics[branchId].layout).toEqual({
      offsetX: 36,
      offsetY: 14,
      semanticGroupKey: null,
      priority: null,
    })
    expect(useEditorStore.getState().document?.workspace.selectedTopicId).toBe(branchId)
    expect(useEditorStore.getState().document?.workspace.chrome.leftSidebarOpen).toBe(false)
    expect(useEditorStore.getState().document?.workspace.hierarchyCollapsedTopicIds).toEqual([])
    expect(useEditorStore.getState().document?.viewport).toEqual({ x: 18, y: -12, zoom: 1.15 })
  })

  it('toggles hierarchy branches as workspace-only state without touching history', () => {
    const document = createMindMapDocument()
    const branchId = document.topics[document.rootTopicId].childIds[0]
    appendChildTopic(document, branchId, 'topic_branch_child', '分支子节点')

    useEditorStore.getState().setDocument(document)
    useEditorStore.getState().toggleHierarchyBranch(document.rootTopicId)
    useEditorStore.getState().toggleHierarchyBranch(branchId)

    expect(useEditorStore.getState().document?.workspace.hierarchyCollapsedTopicIds).toEqual([
      document.rootTopicId,
      branchId,
    ])
    expect(useEditorStore.getState().history).toHaveLength(0)
    expect(useEditorStore.getState().isDirty).toBe(false)
    expect(useEditorStore.getState().hasPendingWorkspaceSave).toBe(true)
  })

  it('preserves raw hierarchy collapse state when selecting a deep topic', () => {
    const document = createMindMapDocument()
    const branchId = document.topics[document.rootTopicId].childIds[0]
    const childId = appendChildTopic(document, branchId, 'topic_nested_test', '深层节点')
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

  it('batch deletes unlocked topics in one history step and preserves locked survivors', () => {
    const document = createMindMapDocument()
    const [leftId, rightId] = document.topics[document.rootTopicId].childIds
    const freeChildId = appendChildTopic(document, leftId, 'topic_free_child', '可删子节点')
    const lockedChildId = appendChildTopic(document, leftId, 'topic_locked_child', '锁定子节点', {
      aiLocked: true,
    })

    useEditorStore.getState().setDocument(document)
    useEditorStore.getState().selectAll()
    useEditorStore.getState().removeTopics(useEditorStore.getState().selectedTopicIds)

    expect(useEditorStore.getState().history).toHaveLength(1)
    expect(useEditorStore.getState().document?.topics[rightId]).toBeUndefined()
    expect(useEditorStore.getState().document?.topics[freeChildId]).toBeUndefined()
    expect(useEditorStore.getState().document?.topics[leftId]).toBeDefined()
    expect(useEditorStore.getState().document?.topics[lockedChildId]).toBeDefined()
    expect(useEditorStore.getState().selectedTopicIds).toEqual([
      document.rootTopicId,
      leftId,
      lockedChildId,
    ])
  })

  it('skips deletion when the selection only contains the root and locked topics', () => {
    const document = createMindMapDocument()
    const lockedId = document.topics[document.rootTopicId].childIds[0]
    document.topics[lockedId].aiLocked = true

    useEditorStore.getState().setDocument(document)
    useEditorStore.getState().setSelection([document.rootTopicId, lockedId], lockedId)
    useEditorStore.getState().removeTopics(useEditorStore.getState().selectedTopicIds)

    expect(useEditorStore.getState().history).toHaveLength(0)
    expect(useEditorStore.getState().selectedTopicIds).toEqual([document.rootTopicId, lockedId])
    expect(useEditorStore.getState().document?.topics[lockedId]).toBeDefined()
  })

  it('deduplicates parent-child deletion into a single subtree removal', () => {
    const document = createMindMapDocument()
    const parentId = document.topics[document.rootTopicId].childIds[0]
    const childId = appendChildTopic(document, parentId, 'topic_child', '子节点')

    useEditorStore.getState().setDocument(document)
    useEditorStore.getState().setSelection([parentId, childId], childId)
    useEditorStore.getState().removeTopics([parentId, childId])

    expect(useEditorStore.getState().history).toHaveLength(1)
    expect(useEditorStore.getState().document?.topics[parentId]).toBeUndefined()
    expect(useEditorStore.getState().document?.topics[childId]).toBeUndefined()
    expect(useEditorStore.getState().selectedTopicIds).toEqual([document.rootTopicId])
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
