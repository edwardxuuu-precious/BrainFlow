import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { LocalStorageAdminStatus, WorkspaceAdminSummary } from '../../../../shared/storage-admin-contract'
import { Button, Input, StatusPill, SurfacePanel, ToolbarGroup } from '../../../components/ui'
import { authSessionService } from '../../auth/auth-session-service'
import type { ImportReport, WorkspaceStorageStatus } from '../services/workspace-storage-service'
import { workspaceStorageService } from '../services/workspace-storage-service'
import { buildConflictDisplayItems } from './conflict-display'
import styles from './StorageSettingsPage.module.css'

type WorkspaceDialogMode = 'create' | 'rename' | 'delete'

function createEmptyAdminStatus(): LocalStorageAdminStatus {
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
      indexedDbAvailable: typeof indexedDB !== 'undefined',
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
      currentOrigin: typeof window === 'undefined' ? null : window.location.origin,
      canonicalOrigin: null,
      legacyMigrationAvailable: false,
      legacyDocumentCount: 0,
      legacyConversationCount: 0,
    },
  }
}

function formatTimestamp(timestamp: number | null): string {
  if (!timestamp) return '暂无记录'
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value)
}

function formatActionError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function getOverallStatusCopy(status: LocalStorageAdminStatus) {
  if (status.api.reachable && status.database.reachable) {
    return {
      title: '本地存储运行正常',
      description: '本地 API 与主库都已连通，可以直接导出、恢复和下载数据库备份。',
    }
  }
  if (!status.api.reachable) {
    return {
      title: '本地服务未连接',
      description: '当前无法访问本地 API，请先确认本地服务是否已经启动。',
    }
  }
  if (status.database.configured) {
    return {
      title: '主库连接需要处理',
      description: '本地 API 可达，但 Postgres 当前不可用，建议先恢复数据库连接。',
    }
  }
  return {
    title: '主库尚未配置完成',
    description: '请先确认 Postgres 配置。数据库备份能力会在主库可用后启用。',
  }
}

function getDialogTitle(mode: WorkspaceDialogMode): string {
  if (mode === 'create') return '新建工作区'
  if (mode === 'rename') return '重命名工作区'
  return '删除工作区'
}

function buildImportSummary(report: ImportReport): string {
  if (!report.success) return '恢复失败，请检查备份文件格式与错误详情。'
  return `已恢复 ${report.importedDocuments} 份文档，${report.importedConversations} 个 AI 会话。`
}

