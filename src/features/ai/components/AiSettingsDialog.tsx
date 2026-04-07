import { Button, StatusPill } from '../../../components/ui'
import { TextArea } from '../../../components/ui/Field'
import type { AiSessionSummary, CodexSettings } from '../../../../shared/ai-contract'
import styles from './AiSettingsDialog.module.css'

interface AiSettingsDialogProps {
  open: boolean
  settings: CodexSettings | null
  systemPromptVersion: string | null
  archivedSessions: AiSessionSummary[]
  error: string | null
  isLoading: boolean
  isSaving: boolean
  isLoadingArchivedSessions: boolean
  draft: string
  onDraftChange: (value: string) => void
  onClose: () => void
  onSave: () => void
  onReset: () => void
  onLoadArchivedSessions: () => void
  onRestoreArchivedSession: (documentId: string, sessionId: string) => void
  onDeleteArchivedSession: (documentId: string, sessionId: string) => void
}

function formatDateTime(timestamp: number | null): string {
  if (!timestamp) {
    return '未归档'
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}

export function AiSettingsDialog({
  open,
  settings,
  systemPromptVersion,
  archivedSessions,
  error,
  isLoading,
  isSaving,
  isLoadingArchivedSessions,
  draft,
  onDraftChange,
  onClose,
  onSave,
  onReset,
  onLoadArchivedSessions,
  onRestoreArchivedSession,
  onDeleteArchivedSession,
}: AiSettingsDialogProps) {
  if (!open) {
    return null
  }

  const groupedArchivedSessions = archivedSessions.reduce<Record<string, AiSessionSummary[]>>(
    (groups, session) => {
      const key = `${session.documentId}::${session.documentTitle}`
      groups[key] ??= []
      groups[key].push(session)
      return groups
    },
    {},
  )

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="AI 全局设置"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <div className={styles.headingBlock}>
            <StatusPill tone="soft">AI Settings</StatusPill>
            <h2 className={styles.heading}>全局业务 Prompt</h2>
            <p className={styles.subtitle}>
              这里只编辑业务行为 Prompt。系统安全边界仍由本机 bridge 固定控制，无法在这里关闭。
            </p>
          </div>
          <div className={styles.meta}>
            <span>业务版本 {settings?.version ?? '未加载'}</span>
            <span>系统版本 {systemPromptVersion ?? '未加载'}</span>
          </div>
        </div>

        <div className={styles.body}>
          <TextArea
            value={draft}
            rows={14}
            className={styles.field}
            disabled={isLoading || isSaving}
            aria-label="业务 Prompt 编辑器"
            placeholder="在这里定义 AI 的业务风格、输出偏好和默认行为。"
            onChange={(event) => onDraftChange(event.target.value)}
          />
          {error ? <p className={styles.error}>{error}</p> : null}
        </div>

        <section className={styles.archivedSection} aria-label="归档聊天">
          <div className={styles.archivedHeader}>
            <div>
              <StatusPill tone="soft">Archived Chats</StatusPill>
              <p className={styles.archivedSubtitle}>归档后的聊天可在这里恢复，删除后将从本地永久移除。</p>
            </div>
            <Button
              tone="primary"
              size="sm"
              iconStart="history"
              onClick={onLoadArchivedSessions}
              disabled={isLoadingArchivedSessions}
            >
              {isLoadingArchivedSessions ? '加载中' : '刷新归档'}
            </Button>
          </div>

          {Object.keys(groupedArchivedSessions).length === 0 ? (
            <p className={styles.emptyArchived}>当前没有归档聊天。</p>
          ) : (
            Object.entries(groupedArchivedSessions).map(([groupKey, sessions]) => {
              const [, documentTitle] = groupKey.split('::')
              return (
                <div key={groupKey} className={styles.archivedGroup}>
                  <h3 className={styles.archivedGroupTitle}>{documentTitle}</h3>
                  <div className={styles.archivedList}>
                    {sessions.map((session) => (
                      <div key={`${session.documentId}:${session.sessionId}`} className={styles.archivedItem}>
                        <div className={styles.archivedItemMeta}>
                          <div className={styles.archivedItemTitle}>{session.title}</div>
                          <div className={styles.archivedItemTime}>
                            归档于 {formatDateTime(session.archivedAt)}
                          </div>
                        </div>
                        <div className={styles.archivedItemActions}>
                          <Button
                            tone="primary"
                            size="sm"
                            iconStart="restore"
                            onClick={() => onRestoreArchivedSession(session.documentId, session.sessionId)}
                          >
                            恢复
                          </Button>
                          <Button
                            tone="danger"
                            size="sm"
                            iconStart="delete"
                            onClick={() => onDeleteArchivedSession(session.documentId, session.sessionId)}
                          >
                            永久删除
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </section>

        <div className={styles.footer}>
          <Button tone="primary" onClick={onClose}>
            关闭
          </Button>
          <Button tone="primary" onClick={onReset} disabled={isLoading || isSaving}>
            恢复默认
          </Button>
          <Button tone="primary" onClick={onSave} disabled={isLoading || isSaving || !draft.trim()}>
            {isSaving ? '保存中' : '保存并立刻生效'}
          </Button>
        </div>
      </section>
    </div>
  )
}
