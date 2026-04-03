import { useState, useMemo } from 'react'
import { Button } from '../../../components/ui'
import styles from './AiContextTray.module.css'

interface Topic {
  topicId: string
  title: string
}

interface AiContextTrayProps {
  selectedTopics: Topic[]
  allTopics?: Topic[]
  useFullDocument: boolean
  onToggleFullDocument: () => void
  onAddTopic: (topicId: string) => void
  onRemoveTopic: (topicId: string) => void
  onCanvasPick?: () => void
}

export function AiContextTray({
  selectedTopics,
  allTopics = [],
  useFullDocument,
  onToggleFullDocument,
  onAddTopic,
  onRemoveTopic,
  onCanvasPick,
}: AiContextTrayProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)

  // 过滤已选择的节点
  const filteredTopics = useMemo(() => {
    if (!searchQuery.trim()) return []
    const query = searchQuery.toLowerCase()
    return allTopics.filter(
      topic => 
        topic.title.toLowerCase().includes(query) &&
        !selectedTopics.find(t => t.topicId === topic.topicId)
    ).slice(0, 5)
  }, [searchQuery, allTopics, selectedTopics])

  const handleToggleExpand = () => {
    setIsExpanded(!isExpanded)
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

  const handleRemoveTopic = (topicId: string) => {
    onRemoveTopic(topicId)
  }

  return (
    <section className={styles.section} data-expanded={isExpanded}>
      {/* Header - Always visible */}
      <button
        type="button"
        className={styles.header}
        onClick={handleToggleExpand}
        aria-expanded={isExpanded}
      >
        <div className={styles.headerLeft}>
          <span className={styles.headerTitle}>Context</span>
          {!isExpanded && (
            <div className={styles.headerSummary}>
              {useFullDocument && (
                <span className={styles.badge}>整张脑图</span>
              )}
              {selectedTopics.map(topic => (
                <span key={topic.topicId} className={styles.badge}>
                  {topic.title}
                </span>
              ))}
              {!useFullDocument && selectedTopics.length === 0 && (
                <span className={styles.badgeEmpty}>未选择上下文</span>
              )}
            </div>
          )}
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
          <path d={isExpanded ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
        </svg>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className={styles.content}>
          {/* Full Document Toggle */}
          <div className={styles.option}>
            <button
              type="button"
              className={`${styles.optionButton} ${useFullDocument ? styles.active : ''}`}
              onClick={onToggleFullDocument}
            >
              <span className={styles.checkIcon}>
                {useFullDocument && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
              <span className={styles.optionLabel}>整张脑图</span>
            </button>
            <p className={styles.optionHint}>AI 会读取全部内容理解上下文</p>
          </div>

          {/* Selected Topics */}
          {selectedTopics.length > 0 && (
            <div className={styles.selectedSection}>
              <div className={styles.sectionLabel}>已选择节点</div>
              <div className={styles.selectedList}>
                {selectedTopics.map(topic => (
                  <div key={topic.topicId} className={styles.selectedItem}>
                    <span className={styles.selectedTitle}>{topic.title}</span>
                    <button
                      type="button"
                      className={styles.removeButton}
                      onClick={() => handleRemoveTopic(topic.topicId)}
                      aria-label={`移除 ${topic.title}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add Topic Section */}
          <div className={styles.addSection}>
            <div className={styles.sectionLabel}>添加节点</div>
            
            {showSearch ? (
              <div className={styles.searchBox}>
                <div className={styles.searchInputWrapper}>
                  <span className={styles.atSymbol}>@</span>
                  <input
                    type="text"
                    className={styles.searchInput}
                    placeholder="输入节点名称搜索..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
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
                
                {filteredTopics.length > 0 && (
                  <div className={styles.searchResults}>
                    {filteredTopics.map(topic => (
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
                )}
                
                {searchQuery && filteredTopics.length === 0 && (
                  <div className={styles.noResults}>未找到匹配的节点</div>
                )}
              </div>
            ) : (
              <div className={styles.addButtons}>
                <Button
                  tone="secondary"
                  size="sm"
                  iconStart="search"
                  onClick={() => setShowSearch(true)}
                >
                  搜索节点
                </Button>
                {onCanvasPick && (
                  <Button
                    tone="ghost"
                    size="sm"
                    onClick={onCanvasPick}
                  >
                    从画布选择
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Done Button */}
          <div className={styles.footer}>
            <Button
              tone="primary"
              size="sm"
              onClick={() => setIsExpanded(false)}
            >
              完成
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
