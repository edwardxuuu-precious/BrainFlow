import type { KeyboardEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Button, Icon, IconButton } from '../../../components/ui'
import { createTopicAttachmentRef, createTopicLink } from '../../documents/topic-defaults'
import type {
  TopicAttachmentRef,
  TopicLink,
  TopicLinkType,
  TopicMetadataPatch,
  TopicNode,
  TopicRichTextDocument,
  TopicTaskPriority,
  TopicTaskStatus,
} from '../../documents/types'
import {
  TOPIC_ATTACHMENT_SOURCES,
  TOPIC_LINK_TYPES,
  TOPIC_TASK_PRIORITIES,
  TOPIC_TASK_STATUSES,
} from '../../documents/types'
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

const taskStatusLabels: Record<TopicTaskStatus, string> = {
  todo: '待办',
  in_progress: '进行中',
  done: '已完成',
}

const taskPriorityLabels: Record<TopicTaskPriority, string> = {
  low: '低',
  medium: '中',
  high: '高',
}

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

function createDefaultTask() {
  return {
    status: 'todo' as const,
    priority: 'medium' as const,
    dueDate: null,
  }
}

function createPlaceholderLink(
  type: TopicLinkType,
  topicOptions: Array<{ id: string; title: string }>,
): TopicLink {
  const link = createTopicLink(type)
  const fallbackTopicId = topicOptions[0]?.id ?? ''

  if (type === 'web') {
    return { ...link, label: '新链接', href: 'https://example.com' }
  }

  if (type === 'topic') {
    return { ...link, label: '关联主题', targetTopicId: fallbackTopicId }
  }

  return { ...link, label: '本地资源', path: 'C:/path/to/resource' }
}

