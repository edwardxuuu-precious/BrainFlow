import type { ReactElement } from 'react'
import { Icon, IconButton } from '../../../components/ui'
import { topicStickerGlyphs } from '../../documents/topic-decorations'
import type { MindMapDocument } from '../../documents/types'
import styles from './HierarchySidebar.module.css'

interface HierarchySidebarProps {
  document: MindMapDocument
  activeTopicId: string | null
  selectedTopicIds: string[]
  collapsedTopicIds: string[]
  onSelect: (topicId: string, additive?: boolean) => void
  onToggleBranch: (topicId: string) => void
  onPrimaryAction: () => void
  onCollapse?: () => void
  id?: string
  className?: string
  mode?: 'docked' | 'drawer'
}

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

function hasMultiSelectModifier(event: React.MouseEvent<HTMLButtonElement>): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey
}

const markerIconMap = {
  important: 'sparkles',
  question: 'question',
  idea: 'spark',
  warning: 'warning',
  decision: 'check',
  blocked: 'close',
} as const

export function HierarchySidebar({
  document,
  activeTopicId,
  selectedTopicIds,
  collapsedTopicIds,
  onSelect,
  onToggleBranch,
  onCollapse,
  id,
  className,
  mode = 'docked',
}: HierarchySidebarProps) {
  const selectedSet = new Set(selectedTopicIds)
  const collapsedSet = new Set(collapsedTopicIds)

  const renderTopic = (topicId: string, depth: number): ReactElement => {
    const topic = document.topics[topicId]
    const hasChildren = topic.childIds.length > 0
    const isCollapsed = collapsedSet.has(topicId)
    const visibleChildren = isCollapsed ? [] : topic.childIds
    const isLocked = topic.aiLocked
    const isActive = activeTopicId === topicId
    const isSelected = selectedSet.has(topicId)
    const hasNote = topic.note.trim().length > 0
    const markers = topic.metadata.markers.slice(0, 2)
    const stickers = (topic.metadata.stickers ?? []).slice(0, 2)
    const description = [
      hasNote ? '已添加详细内容' : '',
      isLocked ? 'AI 已锁定' : '',
    ]
      .filter(Boolean)
      .join('；')

    return (
      <li key={topicId} className={styles.treeItem}>
        <div className={styles.treeRow} style={{ paddingLeft: `${depth * 20}px` }}>
          {hasChildren ? (
            <button
              type="button"
              className={styles.treeToggle}
              data-collapsed={isCollapsed}
              aria-label={isCollapsed ? `展开 ${topic.title}` : `折叠 ${topic.title}`}
              onClick={(event) => {
                event.stopPropagation()
                onToggleBranch(topicId)
              }}
            >
              <Icon name="chevronRight" size={14} strokeWidth={1.8} />
            </button>
          ) : (
            <span className={styles.treeTogglePlaceholder} aria-hidden="true" />
          )}

          <button
            type="button"
            className={classNames(
              styles.treeButton,
              isSelected && styles.treeButtonSelected,
              isActive && styles.treeButtonActive
            )}
            data-depth={depth}
            aria-description={description || undefined}
            onClick={(event) => onSelect(topicId, hasMultiSelectModifier(event))}
          >
            <span className={styles.treeTitleLine}>
              <Icon 
                name={depth === 0 ? 'sparkles' : 'document'} 
                size={14} 
                strokeWidth={1.8}
                className={depth === 0 ? styles.rootIcon : styles.documentIcon}
              />
              <span className={styles.treeTitle}>{topic.title}</span>
              {hasNote ? (
                <span
                  className={styles.metaIndicator}
                  data-note-indicator="true"
                  aria-hidden="true"
                >
                  <Icon name="note" size={11} strokeWidth={1.9} />
                </span>
              ) : null}
              {markers.map((marker) => (
                <span
                  key={marker}
                  className={styles.metaIndicator}
                  data-marker-indicator={marker}
                  aria-hidden="true"
                >
                  <Icon name={markerIconMap[marker]} size={11} strokeWidth={1.9} />
                </span>
              ))}
              {stickers.map((sticker) => (
                <span
                  key={sticker}
                  className={classNames(styles.metaIndicator, styles.stickerIndicator)}
                  data-sticker-indicator={sticker}
                  aria-hidden="true"
                >
                  {topicStickerGlyphs[sticker]}
                </span>
              ))}
              {isLocked ? (
                <span
                  className={styles.lockIndicator}
                  data-lock-indicator="true"
                  aria-hidden="true"
                >
                  <Icon name="lock" size={12} strokeWidth={1.8} />
                </span>
              ) : null}
            </span>
            {hasChildren ? (
              <span className={styles.treeMeta}>
                {topic.childIds.length} 个子节点{isCollapsed ? ' · 已折叠' : ''}
              </span>
            ) : null}
          </button>
        </div>

        {visibleChildren.length > 0 ? (
          <ul className={styles.treeChildren}>
            {visibleChildren.map((childId) => renderTopic(childId, depth + 1))}
          </ul>
        ) : null}
      </li>
    )
  }

  return (
    <aside id={id} className={classNames(styles.sidebar, className)} data-mode={mode}>
      {onCollapse ? (
        <div className={styles.collapseHeader}>
          <IconButton
            label="隐藏右侧栏"
            icon="chevronRight"
            tone="primary"
            size="sm"
            className={styles.collapseButton}
            aria-controls={id}
            onClick={onCollapse}
          />
        </div>
      ) : null}

      <nav className={styles.tree} aria-label="主题层级">
        <ul className={styles.treeList}>{renderTopic(document.rootTopicId, 0)}</ul>
      </nav>
    </aside>
  )
}
