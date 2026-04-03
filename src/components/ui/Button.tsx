import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon, type IconName } from './icons'
import styles from './Button.module.css'

type ButtonTone = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg'

interface BaseButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ButtonTone
  size?: ButtonSize
  iconStart?: IconName
  iconEnd?: IconName
  iconOnly?: boolean
  children?: ReactNode
}

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

export function Button({
  tone = 'secondary',
  size = 'md',
  iconStart,
  iconEnd,
  iconOnly = false,
  className,
  children,
  type = 'button',
  ...props
}: BaseButtonProps) {
  return (
    <button
      type={type}
      className={classNames(
        styles.button,
        styles[tone],
        styles[size],
        iconOnly && styles.iconOnly,
        className,
      )}
      {...props}
    >
      {iconStart ? <Icon name={iconStart} size={size === 'xs' ? 14 : size === 'sm' ? 16 : 18} /> : null}
      {children ? <span className={styles.label}>{children}</span> : null}
      {iconEnd ? <Icon name={iconEnd} size={size === 'xs' ? 14 : size === 'sm' ? 16 : 18} /> : null}
    </button>
  )
}

interface IconButtonProps extends Omit<BaseButtonProps, 'children' | 'iconOnly'> {
  label: string
  icon: IconName
}

export function IconButton({ label, icon, ...props }: IconButtonProps) {
  return <Button aria-label={label} title={label} iconStart={icon} iconOnly {...props} />
}
