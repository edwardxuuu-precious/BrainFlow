import type { AiExecutionError, AiMessage, AiRunStage } from '../../../../shared/ai-contract'
import styles from './AiMessageList.module.css'

interface AiMessageListProps {
  messages: AiMessage[]
  streamingText: string
  runStage: AiRunStage
  streamingStatusText: string
  error: string | null
  executionError: AiExecutionError | null
}

function describeExecutionError(error: AiExecutionError | null, fallback: string | null) {
  if (error?.code === 'schema_invalid') {
    return {
      title: '本地 AI bridge 格式错误',
      message: error.message,
      hint: '这不是登录问题，重新验证不会解决，需要修复应用端的输出格式。',
    }
  }

  if (
    error?.code === 'verification_required' ||
    error?.code === 'subscription_required' ||
    error?.code === 'login_required'
  ) {
    return {
      title: 'Codex 需要重新验证',
      message: error.message,
      hint: '请先修复本机 Codex 登录或订阅状态，再点击"重新验证"。',
    }
  }

  if (error?.message) {
    return {
      title: 'Codex 执行失败',
      message: error.message,
      hint: '请稍后重试；如果持续失败，请检查本地 bridge 日志。',
    }
  }

  if (fallback) {
    return {
      title: 'AI 请求失败',
      message: fallback,
      hint: null,
    }
  }

  return null
}

function describeRunStage(stage: AiRunStage, text: string) {
  if (!text) {
    return null
  }

  if (stage === 'idle' || stage === 'completed' || stage === 'error') {
    return null
  }

  return {
    title:
      stage === 'checking_status'
        ? '正在检查状态'
        : stage === 'building_context'
          ? '正在整理上下文'
          : stage === 'starting_codex'
            ? '正在调用 Codex'
            : stage === 'waiting_first_token'
              ? '正在等待输出'
                : stage === 'streaming'
                  ? '正在输出内容'
                  : stage === 'planning_changes'
                    ? '正在生成改动'
                    : '正在应用改动',
    message: text,
  }
}

export function AiMessageList({
  messages,
  streamingText,
  runStage,
  streamingStatusText,
  error,
  executionError,
}: AiMessageListProps) {
  const resolvedError = describeExecutionError(executionError, error)
  const runStatus = describeRunStage(runStage, streamingStatusText)

  return (
    <section className={styles.list} aria-label="AI 对话消息">
      {messages.length === 0 && !streamingText ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>开始对话</p>
          <p className={styles.emptyText}>
            描述你想要的结构或计划，AI 会结合脑图理解并生成改动建议。
          </p>
        </div>
      ) : null}

      {runStatus ? (
        <section className={styles.statusCard} aria-label="AI 运行状态">
          <p className={styles.statusTitle}>{runStatus.title}</p>
          <p className={styles.statusText}>{runStatus.message}</p>
        </section>
      ) : null}

      <div className={styles.messages}>
        {messages.map((message) => (
          <article
            key={message.id}
            className={`${styles.messageRow} ${message.role === 'user' ? styles.userRow : styles.aiRow}`}
          >
            <div className={`${styles.bubble} ${message.role === 'user' ? styles.userBubble : styles.aiBubble}`}>
              <div className={styles.content}>{message.content}</div>
            </div>
          </article>
        ))}

        {streamingText ? (
          <article className={`${styles.messageRow} ${styles.aiRow}`}>
            <div className={`${styles.bubble} ${styles.aiBubble} ${styles.streaming}`}>
              <div className={styles.content}>{streamingText}</div>
              <span className={styles.typingIndicator}>
                <span />
                <span />
                <span />
              </span>
            </div>
          </article>
        ) : null}
      </div>

      {resolvedError ? (
        <section className={styles.errorCard} aria-label="AI 执行错误">
          <p className={styles.errorTitle}>{resolvedError.title}</p>
          <p className={styles.error}>{resolvedError.message}</p>
          {resolvedError.hint ? <p className={styles.errorHint}>{resolvedError.hint}</p> : null}
        </section>
      ) : null}
    </section>
  )
}
