import type { ReactElement } from 'react'
import { Button, Icon, IconButton, StatusPill } from '../../../components/ui'
import type { MindMapDocument } from '../../documents/types'
import styles from './HierarchySidebar.module.css'

interface HierarchySidebarProps {
  document: MindMapDocument
  activeTopicId: string | null
  selectedTopicIds: string[]
  onSelect: (topicId: string, additive?: boolean) => void
  onPrimaryAction: () => void
  onCollapse?: () => void
  id?: string
  className?: string
  mode?: 'docked' | 'drawer'
}

const shortcuts = [
  { label: '添加子节点', key: 'Tab' },
  { label: '添加同级节点', key: 'Enter' },
  { label: '编辑文本', key: 'F2' },
  { label: '删除节点', key: 'Del' },
] as const

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

function hasMultiSelectModifier(event: React.MouseEvent<HTMLButtonElement>): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey
}

export function HierarchySidebar({
  document,
  activeTopicId,
  selectedTopicIds,
  onSelect,
  onPrimaryAction,
  onCollapse,
  id,
  className,
  mode = 'docked',
}: HierarchySidebarProps) {
  const selectedSet = new Set(selectedTopicIds)

  const renderTopic = (topicId: string, depth: number): ReactElement => {
    const topic = document.topics[topicId]
    const visibleChildren = topic.isCollapsed ? [] : topic.childIds
    const hasNote = topic.note.trim().length > 0
    const isActive = activeTopicId === topicId
    const isSelected = selectedSet.has(topicId)

    return (
      <li key={topicId} className={styles.treeItem}>
        <button
          type="button"
          className={styles.treeButton}
          data-selected={isSelected}
          data-active={isActive}
          data-depth={depth}
          aria-description={hasNote ? '已添加备注' : undefined}
          style={{ paddingLeft: `${14 + depth * 16}px` }}
          onClick={(event) => onSelect(topicId, hasMultiSelectModifier(event))}
        >
          <span className={styles.treeTitleLine}>
            <Icon name={depth === 0 ? 'tree' : 'document'} size={14} />
            <span className={styles.treeTitle}>{topic.title}</span>
            {hasNote ? (
              <span className={styles.noteIndicator} data-note-indicator="true" aria-hidden="true">
                <Icon name="note" size={11} strokeWidth={1.9} />
              </span>
            ) : null}
          </span>
          {topic.childIds.length > 0 ? (
            <span className={styles.treeCount}>
              {topic.childIds.length} 个子节点{topic.isCollapsed ? ' · 已折叠' : ''}
            </span>
          ) : null}
        </button>
        {visibleChildren.length > 0 ? (
          <ul className={`${styles.treeList} ${styles.treeChildren}`}>
            {visibleChildren.map((childId) => renderTopic(childId, depth + 1))}
          </ul>
        ) : null}
      </li>
    )
  }

  return (
    <aside id={id} className={classNames(styles.sidebar, className)} data-mode={mode}>
      <div className={styles.top}>
        <div className={styles.chrome}>
          <StatusPill tone="soft">Hierarchy</StatusPill>
          {onCollapse ? (
            <IconButton
              label="隐藏层级栏"
              icon="back"
              tone="secondary"
              size="sm"
              className={styles.collapseButton}
              aria-controls={id}
              aria-expanded
              onClick={onCollapse}
            />
          ) : null}
        </div>

        <div className={styles.heading}>
          <h2 className={styles.title}>{document.title}</h2>
          <p className={styles.subtitle}>轻量导航负责定位主题，不承载额外编辑逻辑。</p>
        </div>
      </div>

      <nav className={styles.tree} aria-label="主题层级">
        <ul className={styles.treeList}>{renderTopic(document.rootTopicId, 0)}</ul>
      </nav>

      <div className={styles.footer}>
        <div className={styles.footerLabel}>
          <StatusPill tone="soft">Shortcuts</StatusPill>
        </div>
        <div className={styles.shortcutList}>
          {shortcuts.map((shortcut) => (
            <div key={shortcut.key} className={styles.shortcutRow}>
              <span className={styles.shortcutText}>{shortcut.label}</span>
              <span className={styles.shortcutKey}>{shortcut.key}</span>
            </div>
          ))}
        </div>
        <Button
          tone="primary"
          iconStart="add"
          className={styles.primaryAction}
          onClick={onPrimaryAction}
        >
          新增子主题
        </Button>
      </div>
    </aside>
  )
}
