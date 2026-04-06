import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Button } from '../../../components/ui'
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



function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
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

  const sourceDocument = useMemo(
    () => getRenderableTopicRichText(value, fallbackPlainText),
    [fallbackPlainText, value],
  )
  const sourceHtml = useMemo(() => topicRichTextToHtml(sourceDocument), [sourceDocument])


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

  const runCommand = useCallback(
    (command: string, commandValue?: string) => {
      if (typeof document.execCommand === 'function') {
        document.execCommand(command, false, commandValue)
      }

      syncFromDom()
    },
    [syncFromDom],
  )

  const handleLinkAction = useCallback(() => {
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
  }, [runCommand])

  return (
    <div id={id} className={styles.root} data-note-editor-root="true">
      <div className={styles.header}>
        <div className={styles.toolbar}>
          <Button
            tone="primary"
            size="sm"
            className={styles.command}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand('bold')}
          >
            B
          </Button>
          <Button
            tone="primary"
            size="sm"
            className={classNames(styles.command, styles.italic)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand('italic')}
          >
            I
          </Button>
          <Button
            tone="primary"
            size="sm"
            className={classNames(styles.command, styles.underline)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand('underline')}
          >
            U
          </Button>
          <Button
            tone="primary"
            size="sm"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand('insertUnorderedList')}
          >
            列表
          </Button>
          <Button tone="primary" size="sm" onMouseDown={(e) => e.preventDefault()} onClick={handleLinkAction}>
            链接
          </Button>
        </div>
      </div>

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
          if (fallbackPlainText.length === 0 && editorRef.current?.innerText.trim().length === 0) {
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
    </div>
  )
}
