import type { HTMLAttributes } from 'react'
import styles from './ToolbarGroup.module.css'

interface ToolbarGroupProps extends HTMLAttributes<HTMLDivElement> {
  tight?: boolean
}

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

export function ToolbarGroup({ tight = false, className, ...props }: ToolbarGroupProps) {
  return <div className={classNames(styles.group, className)} data-tight={tight} {...props} />
}
