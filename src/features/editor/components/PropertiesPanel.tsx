import type { KeyboardEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, Icon, IconButton } from '../../../components/ui'
import type {
  TopicMetadataPatch,
  TopicNode,
  TopicRichTextDocument,
} from '../../documents/types'
import {
  getTopicTitleStyleVars,
  getTopicTitleTypography,
} from '../topic-title-display'
import { TopicRichTextEditor } from './TopicRichTextEditor'
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
  topicOptions: Array<{ id: string; title: string }>
  availableLabels: string[]
  onRenameChange: (value: string) => void
  onRenameCommit: () => void
  onRenameCancel: () => void
  onNoteChange: (noteRich: TopicRichTextDocument | null) => void
  onMetadataChange: (patch: TopicMetadataPatch) => void
  onToggleAiLock: (aiLocked: boolean) => void
  onLockSelected?: () => void
  onUnlockSelected?: () => void
  onCollapse?: () => void
  id?: string
  className?: string
  mode?: 'docked' | 'drawer'
}

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
  topicOptions: _topicOptions,
  availableLabels,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onNoteChange,
  onMetadataChange,
  onToggleAiLock,
  onCollapse,
  id,
  className,
  mode = 'docked',
  onLockSelected,
  onUnlockSelected,
}: PropertiesPanelProps) {
  const titleInputRef = useRef<HTMLInputElement>(null)
  const skipBlurActionRef = useRef(false)
  const [labelDraft, setLabelDraft] = useState('')
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    note: true,
    metadata: false,
    aiLock: true,
  })
  const [showAiLockTooltip, setShowAiLockTooltip] = useState(false)
  const [aiLockTooltipPos, setAiLockTooltipPos] = useState({ x: 0, y: 0 })
  const [topicTypeDropdownOpen, setTopicTypeDropdownOpen] = useState(false)
  const topicTypeDropdownRef = useRef<HTMLDivElement>(null)
  const aiLockInfoRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        topicTypeDropdownRef.current &&
        !topicTypeDropdownRef.current.contains(event.target as Node)
      ) {
        setTopicTypeDropdownOpen(false)
      }
    }

    if (topicTypeDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [topicTypeDropdownOpen])

  const toggleSection = (section: string) => {
    setCollapsedSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  useEffect(() => {
    if (!isInspectorEditing) {
      return
    }

    titleInputRef.current?.focus()
    titleInputRef.current?.select()
  }, [isInspectorEditing])

  useEffect(() => {
    setLabelDraft('')
  }, [topic?.id])

  const isMultiSelection = selectionCount > 1
  const headingTypography = topic ? getTopicTitleTypography(topic.title, 'regular') : null
  const headingStyleVars = topic ? getTopicTitleStyleVars(topic.title, 'regular') : null

  const addLabel = () => {
    if (!topic) {
      return
    }

    const nextLabel = labelDraft.trim()
    if (!nextLabel || topic.metadata.labels.includes(nextLabel)) {
      return
    }

    onMetadataChange({ labels: [...topic.metadata.labels, nextLabel] })
    setLabelDraft('')
  }

  const handleLabelKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      addLabel()
    }
  }

  return (
    <section id={id} className={classNames(styles.panel, className)} data-mode={mode}>
      <div className={styles.header}>
        {onCollapse ? (
          <div className={styles.collapseHeader}>
            <IconButton
              label="隐藏右侧栏"
              icon="chevronRight"
              tone="primary"
              size="sm"
              className={styles.collapseButton}
              aria-controls={id}
              onClick={onCollapse}
            />
          </div>
        ) : null}
        {!topic ? (
          <div className={styles.placeholder}>
            <h2 className={styles.heading}>
              {isMultiSelection ? `已选择 ${selectionCount} 个节点` : '未选中节点'}
            </h2>
            <p className={styles.empty}>
              {isMultiSelection
                ? '多选模式下不显示单节点详情表单。你仍然可以批量锁定当前选区，或切换到标记/格式面板继续操作。'
                : '点击画布中的任意节点后，可以在这里编辑摘要、详细内容、元数据和操作项。'}
            </p>
            {isMultiSelection ? (
              <div className={styles.multiSelectSummary}>
                <p className={styles.multiSelectStats}>
                  其中 {selectedLockedCount} 个已锁定，{selectedUnlockedCount} 个未锁定
                </p>
                <div className={styles.multiSelectActions}>
                  <Button
                    tone="primary"
                    iconStart="lock"
                    className={styles.actionButton}
                    disabled={selectedUnlockedCount === 0}
                    onClick={onLockSelected}
                  >
                    锁定所选未锁定节点
                  </Button>
                  <Button
                    tone="primary"
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
                  aria-label="编辑节点标题"
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
                <h2
                  className={styles.heading}
                  data-title-tier={headingTypography?.tier}
                  style={headingStyleVars ?? undefined}
                >
                  {topic.title}
                </h2>
              )}
              {isRoot || isFirstLevel ? (
                <p className={styles.topicType}>{isRoot ? '中心主题' : '一级分支'}</p>
              ) : (
                <div ref={topicTypeDropdownRef} className={styles.topicTypeDropdown}>
                  <button
                    type="button"
                    className={styles.topicTypeTrigger}
                    onClick={() => setTopicTypeDropdownOpen(!topicTypeDropdownOpen)}
                  >
                    <span className={styles.topicTypeValue}>
                      <Icon
                        name={
                          topic.metadata?.type === 'milestone'
                            ? 'star'
                            : topic.metadata?.type === 'task'
                              ? 'checkCircle'
                              : 'circle'
                        }
                        size={14}
                        strokeWidth={1.8}
                      />
                      {topic.metadata?.type === 'milestone'
                        ? '里程碑'
                        : topic.metadata?.type === 'task'
                          ? '任务'
                          : '普通主题'}
                    </span>
                    <Icon
                      name="chevronDown"
                      size={14}
                      strokeWidth={1.8}
                      className={classNames(
                        styles.topicTypeIcon,
                        topicTypeDropdownOpen && styles.topicTypeIconOpen,
                      )}
                    />
                  </button>
                  {topicTypeDropdownOpen && (
                    <div className={styles.topicTypeMenu}>
                      <button
                        type="button"
                        className={classNames(
                          styles.topicTypeItem,
                          (!topic.metadata?.type || topic.metadata?.type === 'normal') &&
                            styles.topicTypeItemActive,
                        )}
                        onClick={() => {
                          onMetadataChange({ type: 'normal' })
                          setTopicTypeDropdownOpen(false)
                        }}
                      >
                        <Icon name="circle" size={14} strokeWidth={1.8} />
                        普通主题
                      </button>
                      <button
                        type="button"
                        className={classNames(
                          styles.topicTypeItem,
                          topic.metadata?.type === 'milestone' && styles.topicTypeItemActive,
                        )}
                        onClick={() => {
                          onMetadataChange({ type: 'milestone' })
                          setTopicTypeDropdownOpen(false)
                        }}
                      >
                        <Icon name="star" size={14} strokeWidth={1.8} />
                        里程碑
                      </button>
                      <button
                        type="button"
                        className={classNames(
                          styles.topicTypeItem,
                          topic.metadata?.type === 'task' && styles.topicTypeItemActive,
                        )}
                        onClick={() => {
                          onMetadataChange({ type: 'task' })
                          setTopicTypeDropdownOpen(false)
                        }}
                      >
                        <Icon name="checkCircle" size={14} strokeWidth={1.8} />
                        任务
                      </button>
                    </div>
                  )}
                </div>
              )}
              {isInspectorEditing ? (
                <p className={styles.renameHint}>正在编辑标题，按 Enter 保存，Esc 取消。</p>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {topic && !isMultiSelection ? (
        <div className={styles.content}>
          <div className={styles.block}>
            <button
              type="button"
              className={styles.blockHeader}
              onClick={() => toggleSection('note')}
              aria-expanded={!collapsedSections.note}
            >
              <span className={styles.label}>详细内容</span>
              <svg
                className={classNames(styles.chevron, !collapsedSections.note && styles.chevronOpen)}
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
              >
                <path
                  d="M2.5 4.5L6 8L9.5 4.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {!collapsedSections.note && (
              <TopicRichTextEditor
                id="topic-note"
                value={topic.noteRich}
                fallbackPlainText={topic.note}
                onChange={onNoteChange}
              />
            )}
          </div>

          <div className={styles.block}>
            <button
              type="button"
              className={styles.blockHeader}
              onClick={() => toggleSection('metadata')}
              aria-expanded={!collapsedSections.metadata}
            >
              <span className={styles.label}>标签</span>
              <svg
                className={classNames(
                  styles.chevron,
                  !collapsedSections.metadata && styles.chevronOpen,
                )}
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
              >
                <path
                  d="M2.5 4.5L6 8L9.5 4.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            {!collapsedSections.metadata && (
              <div className={styles.subsection}>
                
                <div className={styles.chipList}>
                  {topic.metadata.labels.length > 0 &&
                    topic.metadata.labels.map((label) => (
                      <span key={label} className={styles.chip}>
                        <span className={styles.chipText}>{label}</span>
                        <button
                          type="button"
                          className={styles.chipRemove}
                          aria-label={`删除标签 ${label}`}
                          onClick={() =>
                            onMetadataChange({
                              labels: topic.metadata.labels.filter((item) => item !== label),
                            })
                          }
                        >
                          ×
                        </button>
                      </span>
                    ))}
                </div>
                <div className={styles.inlineForm}>
                  <input
                    value={labelDraft}
                    className={styles.nativeInput}
                    placeholder="输入标签，回车添加"
                    aria-label="新增标签"
                    onChange={(event) => setLabelDraft(event.target.value)}
                    onKeyDown={handleLabelKeyDown}
                  />
                  <Button tone="primary" size="sm" onClick={addLabel}>
                    添加
                  </Button>
                </div>
                {(() => {
                  const unusedLabels = availableLabels.filter(
                    (label) => !topic.metadata.labels.includes(label),
                  )
                  if (unusedLabels.length === 0) {
                    return null
                  }

                  return (
                    <div className={styles.availableLabelsSection}>
                      <span className={styles.availableLabelsLabel}>可用标签</span>
                      <div className={styles.availableLabelsList}>
                        {unusedLabels.map((label) => (
                          <button
                            key={label}
                            type="button"
                            className={styles.availableLabelChip}
                            onClick={() =>
                              onMetadataChange({
                                labels: [...topic.metadata.labels, label],
                              })
                            }
                          >
                            + {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}
          </div>

          <div className={styles.block}>
            <button
              type="button"
              className={styles.blockHeader}
              onClick={() => toggleSection('aiLock')}
              aria-expanded={!collapsedSections.aiLock}
            >
              <span className={styles.labelWithIcon}>
                AI 锁定
                <span
                  ref={aiLockInfoRef}
                  className={styles.infoIcon}
                  onClick={(event) => event.stopPropagation()}
                  onMouseEnter={() => {
                    if (aiLockInfoRef.current) {
                      const rect = aiLockInfoRef.current.getBoundingClientRect()
                      setAiLockTooltipPos({
                        x: rect.left + rect.width / 2,
                        y: rect.bottom + 8,
                      })
                    }
                    setShowAiLockTooltip(true)
                  }}
                  onMouseLeave={() => setShowAiLockTooltip(false)}
                >
                  <Icon name="info" size={14} strokeWidth={2} />
                </span>
              </span>
              <svg
                className={classNames(
                  styles.chevron,
                  !collapsedSections.aiLock && styles.chevronOpen,
                )}
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
              >
                <path
                  d="M2.5 4.5L6 8L9.5 4.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {!collapsedSections.aiLock && (
              <Button
                tone={topic.aiLocked ? 'danger' : 'ghost'}
                iconStart={topic.aiLocked ? 'lock' : 'unlock'}
                className={styles.actionButton}
                onClick={() => onToggleAiLock(!topic.aiLocked)}
              >
                {topic.aiLocked ? '已锁定，点击解锁' : '允许 AI 修改此节点'}
              </Button>
            )}
          </div>
        </div>
      ) : null}
      {showAiLockTooltip &&
        createPortal(
          <span
            className={styles.infoTooltip}
            style={{
              left: aiLockTooltipPos.x,
              top: aiLockTooltipPos.y,
              transform: 'translateX(-50%)',
            }}
          >
            这是 AI 写保护，不影响人工直接编辑。锁定后，AI 仍可读取该节点，并在其下生成子节点或基于它生成同级节点，但不会修改、移动或删除它。
          </span>,
          document.body,
        )}
    </section>
  )
}
