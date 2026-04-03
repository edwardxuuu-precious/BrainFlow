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
  const setTopicsAiLocked = useEditorStore((state) => state.setTopicsAiLocked)
  const startEditing = useEditorStore((state) => state.startEditing)
  const undo = useEditorStore((state) => state.undo)
  const redo = useEditorStore((state) => state.redo)

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const snapshot = getEditorSnapshot()
      const activeTopicId = snapshot.activeTopicId
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

      if (modifierPressed && event.shiftKey && event.key.toLowerCase() === 'l') {
        const selectedTopicIds = snapshot.selectedTopicIds.filter((topicId) => doc.topics[topicId])
        if (selectedTopicIds.length === 0) {
          return
        }

        event.preventDefault()
        const unlockedTopicIds = selectedTopicIds.filter((topicId) => !doc.topics[topicId].aiLocked)
        setTopicsAiLocked(
          unlockedTopicIds.length === 0 ? selectedTopicIds : unlockedTopicIds,
          unlockedTopicIds.length > 0,
        )
        return
      }

      if (!activeTopicId) {
        return
      }

      switch (event.key) {
        case 'Tab':
          event.preventDefault()
          addChild(activeTopicId)
          break
        case 'Enter':
          event.preventDefault()
          addSibling(activeTopicId)
          break
        case 'F2':
          event.preventDefault()
          startEditing(activeTopicId, 'canvas')
          break
        case 'Backspace':
        case 'Delete':
          if (activeTopicId !== doc.rootTopicId) {
            event.preventDefault()
            removeTopic(activeTopicId)
          }
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [addChild, addSibling, redo, removeTopic, setTopicsAiLocked, startEditing, undo])
}