export function StorageSettingsPage() {
  const navigate = useNavigate()
  const importInputRef = useRef<HTMLInputElement>(null)
  const initialSyncStatus = workspaceStorageService.getStatus()
  const [status, setStatus] = useState<LocalStorageAdminStatus>(createEmptyAdminStatus)
  const [syncStatus, setSyncStatus] = useState<WorkspaceStorageStatus>(initialSyncStatus)
  const [report, setReport] = useState<ImportReport | null>(initialSyncStatus.pendingImportReport)
  const [isInitialized, setIsInitialized] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [dialogMode, setDialogMode] = useState<WorkspaceDialogMode | null>(null)
  const [dialogWorkspace, setDialogWorkspace] = useState<WorkspaceAdminSummary | null>(null)
  const [nameDraft, setNameDraft] = useState('')
  const [deleteDraft, setDeleteDraft] = useState('')
  const [dialogError, setDialogError] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'BrainFlow - 本地存储与恢复'
  }, [])

  useEffect(() => {
    let active = true
    const load = async (refresh: boolean) => {
      try {
        const nextStatus = refresh
          ? await workspaceStorageService.refreshAdminStatus()
          : await workspaceStorageService.getAdminStatus()
        if (active) {
          setStatus(nextStatus)
        }
      } catch (error) {
        if (active) {
          setMessage(formatActionError(error, '无法读取本地存储状态。'))
        }
      } finally {
        if (active) {
          setIsInitialized(true)
        }
      }
    }

    void load(true)

    const unsubscribe = workspaceStorageService.subscribe((nextSyncStatus) => {
      if (!active) return
      setSyncStatus(nextSyncStatus)
      setReport(nextSyncStatus.pendingImportReport)
      void load(false)
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const conflictItems = useMemo(() => buildConflictDisplayItems(syncStatus.conflicts), [syncStatus.conflicts])
  const discardableConflictItems = useMemo(
    () => conflictItems.filter((item) => item.conflict.localRecord && !item.conflict.cloudRecord),
    [conflictItems],
  )
  const overallStatus = getOverallStatusCopy(status)
  const currentWorkspaceId = status.browserCacheSummary.workspaceId ?? status.workspace.id
  const effectiveConflictCount = conflictItems.length

  const closeDialog = () => {
    setDialogMode(null)
    setDialogWorkspace(null)
    setNameDraft('')
    setDeleteDraft('')
    setDialogError(null)
  }

  const openDialog = (mode: WorkspaceDialogMode, workspace: WorkspaceAdminSummary | null = null) => {
    setDialogMode(mode)
    setDialogWorkspace(workspace)
    setNameDraft(mode === 'rename' && workspace ? workspace.name : '')
    setDeleteDraft('')
    setDialogError(null)
  }

  const refreshStatus = async () => {
    const nextStatus = await workspaceStorageService.refreshAdminStatus()
    setStatus(nextStatus)
  }

  const handleDiscardLocalConflicts = async () => {
    const conflictIds = discardableConflictItems.map((item) => item.conflict.id)
    if (conflictIds.length === 0) {
      return
    }

    await runAction(async () => {
      const nextStatus = await workspaceStorageService.discardLocalConflicts(conflictIds)
      setSyncStatus(nextStatus)
      await refreshStatus()
      setMessage('已清除 ' + formatCount(conflictIds.length) + ' 条无主冲突。')
    }, '清除无主冲突失败。')
  }

  const runAction = async (action: () => Promise<void>, fallback: string) => {
    setIsBusy(true)
    setMessage(null)
    try {
      await action()
    } catch (error) {
      setMessage(formatActionError(error, fallback))
    } finally {
      setIsBusy(false)
    }
  }

  const handleImportFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    await runAction(async () => {
      const nextReport = await workspaceStorageService.importBackup(file)
      setReport(nextReport)
      setSyncStatus(workspaceStorageService.getStatus())
      await refreshStatus()
      setMessage(nextReport.success ? '工作区 ZIP 已恢复。' : '工作区 ZIP 恢复完成，但存在错误。')
    }, '恢复工作区 ZIP 失败。')
  }

  const handleWorkspaceDialogSubmit = async () => {
    if (!dialogMode) return
    const trimmedName = nameDraft.trim()
    setDialogError(null)
    if ((dialogMode === 'create' || dialogMode === 'rename') && !trimmedName) {
      setDialogError('请输入工作区名称。')
      return
    }
    if (dialogMode === 'delete' && deleteDraft !== (dialogWorkspace?.name ?? '')) {
      setDialogError('请输入完整工作区名称后再删除。')
      return
    }

    await runAction(async () => {
      if (dialogMode === 'create') {
        setStatus(await workspaceStorageService.createWorkspace(trimmedName))
        setMessage(`工作区已创建：${trimmedName}。已保留当前工作区，可手动切换。`)
      } else if (dialogMode === 'rename' && dialogWorkspace) {
        setStatus(await workspaceStorageService.renameWorkspace(dialogWorkspace.id, trimmedName))
        setMessage(`工作区已重命名为：${trimmedName}`)
      } else if (dialogMode === 'delete' && dialogWorkspace) {
        setStatus(await workspaceStorageService.deleteWorkspace(dialogWorkspace.id))
        setMessage(`已删除工作区：${dialogWorkspace.name}`)
      }
      closeDialog()
    }, '工作区操作失败。')
  }

  if (!isInitialized) {
    return null
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.headerTop}>
            <Button tone="ghost" size="sm" className={styles.backButton} onClick={() => navigate('/')}>
              返回主页
            </Button>
            <StatusPill tone={status.api.reachable && status.database.reachable ? 'accent' : 'soft'}>
              {overallStatus.title}
            </StatusPill>
          </div>
          <div className={styles.headerBody}>
            <div className={styles.headerCopy}>
              <span className={styles.eyebrow}>Storage Recovery</span>
              <h1 className={styles.title}>本地存储与恢复</h1>
              <p className={styles.subtitle}>{overallStatus.description}</p>
            </div>
            <ToolbarGroup className={styles.headerActions}>
              <Button tone="secondary" onClick={() => void runAction(refreshStatus, '刷新本地存储状态失败。')} disabled={isBusy}>
                刷新状态
              </Button>
              <Button tone="ghost" onClick={() => navigate('/')} disabled={isBusy}>
                返回编辑
              </Button>
            </ToolbarGroup>
          </div>
        </header>

        {message ? <p className={styles.actionFeedback}>{message}</p> : null}

        <SurfacePanel frosted className={styles.overviewPanel}>
          <div className={styles.summaryCluster}>
            <div className={styles.summaryItem}>
              <span className={styles.panelLabel}>当前工作区</span>
              <strong className={styles.summaryValue}>{status.workspace.name ?? '未初始化工作区'}</strong>
              <p className={styles.helperText}>工作区 ID：{currentWorkspaceId ?? '未设置'}</p>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.panelLabel}>最近本地写入</span>
              <strong className={styles.summaryValue}>{formatTimestamp(status.browserCacheSummary.lastLocalWriteAt)}</strong>
              <p className={styles.helperText}>待同步操作：{formatCount(status.browserCacheSummary.pendingOpCount)}</p>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.panelLabel}>最近主库同步</span>
              <strong className={styles.summaryValue}>{formatTimestamp(status.browserCacheSummary.lastCloudSyncAt)}</strong>
              <p className={styles.helperText}>待处理冲突：{formatCount(effectiveConflictCount)}</p>
            </div>
          </div>
        </SurfacePanel>

        <SurfacePanel frosted className={styles.actionPanel}>
          <div className={styles.sectionIntro}>
            <div>
              <span className={styles.panelLabel}>Recovery Actions</span>
              <h2 className={styles.sectionTitle}>导入导出与备份</h2>
            </div>
            <ToolbarGroup className={styles.primaryActions}>
              <Button tone="primary" onClick={() => void runAction(() => workspaceStorageService.exportBackupToDownload(), '导出工作区 ZIP 失败。')} disabled={isBusy}>导出工作区 ZIP</Button>
              <Button tone="secondary" onClick={() => importInputRef.current?.click()} disabled={isBusy}>恢复工作区 ZIP</Button>
              <Button tone="secondary" onClick={() => void runAction(() => workspaceStorageService.downloadDatabaseBackup(), '下载数据库备份失败。')} disabled={isBusy || !status.backup.available}>下载数据库备份</Button>
            </ToolbarGroup>
          </div>
          <input ref={importInputRef} type="file" accept=".zip,application/zip" hidden onChange={handleImportFileChange} />
        </SurfacePanel>

        {report ? (
          <SurfacePanel frosted className={styles.reportPanel}>
            <span className={styles.panelLabel}>Import Report</span>
            <h2 className={styles.reportTitle}>恢复结果</h2>
            <p className={styles.reportSummary}>{buildImportSummary(report)}</p>
          </SurfacePanel>
        ) : null}

        <SurfacePanel frosted className={styles.workspacePanel} data-testid="storage-settings-workspace-panel">
          <div className={styles.sectionIntro}>
            <div>
              <span className={styles.panelLabel}>Workspace Admin</span>
              <h2 className={styles.sectionTitle}>工作区管理</h2>
            </div>
            <StatusPill tone={status.workspaces.length > 1 ? 'soft' : 'neutral'}>{status.workspaces.length} 个工作区</StatusPill>
          </div>
          <ToolbarGroup className={styles.inlineActions}>
            <Button tone="secondary" onClick={() => openDialog('create')} disabled={isBusy}>新建工作区</Button>
            {status.auth.mode === 'external' ? (
              <Button tone="ghost" onClick={() => void runAction(async () => { await authSessionService.logout(); navigate('/', { replace: true }) }, '退出登录失败。')} disabled={isBusy}>退出登录</Button>
            ) : null}
          </ToolbarGroup>
          <ul className={styles.workspaceList}>
            {status.workspaces.map((workspace) => {
              const isCurrent = workspace.id === currentWorkspaceId
              return (
                <li key={workspace.id} className={styles.workspaceItem} data-testid={`storage-settings-workspace-${workspace.id}`}>
                  <div className={styles.workspaceInfo}>
                    <div className={styles.workspaceTitleRow}>
                      <span className={styles.listTitle}>{workspace.name}</span>
                      {isCurrent ? <StatusPill tone="accent">当前工作区</StatusPill> : null}
                    </div>
                    <span className={styles.listMeta}>最近更新：{formatTimestamp(workspace.updatedAt)}</span>
                  </div>
                  <ToolbarGroup className={styles.inlineActions}>
                    <Button tone="secondary" onClick={() => void runAction(async () => { setStatus(await workspaceStorageService.switchWorkspace(workspace.id)); setSyncStatus(workspaceStorageService.getStatus()) }, '切换工作区失败。')} disabled={isBusy || isCurrent}>{isCurrent ? '当前工作区' : '切换到此工作区'}</Button>
                    <Button tone="ghost" onClick={() => openDialog('rename', workspace)} disabled={isBusy}>重命名工作区</Button>
                    <Button tone="ghost" onClick={() => openDialog('delete', workspace)} disabled={isBusy || isCurrent}>删除工作区</Button>
                  </ToolbarGroup>
                </li>
              )
            })}
          </ul>
        </SurfacePanel>

        <details className={styles.advancedPanel} data-testid="storage-settings-advanced">
          <summary className={styles.advancedSummary}>
            <div>
              <span className={styles.panelLabel}>Advanced &amp; Diagnostics</span>
              <h2 className={styles.sectionTitle}>高级与诊断</h2>
            </div>
            <StatusPill tone={effectiveConflictCount > 0 ? 'soft' : 'neutral'}>
              {effectiveConflictCount > 0 ? `有 ${formatCount(effectiveConflictCount)} 个待处理冲突` : '默认折叠'}
            </StatusPill>
          </summary>
          <div className={styles.advancedGrid}>
            <SurfacePanel frosted className={styles.advancedCard} data-testid="storage-settings-conflict-queue">
              <div className={styles.cardHead}>
                <div>
                  <span className={styles.panelLabel}>Conflict Queue</span>
                  <h3 className={styles.statusTitle}>冲突处理</h3>
                </div>
                <ToolbarGroup className={styles.inlineActions}>
                  {discardableConflictItems.length > 0 ? (
                    <Button tone="danger" size="sm" onClick={() => void handleDiscardLocalConflicts()} disabled={isBusy}>
                      {'清除 ' + formatCount(discardableConflictItems.length) + ' 条无主冲突'}
                    </Button>
                  ) : null}
                  <StatusPill tone={effectiveConflictCount > 0 ? 'soft' : 'neutral'}>{effectiveConflictCount} 个待处理冲突</StatusPill>
                </ToolbarGroup>
              </div>
              {conflictItems.length > 0 ? (
                <ul className={styles.list}>
                  {conflictItems.map((item) => (
                    <li key={item.key} className={styles.listItem} data-testid={`storage-settings-conflict-${item.conflict.id}`}>
                      <span className={styles.listTitle}>{item.conflict.entityType === 'document' ? '文档冲突' : '会话冲突'}：{item.title}</span>
                      <span className={styles.listMeta}>{item.conflict.summary ?? '正在整理差异'}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.panelText} data-testid="storage-settings-no-conflicts">当前没有检测到需要人工确认的冲突。</p>
              )}
            </SurfacePanel>
          </div>
        </details>
      </div>

      {dialogMode ? (
        <div className={styles.dialogOverlay} role="presentation" onClick={closeDialog}>
          <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="storage-settings-dialog-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="storage-settings-dialog-title" className={styles.dialogTitle}>{getDialogTitle(dialogMode)}</h2>
            {dialogMode === 'create' ? (
              <>
                <p className={styles.dialogText}>创建后会保留当前工作区，新的工作区可稍后手动切换。</p>
                <p className={styles.dialogLabel}>工作区名称</p>
                <Input className={styles.dialogField} placeholder="例如：产品脑图库" value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} autoFocus />
              </>
            ) : null}
            {dialogMode === 'rename' && dialogWorkspace ? (
              <>
                <p className={styles.dialogText}>更新工作区名称不会影响其中已有的文档和会话。</p>
                <p className={styles.dialogLabel}>新的工作区名称</p>
                <Input className={styles.dialogField} value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} autoFocus />
              </>
            ) : null}
            {dialogMode === 'delete' && dialogWorkspace ? (
              <>
                <p className={styles.dialogText}>删除后会清空该工作区在主库存储中的文档与会话。请输入完整名称后再确认。</p>
                <p className={styles.dialogLabel}>输入 “{dialogWorkspace.name}” 以确认删除</p>
                <Input className={styles.dialogField} placeholder={dialogWorkspace.name} value={deleteDraft} onChange={(event) => setDeleteDraft(event.target.value)} autoFocus />
              </>
            ) : null}
            {dialogError ? <p className={styles.dialogError}>{dialogError}</p> : null}
            <div className={styles.dialogActions}>
              <Button tone="ghost" onClick={closeDialog} disabled={isBusy}>取消</Button>
              {dialogMode === 'create' ? <Button tone="primary" onClick={() => void handleWorkspaceDialogSubmit()} disabled={isBusy}>创建工作区</Button> : null}
              {dialogMode === 'rename' ? <Button tone="primary" onClick={() => void handleWorkspaceDialogSubmit()} disabled={isBusy}>保存名称</Button> : null}
              {dialogMode === 'delete' ? <Button tone="danger" onClick={() => void handleWorkspaceDialogSubmit()} disabled={isBusy || deleteDraft !== (dialogWorkspace?.name ?? '')}>确认删除</Button> : null}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
