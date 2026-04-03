import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { Button, IconButton, SegmentedControl, StatusPill, TextArea } from '../../../components/ui'
import type { BranchSide, TopicNode } from '../../documents/types'
import styles from './PropertiesPanel.module.css'

interface PropertiesPanelProps {
  topic: TopicNode | null
  selectionCount: number
  selectedLockedCount?: number
  selectedUnlockedCount?: number
  isRoot: boolean
  isFirstLevel: boolean
  draftTitle: string
  isInspectorEditing: boolean
  onRenameStart: () => void
  onRenameChange: (value: string) => void
  onRenameCommit: () => void
  onRenameCancel: () => void
  onAddChild: () => void
  onAddSibling: () => void
  onDelete: () => void
  onNoteChange: (note: string) => void
  onBranchSideChange: (side: BranchSide) => void
  onResetPosition: () => void
  onToggleAiLock: (aiLocked: boolean) => void
  onLockSelected?: () => void
  onUnlockSelected?: () => void
  onCollapse?: () => void
  id?: string
  className?: string
  mode?: 'docked' | 'drawer'
  tabs?: ReactNode
}

const sideOptions: BranchSide[] = ['auto', 'left', 'right']

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

export function PropertiesPanel({
  topic,
  selectionCount,
  selectedLockedCount = 0,
  selectedUnlockedCount = 0,
  isRoot,
  isFirstLevel,
  draftTitle,
  isInspectorEditing,
  onRenameStart,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onAddChild,
  onAddSibling,
  onDelete,
  onNoteChange,
  onBranchSideChange,
  onResetPosition,
  onToggleAiLock,
  onLockSelected,
  onUnlockSelected,
  onCollapse,
  id,
  className,
  mode = 'docked',
  tabs,
}: PropertiesPanelProps) {
  const titleInputRef = useRef<HTMLInputElement>(null)
  const skipBlurActionRef = useRef(false)

  useEffect(() => {
    if (!isInspectorEditing) {
      return
    }

    titleInputRef.current?.focus()
    titleInputRef.current?.select()
  }, [isInspectorEditing])

  const isMultiSelection = selectionCount > 1

  return (
    <section id={id} className={classNames(styles.panel, className)} data-mode={mode}>
      <div className={styles.header}>
        {tabs ? <div className={styles.tabs}>{tabs}</div> : null}
        <div className={styles.chrome}>
          <StatusPill tone="soft">Inspector</StatusPill>
          {onCollapse ? (
            <IconButton
              label="隐藏右侧栏"
              icon="back"
              tone="secondary"
              size="sm"
              className={styles.collapseButton}
              aria-controls={id}
              aria-expanded
              onClick={onCollapse}
            />
          ) : null}
        </div>

        {!topic ? (
          <div className={styles.placeholder}>
            <h2 className={styles.heading}>
              {isMultiSelection ? `已选择 ${selectionCount} 个节点` : '未选中主题'}
            </h2>
            <p className={styles.empty}>
              {isMultiSelection
                ? '多选模式下不显示单节点表单。你可以直接批量锁定当前选区，或切换到 AI 把当前选区作为聚焦上下文。'
                : '点击画布中的任意节点后，可以在这里编辑备注、方向、锁定状态和位置。'}
            </p>
            {isMultiSelection ? (
              <div className={styles.multiSelectSummary}>
                <p className={styles.multiSelectStats}>
                  其中 {selectedLockedCount} 个已锁定，{selectedUnlockedCount} 个未锁定
                </p>
                <div className={styles.multiSelectActions}>
                  <Button
                    tone="secondary"
                    iconStart="lock"
                    className={styles.actionButton}
                    disabled={selectedUnlockedCount === 0}
                    onClick={onLockSelected}
                  >
                    锁定所选未锁定节点
                  </Button>
                  <Button
                    tone="ghost"
                    iconStart="unlock"
                    className={styles.actionButton}
                    disabled={selectedLockedCount === 0}
                    onClick={onUnlockSelected}
                  >
                    解锁所选已锁定节点
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className={styles.titleRow}>
            <div className={styles.titleBlock}>
              {isInspectorEditing ? (
                <input
                  ref={titleInputRef}
                  value={draftTitle}
                  className={styles.headingInput}
                  aria-label="编辑主题标题"
                  onBlur={() => {
                    if (skipBlurActionRef.current) {
                      skipBlurActionRef.current = false
                      return
                    }

                    onRenameCommit()
                  }}
                  onChange={(event) => onRenameChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      skipBlurActionRef.current = true
                      onRenameCommit()
                    }

                    if (event.key === 'Escape') {
                      event.preventDefault()
                      skipBlurActionRef.current = true
                      onRenameCancel()
                    }
                  }}
                />
              ) : (
                <h2 className={styles.heading}>{topic.title}</h2>
              )}
              <p className={styles.topicType}>
                {isRoot ? '中心主题' : isFirstLevel ? '一级分支' : '普通主题'}
              </p>
              {isInspectorEditing ? (
                <p className={styles.renameHint}>正在编辑右侧标题，按 Enter 保存，Esc 取消。</p>
              ) : null}
            </div>

            <div className={styles.titleActions}>
              <Button
                tone="secondary"
                size="sm"
                iconStart="edit"
                aria-pressed={isInspectorEditing}
                className={isInspectorEditing ? styles.renameButtonActive : undefined}
                onClick={() => {
                  if (isInspectorEditing) {
                    titleInputRef.current?.focus()
                    titleInputRef.current?.select()
                    return
                  }

                  onRenameStart()
                }}
              >
                重命名
              </Button>
            </div>
          </div>
        )}
      </div>

      {topic && !isMultiSelection ? (
        <div className={styles.content}>
          <div className={styles.block}>
            <label className={styles.label} htmlFor="topic-note">
              备注
            </label>
            <TextArea
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
            <SegmentedControl
              value={topic.branchSide}
              ariaLabel="一级分支方向"
              onChange={onBranchSideChange}
              options={sideOptions.map((side) => ({
                value: side,
                label: side === 'auto' ? '自动' : side === 'left' ? '左侧' : '右侧',
                disabled: !isFirstLevel,
              }))}
            />
            {!isFirstLevel ? (
              <p className={styles.helperText}>只有一级分支可以切换左右方向。</p>
            ) : null}
          </div>

          <div className={styles.block}>
            <span className={styles.label}>AI 锁定</span>
            <Button
              tone={topic.aiLocked ? 'secondary' : 'ghost'}
              iconStart={topic.aiLocked ? 'lock' : 'unlock'}
              className={styles.actionButton}
              onClick={() => onToggleAiLock(!topic.aiLocked)}
            >
              {topic.aiLocked ? '已锁定，点击解锁' : '允许 AI 修改此节点'}
            </Button>
            <p className={styles.helperText}>
              这是 AI 写保护，不影响人工直接编辑。锁定后，AI 仍可读取该节点，并在其下生成子节点或基于它生成同级节点，但不会修改、移动或删除它。
            </p>
          </div>

          <div className={styles.block}>
            <span className={styles.label}>位置</span>
            <Button
              tone="secondary"
              iconStart="fitView"
              className={styles.actionButton}
              onClick={onResetPosition}
            >
              重置位置
            </Button>
          </div>

          <div className={styles.block}>
            <span className={styles.label}>操作</span>
            <div className={styles.actions}>
              <Button tone="primary" iconStart="add" className={styles.actionButton} onClick={onAddChild}>
                新增子主题
              </Button>
              {!isRoot ? (
                <Button tone="secondary" iconStart="copy" className={styles.actionButton} onClick={onAddSibling}>
                  新增同级主题
                </Button>
              ) : null}
              {!isRoot ? (
                <Button tone="danger" iconStart="delete" className={styles.actionButton} onClick={onDelete}>
                  删除主题
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
