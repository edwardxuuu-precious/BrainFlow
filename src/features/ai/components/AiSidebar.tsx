import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import type {
  AiExecutionError,
  AiMessage,
  AiRunStage,
  AiSessionSummary,
  AiStatusFeedback,
  CodexSettings,
  CodexStatus,
} from '../../../../shared/ai-contract'
import { Button, IconButton, StatusPill } from '../../../components/ui'
import { AiComposer } from './AiComposer'
import { AiContextTray } from './AiContextTray'
import { AiMessageList } from './AiMessageList'
import { AiSettingsDialog } from './AiSettingsDialog'
import styles from './AiSidebar.module.css'

interface SelectedTopicChip {
  topicId: string
  title: string
  isActive: boolean
}

interface AiSidebarProps {
  selectedTopics: SelectedTopicChip[]
  sessionList: AiSessionSummary[]
  activeSessionId: string | null
  archivedSessions: AiSessionSummary[]
  status: CodexStatus | null
  statusError: string | null
  statusFeedback: AiStatusFeedback | null
  settings: CodexSettings | null
  settingsError: string | null
  messages: AiMessage[]
  runStage: AiRunStage
  streamingStatusText: string
  streamingText: string
  error: string | null
  lastExecutionError: AiExecutionError | null
  draft: string
  isSending: boolean
  isCheckingStatus: boolean
  isLoadingSettings: boolean
  isSavingSettings: boolean
  isLoadingArchivedSessions: boolean
  lastAppliedSummary: string | null
  canUndoLastApplied: boolean
  onDraftChange: (value: string) => void
  onSend: () => void
  onUndoLastApplied: () => void
  onRevalidate: () => void
  onLoadSettings: () => void
  onSaveSettings: (businessPrompt: string) => void
  onResetSettings: () => void
  onLoadArchivedSessions: () => void
  onCreateSession: () => void
  onSwitchSession: (sessionId: string) => void
  onArchiveSession: (sessionId?: string) => void
  onDeleteSession: (sessionId?: string) => void
  onRestoreArchivedSession: (documentId: string, sessionId: string) => void
  onDeleteArchivedSession: (documentId: string, sessionId: string) => void
  resolveTopicTitle?: (topicId: string) => string
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
  sessionList,
  activeSessionId,
  archivedSessions,
  status,
  statusError,
  statusFeedback,
  settings,
  settingsError,
  messages,
  runStage,
  streamingStatusText,
  streamingText,
  error,
  lastExecutionError,
  draft,
  isSending,
  isCheckingStatus,
  isLoadingSettings,
  isSavingSettings,
  isLoadingArchivedSessions,
  lastAppliedSummary,
  canUndoLastApplied,
  onDraftChange,
  onSend,
  onUndoLastApplied,
  onRevalidate,
  onLoadSettings,
  onSaveSettings,
  onResetSettings,
  onLoadArchivedSessions,
  onCreateSession,
  onSwitchSession,
  onArchiveSession,
  onDeleteSession,
  onRestoreArchivedSession,
  onDeleteArchivedSession,
  onCollapse,
  id,
  className,
  mode = 'docked',
  tabs,
}: AiSidebarProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [settingsDraft, setSettingsDraft] = useState('')
  const [hasEditedSettingsDraft, setHasEditedSettingsDraft] = useState(false)

  const isReady = status?.ready ?? false
  const composerDisabled = !isReady
  const composerDisabledHint = '当前 Codex 不可用，请先修复验证并重新检查。'
  const statusActionLabel = isCheckingStatus ? '检查中' : isReady ? '检查状态' : '重新验证'
  const activeSession = useMemo(
    () => sessionList.find((session) => session.sessionId === activeSessionId) ?? null,
    [activeSessionId, sessionList],
  )

  const handleOpenSettings = () => {
    if (!settings && !isLoadingSettings) {
      onLoadSettings()
    }

    if (archivedSessions.length === 0 && !isLoadingArchivedSessions) {
      onLoadArchivedSessions()
    }

    setSettingsDraft(settings?.businessPrompt ?? '')
    setHasEditedSettingsDraft(false)
    setIsSettingsOpen(true)
  }

  return (
    <>
      <section id={id} className={classNames(styles.panel, className)} data-mode={mode}>
        <div className={styles.header}>
          {tabs ? <div className={styles.tabs}>{tabs}</div> : null}
          <div className={styles.chrome}>
            <StatusPill tone="soft">AI</StatusPill>
            <div className={styles.chromeActions}>
              <div className={styles.sessionPicker}>
                <label className={styles.sessionLabel} htmlFor={`${id ?? 'ai'}-session-select`}>
                  当前会话
                </label>
                <select
                  id={`${id ?? 'ai'}-session-select`}
                  className={styles.sessionSelect}
                  value={activeSessionId ?? ''}
                  onChange={(event) => onSwitchSession(event.target.value)}
                >
                  {sessionList.map((session) => (
                    <option key={session.sessionId} value={session.sessionId}>
                      {session.title}
                    </option>
                  ))}
                </select>
              </div>
              <IconButton label="新建聊天" icon="chat" tone="secondary" size="sm" onClick={onCreateSession} />
              <IconButton
                label="归档当前会话"
                icon="archive"
                tone="secondary"
                size="sm"
                onClick={() => onArchiveSession(activeSessionId ?? undefined)}
                disabled={!activeSession}
              />
              <IconButton
                label="删除当前会话"
                icon="delete"
                tone="secondary"
                size="sm"
                onClick={() => onDeleteSession(activeSessionId ?? undefined)}
                disabled={!activeSession}
              />
              <IconButton label="AI 设置" icon="settings" tone="secondary" size="sm" onClick={handleOpenSettings} />
              <Button
                tone="secondary"
                size="sm"
                iconStart="history"
                onClick={onRevalidate}
                disabled={isCheckingStatus}
              >
                {statusActionLabel}
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
            <p className={styles.subtitle}>
              直接说出你的真实想法。AI 会结合整张脑图理解，并把有效改动直接应用到当前画布。
            </p>
          </div>
        </div>

        <div className={styles.body}>
          <section className={styles.statusCard} aria-label="Codex 状态">
            <div className={styles.statusHeader}>
              <StatusPill tone={isReady ? 'accent' : 'soft'}>{isReady ? '可用' : '需要验证'}</StatusPill>
              <span className={styles.statusVersion}>Prompt {status?.systemPromptVersion ?? '未加载'}</span>
            </div>
            {statusError ? <p className={styles.statusError}>{statusError}</p> : null}
            {statusFeedback ? (
              <p
                className={
                  statusFeedback.tone === 'success' ? styles.statusSuccess : styles.statusWarning
                }
              >
                {statusFeedback.message}
              </p>
            ) : null}
            {!isReady ? (
              <div className={styles.statusIssues}>
                <p className={styles.statusText}>当前 Codex 验证信息不可用，请尽快修复后重新验证。</p>
                <ol className={styles.issueList}>
                  <li>确认本机已经安装并可执行 `codex` 命令。</li>
                  <li>运行 `codex login --device-auth`，并使用可用的 ChatGPT 订阅账号完成登录。</li>
                  <li>回到这里点击“重新验证”。</li>
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
              <p className={styles.statusText}>已检测到本机 Codex CLI 与 ChatGPT 登录状态，可以直接基于当前脑图发起对话。</p>
            )}
            {lastExecutionError ? (
              <div className={styles.executionIssue}>
                <p className={styles.executionIssueTitle}>最近一次执行失败</p>
                <p className={styles.executionIssueText}>{lastExecutionError.message}</p>
                {lastExecutionError.code === 'schema_invalid' ? (
                  <p className={styles.executionIssueHint}>
                    这是应用端格式问题，不是登录问题，重新验证不会解决。
                  </p>
                ) : null}
              </div>
            ) : null}
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

          {lastAppliedSummary ? (
            <section className={styles.appliedCard} aria-label="最近已应用改动">
              <div className={styles.appliedHeader}>
                <StatusPill tone="accent">已落图</StatusPill>
                <span className={styles.appliedSummary}>{lastAppliedSummary}</span>
              </div>
              <div className={styles.appliedActions}>
                <Button
                  tone="secondary"
                  size="sm"
                  iconStart="undo"
                  onClick={onUndoLastApplied}
                  disabled={!canUndoLastApplied}
                >
                  撤销本次 AI 改动
                </Button>
              </div>
            </section>
          ) : null}

          <AiMessageList
            messages={messages}
            runStage={runStage}
            streamingStatusText={streamingStatusText}
            streamingText={streamingText}
            error={error}
            executionError={lastExecutionError}
          />

          <AiComposer
            value={draft}
            runStage={runStage}
            isSending={isSending}
            disabled={composerDisabled}
            disabledHint={composerDisabledHint}
            onChange={onDraftChange}
            onSubmit={onSend}
          />
        </div>
      </section>

      <AiSettingsDialog
        open={isSettingsOpen}
        settings={settings}
        systemPromptVersion={status?.systemPromptVersion ?? null}
        archivedSessions={archivedSessions}
        draft={hasEditedSettingsDraft ? settingsDraft : (settings?.businessPrompt ?? settingsDraft)}
        error={settingsError}
        isLoading={isLoadingSettings}
        isSaving={isSavingSettings}
        isLoadingArchivedSessions={isLoadingArchivedSessions}
        onDraftChange={(value) => {
          setSettingsDraft(value)
          setHasEditedSettingsDraft(true)
        }}
        onClose={() => setIsSettingsOpen(false)}
        onSave={() =>
          void onSaveSettings(hasEditedSettingsDraft ? settingsDraft : (settings?.businessPrompt ?? settingsDraft))
        }
        onReset={() => {
          setHasEditedSettingsDraft(false)
          void onResetSettings()
        }}
        onLoadArchivedSessions={() => void onLoadArchivedSessions()}
        onRestoreArchivedSession={(documentId, sessionId) => void onRestoreArchivedSession(documentId, sessionId)}
        onDeleteArchivedSession={(documentId, sessionId) => void onDeleteArchivedSession(documentId, sessionId)}
      />
    </>
  )
}
