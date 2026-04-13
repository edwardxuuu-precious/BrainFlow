import { useState } from 'react'
import styles from './SaveIndicator.module.css'

interface SaveIndicatorProps {
  localSavedAt: number | null
  cloudSyncedAt: number | null
  isDirty: boolean
  isSyncing: boolean
  hasConflict?: boolean
}

function formatTime(timestamp: number | null): string {
  if (!timestamp) {
    return '暂无记录'
  }

  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(timestamp)
}

export function SaveIndicator({
  localSavedAt,
  cloudSyncedAt,
  isDirty,
  isSyncing,
  hasConflict = false,
}: SaveIndicatorProps) {
  const [showTooltip, setShowTooltip] = useState(false)

  const statusText = hasConflict
    ? '主库冲突待处理'
    : isDirty
      ? '等待本地保存'
      : isSyncing
        ? '正在同步到主库'
        : cloudSyncedAt
          ? '已同步到主库'
          : localSavedAt
            ? '仅本地已保存'
            : '尚未保存'

  return (
    <div
      className={styles.container}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span
        className={[styles.dot, isDirty || hasConflict ? styles.dotDirty : styles.dotSaved].join(' ')}
        aria-label={statusText}
      />
      {showTooltip ? (
        <div className={styles.tooltip}>
          <span className={styles.tooltipText}>
            {statusText}
            <br />
            本地已保存：{formatTime(localSavedAt)}
            <br />
            主库已同步：{formatTime(cloudSyncedAt)}
          </span>
        </div>
      ) : null}
    </div>
  )
}
