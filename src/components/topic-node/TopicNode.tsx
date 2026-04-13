import { Handle, Position, type NodeProps } from '@xyflow/react'
import { type CSSProperties, memo, useEffect, useRef, useState } from 'react'
import {
  topicMarkerLabels,
  topicStickerGlyphs,
  topicStickerLabels,
} from '../../features/documents/topic-decorations'
import { useEditorStore } from '../../features/editor/editor-store'
import type { MindMapFlowNode } from '../../features/editor/layout'
import {
  getTopicTitleStyleVars,
  getTopicTitleTypography,
} from '../../features/editor/topic-title-display'
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

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

export const TopicNode = memo(function TopicNode({ id, data, selected }: NodeProps<MindMapFlowNode>) {
  const activeTopicId = useEditorStore((state) => state.activeTopicId)
  const editingTopicId = useEditorStore((state) => state.editingTopicId)
  const editingSurface = useEditorStore((state) => state.editingSurface)
  const startEditing = useEditorStore((state) => state.startEditing)
  const stopEditing = useEditorStore((state) => state.stopEditing)
  const renameTopic = useEditorStore((state) => state.renameTopic)
  const toggleCollapse = useEditorStore((state) => state.toggleCollapse)
  const inputRef = useRef<HTMLInputElement>(null)
  const [hoveredIcon, setHoveredIcon] = useState<string | null>(null)

  const isEditing = editingTopicId === id && editingSurface === 'canvas'
  const isSelected = selected
  const isActive = activeTopicId === id
  const hasNotePreview = data.notePreview.trim().length > 0
  const isLocked = data.aiLocked
  const isDropTarget = data.dropTarget === true
  const labels = data.metadata.labels.slice(0, 2)
  const extraLabelCount = Math.max(0, data.metadata.labels.length - labels.length)
  const markers = data.metadata.markers.slice(0, 2)
  const extraMarkerCount = Math.max(0, data.metadata.markers.length - markers.length)
  const stickers = data.metadata.stickers.slice(0, 2)
  const extraStickerCount = Math.max(0, data.metadata.stickers.length - stickers.length)
  const topicType = data.metadata?.type
  const titleTypography = getTopicTitleTypography(data.title, data.isRoot ? 'root' : 'regular')
  const titleStyleVars = getTopicTitleStyleVars(data.title, data.isRoot ? 'root' : 'regular')
  const showMetaRow =
    labels.length > 0 ||
    markers.length > 0 ||
    extraMarkerCount > 0 ||
    stickers.length > 0 ||
    extraStickerCount > 0

  useEffect(() => {
    if (!isEditing) {
      return
    }

    const textarea = inputRef.current
    if (textarea) {
      textarea.focus()
      textarea.select()
      // 设置初始高度
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`
    }
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
        isDropTarget ? styles.dropTarget : '',
        data.isRoot ? styles.root : '',
        topicType ? styles[topicType] : '',
      ].join(' ')}
      data-selected={isSelected ? 'true' : 'false'}
      data-active={isActive ? 'true' : 'false'}
      data-locked={isLocked ? 'true' : 'false'}
      data-drop-target={isDropTarget ? 'true' : 'false'}
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
      <Handle
        id={targetHandleId('left')}
        type="target"
        position={Position.Left}
        className={styles.handle}
      />
      <Handle
        id={targetHandleId('right')}
        type="target"
        position={Position.Right}
        className={styles.handle}
      />
      <Handle
        id={sourceHandleId('left')}
        type="source"
        position={Position.Left}
        className={styles.handle}
      />
      <Handle
        id={sourceHandleId('right')}
        type="source"
        position={Position.Right}
        className={styles.handle}
      />

      <div className={styles.content}>
        {isEditing ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            defaultValue={data.title}
            className={`${styles.textarea} nodrag nowheel nopan`}
            aria-label="编辑主题标题"
            rows={1}
            onInput={(event) => {
              // 自动调整高度
              const target = event.target as HTMLTextAreaElement
              target.style.height = 'auto'
              target.style.height = `${Math.min(target.scrollHeight, 150)}px`
            }}
            onBlur={commitRename}
            onKeyDown={(event) => {
              // Shift+Enter 换行，Enter 保存
              if (event.key === 'Enter' && !event.shiftKey) {
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
              <div className={styles.titleBlock}>
                <div
                  className={styles.title}
                  data-title-tier={titleTypography.tier}
                  style={titleStyleVars as CSSProperties}
                >
                  {data.title}
                </div>

                {hasNotePreview ? (
                  <div
                    className={styles.detailPreview}
                    data-inline-detail="true"
                    title={data.notePreview}
                  >
                    {data.notePreview}
                  </div>
                ) : null}
              </div>

              {(isLocked || topicType) && (
                <div className={styles.statusGroup}>
                  {isLocked ? (
                    <span
                      className={styles.statusIcon}
                      onMouseEnter={() => setHoveredIcon('lock')}
                      onMouseLeave={() => setHoveredIcon(null)}
                      role="img"
                      aria-label="AI 锁定节点"
                    >
                      <Icon name="lock" size={14} strokeWidth={2} />
                      {hoveredIcon === 'lock' ? (
                        <span className={styles.statusTooltip}>AI 锁定：节点不会被 AI 修改</span>
                      ) : null}
                    </span>
                  ) : null}
                  {topicType === 'milestone' ? (
                    <span
                      className={classNames(styles.statusIcon, styles.milestoneIcon)}
                      onMouseEnter={() => setHoveredIcon('milestone')}
                      onMouseLeave={() => setHoveredIcon(null)}
                      role="img"
                      aria-label="里程碑"
                    >
                      <Icon name="star" size={14} strokeWidth={2} />
                      {hoveredIcon === 'milestone' ? (
                        <span className={styles.statusTooltip}>里程碑节点</span>
                      ) : null}
                    </span>
                  ) : null}
                  {topicType === 'task' ? (
                    <span
                      className={classNames(styles.statusIcon, styles.taskIcon)}
                      onMouseEnter={() => setHoveredIcon('task')}
                      onMouseLeave={() => setHoveredIcon(null)}
                      role="img"
                      aria-label="任务"
                    >
                      <Icon name="checkCircle" size={14} strokeWidth={2} />
                      {hoveredIcon === 'task' ? (
                        <span className={styles.statusTooltip}>任务节点</span>
                      ) : null}
                    </span>
                  ) : null}
                </div>
              )}
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
                      aria-label={`标记：${topicMarkerLabels[marker]}`}
                    >
                      <Icon name={markerIconMap[marker]} size={14} strokeWidth={2} />
                    </span>
                  ))}
                  {extraMarkerCount > 0 ? (
                    <span className={styles.metaCount}>+{extraMarkerCount}</span>
                  ) : null}

                  {stickers.map((sticker) => (
                    <span
                      key={sticker}
                      className={classNames(styles.metaBadge, styles.stickerBadge)}
                      data-sticker={sticker}
                      role="img"
                      aria-label={`贴纸：${topicStickerLabels[sticker]}`}
                    >
                      {topicStickerGlyphs[sticker]}
                    </span>
                  ))}
                  {extraStickerCount > 0 ? (
                    <span className={styles.metaCount}>+{extraStickerCount}</span>
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
})
