import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, StatusPill, SurfacePanel, ToolbarGroup } from '../../../components/ui'
import type { ImportReport, WorkspaceStorageStatus } from '../services/workspace-storage-service'
import { workspaceStorageService } from '../services/workspace-storage-service'
import { buildConflictDisplayItems } from './conflict-display'
import styles from './StorageSettingsPage.module.css'

function createEmptyStatus(): WorkspaceStorageStatus {
  return {
    mode: 'local-only',
    workspaceName: null,
    localSavedAt: null,
    cloudSyncedAt: null,
    isOnline: true,
    isSyncing: false,
    conflicts: [],
    pendingImportReport: null,
    migrationAvailable: true,
    lastSyncError: null,
  }
}

function formatTimestamp(timestamp: number | null): string {
  if (!timestamp) {
    return '暂无记录'
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}

export function StorageSettingsPage() {
  const navigate = useNavigate()
  const importInputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<WorkspaceStorageStatus>(() =>
    typeof window === 'undefined' ? createEmptyStatus() : workspaceStorageService.getStatus(),
  )
  const [isBusy, setIsBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [report, setReport] = useState<ImportReport | null>(null)

  useEffect(() => {
    const unsubscribe = workspaceStorageService.subscribe(setStatus)
    return unsubscribe
  }, [])

  const displayConflicts = useMemo(() => buildConflictDisplayItems(status.conflicts), [status.conflicts])

  const syncTone = useMemo(() => {
    if (displayConflicts.length > 0) {
      return 'soft'
    }
    return status.cloudSyncedAt ? 'accent' : 'neutral'
  }, [displayConflicts.length, status.cloudSyncedAt])

  const syncLabel = status.isSyncing ? '同步中' : status.cloudSyncedAt ? '已接入云同步' : '等待首次云同步'
  const modeLabel = status.mode === 'cloud-connected' ? '云端优先' : '仅本地缓存'
  const networkLabel = status.isOnline ? '在线' : '离线'
  const workspaceLabel = status.workspaceName ? status.workspaceName : '尚未初始化云端工作区'

  const handleExport = async () => {
    setIsBusy(true)
    setMessage(null)
    try {
      await workspaceStorageService.exportBackupToDownload()
      setMessage('备份导出已开始，请检查浏览器下载列表。')
    } finally {
      setIsBusy(false)
    }
  }

  const handleImportFile = async (file: File | null) => {
    if (!file) {
      return
    }

    setIsBusy(true)
    setMessage(null)
    try {
      const nextReport = await workspaceStorageService.importBackup(file)
      setReport(nextReport)
      setMessage(
        nextReport.success
          ? '备份导入已完成，并已进入后续云同步队列。'
          : '备份导入存在失败项，请检查导入结果。',
      )
      setStatus(workspaceStorageService.getStatus())
    } finally {
      setIsBusy(false)
      if (importInputRef.current) {
        importInputRef.current.value = ''
      }
    }
  }

  const handleSyncNow = async () => {
    setIsBusy(true)
    setMessage(null)
    try {
      const nextStatus = await workspaceStorageService.syncNow()
      setStatus(nextStatus)
      setMessage('已触发手动同步。')
    } finally {
      setIsBusy(false)
    }
  }

  const handleMigrate = async () => {
    setIsBusy(true)
    setMessage(null)
    try {
      const nextStatus = await workspaceStorageService.migrateLocalDataToCloud('BrainFlow Imported Workspace')
      setStatus(nextStatus)
      setMessage('本地数据已上传到云端，后续设备将从云端拉取。')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '上传本地数据到云端失败。')
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.headerTop}>
            <Button tone="ghost" size="sm" iconStart="back" className={styles.backButton} onClick={() => navigate(-1)}>
              返回
            </Button>
            <StatusPill tone={syncTone}>{syncLabel}</StatusPill>
          </div>
          <div className={styles.headerBody}>
            <span className={styles.wordmark}>BrainFlow</span>
            <span className={styles.eyebrow}>Storage &amp; Sync</span>
            <h1 className={styles.title}>数据存储与同步</h1>
            <p className={styles.subtitle}>
              云端现在是唯一权威数据源，本地 IndexedDB 只承担离线副本、最近可用缓存与待同步队列。
            </p>
          </div>
        </header>

        {message ? (
          <SurfacePanel compact className={styles.banner}>
            <p className={styles.bannerText}>{message}</p>
          </SurfacePanel>
        ) : null}

        <SurfacePanel frosted className={styles.heroPanel}>
          <div className={styles.heroCopy}>
            <span className={styles.panelLabel}>Workspace Status</span>
            <h2 className={styles.panelTitle}>当前工作区</h2>
            <p className={styles.panelText}>
              {status.workspaceName ? `当前工作区：${status.workspaceName}` : '当前还没有完成云端工作区初始化。'}
            </p>
            <ToolbarGroup className={styles.actions}>
              <Button tone="primary" iconStart="storage" onClick={() => void handleSyncNow()} disabled={isBusy}>
                立即同步
              </Button>
              <Button tone="secondary" onClick={() => void handleMigrate()} disabled={isBusy}>
                上传本地数据到云端
              </Button>
            </ToolbarGroup>
            {status.lastSyncError ? (
              <p className={styles.errorText}>最近一次同步错误：{status.lastSyncError}</p>
            ) : (
              <p className={styles.helperText}>同步动作完成后，其他设备会从云端拉取同一份工作区状态。</p>
            )}
          </div>

          <div className={styles.statGrid}>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>同步模式</span>
              <strong className={styles.statValue}>{modeLabel}</strong>
              <p className={styles.statMeta}>云端负责长期保存，本地只保留最近副本。</p>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>网络状态</span>
              <strong className={styles.statValue}>{networkLabel}</strong>
              <p className={styles.statMeta}>
                {status.isOnline ? '可立即推送与拉取云端变更。' : '离线期间会继续积累待同步队列。'}
              </p>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>本地保存</span>
              <strong className={styles.statValue}>{formatTimestamp(status.localSavedAt)}</strong>
              <p className={styles.statMeta}>IndexedDB 中最近一次完成写入的时间。</p>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>云端同步</span>
              <strong className={styles.statValue}>{formatTimestamp(status.cloudSyncedAt)}</strong>
              <p className={styles.statMeta}>当前设备最近一次与云端完成对齐的时间。</p>
            </div>
          </div>
        </SurfacePanel>

        <section className={styles.secondaryGrid}>
          <SurfacePanel frosted className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <span className={styles.panelLabel}>Backup Relay</span>
                <h2 className={styles.sectionTitle}>辅助备份链路</h2>
              </div>
            </div>
            <p className={styles.panelText}>
              zip 导入导出与文件夹连接继续保留为辅助能力，不再作为主同步链路。
            </p>
            <dl className={styles.detailList}>
              <div className={styles.detailRow}>
                <dt>当前工作区</dt>
                <dd>{workspaceLabel}</dd>
              </div>
              <div className={styles.detailRow}>
                <dt>推荐用途</dt>
                <dd>临时迁移、人工归档、离线备份</dd>
              </div>
            </dl>
            <ToolbarGroup className={styles.actions}>
              <Button iconStart="export" onClick={() => void handleExport()} disabled={isBusy}>
                导出 zip
              </Button>
              <Button iconStart="document" onClick={() => importInputRef.current?.click()} disabled={isBusy}>
                导入 zip
              </Button>
              <input
                ref={importInputRef}
                hidden
                type="file"
                accept=".zip,application/zip"
                onChange={(event) => void handleImportFile(event.target.files?.[0] ?? null)}
              />
            </ToolbarGroup>
          </SurfacePanel>

          <SurfacePanel frosted className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <span className={styles.panelLabel}>Conflict Queue</span>
                <h2 className={styles.sectionTitle}>冲突处理</h2>
              </div>
              <StatusPill tone={displayConflicts.length > 0 ? 'soft' : 'neutral'}>
                {displayConflicts.length} 个待处理冲突
              </StatusPill>
            </div>
            {displayConflicts.length > 0 ? (
              <ul className={styles.list}>
                {displayConflicts.map((item) => {
                  const conflict = item.conflict
                  return (
                    <li key={item.key} className={styles.listItem}>
                      <span className={styles.listTitle}>
                        {conflict.entityType === 'document' ? '文档冲突' : 'AI 会话冲突'}：{item.title}
                      </span>
                      <span className={styles.listMeta}>{conflict.entityId}</span>
                      <span className={styles.listMeta}>
                        {conflict.analysisStatus === 'ready' ? '分析已完成' : '分析中'} · 推荐
                        {conflict.recommendedResolution === 'merged_payload'
                          ? '采用合并建议'
                          : conflict.recommendedResolution === 'save_local_copy'
                            ? '保留本地并另存副本'
                            : conflict.recommendedResolution === 'use_cloud'
                              ? '采用云端版本'
                              : '等待建议'}
                      </span>
                      <span className={styles.listMeta}>
                        来源：
                        {conflict.analysisSource === 'ai'
                          ? 'AI'
                          : conflict.analysisSource === 'heuristic_fallback'
                            ? '规则回退'
                            : conflict.analysisSource === 'heuristic'
                              ? '规则'
                              : '待分析'}
                      </span>
                      {conflict.summary ? (
                        <span className={styles.listMeta}>{conflict.summary}</span>
                      ) : null}
                      {item.duplicateCount > 0 ? (
                        <span className={styles.listMeta}>
                          已折叠 {item.duplicateCount} 条同一实体的重复冲突记录。
                        </span>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className={styles.panelText}>当前没有检测到需要人工决策的云端冲突。</p>
            )}
          </SurfacePanel>
        </section>

        <SurfacePanel frosted className={styles.resultPanel}>
          <div className={styles.panelHead}>
            <div>
              <span className={styles.panelLabel}>Import Report</span>
              <h2 className={styles.sectionTitle}>导入结果</h2>
            </div>
          </div>

          {report ? (
            <div className={styles.report}>
              <p className={styles.panelText}>
                已导入 {report.importedDocuments} 份文档，{report.importedConversations} 个 AI 会话。
              </p>

              {report.duplicatedDocuments.length > 0 ? (
                <div className={styles.reportBlock}>
                  <h3 className={styles.reportTitle}>重复文档副本</h3>
                  <ul className={styles.list}>
                    {report.duplicatedDocuments.map((item) => (
                      <li key={`${item.oldId}:${item.newId}`} className={styles.listItem}>
                        <span className={styles.listTitle}>{item.oldId}</span>
                        <span className={styles.listMeta}>已导入为副本 {item.newId}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {report.warnings.length > 0 ? (
                <div className={styles.reportBlock}>
                  <h3 className={styles.reportTitle}>导入警告</h3>
                  <ul className={styles.list}>
                    {report.warnings.map((warning) => (
                      <li key={warning} className={styles.listItem}>
                        <span className={styles.listMeta}>{warning}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {report.failures.length > 0 ? (
                <div className={styles.reportBlock}>
                  <h3 className={styles.reportTitle}>失败项</h3>
                  <ul className={styles.list}>
                    {report.failures.map((failure) => (
                      <li key={`${failure.kind}:${failure.path}`} className={styles.listItem}>
                        <span className={styles.listTitle}>{failure.path}</span>
                        <span className={styles.listMeta}>{failure.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className={styles.helperText}>没有发现损坏文件或不兼容条目。</p>
              )}
            </div>
          ) : (
            <p className={styles.panelText}>导入 zip 后，这里会显示导入结果、警告与失败项。</p>
          )}
        </SurfacePanel>
      </div>
    </main>
  )
}
