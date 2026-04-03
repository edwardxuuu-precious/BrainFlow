import type { AiRunStage } from '../../../../shared/ai-contract'
import { Button, TextArea } from '../../../components/ui'
import styles from './AiComposer.module.css'

interface AiComposerProps {
  value: string
  isSending: boolean
  runStage: AiRunStage
  disabled?: boolean
  disabledHint?: string
  onChange: (value: string) => void
  onSubmit: () => void
}

function describeSendingState(stage: AiRunStage): string {
  switch (stage) {
    case 'checking_status':
      return '检查中'
    case 'building_context':
      return '整理上下文'
    case 'starting_codex':
      return '调用 Codex'
    case 'waiting_first_token':
      return '等待输出'
    case 'streaming':
      return '输出中'
    case 'applying_changes':
      return '应用改动'
    default:
      return '运行中'
  }
}

export function AiComposer({
  value,
  isSending,
  runStage,
  disabled = false,
  disabledHint,
  onChange,
  onSubmit,
}: AiComposerProps) {
  const hint = disabled
    ? (disabledHint ?? '当前不可发送。')
    : 'Ctrl/Cmd + Enter 发送。AI 会先理解整张脑图，再把有效改动直接应用到当前画布。'

  return (
    <section className={styles.composer}>
      <TextArea
        value={value}
        rows={4}
        disabled={disabled || isSending}
        className={styles.field}
        aria-label="AI 提问输入框"
        placeholder={
          disabled
            ? '当前不可发送，请先修复 Codex 验证。'
            : '直接描述你的真实想法，AI 会尽量按你的表达来组织和落图。'
        }
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
        <Button
          tone="primary"
          iconStart="send"
          disabled={disabled || isSending || !value.trim()}
          onClick={onSubmit}
        >
          {isSending ? describeSendingState(runStage) : '发送给 AI'}
        </Button>
      </div>
    </section>
  )
}
