import { useEffect, useMemo, useRef, useState } from 'react'
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

interface TopicChip {
  topicId: string
  title: string
  isActive: boolean
}

interface Topic {
  topicId: string
  title: string
}

interface AiSidebarProps {
  effectiveTopics?: TopicChip[]
  manualTopics?: TopicChip[]
  canvasTopics?: TopicChip[]
  selectedTopics?: TopicChip[]
  allTopics?: Topic[]
  useFullDocument?: boolean
  onToggleFullDocument?: () => void
  onAddContextTopic?: (topicId: string) => void
  onRemoveContextTopic?: (topicId: string) => void
  onCanvasPick?: () => void
  onCancelCanvasPick?: () => void
  sessionList: AiSessionSummary[]
  activeSessionId: string | null
  archivedSessions: AiSessionSummary[]
  status: CodexStatus | null
  statusError: string | null
  statusFailureKind?: 'bridge_unavailable' | 'bridge_internal_error' | null
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
  id?: string
  className?: string
  mode?: 'docked' | 'drawer'
}

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

export function AiSidebar({
  effectiveTopics = [],
  manualTopics = [],
  canvasTopics = [],
  selectedTopics = [],
  allTopics,
  useFullDocument = true,
  onToggleFullDocument,
  onAddContextTopic,
  onRemoveContextTopic,
  onCanvasPick,
  onCancelCanvasPick,
  sessionList,
  activeSessionId,
  archivedSessions,
  status,
  statusError,
  statusFailureKind = null,
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
}: AiSidebarProps) {
  const resolvedEffectiveTopics = effectiveTopics.length > 0 ? effectiveTopics : selectedTopics
  const resolvedManualTopics =
    manualTopics.length > 0 ? manualTopics : selectedTopics.filter((topic) => !canvasTopics.some((canvasTopic) => canvasTopic.topicId === topic.topicId))
  const resolvedCanvasTopics = canvasTopics
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [settingsDraft, setSettingsDraft] = useState('')
  const [hasEditedSettingsDraft, setHasEditedSettingsDraft] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isStatusExpanded, setIsStatusExpanded] = useState(false)
  const [openMenuSessionId, setOpenMenuSessionId] = useState<string | null>(null)
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  const statusIssues = status?.issues ?? []
  const isReady = status?.ready ?? false
  const hasRequestFailedIssue = statusIssues.some((issue) => issue.code === 'request_failed')
  const hasInternalStatusFailure =
    statusFailureKind === 'bridge_internal_error' || hasRequestFailedIssue
  const isServiceDisconnected = status === null && statusFailureKind !== 'bridge_internal_error'
  const hasCliMissingIssue = statusIssues.some((issue) => issue.code === 'cli_missing')
  const needsVerification =
    status !== null && !isReady && !hasCliMissingIssue && !hasInternalStatusFailure
  const shouldAutoExpandStatus =
    isCheckingStatus ||
    statusError !== null ||
    lastExecutionError !== null ||
    (status !== null && !isReady)
  const statusDetailsId = `${id ?? 'ai-sidebar'}-status-details`
  const composerDisabled = !isReady
  const composerDisabledHint = isServiceDisconnected
    ? '本机 Codex 服务未连接，请先运行 pnpm dev 或 pnpm dev:web。'
    : hasInternalStatusFailure
      ? '本机 Codex bridge 在线，但状态检查失败，请查看 bridge 日志并重新检查状态。'
      : hasCliMissingIssue
        ? '当前 bridge 未解析到本机 Codex CLI，请确认安装后重新运行 pnpm dev 或 pnpm dev:server。'
        : '当前 Codex 需要重新验证，请运行 codex login --device-auth 后再试。'
  const composerDisabledPlaceholder = isServiceDisconnected
    ? '当前无法发送，请先启动本机 Codex 服务。'
    : hasInternalStatusFailure
      ? '当前无法发送，请先修复状态检查失败的问题。'
      : hasCliMissingIssue
        ? '当前无法发送，请先让 bridge 识别本机 Codex CLI。'
        : '当前无法发送，请先完成 Codex 重新验证。'
  const statusButtonActionLabel = isCheckingStatus
    ? '检查中'
    : isReady
      ? '检查状态'
      : isServiceDisconnected
        ? '重新检查服务'
        : hasInternalStatusFailure
          ? '重新检查状态'
          : hasCliMissingIssue
            ? '重新检查 CLI'
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

  const getStatusButtonState = () => {
    if (isCheckingStatus) {
      return { label: '检查中', tone: 'primary' as const, icon: 'loading' as const }
    }
    if (isReady) {
      return { label: '已连接', tone: 'primary' as const, icon: 'check' as const }
    }
    if (isServiceDisconnected) {
      return { label: '未连接服务', tone: 'primary' as const, icon: 'error' as const }
    }
    if (hasInternalStatusFailure) {
      return { label: '状态检查失败', tone: 'primary' as const, icon: 'error' as const }
    }
    if (hasCliMissingIssue) {
      return { label: 'CLI 不可用', tone: 'primary' as const, icon: 'error' as const }
    }
    return { label: '需要验证', tone: 'primary' as const, icon: 'warning' as const }
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

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuSessionId(null)
      }
    }

    if (openMenuSessionId) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [openMenuSessionId])

  // Focus input when editing starts
  useEffect(() => {
    if (editingSessionId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingSessionId])

  const handleMenuToggle = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    setOpenMenuSessionId(openMenuSessionId === sessionId ? null : sessionId)
  }

  const handleStartRename = (e: React.MouseEvent, session: { sessionId: string; title: string }) => {
    e.stopPropagation()
    setOpenMenuSessionId(null)
    setEditingSessionId(session.sessionId)
    setEditingTitle(session.title)
  }

  const handleConfirmRename = () => {
    if (editingSessionId && editingTitle.trim()) {
      // TODO: Call rename API when available
      // For now, just close the editing state
      setEditingSessionId(null)
      setEditingTitle('')
    }
  }

  const handleCancelRename = () => {
    setEditingSessionId(null)
    setEditingTitle('')
  }

  const handleArchiveFromMenu = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    setOpenMenuSessionId(null)
    onArchiveSession(sessionId)
  }

  const handleDeleteFromMenu = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    setOpenMenuSessionId(null)
    onDeleteSession(sessionId)
  }

  return (
    <>
      <section id={id} className={classNames(styles.panel, className)} data-mode={mode}>
        <div className={styles.header}>
          <div className={styles.toolbarRow1}>
            <div className={styles.dropdownWrapper}>
              <button
                type="button"
                className={styles.dropdownTrigger}
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                aria-expanded={isDropdownOpen}
                aria-haspopup="listbox"
              >
                <span className={styles.dropdownValue}>{activeSession?.title || '选择会话'}</span>
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

              {isDropdownOpen && sessionList.length ? (
                <div className={styles.dropdownMenu} role="listbox">
                  {sessionList.map((session) => (
                    <div
                      key={session.sessionId}
                      className={classNames(
                        styles.dropdownItemWrapper,
                        session.sessionId === activeSessionId && styles.dropdownItemActive,
                      )}
                    >
                      {editingSessionId === session.sessionId ? (
                        <input
                          ref={editInputRef}
                          type="text"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onBlur={handleConfirmRename}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handleConfirmRename()
                            }
                            if (e.key === 'Escape') {
                              e.preventDefault()
                              handleCancelRename()
                            }
                          }}
                          className={styles.dropdownItemWithMenu}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <button
                          type="button"
                          className={styles.dropdownItemWithMenu}
                          role="option"
                          aria-selected={session.sessionId === activeSessionId}
                          onClick={() => handleSwitchSession(session.sessionId)}
                        >
                          {session.title}
                        </button>
                      )}
                      {editingSessionId !== session.sessionId && (
                        <>
                          <button
                            type="button"
                            className={styles.menuButton}
                            onClick={(e) => handleMenuToggle(e, session.sessionId)}
                            aria-label="会话选项"
                          >
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                              <circle cx="8" cy="4" r="1.5" />
                              <circle cx="8" cy="8" r="1.5" />
                              <circle cx="8" cy="12" r="1.5" />
                            </svg>
                          </button>
                          {openMenuSessionId === session.sessionId && (
                            <div ref={menuRef} className={styles.sessionContextMenu}>
                              <button
                                type="button"
                                className={styles.contextMenuItem}
                                onClick={(e) => handleStartRename(e, session)}
                              >
                                重命名
                              </button>
                              <button
                                type="button"
                                className={styles.contextMenuItem}
                                onClick={(e) => handleArchiveFromMenu(e, session.sessionId)}
                              >
                                归档
                              </button>
                              <button
                                type="button"
                                className={classNames(styles.contextMenuItem, styles.contextMenuItemDanger)}
                                onClick={(e) => handleDeleteFromMenu(e, session.sessionId)}
                              >
                                删除
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <IconButton label="新建聊天" icon="chat" tone="primary" size="sm" onClick={onCreateSession} />
          </div>

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
                (isServiceDisconnected || hasInternalStatusFailure) && styles.statusButtonDisconnected,
                (needsVerification || hasCliMissingIssue) && styles.statusButtonError,
              )}
            >
              {statusButtonState.label}
            </Button>

            <IconButton label="AI 设置" icon="settings" tone="primary" size="sm" onClick={handleOpenSettings} />
          </div>

          {isStatusExpanded ? (
            <div id={statusDetailsId} className={styles.statusDetails}>
              <div className={styles.statusDetailsHeader}>
                <div className={styles.statusHeaderLeft}>
                  <span
                    className={classNames(
                      styles.statusBadge,
                      isReady
                        ? styles.statusBadgeReady
                        : isServiceDisconnected || hasCliMissingIssue || hasInternalStatusFailure
                          ? styles.statusBadgeDisconnected
                          : styles.statusBadgeNeedAuth,
                    )}
                  >
                    {isReady
                      ? '可用'
                      : isServiceDisconnected
                        ? '未连接服务'
                        : hasInternalStatusFailure
                          ? '状态检查失败'
                          : hasCliMissingIssue
                            ? 'CLI 不可用'
                            : '需要验证'}
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
                    <path
                      d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
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
                      : hasInternalStatusFailure
                        ? '本机 Codex bridge 在线，但状态检查失败；修复 bridge 内部错误后才能继续发送。'
                        : hasCliMissingIssue
                          ? '当前 bridge 没有解析到可用的本机 Codex CLI，修复命令解析后才能继续发送。'
                          : '当前 Codex 验证信息不可用，修复登录或订阅后才能继续发送。'}
                  </p>

                  {isServiceDisconnected ? (
                    <ol className={styles.issueList}>
                      <li>
                        优先运行 <code>pnpm dev</code>，同时启动前端和本机 Codex bridge。
                      </li>
                      <li>
                        如果你是从 VS Code 或命令面板启动开发环境，也可以直接运行 <code>pnpm dev:web</code>。
                      </li>
                      <li>
                        如果前端已在运行，可单独执行 <code>pnpm dev:server</code> 恢复 <code>8787</code> 服务。
                      </li>
                      <li>
                        仅在需要排查纯前端问题时，才使用 <code>pnpm dev:web-only</code>。
                      </li>
                      <li>
                        如果当前是在预览 <code>dist</code>，请额外启动 <code>pnpm start:server</code>。
                      </li>
                      <li>
                        访问 <code>http://127.0.0.1:8787/api/codex/status</code> 确认 bridge 已恢复可达。
                      </li>
                    </ol>
                  ) : hasInternalStatusFailure ? (
                    <ol className={styles.issueList}>
                      <li>bridge 进程仍在线，但状态检查失败；请优先查看本地启动终端或 bridge 输出。</li>
                      <li>
                        重新点击“重新检查状态”，确认 <code>/api/codex/status</code> 是否已恢复为 <code>200</code> JSON 响应。
                      </li>
                      <li>
                        如果反复失败，先停止当前开发进程，再重新运行 <code>pnpm dev</code>。
                      </li>
                    </ol>
                  ) : hasCliMissingIssue ? (
                    <ol className={styles.issueList}>
                      <li>
                        确认本机已经安装并可执行 <code>codex</code> 命令。
                      </li>
                      <li>
                        如果刚安装 CLI 或刚更新 PATH，请重新运行 <code>pnpm dev</code> 或 <code>pnpm dev:web</code>，
                        让 bridge 继承最新环境变量。
                      </li>
                      <li>
                        如果前端已在运行，可单独执行 <code>pnpm dev:server</code> 重启 <code>8787</code> 服务。
                      </li>
                      <li>Windows 下如果是从 VS Code 启动开发环境，必要时重启 VS Code 或终端后再试。</li>
                    </ol>
                  ) : (
                    <ol className={styles.issueList}>
                      <li>
                        确认本机已经安装并可执行 <code>codex</code> 命令。
                      </li>
                      <li>
                        运行 <code>codex login --device-auth</code>，并使用可用的 ChatGPT 订阅账号完成登录。
                      </li>
                      <li>完成后回到这里点击“重新验证”。</li>
                    </ol>
                  )}

                  {statusIssues.length ? (
                    <ul className={styles.issueDetails}>
                      {statusIssues.map((issue) => (
                        <li key={`${issue.code}:${issue.message}`}>{issue.message}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : (
                <p className={styles.statusText}>
                  已检测到本机 Codex CLI 与 ChatGPT 登录状态，可以直接基于当前脑图发起对话。
                </p>
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

              {statusError || lastExecutionError ? (
                <p className={styles.statusLogHint}>
                  完整日志请查看本地启动终端或 bridge 输出，本页不展示原始日志内容。
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className={styles.body}>
          <div className={styles.infoSection}>
            <AiContextTray
              effectiveTopics={resolvedEffectiveTopics}
              manualTopics={resolvedManualTopics}
              canvasTopics={resolvedCanvasTopics}
              allTopics={allTopics}
              useFullDocument={useFullDocument}
              onToggleFullDocument={onToggleFullDocument || (() => {})}
              onAddTopic={onAddContextTopic || (() => {})}
              onRemoveTopic={onRemoveContextTopic || (() => {})}
              onCanvasPick={onCanvasPick}
              onCancelCanvasPick={onCancelCanvasPick}
            />

            {lastAppliedSummary ? (
              <section className={styles.appliedCard} aria-label="最近已应用改动">
                <div className={styles.appliedHeader}>
                  <span className={styles.appliedBadge}>已落图</span>
                  <span className={styles.appliedSummary}>{lastAppliedSummary}</span>
                </div>
                <div className={styles.appliedActions}>
                  <Button
                    tone="primary"
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
