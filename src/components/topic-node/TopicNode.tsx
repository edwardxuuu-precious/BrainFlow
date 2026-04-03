import { Handle, Position, type NodeProps } from '@xyflow/react'
import { type CSSProperties, useEffect, useRef } from 'react'
import { useEditorStore } from '../../features/editor/editor-store'
import type { MindMapFlowNode } from '../../features/editor/layout'
import { Icon } from '../ui'
import styles from './TopicNode.module.css'

function sourceHandleId(side: 'left' | 'right'): string {
  return `source-${side}`
}

function targetHandleId(side: 'left' | 'right'): string {
  return `target-${side}`
}

const markerIconMap = {
  important: 'sparkles',
  question: 'question',
  idea: 'spark',
  warning: 'warning',
  decision: 'check',
  blocked: 'close',
} as const

const markerLabelMap = {
  important: '重点',
  question: '问题',
  idea: '灵感',
  warning: '风险',
  decision: '决策',
  blocked: '阻塞',
} as const

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

export function TopicNode({ id, data, selected }: NodeProps<MindMapFlowNode>) {
  const activeTopicId = useEditorStore((state) => state.activeTopicId)
  const selectedTopicIds = useEditorStore((state) => state.selectedTopicIds)
  const editingTopicId = useEditorStore((state) => state.editingTopicId)
  const editingSurface = useEditorStore((state) => state.editingSurface)
  const startEditing = useEditorStore((state) => state.startEditing)
  const stopEditing = useEditorStore((state) => state.stopEditing)
  const renameTopic = useEditorStore((state) => state.renameTopic)
  const toggleCollapse = useEditorStore((state) => state.toggleCollapse)
  const inputRef = useRef<HTMLInputElement>(null)

  const isEditing = editingTopicId === id && editingSurface === 'canvas'
  const isSelected = selected || selectedTopicIds.includes(id)
  const isActive = activeTopicId === id
  const hasNote = data.note.trim().length > 0
  const isLocked = data.aiLocked
  const labels = data.metadata.labels.slice(0, 2)
  const extraLabelCount = Math.max(0, data.metadata.labels.length - labels.length)
  const markers = data.metadata.markers.slice(0, 2)
  const extraMarkerCount = Math.max(0, data.metadata.markers.length - markers.length)
  const hasLinks = data.metadata.links.length > 0
  const hasAttachments = data.metadata.attachments.length > 0
  const task = data.metadata.task
  const showMetaRow =
    labels.length > 0 ||
    markers.length > 0 ||
    extraMarkerCount > 0 ||
    !!task ||
    hasLinks ||
    hasAttachments

  useEffect(() => {
    if (!isEditing) {
      return
    }

    inputRef.current?.focus()
    inputRef.current?.select()
  }, [isEditing])

  const commitRename = () => {
    renameTopic(id, inputRef.current?.value ?? data.title)
    stopEditing()
  }

  return (
    <div
      className={[
        styles.node,
        isSelected ? styles.selected : '',
        isActive ? styles.active : '',
        isEditing ? styles.editing : '',
        isLocked ? styles.locked : '',
        data.isRoot ? styles.root : '',
      ].join(' ')}
      data-selected={isSelected ? 'true' : 'false'}
      data-active={isActive ? 'true' : 'false'}
      data-locked={isLocked ? 'true' : 'false'}
      data-variant={data.style.variant}
      data-emphasis={data.style.emphasis}
      style={
        {
          '--branch-color': data.branchColor,
          '--topic-fill': data.style.background ?? 'var(--surface-container-lowest)',
          '--topic-text': data.style.textColor ?? 'var(--color-text)',
        } as CSSProperties
      }
      onDoubleClick={() => startEditing(id, 'canvas')}
    >
      <Handle id={targetHandleId('left')} type="target" position={Position.Left} className={styles.handle} />
      <Handle id={targetHandleId('right')} type="target" position={Position.Right} className={styles.handle} />
      <Handle id={sourceHandleId('left')} type="source" position={Position.Left} className={styles.handle} />
      <Handle id={sourceHandleId('right')} type="source" position={Position.Right} className={styles.handle} />

      <div className={styles.content}>
        {isLocked ? (
          <span
            className={styles.lockBadge}
            data-lock-badge="true"
            role="img"
            aria-label="AI 锁定节点"
          >
            <Icon name="lock" size={12} strokeWidth={1.9} />
            <span className={styles.lockBadgeText}>已锁定</span>
          </span>
        ) : null}
        {data.isRoot ? <span className={styles.badge}>BRAINFLOW</span> : null}
        {isEditing ? (
          <input
            ref={inputRef}
            defaultValue={data.title}
            className={`${styles.input} nodrag nowheel nopan`}
            aria-label="编辑主题标题"
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commitRename()
              }

              if (event.key === 'Escape') {
                event.preventDefault()
                if (inputRef.current) {
                  inputRef.current.value = data.title
                }
                stopEditing()
              }
            }}
          />
        ) : (
          <>
            <div className={styles.titleRow}>
              <div className={styles.title}>{data.title}</div>
              {hasNote ? (
                <span
                  className={styles.noteIndicator}
                  data-note-indicator="true"
                  role="img"
                  aria-label="已添加备注"
                >
                  <Icon name="note" size={12} strokeWidth={1.9} />
                </span>
              ) : null}
            </div>
            {showMetaRow ? (
              <div className={styles.metaRow}>
                {labels.length > 0 ? (
                  <div className={styles.labelGroup}>
                    {labels.map((label) => (
                      <span key={label} className={styles.labelChip}>
                        {label}
                      </span>
                    ))}
                    {extraLabelCount > 0 ? (
                      <span className={styles.metaCount}>+{extraLabelCount}</span>
                    ) : null}
                  </div>
                ) : null}
                <div className={styles.badgeGroup}>
                  {markers.map((marker) => (
                    <span
                      key={marker}
                      className={classNames(styles.metaBadge, styles.markerBadge)}
                      data-marker={marker}
                      role="img"
                      aria-label={`标记：${markerLabelMap[marker]}`}
                    >
                      <Icon name={markerIconMap[marker]} size={11} strokeWidth={2} />
                    </span>
                  ))}
                  {extraMarkerCount > 0 ? (
                    <span className={styles.metaCount}>+{extraMarkerCount}</span>
                  ) : null}
                  {task ? (
                    <span
                      className={classNames(styles.metaBadge, styles.taskBadge)}
                      data-task-status={task.status}
                      role="img"
                      aria-label={`任务：${task.status}`}
                    >
                      <Icon
                        name={task.status === 'done' ? 'check' : task.status === 'in_progress' ? 'calendar' : 'history'}
                        size={11}
                        strokeWidth={2}
                      />
                    </span>
                  ) : null}
                  {hasLinks ? (
                    <span
                      className={classNames(styles.metaBadge, styles.linkBadge)}
                      data-link-indicator="true"
                      role="img"
                      aria-label="包含链接"
                    >
                      <Icon name="link" size={11} strokeWidth={2} />
                    </span>
                  ) : null}
                  {hasAttachments ? (
                    <span
                      className={classNames(styles.metaBadge, styles.attachmentBadge)}
                      data-attachment-indicator="true"
                      role="img"
                      aria-label="包含附件引用"
                    >
                      <Icon name="attachment" size={11} strokeWidth={2} />
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      {data.childCount > 0 ? (
        <button
          type="button"
          className={`${styles.collapse} nodrag nowheel nopan`}
          aria-label={data.isCollapsed ? '展开子主题' : '折叠子主题'}
          onClick={(event) => {
            event.stopPropagation()
            toggleCollapse(id)
          }}
        >
          {data.isCollapsed ? '+' : '−'}
        </button>
      ) : null}
    </div>
  )
}
