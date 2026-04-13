import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { LocalStorageAdminStatus } from '../../../shared/storage-admin-contract'
import { Button, Input } from '../../components/ui'
import { workspaceStorageService } from '../../features/storage/services/workspace-storage-service'
import homeStyles from './HomePage.module.css'
import styles from './HomeWorkspaceSummary.module.css'

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

export function HomeWorkspaceSummary({ documentCount }: { documentCount: number }) {
  const navigate = useNavigate()
  const [status, setStatus] = useState<LocalStorageAdminStatus>(fallbackStatus)
  const [renameOpen, setRenameOpen] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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

  const currentWorkspace =
    status.workspaces.find(
      (workspace) => workspace.id === (status.browserCacheSummary.workspaceId ?? status.workspace.id),
    ) ?? null
  const workspaceName = currentWorkspace?.name ?? status.workspace.name ?? '未初始化工作区'

  const openRename = () => {
    setNameDraft(workspaceName)
    setError(null)
    setRenameOpen(true)
  }

  const submitRename = async () => {
    if (!currentWorkspace || !nameDraft.trim()) {
      setError('工作区名称不能为空。')
      return
    }

    setBusy(true)
    setError(null)

    try {
      const next = await workspaceStorageService.renameWorkspace(currentWorkspace.id, nameDraft)
      setStatus(next)
      setRenameOpen(false)
    } catch (renameError) {
      setError(renameError instanceof Error && renameError.message ? renameError.message : '重命名工作区失败。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.section}>
      <span className={homeStyles.footerLabel}>当前工作区</span>
      <span className={styles.value}>{`${workspaceName} · ${documentCount} 份脑图`}</span>
      <div className={styles.actions}>
        <Button tone="ghost" size="sm" onClick={() => navigate('/settings')}>
          管理工作区
        </Button>
        <Button tone="ghost" size="sm" onClick={openRename} disabled={!currentWorkspace}>
          重命名工作区
        </Button>
      </div>

      {renameOpen ? (
        <div className={styles.dialogOverlay} role="presentation">
          <div
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="home-workspace-rename-title"
          >
            <h2 id="home-workspace-rename-title" className={styles.title}>
              重命名工作区
            </h2>
            <p className={styles.text}>这里只修改当前工作区名称，不会影响其中脑图的内容和 ID。</p>
            <Input
              className={styles.field}
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              placeholder="输入新的工作区名称"
              autoFocus
            />
            {error ? <p className={styles.error}>{error}</p> : null}
            <div className={styles.dialogActions}>
              <Button tone="ghost" onClick={() => setRenameOpen(false)} disabled={busy}>
                取消
              </Button>
              <Button tone="primary" onClick={() => void submitRename()} disabled={busy || !nameDraft.trim()}>
                保存名称
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
