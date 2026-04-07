import { IconButton } from '../../../components/ui'
import styles from './SidebarRail.module.css'

interface SidebarRailProps {
  side: 'left' | 'right'
  controlsId: string
  expanded: boolean
  label: string
  className?: string
  onToggle: () => void
}

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

export function SidebarRail({
  side,
  controlsId,
  expanded,
  label,
  className,
  onToggle,
}: SidebarRailProps) {
  return (
    <div className={classNames(styles.rail, className)} data-side={side}>
      <IconButton
        label={label}
        icon="back"
        size="sm"
        tone="primary"
        className={styles.toggle}
        aria-controls={controlsId}
        aria-expanded={expanded}
        onClick={onToggle}
      />
    </div>
  )
}
