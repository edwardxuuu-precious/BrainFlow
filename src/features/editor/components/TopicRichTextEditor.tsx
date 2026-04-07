import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

const FONT_OPTIONS = [
  { value: '', label: '默认' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: '"Times New Roman", serif', label: 'Times' },
  { value: '"Courier New", monospace', label: 'Courier' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: '"Microsoft YaHei", sans-serif', label: '微软雅黑' },
  { value: '"SimSun", serif', label: '宋体' },
]

const FONT_SIZE_OPTIONS = [
  { value: '', label: '默认' },
  { value: '12px', label: '12' },
  { value: '14px', label: '14' },
  { value: '16px', label: '16' },
  { value: '18px', label: '18' },
  { value: '20px', label: '20' },
  { value: '24px', label: '24' },
  { value: '28px', label: '28' },
  { value: '32px', label: '32' },
]

const COLOR_OPTIONS = [
  '#000000', '#333333', '#666666', '#999999',
  '#FF0000', '#FF4444', '#FF6B6B', '#FF8787',
  '#00AA00', '#22C55E', '#4ADE80', '#86EFAC',
  '#0066FF', '#3B82F6', '#60A5FA', '#93C5FD',
  '#FF8800', '#F97316', '#FB923C', '#FDBA74',
  '#8B5CF6', '#A78BFA', '#C4B5FD', '#DDD6FE',
]

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
  const [showColorPicker, setShowColorPicker] = useState(false)
  const colorPickerRef = useRef<HTMLDivElement>(null)

  const sourceDocument = useMemo(
    () => getRenderableTopicRichText(value, fallbackPlainText),
    [fallbackPlainText, value],
  )
  const sourceHtml = useMemo(() => topicRichTextToHtml(sourceDocument), [sourceDocument])

  useEffect(() => {
    if (!editorRef.current) return
    const isFocused = document.activeElement === editorRef.current
    if (isFocused) return
    if (editorRef.current.innerHTML !== sourceHtml) {
      editorRef.current.innerHTML = sourceHtml
    }
  }, [sourceHtml])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(event.target as Node)) {
        setShowColorPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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

  const handleFontChange = useCallback((font: string) => {
    if (font) runCommand('fontName', font)
  }, [runCommand])

  const handleFontSizeChange = useCallback((size: string) => {
    if (!size) return
    runCommand('fontSize', '7')
    const selection = window.getSelection()
    if (selection?.rangeCount) {
      const spans = editorRef.current?.querySelectorAll('font[size="7"]')
      spans?.forEach((span) => {
        const element = span as HTMLElement
        element.style.fontSize = size
        element.removeAttribute('size')
      })
      syncFromDom()
    }
  }, [runCommand, syncFromDom])

  const handleColorChange = useCallback((color: string) => {
    runCommand('foreColor', color)
    setShowColorPicker(false)
  }, [runCommand])

  const handleLinkAction = useCallback(() => {
    const selection = window.getSelection()
    const activeLink = findClosestLink(selection?.anchorNode ?? null)
    const nextHref = window.prompt(
      '输入链接地址，留空则移除当前链接。',
      activeLink?.getAttribute('href') ?? 'https://',
    )
    if (nextHref === null) return
    const normalized = nextHref.trim()
    if (!normalized) {
      runCommand('unlink')
      return
    }
    runCommand('createLink', normalized)
  }, [runCommand])

  return (
    <div id={id} className={styles.root} data-note-editor-root="true">
      {/* Font & Size Row */}
      <div className={styles.toolbarRow}>
        <select
          className={styles.select}
          onChange={(e) => handleFontChange(e.target.value)}
          onMouseDown={(e) => e.preventDefault()}
          defaultValue=""
        >
          {FONT_OPTIONS.map((font) => (
            <option key={font.value} value={font.value}>
              {font.label}
            </option>
          ))}
        </select>
        <select
          className={classNames(styles.select, styles.selectSmall)}
          onChange={(e) => handleFontSizeChange(e.target.value)}
          onMouseDown={(e) => e.preventDefault()}
          defaultValue=""
        >
          {FONT_SIZE_OPTIONS.map((size) => (
            <option key={size.value} value={size.value}>
              {size.label}
            </option>
          ))}
        </select>
      </div>

      {/* Style & Color Row */}
      <div className={styles.toolbarRow}>
        <div className={styles.styleButtons}>
          <button
            type="button"
            className={styles.styleButton}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand('bold')}
            title="粗体"
          >
            <span className={styles.bold}>B</span>
          </button>
          <button
            type="button"
            className={styles.styleButton}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand('italic')}
            title="斜体"
          >
            <span className={styles.italic}>I</span>
          </button>
          <button
            type="button"
            className={styles.styleButton}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand('underline')}
            title="下划线"
          >
            <span className={styles.underline}>U</span>
          </button>
          <button
            type="button"
            className={styles.styleButton}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand('strikeThrough')}
            title="删除线"
          >
            <span className={styles.strikethrough}>S</span>
          </button>
        </div>

        <div className={styles.divider} />

        {/* Color Picker */}
        <div className={styles.colorPickerWrapper} ref={colorPickerRef}>
          <button
            type="button"
            className={styles.styleButton}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setShowColorPicker(!showColorPicker)}
            title="字体颜色"
            style={{ width: 'auto', padding: '0 10px' }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 2L3 14H13L8 2Z" />
            </svg>
          </button>
          {showColorPicker && (
            <div className={styles.colorPalette}>
              {COLOR_OPTIONS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={styles.colorOption}
                  style={{ backgroundColor: color }}
                  onClick={() => handleColorChange(color)}
                  title={color}
                />
              ))}
            </div>
          )}
        </div>

        <div className={styles.divider} />

        {/* List */}
        <button
          type="button"
          className={styles.styleButton}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runCommand('insertUnorderedList')}
          title="列表"
          style={{ width: 'auto', padding: '0 12px', fontSize: '13px' }}
        >
          列表
        </button>

        {/* Link */}
        <button
          type="button"
          className={styles.styleButton}
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleLinkAction}
          title="链接"
          style={{ width: 'auto', padding: '0 12px', fontSize: '13px' }}
        >
          链接
        </button>
      </div>

      {/* Editor */}
      <div className={styles.editorWrapper}>
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
            if (!(event.metaKey || event.ctrlKey)) return
            const lowerKey = event.key.toLowerCase()
            if (lowerKey === 'b') {
              event.preventDefault()
              runCommand('bold')
            } else if (lowerKey === 'i') {
              event.preventDefault()
              runCommand('italic')
            } else if (lowerKey === 'u') {
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
    </div>
  )
}
