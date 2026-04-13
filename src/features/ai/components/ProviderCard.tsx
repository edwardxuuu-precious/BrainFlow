import type { AiProviderInfo } from '../../../../shared/ai-contract'
import { StatusPill } from '../../../components/ui'
import styles from './ProviderCard.module.css'

interface ProviderCardProps {
  provider: AiProviderInfo
  selected: boolean
  onSelect: () => void
  onTest?: () => void
  canTest?: boolean
  isTesting?: boolean
  testStatus?: 'idle' | 'success' | 'error'
  testError?: string | null
  onClearTestStatus?: () => void
}

function getProviderIcon(type: string): string {
  switch (type) {
    case 'codex':
      return '🤖'
    case 'deepseek':
      return '🧠'
    case 'kimi-code':
      return '💻'
    default:
      return '🤖'
  }
}

function getProviderStatusPill(ready: boolean, selected: boolean) {
  if (selected) {
    return <StatusPill tone="accent">当前使用</StatusPill>
  }
  if (ready) {
    return <StatusPill tone="accent">可用</StatusPill>
  }
  return <StatusPill tone="soft">需配置</StatusPill>
}

export function ProviderCard({
  provider,
  selected,
  onSelect,
  onTest,
  canTest = provider.ready,
  isTesting,
  testStatus = 'idle',
  testError,
  onClearTestStatus,
}: ProviderCardProps) {
  const showSuccess = testStatus === 'success'
  const showError = testStatus === 'error' && testError

  return (
    <div
      className={`${styles.card} ${selected ? styles.selected : ''}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onSelect()
        }
      }}
    >
      <div className={styles.icon}>{getProviderIcon(provider.type)}</div>
      <div className={styles.content}>
        <div className={styles.header}>
          <h4 className={styles.name}>{provider.name}</h4>
          {getProviderStatusPill(provider.ready, selected)}
        </div>
        <p className={styles.description}>{provider.description}</p>
        <div className={styles.features}>
          {provider.features.streaming && (
            <span className={styles.feature}>流式响应</span>
          )}
          {provider.features.structuredOutput && (
            <span className={styles.feature}>结构化输出</span>
          )}
          {provider.features.contextInjection && (
            <span className={styles.feature}>上下文注入</span>
          )}
        </div>
        {onTest && (
          <div className={styles.testSection}>
            <button
              className={styles.testButton}
              onClick={(e) => {
                e.stopPropagation()
                onTest()
              }}
              disabled={isTesting || !canTest}
            >
              {isTesting ? '测试中...' : '测试连接'}
            </button>

            {showSuccess && (
              <span className={styles.testSuccess}>✓ 连接成功</span>
            )}

            {showError && (
              <div className={styles.errorSection}>
                <span className={styles.testError}>✗ 连接失败</span>
                <details className={styles.errorDetails}>
                  <summary>查看错误详情</summary>
                  <pre className={styles.errorContent}>{testError}</pre>
                </details>
                <button
                  className={styles.clearErrorBtn}
                  onClick={(e) => {
                    e.stopPropagation()
                    onClearTestStatus?.()
                  }}
                >
                  清除
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      {selected && (
        <div className={styles.checkmark}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
      )}
    </div>
  )
}
