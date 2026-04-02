import type { HTMLAttributes } from 'react'
import styles from './StatusPill.module.css'

type PillTone = 'neutral' | 'accent' | 'soft'

interface StatusPillProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: PillTone
}

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

export function StatusPill({ tone = 'neutral', className, ...props }: StatusPillProps) {
  return <span className={classNames(styles.pill, styles[tone], className)} {...props} />
}
