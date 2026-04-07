import { Handle, Position, type NodeProps } from '@xyflow/react'
import { type CSSProperties, useEffect, useRef, useState } from 'react'
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

export function TopicNode({ id, data, selected }: NodeProps<MindMapFlowNode>) {
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
  const hasNote = data.note.trim().length > 0
  const isLocked = data.aiLocked
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
        topicType ? styles[topicType] : '',
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
        {(isLocked || hasNote || topicType) && (
          <div className={styles.statusBar}>
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
            {hasNote ? (
              <span
                className={classNames(styles.statusIcon, styles.noteIcon)}
                onMouseEnter={() => setHoveredIcon('note')}
                onMouseLeave={() => setHoveredIcon(null)}
                role="img"
                aria-label="已添加详细内容"
              >
                <Icon name="note" size={14} strokeWidth={2} />
                {hoveredIcon === 'note' ? (
                  <span className={styles.statusTooltip}>已添加详细内容</span>
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
              <div
                className={styles.title}
                data-title-tier={titleTypography.tier}
                style={titleStyleVars as CSSProperties}
              >
                {data.title}
              </div>
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
}
