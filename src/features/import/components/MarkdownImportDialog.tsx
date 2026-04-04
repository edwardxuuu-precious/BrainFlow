import type {
  MarkdownImportConflict,
  MarkdownImportPreviewNode,
} from '../../../../shared/ai-contract'
import { Button, IconButton, SurfacePanel } from '../../../components/ui'
import type { MarkdownImportPreprocessedNode } from '../../../../shared/ai-contract'
import styles from './MarkdownImportDialog.module.css'

interface MarkdownImportDialogProps {
  open: boolean
  fileName: string | null
  preprocessedTree: MarkdownImportPreprocessedNode[]
  preview: {
    summary: string
    previewTree: MarkdownImportPreviewNode[]
    conflicts: MarkdownImportConflict[]
    operations: Array<{ risk: 'low' | 'high' }>
    warnings?: string[]
  } | null
  approvedConflictIds: string[]
  statusText: string
  error: string | null
  isPreviewing: boolean
  isApplying: boolean
  onClose: () => void
  onToggleConflict: (conflictId: string) => void
  onApply: () => void
}

function PreviewTree({ nodes }: { nodes: MarkdownImportPreviewNode[] }) {
  if (nodes.length === 0) {
    return <p className={styles.empty}>当前没有可展示的结构化预览。</p>
  }

  return (
    <ul className={styles.treeList}>
      {nodes.map((node) => (
        <li key={node.id} className={styles.treeItem}>
          <div className={styles.treeCard} data-relation={node.relation}>
            <div className={styles.treeTitleRow}>
              <strong>{node.title}</strong>
              <span className={styles.treeBadge}>
                {node.relation === 'new' ? '新增' : node.relation === 'merge' ? '合并' : '冲突'}
              </span>
            </div>
            {node.reason ? <p className={styles.treeReason}>{node.reason}</p> : null}
            {node.note ? <p className={styles.treeNote}>{node.note}</p> : null}
          </div>
          {node.children.length > 0 ? <PreviewTree nodes={node.children} /> : null}
        </li>
      ))}
    </ul>
  )
}

export function MarkdownImportDialog({
  open,
  fileName,
  preprocessedTree,
  preview,
  approvedConflictIds,
  statusText,
  error,
  isPreviewing,
  isApplying,
  onClose,
  onToggleConflict,
  onApply,
}: MarkdownImportDialogProps) {
  if (!open) {
    return null
  }

  const lowRiskCount = preview?.operations.filter((operation) => operation.risk === 'low').length ?? 0
  const highRiskCount =
    preview?.operations.filter((operation) => operation.risk === 'high').length ?? 0

  return (
    <div className={styles.overlay} role="presentation">
      <SurfacePanel
        role="dialog"
        aria-modal="true"
        aria-labelledby="markdown-import-title"
        className={styles.dialog}
      >
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Markdown 导入</p>
            <h2 id="markdown-import-title" className={styles.title}>
              智能合并预览
            </h2>
          </div>
          <IconButton label="关闭导入预览" icon="close" tone="ghost" size="sm" onClick={onClose} />
        </div>

        <div className={styles.metaGrid}>
          <div className={styles.metaCard}>
            <span className={styles.metaLabel}>文件</span>
            <strong>{fileName ?? '未选择文件'}</strong>
          </div>
          <div className={styles.metaCard}>
            <span className={styles.metaLabel}>预处理节点</span>
            <strong>{preprocessedTree.length}</strong>
          </div>
          <div className={styles.metaCard}>
            <span className={styles.metaLabel}>自动项</span>
            <strong>{lowRiskCount}</strong>
          </div>
          <div className={styles.metaCard}>
            <span className={styles.metaLabel}>待确认项</span>
            <strong>{highRiskCount}</strong>
          </div>
        </div>

        {statusText ? <p className={styles.status}>{statusText}</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}
        {preview?.summary ? <p className={styles.summary}>{preview.summary}</p> : null}

        <div className={styles.content}>
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>结构化预览</h3>
            {isPreviewing && !preview ? (
              <p className={styles.empty}>正在生成导入预览…</p>
            ) : (
              <PreviewTree nodes={preview?.previewTree ?? []} />
            )}
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>冲突与确认</h3>
            {!preview?.conflicts.length ? (
              <p className={styles.empty}>当前没有需要手动确认的高风险冲突。</p>
            ) : (
              <div className={styles.conflictList}>
                {preview.conflicts.map((conflict) => {
                  const checked = approvedConflictIds.includes(conflict.id)
                  return (
                    <label key={conflict.id} className={styles.conflictItem}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleConflict(conflict.id)}
                      />
                      <div>
                        <div className={styles.conflictHeader}>
                          <strong>{conflict.title}</strong>
                          <span className={styles.conflictKind}>{conflict.kind}</span>
                        </div>
                        <p className={styles.conflictDescription}>{conflict.description}</p>
                      </div>
                    </label>
                  )
                })}
              </div>
            )}

            {preview?.warnings?.length ? (
              <div className={styles.warningList}>
                {preview.warnings.map((warning) => (
                  <p key={warning} className={styles.warningItem}>
                    {warning}
                  </p>
                ))}
              </div>
            ) : null}
          </section>
        </div>

        <div className={styles.footer}>
          <Button tone="ghost" onClick={onClose} disabled={isApplying}>
            关闭
          </Button>
          <Button
            tone="primary"
            iconStart="document"
            onClick={onApply}
            disabled={!preview || isPreviewing || isApplying}
          >
            {isApplying ? '应用中…' : '应用到脑图'}
          </Button>
        </div>
      </SurfacePanel>
    </div>
  )
}
