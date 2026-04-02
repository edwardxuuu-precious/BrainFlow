import { StatusPill } from '../../../components/ui'
import styles from './AiContextTray.module.css'

interface SelectionTopicChip {
  topicId: string
  title: string
  isActive: boolean
}

interface AiContextTrayProps {
  selectedTopics: SelectionTopicChip[]
}

export function AiContextTray({ selectedTopics }: AiContextTrayProps) {
  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <StatusPill tone="soft">Context</StatusPill>
        <span className={styles.count}>{selectedTopics.length} 个节点</span>
      </div>

      <div className={styles.current}>
        <div>
          <div className={styles.caption}>当前选区</div>
          <div className={styles.selectionTitle}>
            {selectedTopics.length > 0 ? 'AI 将直接使用当前选区作为上下文。' : '尚未选择任何节点'}
          </div>
        </div>
      </div>

      <div className={styles.chips}>
        {selectedTopics.length === 0 ? (
          <p className={styles.empty}>先框选或多选节点，再切到 AI 提问。</p>
        ) : (
          selectedTopics.map((topic) => (
            <span
              key={topic.topicId}
              className={styles.chip}
              data-active={topic.isActive}
            >
              <span className={styles.chipLabel}>{topic.title}</span>
              {topic.isActive ? <span className={styles.activeBadge}>焦点</span> : null}
            </span>
          ))
        )}
      </div>
    </section>
  )
}
