import type { AiMessage } from '../../../../shared/ai-contract'
import styles from './AiMessageList.module.css'

interface AiMessageListProps {
  messages: AiMessage[]
  streamingText: string
  error: string | null
}

export function AiMessageList({ messages, streamingText, error }: AiMessageListProps) {
  return (
    <section className={styles.list} aria-label="AI 对话消息">
      {messages.length === 0 && !streamingText ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>BrainFlow AI 已就绪</p>
          <p className={styles.emptyText}>附加相关节点后提问，我会先回答，再在必要时给出待审批的画布提案。</p>
        </div>
      ) : null}

      {messages.map((message) => (
        <article key={message.id} className={styles.message} data-role={message.role}>
          <div className={styles.role}>{message.role === 'user' ? '你' : 'AI'}</div>
          <div className={styles.bubble}>{message.content}</div>
        </article>
      ))}

      {streamingText ? (
        <article className={styles.message} data-role="assistant">
          <div className={styles.role}>AI</div>
          <div className={styles.bubble}>{streamingText}</div>
        </article>
      ) : null}

      {error ? <p className={styles.error}>{error}</p> : null}
    </section>
  )
}
