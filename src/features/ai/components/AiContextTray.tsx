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
        <span className={styles.count}>整张脑图</span>
      </div>

      <div className={styles.current}>
        <div>
          <div className={styles.caption}>当前上下文</div>
          <div className={styles.selectionTitle}>AI 会默认读取整张脑图，并优先围绕当前聚焦节点理解你的问题。</div>
        </div>
      </div>

      <div className={styles.current}>
        <div>
          <div className={styles.caption}>当前聚焦</div>
          <div className={styles.selectionTitle}>
            {selectedTopics.length > 0
              ? `已聚焦 ${selectedTopics.length} 个节点`
              : '未指定聚焦节点，AI 将直接基于整图理解你的表达'}
          </div>
        </div>
      </div>

      <div className={styles.chips}>
        {selectedTopics.length === 0 ? (
          <p className={styles.empty}>可以直接提问；如果你希望 AI 更聚焦，也可以先框选或多选相关节点。</p>
        ) : (
          selectedTopics.map((topic) => (
            <span key={topic.topicId} className={styles.chip} data-active={topic.isActive}>
              <span className={styles.chipLabel}>{topic.title}</span>
              {topic.isActive ? <span className={styles.activeBadge}>焦点</span> : null}
            </span>
          ))
        )}
      </div>
    </section>
  )
}
