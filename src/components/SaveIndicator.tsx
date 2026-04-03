import { useState } from 'react';
import styles from './SaveIndicator.module.css';

interface SaveIndicatorProps {
  lastSavedAt: number | null;
  isDirty: boolean;
}

export function SaveIndicator({ lastSavedAt, isDirty }: SaveIndicatorProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const formatTime = (timestamp: number | null): string => {
    if (!timestamp) {
      return '尚未保存';
    }
    return new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(timestamp);
  };

  return (
    <div
      className={styles.container}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span
        className={[styles.dot, isDirty ? styles.dotDirty : styles.dotSaved].join(' ')}
        aria-label={isDirty ? '等待保存' : '已自动保存'}
      />
      {showTooltip && (
        <div className={styles.tooltip}>
          <span className={styles.tooltipText}>
            {isDirty ? '等待自动保存...' : `上次保存: ${formatTime(lastSavedAt)}`}
          </span>
        </div>
      )}
    </div>
  );
}
