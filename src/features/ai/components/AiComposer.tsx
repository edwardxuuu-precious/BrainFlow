import { useRef, useState, useEffect, useCallback } from 'react'
import type { AiRunStage } from '../../../../shared/ai-contract'
import { Button, IconButton } from '../../../components/ui'
import styles from './AiComposer.module.css'

interface AiComposerProps {
  value: string
  isSending: boolean
  runStage: AiRunStage
  disabled?: boolean
  disabledHint?: string
  disabledPlaceholder?: string
  onChange: (value: string) => void
  onSubmit: () => void
}

const MIN_HEIGHT = 160
const MAX_HEIGHT = 400
const DEFAULT_HEIGHT = 180

function describeSendingState(stage: AiRunStage): string {
  switch (stage) {
    case 'checking_status':
      return '检查中'
    case 'building_context':
      return '整理上下文'
    case 'starting_codex':
      return '调用 Codex'
    case 'waiting_first_token':
      return '等待输出'
    case 'streaming':
      return '输出中'
    case 'planning_changes':
      return '生成改动中'
    case 'applying_changes':
      return '应用改动'
    default:
      return '运行中'
  }
}

export function AiComposer({
  value,
  isSending,
  runStage,
  disabled = false,
  disabledHint,
  disabledPlaceholder,
  onChange,
  onSubmit,
}: AiComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const [attachments, setAttachments] = useState<File[]>([])
  const [height, setHeight] = useState(DEFAULT_HEIGHT)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartYRef = useRef(0)
  const dragStartHeightRef = useRef(0)

  const handleSubmit = () => {
    if (!value.trim() && attachments.length === 0) return
    onSubmit()
    setAttachments([])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      handleSubmit()
    }
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (files) {
      setAttachments(Array.from(files))
    }
  }

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  const handleResizeStart = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    setIsDragging(true)
    dragStartYRef.current = event.clientY
    dragStartHeightRef.current = height
  }, [height])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (event: MouseEvent) => {
      const deltaY = dragStartYRef.current - event.clientY
      const newHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, dragStartHeightRef.current + deltaY))
      setHeight(newHeight)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  return (
    <section 
      ref={composerRef}
      className={styles.composer} 
      style={{ height }}
    >
      {/* Resize handle */}
      <div 
        className={styles.resizeHandle}
        onMouseDown={handleResizeStart}
        title="拖拽调整高度"
      >
        <div className={styles.resizeHandleBar} />
      </div>

      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className={styles.attachments}>
          {attachments.map((file, index) => (
            <div key={index} className={styles.attachmentChip}>
              <span className={styles.attachmentName}>{file.name}</span>
              <button
                type="button"
                className={styles.removeAttachment}
                onClick={() => removeAttachment(index)}
                aria-label={`移除 ${file.name}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className={styles.inputArea}>
        <textarea
          ref={textareaRef}
          value={value}
          disabled={disabled || isSending}
          className={styles.field}
          aria-label="AI 提问输入框"
          placeholder={
            disabled
              ? (disabledPlaceholder ?? '当前不可发送，请先修复 Codex 验证。')
              : '输入消息...'
          }
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          <IconButton
            label="添加附件"
            icon="attachment"
            tone="primary"
            size="sm"
            disabled={disabled || isSending}
            onClick={() => fileInputRef.current?.click()}
          />
          <input
            ref={fileInputRef}
            type="file"
            className={styles.fileInput}
            accept="image/png,image/jpeg,image/webp,image/gif,.txt,.md,.json"
            multiple
            onChange={handleFileSelect}
          />
          {disabled && disabledHint && (
            <span className={styles.hint}>{disabledHint}</span>
          )}
        </div>

        <Button
          tone="primary"
          iconStart="send"
          size="sm"
          disabled={disabled || isSending || (!value.trim() && attachments.length === 0)}
          onClick={handleSubmit}
        >
          {isSending ? describeSendingState(runStage) : '发送'}
        </Button>
      </div>
    </section>
  )
}
