import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMindMapDocument } from '../documents/document-factory'
import { resetEditorStore, useEditorStore } from './editor-store'
import { useEditorShortcuts } from './use-editor-shortcuts'

function ShortcutHarness() {
  useEditorShortcuts()

  return (
    <div>
      <input aria-label="标题输入框" />
    </div>
  )
}

describe('useEditorShortcuts', () => {
  beforeEach(() => {
    resetEditorStore()
  })

  it('selects the full document on Ctrl+A outside typing fields', () => {
    const document = createMindMapDocument()
    const branchId = document.topics[document.rootTopicId].childIds[0]

    useEditorStore.getState().setDocument(document)
    useEditorStore.getState().setSelection([branchId], branchId)
    render(<ShortcutHarness />)

    fireEvent.keyDown(window, { key: 'a', ctrlKey: true })

    expect(useEditorStore.getState().selectedTopicIds).toEqual(Object.keys(document.topics))
    expect(useEditorStore.getState().activeTopicId).toBe(branchId)
  })

  it('does not hijack Ctrl+A inside typing elements', () => {
    const document = createMindMapDocument()
    const branchId = document.topics[document.rootTopicId].childIds[0]

    useEditorStore.getState().setDocument(document)
    useEditorStore.getState().setSelection([branchId], branchId)
    render(<ShortcutHarness />)

    fireEvent.keyDown(screen.getByRole('textbox', { name: '标题输入框' }), {
      key: 'a',
      ctrlKey: true,
    })

    expect(useEditorStore.getState().selectedTopicIds).toEqual([branchId])
    expect(useEditorStore.getState().activeTopicId).toBe(branchId)
  })

  it('deletes only the unlocked portion of the current selection', () => {
    const document = createMindMapDocument()
    const [lockedId, removableId] = document.topics[document.rootTopicId].childIds
    document.topics[lockedId].aiLocked = true

    useEditorStore.getState().setDocument(document)
    useEditorStore.getState().selectAll()
    render(<ShortcutHarness />)

    fireEvent.keyDown(window, { key: 'Delete' })

    expect(useEditorStore.getState().document?.topics[lockedId]).toBeDefined()
    expect(useEditorStore.getState().document?.topics[removableId]).toBeUndefined()
    expect(useEditorStore.getState().selectedTopicIds).toEqual([document.rootTopicId, lockedId])
  })

  it('does not start renaming a locked topic with F2', () => {
    const document = createMindMapDocument()
    const lockedId = document.topics[document.rootTopicId].childIds[0]
    document.topics[lockedId].aiLocked = true

    useEditorStore.getState().setDocument(document)
    useEditorStore.getState().setSelection([lockedId], lockedId)
    render(<ShortcutHarness />)

    fireEvent.keyDown(window, { key: 'F2' })

    expect(useEditorStore.getState().editingTopicId).toBeNull()
    expect(useEditorStore.getState().editingSurface).toBeNull()
  })
})
