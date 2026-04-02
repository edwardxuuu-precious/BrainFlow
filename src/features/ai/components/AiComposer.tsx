import { Button, TextArea } from '../../../components/ui'
import styles from './AiComposer.module.css'

interface AiComposerProps {
  value: string
  isSending: boolean
  disabled?: boolean
  disabledHint?: string
  onChange: (value: string) => void
  onSubmit: () => void
}

export function AiComposer({
  value,
  isSending,
  disabled = false,
  disabledHint,
  onChange,
  onSubmit,
}: AiComposerProps) {
  const hint = disabled
    ? (disabledHint ?? '当前不可发送。')
    : 'Ctrl/Cmd + Enter 发送。Codex 只会返回待你批准的本地脑图提案。'

  return (
    <section className={styles.composer}>
      <TextArea
        value={value}
        rows={4}
        disabled={disabled || isSending}
        className={styles.field}
        aria-label="AI 提问输入框"
        placeholder={disabled ? '当前不可发送，请先修复验证或选择节点。' : '描述你的真实问题，或说明希望如何扩展当前选区。'}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault()
            if (!disabled) {
              onSubmit()
            }
          }
        }}
      />

      <div className={styles.footer}>
        <p className={styles.hint}>{hint}</p>
        <Button tone="primary" iconStart="send" disabled={disabled || isSending || !value.trim()} onClick={onSubmit}>
          {isSending ? '正在思考' : '发送给 AI'}
        </Button>
      </div>
    </section>
  )
}
