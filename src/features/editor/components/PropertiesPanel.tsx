import type { KeyboardEvent, ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Button, SegmentedControl } from '../../../components/ui'
import { createTopicAttachmentRef, createTopicLink } from '../../documents/topic-defaults'
import type {
  BranchSide,
  MindMapTheme,
  TopicAttachmentRef,
  TopicLink,
  TopicLinkType,
  TopicMarker,
  TopicMetadataPatch,
  TopicNode,
  TopicRichTextDocument,
  TopicStylePatch,
  TopicTaskPriority,
  TopicTaskStatus,
} from '../../documents/types'
import {
  TOPIC_ATTACHMENT_SOURCES,
  TOPIC_LINK_TYPES,
  TOPIC_MARKERS,
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
  theme: Pick<MindMapTheme, 'surface' | 'text' | 'accent'>
  topicOptions: Array<{ id: string; title: string }>
  onRenameStart: () => void
  onRenameChange: (value: string) => void
  onRenameCommit: () => void
  onRenameCancel: () => void
  onAddChild: () => void
  onAddSibling: () => void
  onDelete: () => void
  onNoteChange: (noteRich: TopicRichTextDocument | null) => void
  onMetadataChange: (patch: TopicMetadataPatch) => void
  onStyleChange: (patch: TopicStylePatch) => void
  onApplyStyleToSelected?: (patch: TopicStylePatch) => void
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
const emphasisOptions = [
  { value: 'normal', label: '默认' },
  { value: 'focus', label: '强调' },
] as const
const variantOptions = [
  { value: 'default', label: '默认' },
  { value: 'soft', label: '柔和' },
  { value: 'solid', label: '实色' },
] as const

const markerLabels: Record<TopicMarker, string> = {
  important: '重点',
  question: '问题',
  idea: '灵感',
  warning: '风险',
  decision: '决策',
  blocked: '阻塞',
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

function isHexColor(value: string | undefined): value is string {
  return /^#(?:[0-9a-fA-F]{6})$/.test(value ?? '')
}

function colorValue(value: string | undefined, fallback: string): string {
  return isHexColor(value) ? value : fallback
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
  theme,
  topicOptions,
  onRenameStart,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onAddChild,
  onAddSibling,
  onDelete,
  onNoteChange,
  onMetadataChange,
  onStyleChange,
  onApplyStyleToSelected,
  onBranchSideChange,
  onResetPosition,
  onToggleAiLock,
  onLockSelected,
  onUnlockSelected,
  id,
  className,
  mode = 'docked',
  tabs,
}: PropertiesPanelProps) {
  const titleInputRef = useRef<HTMLInputElement>(null)
  const skipBlurActionRef = useRef(false)
  const [labelDraft, setLabelDraft] = useState('')

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

  const renderStyleControls = (
    applyPatch: (patch: TopicStylePatch) => void,
    style?: TopicNode['style'],
  ) => (
    <div className={styles.styleStack}>
      <div className={styles.subsection}>
        <span className={styles.sublabel}>强调态</span>
        <SegmentedControl
          value={style?.emphasis ?? 'normal'}
          ariaLabel="节点强调态"
          onChange={(value) => applyPatch({ emphasis: value as TopicStylePatch['emphasis'] })}
          options={emphasisOptions.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
        />
      </div>

      <div className={styles.subsection}>
        <span className={styles.sublabel}>节点预设</span>
        <SegmentedControl
          value={style?.variant ?? 'default'}
          ariaLabel="节点样式预设"
          onChange={(value) => applyPatch({ variant: value as TopicStylePatch['variant'] })}
          options={variantOptions.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
        />
      </div>

      <div className={styles.colorGrid}>
        <label className={styles.colorField}>
          <span className={styles.sublabel}>背景色</span>
          <div className={styles.colorControl}>
            <input
              type="color"
              className={styles.colorInput}
              aria-label="背景色"
              value={colorValue(style?.background, theme.surface)}
              onChange={(event) => applyPatch({ background: event.target.value })}
            />
            <Button tone="ghost" size="sm" className={styles.inlineButton} onClick={() => applyPatch({ background: null })}>
              清除
            </Button>
          </div>
        </label>

        <label className={styles.colorField}>
          <span className={styles.sublabel}>文字色</span>
          <div className={styles.colorControl}>
            <input
              type="color"
              className={styles.colorInput}
              aria-label="文字色"
              value={colorValue(style?.textColor, theme.text)}
              onChange={(event) => applyPatch({ textColor: event.target.value })}
            />
            <Button tone="ghost" size="sm" className={styles.inlineButton} onClick={() => applyPatch({ textColor: null })}>
              清除
            </Button>
          </div>
        </label>

        <label className={styles.colorField}>
          <span className={styles.sublabel}>分支色</span>
          <div className={styles.colorControl}>
            <input
              type="color"
              className={styles.colorInput}
              aria-label="分支色"
              value={colorValue(style?.branchColor, theme.accent)}
              onChange={(event) => applyPatch({ branchColor: event.target.value })}
            />
            <Button tone="ghost" size="sm" className={styles.inlineButton} onClick={() => applyPatch({ branchColor: null })}>
              清除
            </Button>
          </div>
        </label>
      </div>
    </div>
  )

  return (
    <section id={id} className={classNames(styles.panel, className)} data-mode={mode}>
      <div className={styles.header}>
        {tabs ? <div className={styles.tabs}>{tabs}</div> : null}
        {!topic ? (
          <div className={styles.placeholder}>
            <h2 className={styles.heading}>
              {isMultiSelection ? `已选择 ${selectionCount} 个节点` : '未选中主题'}
            </h2>
            <p className={styles.empty}>
              {isMultiSelection
                ? '多选模式下不显示单节点元数据表单。你可以直接批量锁定当前选区，或对样式字段做按需批量套用。'
                : '点击画布中的任意节点后，可以在这里编辑备注、元数据、样式和方向。'}
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

      {isMultiSelection ? (
        <div className={styles.content}>
          <div className={styles.block}>
            <span className={styles.label}>批量样式</span>
            <p className={styles.helperText}>
              只会把你本次显式修改的字段写入当前选区，未改字段保持每个节点原样。
            </p>
            {renderStyleControls(
              (patch) => onApplyStyleToSelected?.(patch),
              {
                emphasis: 'normal',
                variant: 'default',
              },
            )}
          </div>
        </div>
      ) : null}

      {topic && !isMultiSelection ? (
        <div className={styles.content}>
          <div className={styles.block}>
            <span className={styles.label}>备注</span>
            <TopicRichTextEditor
              id="topic-note"
              value={topic.noteRich}
              fallbackPlainText={topic.note}
              onChange={onNoteChange}
            />
          </div>

          <div className={styles.block}>
            <span className={styles.label}>元数据</span>

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
              <span className={styles.sublabel}>标记</span>
              <div className={styles.markerGrid}>
                {TOPIC_MARKERS.map((marker) => {
                  const active = topic.metadata.markers.includes(marker)
                  return (
                    <Button
                      key={marker}
                      type="button"
                      tone={active ? 'secondary' : 'ghost'}
                      size="sm"
                      className={styles.markerButton}
                      onClick={() =>
                        onMetadataChange({
                          markers: active
                            ? topic.metadata.markers.filter((item) => item !== marker)
                            : [...topic.metadata.markers, marker],
                        })
                      }
                    >
                      {markerLabels[marker]}
                    </Button>
                  )
                })}
              </div>
            </div>

            <div className={styles.subsection}>
              <div className={styles.subsectionHeader}>
                <span className={styles.sublabel}>任务</span>
                {topic.metadata.task ? (
                  <Button tone="ghost" size="sm" className={styles.inlineButton} onClick={() => onMetadataChange({ task: null })}>
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
                <Button tone="secondary" size="sm" className={styles.inlineButton} onClick={() => onMetadataChange({ task: createDefaultTask() })}>
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
                              onChange={(event) => updateLink(link.id, { targetTopicId: event.target.value })}
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
                          attachments: [...topic.metadata.attachments, createPlaceholderAttachment(source)],
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
                              attachments: topic.metadata.attachments.filter((item) => item.id !== attachment.id),
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
                            onChange={(event) => updateAttachment(attachment.id, { name: event.target.value })}
                          />
                        </label>
                        <label className={styles.fieldItemWide}>
                          <span className={styles.fieldCaption}>URI / 路径</span>
                          <input
                            className={styles.nativeInput}
                            value={attachment.uri}
                            aria-label="附件 URI"
                            onChange={(event) => updateAttachment(attachment.id, { uri: event.target.value })}
                          />
                        </label>
                        <label className={styles.fieldItemWide}>
                          <span className={styles.fieldCaption}>MIME Type</span>
                          <input
                            className={styles.nativeInput}
                            value={attachment.mimeType ?? ''}
                            aria-label="附件 MIME Type"
                            onChange={(event) => updateAttachment(attachment.id, { mimeType: event.target.value || null })}
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
          </div>

          <div className={styles.block}>
            <span className={styles.label}>样式</span>
            {renderStyleControls(onStyleChange, topic.style)}
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
            <Button tone="secondary" iconStart="fitView" className={styles.actionButton} onClick={onResetPosition}>
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
