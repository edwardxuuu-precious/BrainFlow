import { useEffect, useMemo, useState } from 'react'
import { Button, SurfacePanel } from '../../../components/ui'
import type { SyncConflictResolution } from '../../../../shared/sync-contract'
import type { StorageConflictRecord } from '../domain/sync-records'
import styles from './StorageConflictDialog.module.css'

interface StorageConflictDialogProps {
  conflict: StorageConflictRecord | null
  onResolve: (
    conflictId: string,
    resolution: SyncConflictResolution,
    mergedPayload?: unknown,
  ) => Promise<void>
  onDiscardLocalConflict?: (conflictId: string) => Promise<void>
  onDismiss: () => void
}

interface ConflictDiffEntry {
  path: string
  localValue: string
  cloudValue: string
}

const MAX_DIFF_ENTRIES = 10

function formatTimestamp(timestamp: number | null): string {
  if (!timestamp) {
    return '未记录'
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}

function resolveTitle(conflict: StorageConflictRecord): string {
  const localPayload = conflict.localPayload as { title?: string } | null
  const cloudPayload = conflict.cloudPayload as { title?: string } | null
  return localPayload?.title ?? cloudPayload?.title ?? conflict.entityId
}

function describeAnalysisSource(conflict: StorageConflictRecord): string {
  switch (conflict.analysisSource) {
    case 'heuristic':
      return '时间规则建议'
    case 'heuristic_fallback':
      return '规则建议'
    case 'ai':
      return '旧版历史建议'
    default:
      return '等待建议'
  }
}

function describeConfidence(conflict: StorageConflictRecord): string {
  switch (conflict.confidence) {
    case 'high':
      return '高'
    case 'medium':
      return '中'
    case 'low':
      return '低'
    default:
      return '未标注'
  }
}

function isPayloadObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function arePayloadsEqual(left: unknown, right: unknown): boolean {
  try {
    return JSON.stringify(left) === JSON.stringify(right)
  } catch {
    return Object.is(left, right)
  }
}

function recommendsLocalLatest(conflict: StorageConflictRecord): boolean {
  return (
    conflict.recommendedResolution === 'merged_payload' &&
    conflict.analysisSource === 'heuristic' &&
    arePayloadsEqual(conflict.mergedPayload ?? null, conflict.localPayload)
  )
}

function describeResolution(
  conflict: StorageConflictRecord,
  resolution: SyncConflictResolution | null,
): string {
  switch (resolution) {
    case 'use_cloud':
      return '采用主库较新版本'
    case 'save_local_copy':
      return '保留本地并另存副本'
    case 'merged_payload':
      return recommendsLocalLatest(conflict) ? '采用本地较新版本' : '采用建议内容'
    default:
      return '等待建议'
  }
}

function describeRecordState(exists: boolean, deletedAt: number | null | undefined): string {
  if (!exists) {
    return '未记录'
  }

  return deletedAt ? '已删除' : '有效内容'
}

function getFallbackResolutions(conflict: StorageConflictRecord): SyncConflictResolution[] {
  const actionable: SyncConflictResolution[] = []

  if (conflict.cloudRecord) {
    actionable.push('use_cloud')
  }

  if (conflict.localRecord) {
    actionable.push('save_local_copy')
  }

  return actionable
}

function canDiscardLocalConflict(conflict: StorageConflictRecord): boolean {
  return Boolean(conflict.localRecord) && !conflict.cloudRecord
}

function orderResolutions(
  recommended: SyncConflictResolution | null,
  resolutions: SyncConflictResolution[],
): SyncConflictResolution[] {
  if (!recommended || !resolutions.includes(recommended)) {
    return resolutions
  }

  return [recommended, ...resolutions.filter((item) => item !== recommended)]
}

function describeResolveError(error: unknown): string {
  const message = error instanceof Error ? error.message : '冲突处理失败，请稍后重试。'

  if (message === 'Conflict not found.') {
    return '主库已经找不到这条冲突，当前未自动清理本地冲突或另存副本。你可以刷新同步状态后再试。'
  }

  return message
}

function getNewestSide(conflict: StorageConflictRecord): 'local' | 'cloud' | 'same' | null {
  if (!conflict.localRecord || !conflict.cloudRecord) {
    return null
  }

  if (conflict.localRecord.updatedAt > conflict.cloudRecord.updatedAt) {
    return 'local'
  }

  if (conflict.cloudRecord.updatedAt > conflict.localRecord.updatedAt) {
    return 'cloud'
  }

  return 'same'
}

function formatDiffValue(value: unknown): string {
  if (value === undefined) return '未提供'
  if (value === null) return '空'
  if (typeof value === 'string') return value.length > 80 ? `${value.slice(0, 77)}...` : value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `${value.length} 项`
  if (isPayloadObject(value)) return `${Object.keys(value).length} 个字段`
  return String(value)
}

function formatDiffPath(path: string): string {
  if (!path) {
    return '内容'
  }

  return path
    .split('.')
    .map((part) => {
      if (/^\d+$/.test(part)) return `[${part}]`
      if (part === 'title') return '标题'
      if (part === 'updatedAt') return '更新时间'
      if (part === 'createdAt') return '创建时间'
      if (part === 'topics') return '主题'
      if (part === 'knowledgeImports') return '知识导入'
      if (part === 'messages') return '消息'
      if (part === 'documentId') return '文档 ID'
      if (part === 'sessionId') return '会话 ID'
      return part
    })
    .join(' / ')
}

function collectDiffEntries(
  localValue: unknown,
  cloudValue: unknown,
): { entries: ConflictDiffEntry[]; totalCount: number } {
  const entries: ConflictDiffEntry[] = []

  const walk = (left: unknown, right: unknown, path: string): number => {
    if (Object.is(left, right)) {
      return 0
    }

    if (Array.isArray(left) && Array.isArray(right)) {
      let count = 0

      if (left.length !== right.length) {
        count += 1
        if (entries.length < MAX_DIFF_ENTRIES) {
          entries.push({
            path: formatDiffPath(path ? `${path}.length` : 'length'),
            localValue: String(left.length),
            cloudValue: String(right.length),
          })
        }
      }

      const length = Math.max(left.length, right.length)
      for (let index = 0; index < length; index += 1) {
        count += walk(left[index], right[index], path ? `${path}.${index}` : String(index))
      }

      return count
    }

    if (isPayloadObject(left) && isPayloadObject(right)) {
      let count = 0
      const keys = Array.from(new Set([...Object.keys(left), ...Object.keys(right)])).sort()

      for (const key of keys) {
        count += walk(left[key], right[key], path ? `${path}.${key}` : key)
      }

      if (count === 0) {
        if (entries.length < MAX_DIFF_ENTRIES) {
          entries.push({
            path: formatDiffPath(path),
            localValue: formatDiffValue(left),
            cloudValue: formatDiffValue(right),
          })
        }

        return 1
      }

      return count
    }

    if (entries.length < MAX_DIFF_ENTRIES) {
      entries.push({
        path: formatDiffPath(path),
        localValue: formatDiffValue(left),
        cloudValue: formatDiffValue(right),
      })
    }

    return 1
  }

  const totalCount = walk(localValue, cloudValue, '')
  return { entries, totalCount }
}

export function StorageConflictDialog({
  conflict,
  onResolve,
  onDiscardLocalConflict,
  onDismiss,
}: StorageConflictDialogProps) {
  const [resolvingResolution, setResolvingResolution] = useState<SyncConflictResolution | null>(null)
  const [isDiscardingLocal, setIsDiscardingLocal] = useState(false)
  const [resolveError, setResolveError] = useState<string | null>(null)

  useEffect(() => {
    setResolveError(null)
    setResolvingResolution(null)
    setIsDiscardingLocal(false)
  }, [conflict?.id])

  const diffSummary = useMemo(() => {
    if (!conflict || conflict.localPayload === null || conflict.cloudPayload === null) {
      return { entries: [] as ConflictDiffEntry[], totalCount: 0 }
    }

    return collectDiffEntries(conflict.localPayload, conflict.cloudPayload)
  }, [conflict])

  if (!conflict) {
    return null
  }

  const title =
    conflict.entityType === 'document'
      ? `文档冲突：${resolveTitle(conflict)}`
      : `会话冲突：${resolveTitle(conflict)}`
  const isAnalyzing = conflict.analysisStatus !== 'ready'
  const actionableResolutions =
    conflict.actionableResolutions.length > 0
      ? conflict.actionableResolutions
      : getFallbackResolutions(conflict)
  const orderedResolutions = orderResolutions(conflict.recommendedResolution, actionableResolutions)
  const allowDiscardLocal = Boolean(onDiscardLocalConflict) && canDiscardLocalConflict(conflict)
  const isResolving = resolvingResolution !== null || isDiscardingLocal
  const newestSide = getNewestSide(conflict)
  const hiddenDiffCount = Math.max(0, diffSummary.totalCount - diffSummary.entries.length)

  const handleResolve = async (
    resolution: SyncConflictResolution,
    mergedPayload?: unknown,
  ): Promise<void> => {
    setResolveError(null)
    setResolvingResolution(resolution)

    try {
      await onResolve(conflict.id, resolution, mergedPayload)
    } catch (error) {
      setResolveError(describeResolveError(error))
    } finally {
      setResolvingResolution(null)
    }
  }

  const handleDiscardLocal = async (): Promise<void> => {
    if (!onDiscardLocalConflict) {
      return
    }

    setResolveError(null)
    setIsDiscardingLocal(true)

    try {
      await onDiscardLocalConflict(conflict.id)
    } catch (error) {
      setResolveError(describeResolveError(error))
    } finally {
      setIsDiscardingLocal(false)
    }
  }

  return (
    <div className={styles.overlay} data-testid="storage-conflict-dialog" onClick={onDismiss}>
      <SurfacePanel frosted className={styles.dialog} onClick={(event) => event.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.titleBlock}>
            <h3 className={styles.title}>{title}</h3>
            <p className={styles.subtitle}>
              检测到本地缓存版本和 Postgres 主库权威版本存在冲突。系统会按更新时间给出建议，并展示差异供你确认，不会自动覆盖任何一侧内容。
            </p>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            data-testid="storage-conflict-dismiss"
            onClick={onDismiss}
          >
            稍后处理
          </button>
        </div>

        <div className={styles.compareGrid}>
          <div className={styles.compareCard}>
            <div className={styles.cardHead}>
              <span className={styles.cardLabel}>本地版本</span>
              {newestSide === 'local' ? <span className={styles.cardBadge}>较新版本</span> : null}
            </div>
            <span className={styles.cardMeta}>更新时间：{formatTimestamp(conflict.localRecord?.updatedAt ?? null)}</span>
            <span className={styles.cardMeta}>哈希：{conflict.localRecord?.contentHash ?? '未知'}</span>
            <span className={styles.cardMeta}>
              状态：{describeRecordState(Boolean(conflict.localRecord), conflict.localRecord?.deletedAt)}
            </span>
          </div>

          <div className={styles.compareCard}>
            <div className={styles.cardHead}>
              <span className={styles.cardLabel}>主库版本</span>
              {newestSide === 'cloud' ? <span className={styles.cardBadge}>较新版本</span> : null}
            </div>
            <span className={styles.cardMeta}>更新时间：{formatTimestamp(conflict.cloudRecord?.updatedAt ?? null)}</span>
            <span className={styles.cardMeta}>哈希：{conflict.cloudRecord?.contentHash ?? '未知'}</span>
            <span className={styles.cardMeta}>
              状态：{describeRecordState(Boolean(conflict.cloudRecord), conflict.cloudRecord?.deletedAt)}
            </span>
          </div>
        </div>

        <section className={styles.analysisPanel} data-testid="storage-conflict-analysis" aria-live="polite">
          <div className={styles.analysisHead}>
            <span className={styles.analysisLabel}>分析结果</span>
            <span className={styles.analysisMeta}>
              来源：{describeAnalysisSource(conflict)} | 置信度：{describeConfidence(conflict)}
            </span>
          </div>

          {isAnalyzing ? (
            <div className={styles.pendingState} data-testid="storage-conflict-analysis-pending">
              <div className={styles.spinner} aria-hidden="true" />
              <div>
                <strong className={styles.pendingTitle}>正在整理差异</strong>
                <p className={styles.pendingText}>
                  系统正在根据更新时间和内容差异生成建议，稍后就会展示可确认的处理方案。
                </p>
              </div>
            </div>
          ) : (
            <div className={styles.analysisReady} data-testid="storage-conflict-analysis-ready">
              <div className={styles.recommendCard} data-testid="storage-conflict-recommendation-card">
                <span className={styles.recommendLabel}>推荐动作</span>
                <strong className={styles.recommendValue}>
                  {describeResolution(conflict, conflict.recommendedResolution)}
                </strong>
                <p className={styles.recommendSummary}>
                  {conflict.summary ?? '当前已生成规则建议，请结合下方差异确认。'}
                </p>
                {conflict.analysisNote ? <p className={styles.analysisNote}>{conflict.analysisNote}</p> : null}
              </div>

              {conflict.reasons.length > 0 ? (
                <ul className={styles.reasonList}>
                  {conflict.reasons.map((reason, index) => (
                    <li key={`${conflict.id}:reason:${index}`}>{reason}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </section>

        <section className={styles.diffPanel} data-testid="storage-conflict-diff">
          <div className={styles.diffHead}>
            <span className={styles.diffLabel}>差异对比</span>
            <span className={styles.diffMeta}>
              {diffSummary.totalCount > 0 ? `共发现 ${diffSummary.totalCount} 处差异` : '当前没有可展示的结构化差异'}
            </span>
          </div>

          {diffSummary.entries.length > 0 ? (
            <div className={styles.diffList}>
              {diffSummary.entries.map((entry) => (
                <div key={`${conflict.id}:${entry.path}`} className={styles.diffRow}>
                  <span className={styles.diffPath}>{entry.path}</span>
                  <span className={styles.diffValueLocal}>本地：{entry.localValue}</span>
                  <span className={styles.diffValueCloud}>主库：{entry.cloudValue}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.diffEmpty}>当前无法提取结构化差异，请结合更新时间和标题确认处理方式。</p>
          )}

          {hiddenDiffCount > 0 ? (
            <p className={styles.diffNote}>
              仅展示前 {diffSummary.entries.length} 处差异，剩余 {hiddenDiffCount} 处未展开。
            </p>
          ) : null}
        </section>

        {resolveError ? (
          <div className={styles.errorPanel} role="alert" data-testid="storage-conflict-resolve-error">
            <div>
              <strong className={styles.errorTitle}>处理冲突失败</strong>
              <p className={styles.errorText}>{resolveError}</p>
            </div>
            <Button tone="secondary" onClick={() => setResolveError(null)}>
              重新选择处理方式
            </Button>
          </div>
        ) : null}

        <div className={styles.actions} data-testid="storage-conflict-actions">
          {allowDiscardLocal ? (
            <Button
              tone="danger"
              data-testid="storage-conflict-discard-local"
              disabled={isResolving}
              onClick={() => void handleDiscardLocal()}
            >
              {isDiscardingLocal ? '正在清理...' : '删除本地并清除冲突'}
            </Button>
          ) : null}
          {isAnalyzing ? (
            <Button tone="primary" disabled>
              正在整理建议...
            </Button>
          ) : (
            orderedResolutions.map((resolution) => {
              const isPrimary = resolution === conflict.recommendedResolution
              const requiresMergedPayload = resolution === 'merged_payload'
              const disabled = requiresMergedPayload && !conflict.mergedPayload

              return (
                <Button
                  key={resolution}
                  tone={isPrimary ? 'primary' : 'secondary'}
                  data-testid={`storage-conflict-action-${resolution}`}
                  disabled={disabled || isResolving}
                  onClick={() =>
                    void handleResolve(
                      resolution,
                      requiresMergedPayload ? conflict.mergedPayload ?? undefined : undefined,
                    )
                  }
                >
                  {resolvingResolution === resolution ? '正在处理...' : describeResolution(conflict, resolution)}
                </Button>
              )
            })
          )}
        </div>
      </SurfacePanel>
    </div>
  )
}
