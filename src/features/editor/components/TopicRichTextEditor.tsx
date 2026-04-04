import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, SegmentedControl } from '../../../components/ui'
import {
  createTopicRichTextFromPlainText,
  getRenderableTopicRichText,
  parseTopicRichTextFromHtml,
  topicRichTextToHtml,
} from '../../documents/topic-rich-text'
import type { TopicRichTextDocument } from '../../documents/types'
import styles from './TopicRichTextEditor.module.css'

interface TopicRichTextEditorProps {
  id?: string
  value: TopicRichTextDocument | null
  fallbackPlainText: string
  placeholder?: string
  onChange: (value: TopicRichTextDocument | null) => void
}

type EditorMode = 'edit' | 'preview'

const editorModeOptions = [
  { value: 'edit', label: '编辑' },
  { value: 'preview', label: '预览' },
] as const

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

function moveCaretToEnd(element: HTMLElement): void {
  const selection = window.getSelection()
  if (!selection) {
    return
  }

  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

function findClosestLink(node: Node | null): HTMLAnchorElement | null {
  let cursor: Node | null = node

  while (cursor) {
    if (cursor instanceof HTMLAnchorElement) {
      return cursor
    }

    cursor = cursor.parentNode
  }

  return null
}

export function TopicRichTextEditor({
  id,
  value,
  fallbackPlainText,
  placeholder = '记录上下文、待办，或者补充说明。',
  onChange,
}: TopicRichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<EditorMode>('edit')
  const sourceDocument = useMemo(
    () => getRenderableTopicRichText(value, fallbackPlainText),
    [fallbackPlainText, value],
  )
  const sourceHtml = useMemo(() => topicRichTextToHtml(sourceDocument), [sourceDocument])
  const previewText = fallbackPlainText.trim()

  useEffect(() => {
    if (!editorRef.current) {
      return
    }

    const isFocused = document.activeElement === editorRef.current
    if (isFocused) {
      return
    }

    if (editorRef.current.innerHTML !== sourceHtml) {
      editorRef.current.innerHTML = sourceHtml
    }
  }, [sourceHtml])

  const syncFromDom = useCallback(() => {
    const nextHtml = editorRef.current?.innerHTML ?? ''
    onChange(parseTopicRichTextFromHtml(nextHtml))
  }, [onChange])

  const focusEditor = useCallback(() => {
    if (!editorRef.current) {
      return
    }

    editorRef.current.focus()
    moveCaretToEnd(editorRef.current)
  }, [])

  const runCommand = useCallback(
    (command: string, commandValue?: string) => {
      focusEditor()

      if (typeof document.execCommand === 'function') {
        document.execCommand(command, false, commandValue)
      }

      syncFromDom()
    },
    [focusEditor, syncFromDom],
  )

  const handleLinkAction = useCallback(() => {
    focusEditor()

    const selection = window.getSelection()
    const activeLink = findClosestLink(selection?.anchorNode ?? null)
    const nextHref = window.prompt(
      '输入链接地址，留空则移除当前链接。',
      activeLink?.getAttribute('href') ?? 'https://',
    )

    if (nextHref === null) {
      return
    }

    const normalized = nextHref.trim()
    if (!normalized) {
      runCommand('unlink')
      return
    }

    runCommand('createLink', normalized)
  }, [focusEditor, runCommand])

  return (
    <div id={id} className={styles.root} data-note-editor-root="true">
      <div className={styles.header}>
        <SegmentedControl
          value={mode}
          options={[...editorModeOptions]}
          ariaLabel="详细内容视图切换"
          onChange={setMode}
        />
        <div className={styles.toolbar}>
          <Button
            tone="ghost"
            size="sm"
            className={styles.command}
            disabled={mode !== 'edit'}
            onClick={() => runCommand('bold')}
          >
            B
          </Button>
          <Button
            tone="ghost"
            size="sm"
            className={classNames(styles.command, styles.italic)}
            disabled={mode !== 'edit'}
            onClick={() => runCommand('italic')}
          >
            I
          </Button>
          <Button
            tone="ghost"
            size="sm"
            className={classNames(styles.command, styles.underline)}
            disabled={mode !== 'edit'}
            onClick={() => runCommand('underline')}
          >
            U
          </Button>
          <Button
            tone="ghost"
            size="sm"
            disabled={mode !== 'edit'}
            onClick={() => runCommand('insertUnorderedList')}
          >
            列表
          </Button>
          <Button tone="ghost" size="sm" disabled={mode !== 'edit'} onClick={handleLinkAction}>
            链接
          </Button>
        </div>
      </div>

      {mode === 'preview' ? (
        previewText ? (
          <div
            className={styles.preview}
            aria-label="详细内容预览"
            dangerouslySetInnerHTML={{ __html: sourceHtml }}
          />
        ) : (
          <div className={styles.empty}>{placeholder}</div>
        )
      ) : (
        <div
          ref={editorRef}
          className={styles.editor}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label="详细内容富文本编辑器"
          aria-multiline="true"
          data-placeholder={placeholder}
          dangerouslySetInnerHTML={{ __html: sourceHtml }}
          onFocus={() => {
            if (previewText.length === 0 && editorRef.current?.innerText.trim().length === 0) {
              editorRef.current.innerHTML = '<p><br></p>'
            }
          }}
          onInput={syncFromDom}
          onBlur={syncFromDom}
          onKeyDown={(event) => {
            if (!(event.metaKey || event.ctrlKey)) {
              return
            }

            const lowerKey = event.key.toLowerCase()
            if (lowerKey === 'b') {
              event.preventDefault()
              runCommand('bold')
            }

            if (lowerKey === 'i') {
              event.preventDefault()
              runCommand('italic')
            }

            if (lowerKey === 'u') {
              event.preventDefault()
              runCommand('underline')
            }
          }}
          onPaste={(event) => {
            event.preventDefault()
            const text = event.clipboardData.getData('text/plain')
            const fragment = topicRichTextToHtml(createTopicRichTextFromPlainText(text))

            if (typeof document.execCommand === 'function') {
              document.execCommand(
                text.includes('\n') || /^\s*[-*]\s+/m.test(text) ? 'insertHTML' : 'insertText',
                false,
                text.includes('\n') || /^\s*[-*]\s+/m.test(text) ? fragment : text,
              )
            }

            syncFromDom()
          }}
        />
      )}
    </div>
  )
}
