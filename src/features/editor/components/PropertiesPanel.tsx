import type { BranchSide, TopicNode } from '../../documents/types'
import styles from './PropertiesPanel.module.css'

interface PropertiesPanelProps {
  topic: TopicNode | null
  isRoot: boolean
  isFirstLevel: boolean
  onRename: () => void
  onAddChild: () => void
  onAddSibling: () => void
  onDelete: () => void
  onNoteChange: (note: string) => void
  onBranchSideChange: (side: BranchSide) => void
  onResetPosition: () => void
}

const sideOptions: BranchSide[] = ['auto', 'left', 'right']

export function PropertiesPanel({
  topic,
  isRoot,
  isFirstLevel,
  onRename,
  onAddChild,
  onAddSibling,
  onDelete,
  onNoteChange,
  onBranchSideChange,
  onResetPosition,
}: PropertiesPanelProps) {
  if (!topic) {
    return (
      <section className={styles.panel}>
        <div className={styles.placeholder}>
          <span className={styles.sectionLabel}>Inspector</span>
          <h2 className={styles.heading}>未选中主题</h2>
          <p className={styles.empty}>点击节点后，可在这里编辑备注、调整一级分支方向，或重置手工位置。</p>
        </div>
      </section>
    )
  }

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <div>
          <span className={styles.sectionLabel}>Inspector</span>
          <h2 className={styles.heading}>{isRoot ? '中心主题' : isFirstLevel ? '一级分支' : '普通主题'}</h2>
        </div>
        <button type="button" className={styles.linkButton} onClick={onRename}>
          重命名
        </button>
      </div>

      <div className={styles.block}>
        <label className={styles.label} htmlFor="topic-note">
          备注
        </label>
        <textarea
          id="topic-note"
          value={topic.note}
          className={styles.note}
          rows={7}
          placeholder="记录上下文、待办，或者补充说明。"
          onChange={(event) => onNoteChange(event.target.value)}
        />
      </div>

      <div className={styles.block}>
        <span className={styles.label}>一级分支方向</span>
        <div className={styles.segmented} role="group" aria-label="一级分支方向">
          {sideOptions.map((side) => (
            <button
              key={side}
              type="button"
              disabled={!isFirstLevel}
              className={`${styles.segment} ${topic.branchSide === side ? styles.segmentActive : ''}`}
              onClick={() => onBranchSideChange(side)}
            >
              {side === 'auto' ? '自动' : side === 'left' ? '左侧' : '右侧'}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.block}>
        <span className={styles.label}>位置</span>
        <button type="button" className={styles.secondaryButton} onClick={onResetPosition}>
          重置位置
        </button>
      </div>

      <div className={styles.block}>
        <span className={styles.label}>操作</span>
        <div className={styles.actions}>
          <button type="button" className={styles.primaryButton} onClick={onAddChild}>
            新增子主题
          </button>
          {!isRoot ? (
            <button type="button" className={styles.secondaryButton} onClick={onAddSibling}>
              新增同级主题
            </button>
          ) : null}
          {!isRoot ? (
            <button type="button" className={styles.secondaryButton} onClick={onDelete}>
              删除主题
            </button>
          ) : null}
        </div>
      </div>
    </section>
  )
}
