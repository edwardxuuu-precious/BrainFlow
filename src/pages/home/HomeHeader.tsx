import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { LocalStorageAdminStatus } from '../../../shared/storage-admin-contract'
import { Button } from '../../components/ui'
import { Icon } from '../../components/ui/icons'
import { workspaceStorageService } from '../../features/storage/services/workspace-storage-service'
import styles from './HomeHeader.module.css'

function fallbackStatus(): LocalStorageAdminStatus {
  const checkedAt = Date.now()
  return {
    mode: 'local_postgres',
    checkedAt,
    api: { reachable: false, checkedAt },
    database: {
      driver: 'postgres',
      configured: false,
      reachable: false,
      label: null,
      lastError: null,
      backupFormat: 'custom',
      lastBackupAt: null,
    },
    backup: { available: false, directory: null, lastError: null },
    auth: { mode: 'stub', authenticated: true, username: null },
    workspace: { id: null, name: null },
    workspaces: [],
    runtime: { canonicalOrigin: null },
    browserCacheSummary: {
      indexedDbAvailable: true,
      deviceId: null,
      workspaceId: null,
      pendingOpCount: 0,
      lastLocalWriteAt: null,
      lastCloudSyncAt: null,
      isOnline: true,
      isSyncing: false,
      lastSyncError: null,
      conflictCount: 0,
      legacyMigrationCompleted: false,
    },
    diagnostics: {
      currentOrigin: null,
      canonicalOrigin: null,
      legacyMigrationAvailable: false,
      legacyDocumentCount: 0,
      legacyConversationCount: 0,
    },
  }
}

interface HomeHeaderProps {
  brandQuote: { text: string; author: string }
}

