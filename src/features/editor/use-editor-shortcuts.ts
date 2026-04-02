import { useEffect } from 'react'
import { getEditorSnapshot, useEditorStore } from './editor-store'

function isTypingElement(element: EventTarget | null): boolean {
  if (!(element instanceof HTMLElement)) {
    return false
  }

  if (element.isContentEditable) {
    return true
  }

  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)
}

export function useEditorShortcuts(): void {
  const addChild = useEditorStore((state) => state.addChild)
  const addSibling = useEditorStore((state) => state.addSibling)
  const removeTopic = useEditorStore((state) => state.removeTopic)
  const startEditing = useEditorStore((state) => state.startEditing)
  const undo = useEditorStore((state) => state.undo)
  const redo = useEditorStore((state) => state.redo)

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const snapshot = getEditorSnapshot()
      const selectedTopicId = snapshot.selectedTopicId
      const doc = snapshot.document

      if (!doc) {
        return
      }

      const modifierPressed = event.ctrlKey || event.metaKey
      if (modifierPressed && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) {
          redo()
        } else {
          undo()
        }
        return
      }

      if (isTypingElement(event.target) || snapshot.editingTopicId) {
        return
      }

      if (!selectedTopicId) {
        return
      }

      switch (event.key) {
        case 'Tab':
          event.preventDefault()
          addChild(selectedTopicId)
          break
        case 'Enter':
          event.preventDefault()
          addSibling(selectedTopicId)
          break
        case 'F2':
          event.preventDefault()
          startEditing(selectedTopicId)
          break
        case 'Backspace':
        case 'Delete':
          if (selectedTopicId !== doc.rootTopicId) {
            event.preventDefault()
            removeTopic(selectedTopicId)
          }
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [addChild, addSibling, redo, removeTopic, startEditing, undo])
}
