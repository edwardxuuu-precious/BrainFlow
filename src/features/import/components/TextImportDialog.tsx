import type {
  TextImportConflict,
  TextImportPreviewNode,
  TextImportPreprocessHint,
  TextImportSourceType,
} from '../../../../shared/ai-contract'
import { Button, IconButton, Input, SurfacePanel, TextArea } from '../../../components/ui'
import styles from './TextImportDialog.module.css'

interface TextImportDialogProps {
  open: boolean
  sourceName: string | null
  sourceType: TextImportSourceType | null
  rawText: string
  draftSourceName: string
  draftText: string
  preprocessedHints: TextImportPreprocessHint[]
  preview: {
    summary: string
    conflicts: TextImportConflict[]
    operations: Array<{ risk: 'low' | 'high' }>
    warnings?: string[]
  } | null
  previewTree: TextImportPreviewNode[]
  approvedConflictIds: string[]
  statusText: string
  error: string | null
  isPreviewing: boolean
  isApplying: boolean
  onClose: () => void
  onChooseFile: () => void
  onDraftSourceNameChange: (value: string) => void
  onDraftTextChange: (value: string) => void
  onGenerateFromText: () => void
  onToggleConflict: (conflictId: string) => void
  onApply: () => void
}

function PreviewTree({ nodes }: { nodes: TextImportPreviewNode[] }) {
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

export function TextImportDialog({
  open,
  sourceName,
  sourceType,
  rawText,
  draftSourceName,
  draftText,
  preprocessedHints,
  preview,
  previewTree,
  approvedConflictIds,
  statusText,
  error,
  isPreviewing,
  isApplying,
  onClose,
  onChooseFile,
  onDraftSourceNameChange,
  onDraftTextChange,
  onGenerateFromText,
  onToggleConflict,
  onApply,
}: TextImportDialogProps) {
  if (!open) {
    return null
  }

  const lowRiskCount = preview?.operations.filter((operation) => operation.risk === 'low').length ?? 0
  const highRiskCount =
    preview?.operations.filter((operation) => operation.risk === 'high').length ?? 0
  const sourceLength = rawText.length || draftText.length

  return (
    <div className={styles.overlay} role="presentation">
      <SurfacePanel
        role="dialog"
        aria-modal="true"
        aria-labelledby="text-import-title"
        className={styles.dialog}
      >
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>智能导入</p>
            <h2 id="text-import-title" className={styles.title}>
              AI 文本整理与合并预览
            </h2>
          </div>
          <IconButton label="关闭导入预览" icon="close" tone="ghost" size="sm" onClick={onClose} />
        </div>

        <div className={styles.inputPanel}>
          <div className={styles.inputHeader}>
            <div>
              <h3 className={styles.sectionTitle}>输入来源</h3>
              <p className={styles.empty}>
                支持 `.md`、`.txt`、无扩展名文本文件，也支持直接粘贴原文。
              </p>
            </div>
            <Button tone="secondary" onClick={onChooseFile} disabled={isPreviewing || isApplying}>
              选择文本文件
            </Button>
          </div>

          <div className={styles.inputGrid}>
            <div className={styles.sourceField}>
              <span className={styles.metaLabel}>来源名称</span>
              <Input
                value={draftSourceName}
                placeholder="例如：会议纪要 / 粘贴文本 / GTM_main"
                onChange={(event) => onDraftSourceNameChange(event.target.value)}
                disabled={isPreviewing || isApplying}
              />
            </div>
            <div className={styles.sourceField}>
              <span className={styles.metaLabel}>来源类型</span>
              <div className={styles.sourceTypeValue}>
                {sourceType === 'file' ? '文件' : sourceType === 'paste' ? '粘贴文本' : '未指定'}
              </div>
            </div>
          </div>

          <TextArea
            className={styles.textArea}
            value={draftText}
            placeholder="将任意文本粘贴到这里，然后生成 AI 导入预览。"
            onChange={(event) => onDraftTextChange(event.target.value)}
            disabled={isPreviewing || isApplying}
          />

          <div className={styles.inputActions}>
            <Button
              tone="primary"
              onClick={onGenerateFromText}
              disabled={isPreviewing || isApplying || !draftText.trim()}
            >
              {isPreviewing ? '生成预览中…' : '生成智能预览'}
            </Button>
          </div>
        </div>

        <div className={styles.metaGrid}>
          <div className={styles.metaCard}>
            <span className={styles.metaLabel}>来源名称</span>
            <strong>{(sourceName ?? draftSourceName) || '未命名来源'}</strong>
          </div>
          <div className={styles.metaCard}>
            <span className={styles.metaLabel}>来源类型</span>
            <strong>{sourceType === 'file' ? '文件' : sourceType === 'paste' ? '粘贴文本' : '未指定'}</strong>
          </div>
          <div className={styles.metaCard}>
            <span className={styles.metaLabel}>原文长度</span>
            <strong>{sourceLength}</strong>
          </div>
          <div className={styles.metaCard}>
            <span className={styles.metaLabel}>预处理线索</span>
            <strong>{preprocessedHints.length}</strong>
          </div>
          <div className={styles.metaCard}>
            <span className={styles.metaLabel}>自动项 / 待确认</span>
            <strong>
              {lowRiskCount} / {highRiskCount}
            </strong>
          </div>
        </div>

        {statusText ? <p className={styles.status}>{statusText}</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}
        {preview?.summary ? <p className={styles.summary}>{preview.summary}</p> : null}

        <div className={styles.content}>
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>结构化预览</h3>
            {isPreviewing && previewTree.length === 0 ? (
              <p className={styles.empty}>正在生成导入预览…</p>
            ) : (
              <PreviewTree nodes={previewTree} />
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
