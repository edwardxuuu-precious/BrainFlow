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
import { Button, IconButton } from '../../../components/ui'
import { AiComposer } from './AiComposer'
import { AiContextTray } from './AiContextTray'
import { AiMessageList } from './AiMessageList'
import { AiSettingsDialog } from './AiSettingsDialog'
import { ResizableSplitter } from './ResizableSplitter'
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
  id,
  className,
  mode = 'docked',
  tabs,
}: AiSidebarProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [settingsDraft, setSettingsDraft] = useState('')
  const [hasEditedSettingsDraft, setHasEditedSettingsDraft] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isStatusExpanded, setIsStatusExpanded] = useState(false)
  const [composerHeight, setComposerHeight] = useState(180)

  const isReady = status?.ready ?? false
  const composerDisabled = !isReady
  const composerDisabledHint = '当前 Codex 不可用，请先修复验证并重新检查。'
  
  const activeSession = useMemo(
    () => sessionList.find((session) => session.sessionId === activeSessionId) ?? null,
    [activeSessionId, sessionList],
  )

  // Determine status button state
  const getStatusButtonState = () => {
    if (isCheckingStatus) {
      return { label: '检查中', tone: 'secondary' as const, icon: 'loading' as const }
    }
    if (isReady) {
      return { label: '已连接', tone: 'secondary' as const, icon: 'check' as const }
    }
    if (status === null) {
      return { label: '未连接', tone: 'secondary' as const, icon: 'error' as const }
    }
    return { label: '需要验证', tone: 'secondary' as const, icon: 'warning' as const }
  }

  const statusButtonState = getStatusButtonState()

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

  const handleSwitchSession = (sessionId: string) => {
    onSwitchSession(sessionId)
    setIsDropdownOpen(false)
  }

  const handleStatusClick = () => {
    if (!isReady && !isCheckingStatus) {
      onRevalidate()
    } else {
      setIsStatusExpanded(!isStatusExpanded)
    }
  }

  return (
    <>
      <section id={id} className={classNames(styles.panel, className)} data-mode={mode}>
        <div className={styles.header}>
          {tabs ? <div className={styles.tabs}>{tabs}</div> : null}
          
          {/* Session Toolbar - Row 1: Dropdown + New Chat */}
          <div className={styles.toolbarRow1}>
            <div className={styles.dropdownWrapper}>
              <button
                type="button"
                className={styles.dropdownTrigger}
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                aria-expanded={isDropdownOpen}
                aria-haspopup="listbox"
              >
                <span className={styles.dropdownValue}>
                  {activeSession?.title || '选择会话'}
                </span>
                <svg
                  className={classNames(styles.dropdownIcon, isDropdownOpen && styles.dropdownIconOpen)}
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                >
                  <path
                    d="M2.5 4.5L6 8L9.5 4.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              
              {isDropdownOpen && sessionList?.length ? (
                <div className={styles.dropdownMenu} role="listbox">
                  {sessionList.map((session) => (
                    <button
                      key={session.sessionId}
                      type="button"
                      className={classNames(
                        styles.dropdownItem,
                        session.sessionId === activeSessionId && styles.dropdownItemActive
                      )}
                      role="option"
                      aria-selected={session.sessionId === activeSessionId}
                      onClick={() => handleSwitchSession(session.sessionId)}
                    >
                      {session.title}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <IconButton label="新建聊天" icon="chat" tone="secondary" size="sm" onClick={onCreateSession} />
          </div>

          {/* Actions + Status Row */}
          <div className={styles.actionsRow}>
            <Button
              tone={statusButtonState.tone}
              size="sm"
              iconStart={statusButtonState.icon}
              onClick={handleStatusClick}
              disabled={isCheckingStatus}
              className={classNames(
                styles.statusButton,
                isReady && styles.statusButtonReady,
                !isReady && status !== null && styles.statusButtonError
              )}
            >
              {statusButtonState.label}
            </Button>

            <div className={styles.actionButtons}>
              <IconButton
                label="归档当前会话"
                icon="archive"
                tone="ghost"
                size="sm"
                onClick={() => onArchiveSession(activeSessionId ?? undefined)}
                disabled={!activeSession}
              />
              <IconButton
                label="删除当前会话"
                icon="delete"
                tone="ghost"
                size="sm"
                onClick={() => onDeleteSession(activeSessionId ?? undefined)}
                disabled={!activeSession}
              />
              <IconButton label="AI 设置" icon="settings" tone="ghost" size="sm" onClick={handleOpenSettings} />
            </div>
          </div>

          {/* Expandable Status Details */}
          {isStatusExpanded ? (
            <div className={styles.statusDetails}>
              <div className={styles.statusDetailsHeader}>
                <span className={classNames(
                  styles.statusBadge,
                  isReady ? styles.statusBadgeReady : styles.statusBadgeNeedAuth
                )}>
                  {isReady ? '可用' : status === null ? '未连接' : '需要验证'}
                </span>
                <span className={styles.statusVersion}>Prompt {status?.systemPromptVersion ?? '未加载'}</span>
              </div>
              
              {statusError ? <p className={styles.statusError}>{statusError}</p> : null}
              {statusFeedback ? (
                <p className={statusFeedback.tone === 'success' ? styles.statusSuccess : styles.statusWarning}>
                  {statusFeedback.message}
                </p>
              ) : null}
              
              {!isReady ? (
                <div className={styles.statusIssues}>
                  <p className={styles.statusText}>
                    {status === null 
                      ? '无法连接到 Codex 服务，请确保后端服务已启动。'
                      : '当前 Codex 验证信息不可用，请尽快修复后重新验证。'}
                  </p>
                  {status === null ? (
                    <ol className={styles.issueList}>
                      <li>运行 <code>pnpm dev:server</code> 启动后端服务</li>
                      <li>确保 Codex CLI 已安装并可执行</li>
                      <li>运行 <code>codex login --device-auth</code> 完成登录</li>
                    </ol>
                  ) : (
                    <ol className={styles.issueList}>
                      <li>确认本机已经安装并可执行 <code>codex</code> 命令。</li>
                      <li>运行 <code>codex login --device-auth</code>，并使用可用的 ChatGPT 订阅账号完成登录。</li>
                      <li>回到这里点击"重新验证"。</li>
                    </ol>
                  )}
                  {status?.issues?.length ? (
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
            </div>
          ) : null}
        </div>

        <div className={styles.body}>
          {/* Context and Status Info */}
          <div className={styles.infoSection}>
            <AiContextTray selectedTopics={selectedTopics} />

            {lastAppliedSummary ? (
              <section className={styles.appliedCard} aria-label="最近已应用改动">
                <div className={styles.appliedHeader}>
                  <span className={styles.appliedBadge}>已落图</span>
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
                    撤销
                  </Button>
                </div>
              </section>
            ) : null}
          </div>

          {/* Chat Area with Resizable Splitter */}
          <div className={styles.chatArea}>
            <div className={styles.messagesWrapper}>
              <AiMessageList
                messages={messages}
                runStage={runStage}
                streamingStatusText={streamingStatusText}
                streamingText={streamingText}
                error={error}
                executionError={lastExecutionError}
              />
            </div>

            <ResizableSplitter
              minSize={120}
              maxSize={400}
              defaultSize={composerHeight}
              onResize={setComposerHeight}
            />

            <div
              className={styles.composerWrapper}
              style={{ height: composerHeight }}
            >
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
          </div>
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
