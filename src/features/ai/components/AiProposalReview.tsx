import type { AiCanvasProposal } from '../../../../shared/ai-contract'
import { Button, StatusPill } from '../../../components/ui'
import styles from './AiProposalReview.module.css'

interface AiProposalReviewProps {
  proposal: AiCanvasProposal
  resolveTopicTitle: (topicId: string) => string
  onApply: () => void
  onDismiss: () => void
}

function describeOperation(
  proposal: AiCanvasProposal,
  resolveTopicTitle: (topicId: string) => string,
): string[] {
  return proposal.operations.map((operation) => {
    switch (operation.type) {
      case 'create_child':
        return `在“${resolveTopicTitle(operation.parentTopicId)}”下新增子主题“${operation.title}”`
      case 'create_sibling':
        return `在“${resolveTopicTitle(operation.targetTopicId)}”后新增同级主题“${operation.title}”`
      case 'update_topic':
        return `更新“${resolveTopicTitle(operation.topicId)}”${
          operation.title ? ` 的标题为“${operation.title}”` : ''
        }${operation.note !== undefined ? ' 并同步备注' : ''}`
    }
  })
}

export function AiProposalReview({
  proposal,
  resolveTopicTitle,
  onApply,
  onDismiss,
}: AiProposalReviewProps) {
  return (
    <section className={styles.review} aria-label="AI 提案审批">
      <div className={styles.header}>
        <StatusPill tone="accent">待审批提案</StatusPill>
        <span className={styles.summary}>{proposal.summary}</span>
      </div>

      <ol className={styles.operations}>
        {describeOperation(proposal, resolveTopicTitle).map((text) => (
          <li key={text} className={styles.operation}>
            {text}
          </li>
        ))}
      </ol>

      <div className={styles.actions}>
        <Button tone="primary" iconStart="check" onClick={onApply}>
          应用到脑图
        </Button>
        <Button tone="secondary" iconStart="close" onClick={onDismiss}>
          放弃提案
        </Button>
      </div>
    </section>
  )
}
