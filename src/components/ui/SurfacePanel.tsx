import type { HTMLAttributes } from 'react'
import styles from './SurfacePanel.module.css'

interface SurfacePanelProps extends HTMLAttributes<HTMLDivElement> {
  frosted?: boolean
  muted?: boolean
  compact?: boolean
}

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

export function SurfacePanel({
  frosted = false,
  muted = false,
  compact = false,
  className,
  ...props
}: SurfacePanelProps) {
  return (
    <div
      className={classNames(
        styles.panel,
        frosted && styles.frosted,
        muted && styles.muted,
        compact && styles.compact,
        className,
      )}
      {...props}
    />
  )
}
