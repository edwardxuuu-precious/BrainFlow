import { IconButton } from '../../../components/ui'
import styles from './EditorSidebarTabs.module.css'

interface EditorSidebarTabsProps {
  activeTab: 'inspector' | 'ai'
  onChange: (tab: 'inspector' | 'ai') => void
  onCollapse?: () => void
}

export function EditorSidebarTabs({ activeTab, onChange, onCollapse }: EditorSidebarTabsProps) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.tabs} role="tablist" aria-label="右侧边栏标签">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'inspector'}
          className={styles.tab}
          data-active={activeTab === 'inspector'}
          onClick={() => onChange('inspector')}
        >
          Inspector
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'ai'}
          className={styles.tab}
          data-active={activeTab === 'ai'}
          onClick={() => onChange('ai')}
        >
          AI
        </button>
      </div>
      {onCollapse ? (
        <IconButton
          label="隐藏右侧栏"
          icon="back"
          tone="secondary"
          size="sm"
          className={styles.collapseButton}
          onClick={onCollapse}
        />
      ) : null}
    </div>
  )
}
