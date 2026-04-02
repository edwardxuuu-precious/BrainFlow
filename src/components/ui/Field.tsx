import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { Icon } from './icons'
import styles from './Field.module.css'

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

type InputProps = InputHTMLAttributes<HTMLInputElement>
type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

export function Input({ className, ...props }: InputProps) {
  return (
    <label className={classNames(styles.field, className)}>
      <input className={styles.input} {...props} />
    </label>
  )
}

export function SearchField({ className, ...props }: InputProps) {
  return (
    <label className={classNames(styles.searchField, className)}>
      <Icon name="search" size={16} className={styles.searchIcon} />
      <input className={styles.input} type="search" {...props} />
    </label>
  )
}

export function TextArea({ className, ...props }: TextAreaProps) {
  return (
    <label className={classNames(styles.field, className)}>
      <textarea className={styles.textarea} {...props} />
    </label>
  )
}
