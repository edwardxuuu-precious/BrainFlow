import styles from './SegmentedControl.module.css'

interface SegmentOption<T extends string> {
  value: T
  label: string
  disabled?: boolean
}

interface SegmentedControlProps<T extends string> {
  value: T
  options: SegmentOption<T>[]
  ariaLabel: string
  onChange: (value: T) => void
}

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

export function SegmentedControl<T extends string>({
  value,
  options,
  ariaLabel,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div className={styles.root}>
      <div
        className={styles.track}
        role="group"
        aria-label={ariaLabel}
        style={{ ['--segment-count' as string]: options.length }}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={option.disabled}
            className={classNames(styles.segment, option.value === value && styles.active)}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
