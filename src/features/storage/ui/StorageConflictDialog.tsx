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
  onDismiss: () => void
}

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
    case 'ai':
      return 'AI 深度分析'
    case 'heuristic_fallback':
      return '规则回退建议'
    case 'heuristic':
      return '规则建议'
    default:
      return '等待分析'
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

function describeResolution(resolution: SyncConflictResolution | null): string {
  switch (resolution) {
    case 'use_cloud':
      return '采用云端版本'
    case 'save_local_copy':
      return '保留本地并另存副本'
    case 'merged_payload':
      return '采用合并建议'
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

function orderResolutions(
  recommended: SyncConflictResolution | null,
  resolutions: SyncConflictResolution[],
): SyncConflictResolution[] {
  if (!recommended || !resolutions.includes(recommended)) {
    return resolutions
  }

  return [recommended, ...resolutions.filter((item) => item !== recommended)]
}

export function StorageConflictDialog({
  conflict,
  onResolve,
  onDismiss,
}: StorageConflictDialogProps) {
  if (!conflict) {
    return null
  }

  const title =
    conflict.entityType === 'document'
      ? `文档冲突：${resolveTitle(conflict)}`
      : `AI 会话冲突：${resolveTitle(conflict)}`
  const isAnalyzing = conflict.analysisStatus !== 'ready'
  const actionableResolutions =
    conflict.actionableResolutions.length > 0
      ? conflict.actionableResolutions
      : getFallbackResolutions(conflict)
  const orderedResolutions = orderResolutions(conflict.recommendedResolution, actionableResolutions)

  return (
    <div className={styles.overlay} onClick={onDismiss}>
      <SurfacePanel
        frosted
        className={styles.dialog}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <div className={styles.titleBlock}>
            <h3 className={styles.title}>{title}</h3>
            <p className={styles.subtitle}>
              检测到本地缓存版本和云端权威版本存在冲突。系统只会给出建议，不会自动覆盖任何一侧内容。
            </p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onDismiss}>
            稍后处理
          </button>
        </div>

        <div className={styles.compareGrid}>
          <div className={styles.compareCard}>
            <span className={styles.cardLabel}>本地版本</span>
            <span className={styles.cardMeta}>
              更新时间：{formatTimestamp(conflict.localRecord?.updatedAt ?? null)}
            </span>
            <span className={styles.cardMeta}>哈希：{conflict.localRecord?.contentHash ?? '未知'}</span>
            <span className={styles.cardMeta}>
              状态：{describeRecordState(Boolean(conflict.localRecord), conflict.localRecord?.deletedAt)}
            </span>
          </div>
          <div className={styles.compareCard}>
            <span className={styles.cardLabel}>云端版本</span>
            <span className={styles.cardMeta}>
              更新时间：{formatTimestamp(conflict.cloudRecord?.updatedAt ?? null)}
            </span>
            <span className={styles.cardMeta}>哈希：{conflict.cloudRecord?.contentHash ?? '未知'}</span>
            <span className={styles.cardMeta}>
              状态：{describeRecordState(Boolean(conflict.cloudRecord), conflict.cloudRecord?.deletedAt)}
            </span>
          </div>
        </div>

        <section className={styles.analysisPanel} aria-live="polite">
          <div className={styles.analysisHead}>
            <span className={styles.analysisLabel}>分析结果</span>
            <span className={styles.analysisMeta}>
              来源：{describeAnalysisSource(conflict)} | 置信度：{describeConfidence(conflict)}
            </span>
          </div>

          {isAnalyzing ? (
            <div className={styles.pendingState}>
              <div className={styles.spinner} aria-hidden="true" />
              <div>
                <strong className={styles.pendingTitle}>正在分析冲突</strong>
                <p className={styles.pendingText}>
                  系统会先做规则判断，必要时再调用 AI 进行深度比较，稍后会给出推荐处理方式。
                </p>
              </div>
            </div>
          ) : (
            <div className={styles.analysisReady}>
              <div className={styles.recommendCard}>
                <span className={styles.recommendLabel}>推荐动作</span>
                <strong className={styles.recommendValue}>
                  {describeResolution(conflict.recommendedResolution)}
                </strong>
                <p className={styles.recommendSummary}>
                  {conflict.summary ?? '分析已完成，但当前没有可展示的摘要。'}
                </p>
                {conflict.analysisNote ? (
                  <p className={styles.analysisNote}>{conflict.analysisNote}</p>
                ) : null}
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

        <div className={styles.actions}>
          {isAnalyzing ? (
            <Button tone="primary" disabled>
              正在分析…
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
                  disabled={disabled}
                  onClick={() =>
                    void onResolve(
                      conflict.id,
                      resolution,
                      requiresMergedPayload ? conflict.mergedPayload ?? undefined : undefined,
                    )
                  }
                >
                  {describeResolution(resolution)}
                </Button>
              )
            })
          )}
        </div>
      </SurfacePanel>
    </div>
  )
}
