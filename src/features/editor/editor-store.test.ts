import { beforeEach, describe, expect, it } from 'vitest'
import { createMindMapDocument } from '../documents/document-factory'
import { resetEditorStore, useEditorStore } from './editor-store'

describe('editor-store', () => {
  beforeEach(() => {
    resetEditorStore()
  })

  it('persists topic offsets and includes them in undo redo history', () => {
    const document = createMindMapDocument()
    const branchId = document.topics[document.rootTopicId].childIds[0]

    useEditorStore.getState().setDocument(document)
    useEditorStore.getState().setTopicOffset(branchId, 36, 14)

    expect(useEditorStore.getState().document?.topics[branchId].layout).toEqual({
      offsetX: 36,
      offsetY: 14,
    })

    useEditorStore.getState().undo()
    expect(useEditorStore.getState().document?.topics[branchId].layout).toEqual({
      offsetX: 0,
      offsetY: 0,
    })

    useEditorStore.getState().redo()
    expect(useEditorStore.getState().document?.topics[branchId].layout).toEqual({
      offsetX: 36,
      offsetY: 14,
    })

    useEditorStore.getState().resetTopicOffset(branchId)
    expect(useEditorStore.getState().document?.topics[branchId].layout).toEqual({
      offsetX: 0,
      offsetY: 0,
    })
  })
})
