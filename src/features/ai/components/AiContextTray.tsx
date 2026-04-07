import { useCallback, useMemo, useState } from 'react'
import { Button } from '../../../components/ui'
import styles from './AiContextTray.module.css'

interface Topic {
  topicId: string
  title: string
  isActive?: boolean
}

interface AiContextTrayProps {
  effectiveTopics: Topic[]
  manualTopics: Topic[]
  canvasTopics: Topic[]
  allTopics?: Topic[]
  useFullDocument: boolean
  onToggleFullDocument: () => void
  onAddTopic: (topicId: string) => void
  onRemoveTopic: (topicId: string) => void
  onCanvasPick?: () => void
  onCancelCanvasPick?: () => void
}

export function AiContextTray({
  effectiveTopics,
  manualTopics,
  canvasTopics,
  allTopics = [],
  useFullDocument,
  onToggleFullDocument,
  onAddTopic,
  onRemoveTopic,
  onCanvasPick,
  onCancelCanvasPick,
}: AiContextTrayProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [isPickingFromCanvas, setIsPickingFromCanvas] = useState(false)

  const filteredTopics = useMemo(() => {
    if (!searchQuery.trim()) {
      return []
    }

    const query = searchQuery.toLowerCase()
    return allTopics
      .filter(
        (topic) =>
          topic.title.toLowerCase().includes(query) &&
          !manualTopics.some((selectedTopic) => selectedTopic.topicId === topic.topicId),
      )
      .slice(0, 5)
  }, [allTopics, manualTopics, searchQuery])

  const handleToggleExpand = () => {
    setIsExpanded((previous) => !previous)
    if (isExpanded) {
      setShowSearch(false)
      setSearchQuery('')
    }
  }

  const handleSelectTopic = (topic: Topic) => {
    onAddTopic(topic.topicId)
    setSearchQuery('')
    setShowSearch(false)
  }

  const handleStartCanvasPick = useCallback(() => {
    setIsPickingFromCanvas(true)
    onCanvasPick?.()
  }, [onCanvasPick])

  const handleDone = useCallback(() => {
    if (isPickingFromCanvas) {
      onCancelCanvasPick?.()
    }
    setIsPickingFromCanvas(false)
    setIsExpanded(false)
  }, [isPickingFromCanvas, onCancelCanvasPick])

  return (
    <section className={styles.section} data-expanded={isExpanded}>
      <button
        type="button"
        className={styles.header}
        onClick={handleToggleExpand}
        aria-expanded={isExpanded}
      >
        <div className={styles.headerLeft}>
          <span className={styles.headerTitle}>Context</span>
          {!isExpanded ? (
            <div className={styles.headerSummary}>
              {useFullDocument ? <span className={styles.badge}>整张脑图</span> : null}
              {effectiveTopics.map((topic) => (
                <span key={topic.topicId} className={styles.badge}>
                  {topic.title}
                </span>
              ))}
              {!useFullDocument && effectiveTopics.length === 0 ? (
                <span className={styles.badgeEmpty}>未选择上下文</span>
              ) : null}
            </div>
          ) : null}
        </div>
        <svg
          className={styles.chevron}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d={isExpanded ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
        </svg>
      </button>

      {isExpanded ? (
        <div className={styles.content}>
          <div className={styles.option}>
            <button
              type="button"
              className={`${styles.optionButton} ${useFullDocument ? styles.active : ''}`}
              onClick={onToggleFullDocument}
            >
              <span className={styles.checkIcon}>
                {useFullDocument ? (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                  >
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                ) : null}
              </span>
              <span className={styles.optionLabel}>整张脑图</span>
            </button>
            <p className={styles.optionHint}>
              AI 会读取整张脑图，手动上下文和画布选区只作为重点提示。
            </p>
          </div>

          <div className={styles.selectedSection}>
            <div className={styles.sectionLabel}>画布当前选区</div>
            {canvasTopics.length > 0 ? (
              <div className={styles.selectedList}>
                {canvasTopics.map((topic) => (
                  <div key={topic.topicId} className={styles.selectedItem}>
                    <span className={styles.selectedTitle}>{topic.title}</span>
                    {topic.isActive ? <span className={styles.sourceBadge}>当前焦点</span> : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>当前画布没有选中节点。</div>
            )}
          </div>

          <div className={styles.selectedSection}>
            <div className={styles.sectionLabel}>手动上下文</div>
            {manualTopics.length > 0 ? (
              <div className={styles.selectedList}>
                {manualTopics.map((topic) => (
                  <div key={topic.topicId} className={styles.selectedItem}>
                    <span className={styles.selectedTitle}>{topic.title}</span>
                    <div className={styles.selectedActions}>
                      {topic.isActive ? <span className={styles.sourceBadge}>当前焦点</span> : null}
                      <button
                        type="button"
                        className={styles.removeButton}
                        onClick={() => onRemoveTopic(topic.topicId)}
                        aria-label={`移除 ${topic.title}`}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>还没有手动固定的上下文节点。</div>
            )}
          </div>

          {effectiveTopics.length > 0 ? (
            <div className={styles.selectedSection}>
              <div className={styles.sectionLabel}>本次生效上下文</div>
              <div className={styles.selectedList}>
                {effectiveTopics.map((topic) => (
                  <div key={topic.topicId} className={styles.selectedItem}>
                    <span className={styles.selectedTitle}>{topic.title}</span>
                    {topic.isActive ? <span className={styles.sourceBadge}>当前焦点</span> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className={styles.addSection}>
            <div className={styles.sectionLabel}>添加手动上下文</div>

            {showSearch ? (
              <div className={styles.searchBox}>
                <div className={styles.searchInputWrapper}>
                  <span className={styles.atSymbol}>@</span>
                  <input
                    type="text"
                    className={styles.searchInput}
                    placeholder="输入节点名称搜索..."
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    autoFocus
                  />
                  <button
                    type="button"
                    className={styles.closeSearch}
                    onClick={() => {
                      setShowSearch(false)
                      setSearchQuery('')
                    }}
                  >
                    ×
                  </button>
                </div>

                {filteredTopics.length > 0 ? (
                  <div className={styles.searchResults}>
                    {filteredTopics.map((topic) => (
                      <button
                        key={topic.topicId}
                        type="button"
                        className={styles.searchResult}
                        onClick={() => handleSelectTopic(topic)}
                      >
                        {topic.title}
                      </button>
                    ))}
                  </div>
                ) : null}

                {searchQuery && filteredTopics.length === 0 ? (
                  <div className={styles.noResults}>没有找到匹配的节点</div>
                ) : null}
              </div>
            ) : (
              <div className={styles.addButtons}>
                <Button tone="primary" size="sm" iconStart="search" onClick={() => setShowSearch(true)}>
                  搜索节点
                </Button>
                {onCanvasPick ? (
                  <Button tone="primary" size="sm" onClick={handleStartCanvasPick}>
                    {isPickingFromCanvas ? '从画布点击节点…' : '从画布选择'}
                  </Button>
                ) : null}
              </div>
            )}
          </div>

          <div className={styles.footer}>
            <button type="button" className={styles.doneButton} onClick={handleDone}>
              完成
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
