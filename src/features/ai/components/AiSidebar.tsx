import type { ReactNode } from 'react'
import type {
  AiCanvasProposal,
  AiMessage,
  CodexStatus,
} from '../../../../shared/ai-contract'
import { Button, IconButton, StatusPill } from '../../../components/ui'
import { AiComposer } from './AiComposer'
import { AiContextTray } from './AiContextTray'
import { AiMessageList } from './AiMessageList'
import { AiProposalReview } from './AiProposalReview'
import styles from './AiSidebar.module.css'

interface SelectedTopicChip {
  topicId: string
  title: string
  isActive: boolean
}

interface AiSidebarProps {
  selectedTopics: SelectedTopicChip[]
  status: CodexStatus | null
  statusError: string | null
  messages: AiMessage[]
  streamingText: string
  error: string | null
  draft: string
  isSending: boolean
  isCheckingStatus: boolean
  proposal: AiCanvasProposal | null
  onDraftChange: (value: string) => void
  onSend: () => void
  onApplyProposal: () => void
  onDismissProposal: () => void
  onRevalidate: () => void
  resolveTopicTitle: (topicId: string) => string
  onCollapse?: () => void
  id?: string
  className?: string
  mode?: 'docked' | 'drawer'
  tabs?: ReactNode
}

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

export function AiSidebar({
  selectedTopics,
  status,
  statusError,
  messages,
  streamingText,
  error,
  draft,
  isSending,
  isCheckingStatus,
  proposal,
  onDraftChange,
  onSend,
  onApplyProposal,
  onDismissProposal,
  onRevalidate,
  resolveTopicTitle,
  onCollapse,
  id,
  className,
  mode = 'docked',
  tabs,
}: AiSidebarProps) {
  const isReady = status?.ready ?? false
  const composerDisabled = !isReady || selectedTopics.length === 0
  const composerDisabledHint = !isReady
    ? '当前 Codex 不可用，请先修复验证并重新验证。'
    : '先框选或多选节点后再提问。'

  return (
    <section id={id} className={classNames(styles.panel, className)} data-mode={mode}>
      <div className={styles.header}>
        {tabs ? <div className={styles.tabs}>{tabs}</div> : null}
        <div className={styles.chrome}>
          <StatusPill tone="soft">AI</StatusPill>
          <div className={styles.chromeActions}>
            <Button tone="secondary" size="sm" iconStart="history" onClick={onRevalidate} disabled={isCheckingStatus}>
              {isCheckingStatus ? '验证中' : '重新验证'}
            </Button>
            {onCollapse ? (
              <IconButton
                label="隐藏右侧栏"
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
        </div>
        <div className={styles.intro}>
          <h2 className={styles.heading}>Codex for BrainFlow</h2>
          <p className={styles.subtitle}>AI 只会读取当前选区上下文，并只能返回待你批准的本地脑图提案。</p>
        </div>
      </div>

      <div className={styles.body}>
        <section className={styles.statusCard} aria-label="Codex 状态">
          <div className={styles.statusHeader}>
            <StatusPill tone={isReady ? 'accent' : 'soft'}>
              {isReady ? '可用' : '需要验证'}
            </StatusPill>
            <span className={styles.statusVersion}>
              Prompt {status?.systemPromptVersion ?? '未加载'}
            </span>
          </div>
          {statusError ? <p className={styles.statusError}>{statusError}</p> : null}
          {!isReady ? (
            <div className={styles.statusIssues}>
              <p className={styles.statusText}>当前 Codex 验证信息不可用，请尽快修复后重新验证。</p>
              <ol className={styles.issueList}>
                <li>确认本机已安装并可执行 `codex` 命令。</li>
                <li>运行 `codex login --device-auth` 并使用可用的 ChatGPT 订阅账号完成登录。</li>
                <li>返回这里点击“重新验证”。</li>
              </ol>
              {status?.issues.length ? (
                <ul className={styles.issueDetails}>
                  {status.issues.map((issue) => (
                    <li key={`${issue.code}:${issue.message}`}>{issue.message}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <p className={styles.statusText}>已检测到本机 Codex CLI 与 ChatGPT 登录状态，可以基于当前选区发起对话。</p>
          )}
        </section>

        <details className={styles.promptCard}>
          <summary className={styles.promptSummary}>
            <span>当前系统提示词</span>
            <span className={styles.promptMeta}>{status?.systemPromptVersion ?? '未加载'}</span>
          </summary>
          <p className={styles.promptExcerpt}>{status?.systemPromptSummary ?? '未加载系统提示词。'}</p>
          <pre className={styles.promptContent}>{status?.systemPrompt ?? '未加载系统提示词。'}</pre>
        </details>

        <AiContextTray selectedTopics={selectedTopics} />

        {proposal ? (
          <AiProposalReview
            proposal={proposal}
            resolveTopicTitle={resolveTopicTitle}
            onApply={onApplyProposal}
            onDismiss={onDismissProposal}
          />
        ) : null}

        <AiMessageList messages={messages} streamingText={streamingText} error={error} />

        <AiComposer
          value={draft}
          isSending={isSending}
          disabled={composerDisabled}
          disabledHint={composerDisabledHint}
          onChange={onDraftChange}
          onSubmit={onSend}
        />
      </div>
    </section>
  )
}