function createPlaceholderAttachment(source: TopicAttachmentRef['source']): TopicAttachmentRef {
  const attachment = createTopicAttachmentRef(source)
  return {
    ...attachment,
    name: source === 'url' ? '外部附件' : '本地附件',
    uri: source === 'url' ? 'https://example.com/resource' : 'C:/path/to/file',
  }
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
  topicOptions,
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
  const [topicTypeDropdownOpen, setTopicTypeDropdownOpen] = useState(false)
  const topicTypeDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (topicTypeDropdownRef.current && !topicTypeDropdownRef.current.contains(event.target as Node)) {
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

  const updateLink = (linkId: string, patch: Partial<TopicLink>) => {
    if (!topic) {
      return
    }

    onMetadataChange({
      links: topic.metadata.links.map((link) =>
        link.id === linkId ? { ...link, ...patch } : link,
      ),
    })
  }

  const updateAttachment = (attachmentId: string, patch: Partial<TopicAttachmentRef>) => {
    if (!topic) {
      return
    }

    onMetadataChange({
      attachments: topic.metadata.attachments.map((attachment) =>
        attachment.id === attachmentId ? { ...attachment, ...patch } : attachment,
      ),
    })
  }

  return (
    <section id={id} className={classNames(styles.panel, className)} data-mode={mode}>
      <div className={styles.header}>
        <div className={styles.chrome}>
          <div className={styles.modeIntro}>
            <span className={styles.modeLabel}>详情</span>
            <h2 className={styles.modeHeading}>节点详情</h2>
            <p className={styles.modeDescription}>查看并编辑当前选区的备注、元数据和节点操作。</p>
          </div>
          {onCollapse ? (
            <IconButton
              label="隐藏右侧栏"
              icon="chevronRight"
              tone="ghost"
              size="sm"
              className={styles.collapseButton}
              aria-controls={id}
              onClick={onCollapse}
            />
          ) : null}
        </div>
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
                <h2 className={styles.heading}>{topic.title}</h2>
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
              <span className={styles.label}>元数据</span>
              <svg
                className={classNames(styles.chevron, !collapsedSections.metadata && styles.chevronOpen)}
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
            <>
            <div className={styles.subsection}>
              <span className={styles.sublabel}>标签</span>
              <div className={styles.chipList}>
                {topic.metadata.labels.length > 0 ? (
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
                  ))
                ) : (
                  <span className={styles.emptyInline}>暂无标签</span>
                )}
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
                <Button tone="secondary" size="sm" onClick={addLabel}>
                  添加
                </Button>
              </div>
            </div>

            <div className={styles.subsection}>
              <div className={styles.subsectionHeader}>
                <span className={styles.sublabel}>任务</span>
                {topic.metadata.task ? (
                  <Button
                    tone="ghost"
                    size="sm"
                    className={styles.inlineButton}
                    onClick={() => onMetadataChange({ task: null })}
                  >
                    清除任务
                  </Button>
                ) : null}
              </div>
              {topic.metadata.task ? (
                <div className={styles.fieldGrid}>
                  <label className={styles.fieldItem}>
                    <span className={styles.fieldCaption}>状态</span>
                    <select
                      className={styles.nativeSelect}
                      value={topic.metadata.task.status}
                      aria-label="任务状态"
                      onChange={(event) =>
                        onMetadataChange({
                          task: {
                            ...topic.metadata.task!,
                            status: event.target.value as TopicTaskStatus,
                          },
                        })
                      }
                    >
                      {TOPIC_TASK_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {taskStatusLabels[status]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.fieldItem}>
                    <span className={styles.fieldCaption}>优先级</span>
                    <select
                      className={styles.nativeSelect}
                      value={topic.metadata.task.priority}
                      aria-label="任务优先级"
                      onChange={(event) =>
                        onMetadataChange({
                          task: {
                            ...topic.metadata.task!,
                            priority: event.target.value as TopicTaskPriority,
                          },
                        })
                      }
                    >
                      {TOPIC_TASK_PRIORITIES.map((priority) => (
                        <option key={priority} value={priority}>
                          {taskPriorityLabels[priority]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.fieldItem}>
                    <span className={styles.fieldCaption}>截止日期</span>
                    <input
                      type="date"
                      className={styles.nativeInput}
                      aria-label="任务截止日期"
                      value={topic.metadata.task.dueDate ?? ''}
                      onChange={(event) =>
                        onMetadataChange({
                          task: {
                            ...topic.metadata.task!,
                            dueDate: event.target.value || null,
                          },
                        })
                      }
                    />
                  </label>
                </div>
              ) : (
                <Button
                  tone="primary"
                  size="sm"
                  className={styles.inlineButton}
                  onClick={() => onMetadataChange({ task: createDefaultTask() })}
                >
                  启用任务
                </Button>
              )}
            </div>

            <div className={styles.subsection}>
              <div className={styles.subsectionHeader}>
                <span className={styles.sublabel}>链接</span>
                <div className={styles.inlineActions}>
                  {TOPIC_LINK_TYPES.map((type) => (
                    <Button
                      key={type}
                      tone="ghost"
                      size="sm"
                      className={styles.inlineButton}
                      onClick={() =>
                        onMetadataChange({
                          links: [...topic.metadata.links, createPlaceholderLink(type, topicOptions)],
                        })
                      }
                    >
                      新增{type === 'web' ? '网页' : type === 'topic' ? '主题' : '本地'}链接
                    </Button>
                  ))}
                </div>
              </div>
              <div className={styles.stackList}>
                {topic.metadata.links.length > 0 ? (
                  topic.metadata.links.map((link) => (
                    <div key={link.id} className={styles.stackCard}>
                      <div className={styles.cardTop}>
                        <span className={styles.cardTitle}>链接</span>
                        <Button
                          tone="ghost"
                          size="sm"
                          className={styles.inlineButton}
                          onClick={() =>
                            onMetadataChange({
                              links: topic.metadata.links.filter((item) => item.id !== link.id),
                            })
                          }
                        >
                          删除
                        </Button>
                      </div>
                      <div className={styles.fieldGrid}>
                        <label className={styles.fieldItem}>
                          <span className={styles.fieldCaption}>类型</span>
                          <select
                            className={styles.nativeSelect}
                            value={link.type}
                            aria-label="链接类型"
                            onChange={(event) => {
                              const nextType = event.target.value as TopicLinkType
                              const nextLink = createPlaceholderLink(nextType, topicOptions)
                              updateLink(link.id, {
                                ...nextLink,
                                id: link.id,
                              })
                            }}
                          >
                            <option value="web">网页</option>
                            <option value="topic">主题</option>
                            <option value="local">本地</option>
                          </select>
                        </label>
                        <label className={styles.fieldItem}>
                          <span className={styles.fieldCaption}>名称</span>
                          <input
                            className={styles.nativeInput}
                            value={link.label}
                            aria-label="链接名称"
                            onChange={(event) => updateLink(link.id, { label: event.target.value })}
                          />
                        </label>
                        {link.type === 'web' ? (
                          <label className={styles.fieldItemWide}>
                            <span className={styles.fieldCaption}>URL</span>
                            <input
                              className={styles.nativeInput}
                              value={link.href ?? ''}
                              aria-label="链接地址"
                              onChange={(event) => updateLink(link.id, { href: event.target.value })}
                            />
                          </label>
                        ) : null}
                        {link.type === 'topic' ? (
                          <label className={styles.fieldItemWide}>
                            <span className={styles.fieldCaption}>目标主题</span>
                            <select
                              className={styles.nativeSelect}
                              value={link.targetTopicId ?? ''}
                              aria-label="目标主题"
                              onChange={(event) =>
                                updateLink(link.id, { targetTopicId: event.target.value })
                              }
                            >
                              {topicOptions.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.title}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                        {link.type === 'local' ? (
                          <label className={styles.fieldItemWide}>
                            <span className={styles.fieldCaption}>本地路径</span>
                            <input
                              className={styles.nativeInput}
                              value={link.path ?? ''}
                              aria-label="本地路径"
                              onChange={(event) => updateLink(link.id, { path: event.target.value })}
                            />
                          </label>
                        ) : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <span className={styles.emptyInline}>暂无链接</span>
                )}
              </div>
            </div>

            <div className={styles.subsection}>
              <div className={styles.subsectionHeader}>
                <span className={styles.sublabel}>附件引用</span>
                <div className={styles.inlineActions}>
                  {TOPIC_ATTACHMENT_SOURCES.map((source) => (
                    <Button
                      key={source}
                      tone="ghost"
                      size="sm"
                      className={styles.inlineButton}
                      onClick={() =>
                        onMetadataChange({
                          attachments: [
                            ...topic.metadata.attachments,
                            createPlaceholderAttachment(source),
                          ],
                        })
                      }
                    >
                      新增{source === 'url' ? 'URL' : '本地'}附件
                    </Button>
                  ))}
                </div>
              </div>
              <div className={styles.stackList}>
                {topic.metadata.attachments.length > 0 ? (
                  topic.metadata.attachments.map((attachment) => (
                    <div key={attachment.id} className={styles.stackCard}>
                      <div className={styles.cardTop}>
                        <span className={styles.cardTitle}>附件引用</span>
                        <Button
                          tone="ghost"
                          size="sm"
                          className={styles.inlineButton}
                          onClick={() =>
                            onMetadataChange({
                              attachments: topic.metadata.attachments.filter(
                                (item) => item.id !== attachment.id,
                              ),
                            })
                          }
                        >
                          删除
                        </Button>
                      </div>
                      <div className={styles.fieldGrid}>
                        <label className={styles.fieldItem}>
                          <span className={styles.fieldCaption}>来源</span>
                          <select
                            className={styles.nativeSelect}
                            value={attachment.source}
                            aria-label="附件来源"
                            onChange={(event) =>
                              updateAttachment(attachment.id, {
                                source: event.target.value as TopicAttachmentRef['source'],
                              })
                            }
                          >
                            <option value="url">URL</option>
                            <option value="local">本地</option>
                          </select>
                        </label>
                        <label className={styles.fieldItem}>
                          <span className={styles.fieldCaption}>名称</span>
                          <input
                            className={styles.nativeInput}
                            value={attachment.name}
                            aria-label="附件名称"
                            onChange={(event) =>
                              updateAttachment(attachment.id, { name: event.target.value })
                            }
                          />
                        </label>
                        <label className={styles.fieldItemWide}>
                          <span className={styles.fieldCaption}>URI / 路径</span>
                          <input
                            className={styles.nativeInput}
                            value={attachment.uri}
                            aria-label="附件 URI"
                            onChange={(event) =>
                              updateAttachment(attachment.id, { uri: event.target.value })
                            }
                          />
                        </label>
                        <label className={styles.fieldItemWide}>
                          <span className={styles.fieldCaption}>MIME Type</span>
                          <input
                            className={styles.nativeInput}
                            value={attachment.mimeType ?? ''}
                            aria-label="附件 MIME Type"
                            onChange={(event) =>
                              updateAttachment(attachment.id, {
                                mimeType: event.target.value || null,
                              })
                            }
                          />
                        </label>
                      </div>
                    </div>
                  ))
                ) : (
                  <span className={styles.emptyInline}>暂无附件引用</span>
                )}
              </div>
            </div>
            </>
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
                  className={styles.infoIcon}
                  onClick={(e) => e.stopPropagation()}
                  onMouseEnter={() => setShowAiLockTooltip(true)}
                  onMouseLeave={() => setShowAiLockTooltip(false)}
                >
                  <Icon name="info" size={14} strokeWidth={2} />
                  {showAiLockTooltip && (
                    <span className={styles.infoTooltip}>
                      这是 AI 写保护，不影响人工直接编辑。锁定后，AI 仍可读取该节点，并在其下生成子节点或基于它生成同级节点，但不会修改、移动或删除它。
                    </span>
                  )}
                </span>
              </span>
              <svg
                className={classNames(styles.chevron, !collapsedSections.aiLock && styles.chevronOpen)}
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
    </section>
  )
}
