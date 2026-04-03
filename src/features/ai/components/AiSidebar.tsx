import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
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

import styles from './AiSidebar.module.css'

interface SelectedTopicChip {
  topicId: string
  title: string
  isActive: boolean
}

interface Topic {
  topicId: string
  title: string
}

interface AiSidebarProps {
  selectedTopics: SelectedTopicChip[]
  allTopics?: Topic[]
  useFullDocument?: boolean
  onToggleFullDocument?: () => void
  onAddContextTopic?: (topicId: string) => void
  onRemoveContextTopic?: (topicId: string) => void
  onCanvasPick?: () => void
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
  allTopics,
  useFullDocument = true,
  onToggleFullDocument,
  onAddContextTopic,
  onRemoveContextTopic,
  onCanvasPick,
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


  const isReady = status?.ready ?? false
  const isServiceDisconnected = status === null
  const needsVerification = status !== null && !isReady
  const shouldAutoExpandStatus =
    isCheckingStatus ||
    statusError !== null ||
    lastExecutionError !== null ||
    needsVerification
  const statusDetailsId = `${id ?? 'ai-sidebar'}-status-details`
  const composerDisabled = !isReady
  const composerDisabledHint = isServiceDisconnected
    ? '本机 Codex 服务未连接，请先运行 pnpm dev 或 pnpm dev:server。'
    : '当前 Codex 需要重新验证，请运行 codex login --device-auth 后再试。'
  const composerDisabledPlaceholder = isServiceDisconnected
    ? '当前无法发送，请先启动本机 Codex 服务。'
    : '当前无法发送，请先完成 Codex 重新验证。'
  const statusButtonActionLabel = isCheckingStatus
    ? '检查中'
    : isReady
      ? '检查状态'
      : isServiceDisconnected
        ? '重新检查服务'
        : '重新验证'

  const activeSession = useMemo(
    () => sessionList.find((session) => session.sessionId === activeSessionId) ?? null,
    [activeSessionId, sessionList],
  )

  useEffect(() => {
    if (shouldAutoExpandStatus) {
      setIsStatusExpanded(true)
    }
  }, [shouldAutoExpandStatus])

  // Determine status button state
  const getStatusButtonState = () => {
    if (isCheckingStatus) {
      return { label: '检查中', tone: 'secondary' as const, icon: 'loading' as const }
    }
    if (isReady) {
      return { label: '已连接', tone: 'secondary' as const, icon: 'check' as const }
    }
    if (isServiceDisconnected) {
      return { label: '未连接服务', tone: 'secondary' as const, icon: 'error' as const }
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
    if (isCheckingStatus) {
      setIsStatusExpanded((current) => !current)
      return
    }

    setIsStatusExpanded(true)
    onRevalidate()
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
              aria-label={statusButtonActionLabel}
              aria-controls={statusDetailsId}
              aria-expanded={isStatusExpanded}
              title={statusButtonActionLabel}
              className={classNames(
                styles.statusButton,
                isReady && styles.statusButtonReady,
                isServiceDisconnected && styles.statusButtonDisconnected,
                needsVerification && styles.statusButtonError,
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
            <div id={statusDetailsId} className={styles.statusDetails}>
              <div className={styles.statusDetailsHeader}>
                <div className={styles.statusHeaderLeft}>
                  <span className={classNames(
                    styles.statusBadge,
                    isReady
                      ? styles.statusBadgeReady
                      : isServiceDisconnected
                        ? styles.statusBadgeDisconnected
                        : styles.statusBadgeNeedAuth
                  )}>
                    {isReady ? '可用' : isServiceDisconnected ? '未连接服务' : '需要验证'}
                  </span>
                  <span className={styles.statusVersion}>Prompt {status?.systemPromptVersion ?? '未加载'}</span>
                </div>
                <button
                  type="button"
                  className={styles.statusCloseButton}
                  onClick={() => setIsStatusExpanded(false)}
                  aria-label="收起状态详情"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
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
                    {isServiceDisconnected
                      ? '当前未连接到本机 Codex 服务，AI 发送能力已暂停。'
                      : '当前 Codex 验证信息不可用，修复登录或订阅后才能继续发送。'}
                  </p>
                  {isServiceDisconnected ? (
                    <ol className={styles.issueList}>
                      <li>优先运行 <code>pnpm dev</code>，同时启动前端和本机 Codex bridge。</li>
                      <li>如果前端已在运行，可单独执行 <code>pnpm dev:server</code> 恢复 <code>8787</code> 服务。</li>
                      <li>如果当前是在预览 <code>dist</code>，请额外启动 <code>pnpm start:server</code>。</li>
                      <li>访问 <code>http://127.0.0.1:8787/api/codex/status</code> 确认 bridge 已恢复可达。</li>
                    </ol>
                  ) : (
                    <ol className={styles.issueList}>
                      <li>确认本机已经安装并可执行 <code>codex</code> 命令。</li>
                      <li>运行 <code>codex login --device-auth</code>，并使用可用的 ChatGPT 订阅账号完成登录。</li>
                      <li>完成后回到这里点击“重新验证”。</li>
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
              {(statusError || lastExecutionError) ? (
                <p className={styles.statusLogHint}>
                  完整日志请查看本地启动终端或 bridge 输出，本页不展示原始日志内容。
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className={styles.body}>
          {/* Context and Status Info */}
          <div className={styles.infoSection}>
            <AiContextTray
              selectedTopics={selectedTopics}
              allTopics={allTopics}
              useFullDocument={useFullDocument}
              onToggleFullDocument={onToggleFullDocument || (() => {})}
              onAddTopic={onAddContextTopic || (() => {})}
              onRemoveTopic={onRemoveContextTopic || (() => {})}
              onCanvasPick={onCanvasPick}
            />

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

          {/* Chat Area */}
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

            <div className={styles.composerWrapper}>
              <AiComposer
                value={draft}
                runStage={runStage}
                isSending={isSending}
                disabled={composerDisabled}
                disabledHint={composerDisabledHint}
                disabledPlaceholder={composerDisabledPlaceholder}
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
