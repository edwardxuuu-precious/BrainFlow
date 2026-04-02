import styles from './EditorSidebarTabs.module.css'

interface EditorSidebarTabsProps {
  activeTab: 'inspector' | 'ai'
  onChange: (tab: 'inspector' | 'ai') => void
}

export function EditorSidebarTabs({ activeTab, onChange }: EditorSidebarTabsProps) {
  return (
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
  )
}