export function HomeHeader({ brandQuote }: HomeHeaderProps) {
  const navigate = useNavigate()
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<LocalStorageAdminStatus>(fallbackStatus)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const [renameBusy, setRenameBusy] = useState(false)
  const [switchingWorkspaceId, setSwitchingWorkspaceId] = useState<string | null>(null)

  const currentWorkspaceId = status.browserCacheSummary.workspaceId ?? status.workspace.id
  const currentWorkspace = status.workspaces.find((workspace) => workspace.id === currentWorkspaceId) ?? null
  const displayedWorkspaceId = switchingWorkspaceId ?? currentWorkspaceId
  const displayedWorkspace =
    status.workspaces.find((workspace) => workspace.id === displayedWorkspaceId) ?? currentWorkspace
  const workspaceName = displayedWorkspace?.name ?? status.workspace.name ?? 'Current Workspace'

  useEffect(() => {
    let active = true

    const load = async (refresh: boolean) => {
      const next = refresh
        ? await workspaceStorageService.refreshAdminStatus()
        : await workspaceStorageService.getAdminStatus()
      if (active) {
        setStatus(next)
      }
    }

    void load(true).catch(() => undefined)
    const off = workspaceStorageService.subscribe(() => {
      void load(false).catch(() => undefined)
    })

    return () => {
      active = false
      off()
    }
  }, [])

  useEffect(() => {
    if (switchingWorkspaceId && switchingWorkspaceId === currentWorkspaceId) {
      setSwitchingWorkspaceId(null)
    }
  }, [currentWorkspaceId, switchingWorkspaceId])

  useEffect(() => {
    if (!dropdownOpen) {
      return
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [dropdownOpen])

  const handleSwitchWorkspace = async (workspaceId: string) => {
    setDropdownOpen(false)
    if (workspaceId === currentWorkspaceId || switchingWorkspaceId) {
      return
    }

    setSwitchingWorkspaceId(workspaceId)
    try {
      await workspaceStorageService.switchWorkspace(workspaceId)
    } catch (error) {
      console.error('切换工作区失败', error)
      setSwitchingWorkspaceId(null)
    }
  }

  const openRenameDialog = () => {
    setDropdownOpen(false)
    setRenameDraft(currentWorkspace?.name ?? workspaceName)
    setRenameError(null)
    setRenameDialogOpen(true)
  }

  const submitRename = async () => {
    if (!currentWorkspace || !renameDraft.trim()) {
      setRenameError('工作区名称不能为空。')
      return
    }

    setRenameBusy(true)
    setRenameError(null)

    try {
      await workspaceStorageService.renameWorkspace(currentWorkspace.id, renameDraft.trim())
      setRenameDialogOpen(false)
    } catch (error) {
      setRenameError(error instanceof Error && error.message ? error.message : '重命名工作区失败。')
    } finally {
      setRenameBusy(false)
    }
  }

  return (
    <>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.wordmark}>FLOW</span>
          <span className={styles.quote} title={brandQuote.author}>
            {brandQuote.text}
          </span>
        </div>

        <div className={styles.actions}>
          <div className={styles.workspaceSelector} ref={dropdownRef}>
            <button
              className={styles.workspaceButton}
              onClick={() => setDropdownOpen((open) => !open)}
              aria-expanded={dropdownOpen}
              aria-haspopup="listbox"
              disabled={switchingWorkspaceId !== null}
            >
              <Icon name="storage" size={16} />
              <span className={styles.workspaceName}>{workspaceName}</span>
              <Icon
                name="chevronDown"
                size={14}
                className={dropdownOpen ? styles.chevronOpen : ''}
              />
            </button>

            {dropdownOpen && (
              <div className={styles.dropdown} role="listbox">
                <div className={styles.dropdownHeader}>选择工作区</div>

                {status.workspaces.map((workspace) => (
                  <button
                    key={workspace.id}
                    className={`${styles.dropdownItem} ${
                      workspace.id === displayedWorkspaceId ? styles.dropdownItemActive : ''
                    }`}
                    onClick={() => void handleSwitchWorkspace(workspace.id)}
                    role="option"
                    aria-selected={workspace.id === displayedWorkspaceId}
                    disabled={switchingWorkspaceId !== null}
                  >
                    <span className={styles.dropdownItemName}>{workspace.name}</span>
                    {workspace.id === displayedWorkspaceId && <Icon name="check" size={14} />}
                  </button>
                ))}

                {status.workspaces.length === 0 && (
                  <div className={styles.dropdownEmpty}>暂无其他工作区</div>
                )}

                <div className={styles.dropdownDivider} />

                <button className={styles.dropdownItem} onClick={openRenameDialog}>
                  <Icon name="edit" size={14} />
                  <span>重命名当前工作区</span>
                </button>

                <button
                  className={styles.dropdownItem}
                  onClick={() => {
                    setDropdownOpen(false)
                    navigate('/settings')
                  }}
                >
                  <Icon name="settings" size={14} />
                  <span>管理工作区</span>
                </button>
              </div>
            )}
          </div>

          <Button
            tone="ghost"
            size="sm"
            iconStart="ai"
            onClick={() => navigate('/ai-settings')}
            className={styles.settingsButton}
            title="AI 服务"
          >
            AI 服务
          </Button>

          <Button
            tone="ghost"
            size="sm"
            iconStart="settings"
            onClick={() => navigate('/settings')}
            className={styles.settingsButton}
            title="数据存储与同步"
          />
        </div>
      </header>

      {renameDialogOpen && (
        <div
          className={styles.dialogOverlay}
          onClick={() => {
            if (!renameBusy) {
              setRenameDialogOpen(false)
            }
          }}
        >
          <div className={styles.dialog} onClick={(event) => event.stopPropagation()}>
            <h3 className={styles.dialogTitle}>重命名工作区</h3>
            <p className={styles.dialogDescription}>
              修改当前工作区名称，不会影响其中的脑图和对话内容。
            </p>

            <input
              type="text"
              className={styles.dialogInput}
              value={renameDraft}
              onChange={(event) => setRenameDraft(event.target.value)}
              placeholder="输入新的工作区名称"
              autoFocus
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !renameBusy) {
                  void submitRename()
                }
                if (event.key === 'Escape' && !renameBusy) {
                  setRenameDialogOpen(false)
                }
              }}
            />

            {renameError && <p className={styles.dialogError}>{renameError}</p>}

            <div className={styles.dialogActions}>
              <Button
                tone="ghost"
                onClick={() => setRenameDialogOpen(false)}
                disabled={renameBusy}
              >
                取消
              </Button>
              <Button
                tone="primary"
                onClick={() => void submitRename()}
                disabled={renameBusy || !renameDraft.trim()}
              >
                {renameBusy ? '保存中...' : '保存'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
