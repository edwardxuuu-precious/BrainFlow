import { Handle, Position, type NodeProps } from '@xyflow/react'
import { type CSSProperties, useEffect, useRef } from 'react'
import { useEditorStore } from '../../features/editor/editor-store'
import type { MindMapFlowNode } from '../../features/editor/layout'
import { Icon } from '../ui'
import styles from './TopicNode.module.css'

function sourceHandleId(side: 'left' | 'right'): string {
  return `source-${side}`
}

function targetHandleId(side: 'left' | 'right'): string {
  return `target-${side}`
}

export function TopicNode({ id, data, selected }: NodeProps<MindMapFlowNode>) {
  const activeTopicId = useEditorStore((state) => state.activeTopicId)
  const selectedTopicIds = useEditorStore((state) => state.selectedTopicIds)
  const editingTopicId = useEditorStore((state) => state.editingTopicId)
  const editingSurface = useEditorStore((state) => state.editingSurface)
  const startEditing = useEditorStore((state) => state.startEditing)
  const stopEditing = useEditorStore((state) => state.stopEditing)
  const renameTopic = useEditorStore((state) => state.renameTopic)
  const toggleCollapse = useEditorStore((state) => state.toggleCollapse)
  const inputRef = useRef<HTMLInputElement>(null)

  const isEditing = editingTopicId === id && editingSurface === 'canvas'
  const isSelected = selected || selectedTopicIds.includes(id)
  const isActive = activeTopicId === id
  const hasNote = data.note.trim().length > 0

  useEffect(() => {
    if (!isEditing) {
      return
    }

    inputRef.current?.focus()
    inputRef.current?.select()
  }, [isEditing])

  const commitRename = () => {
    renameTopic(id, inputRef.current?.value ?? data.title)
    stopEditing()
  }

  return (
    <div
      className={[
        styles.node,
        isSelected ? styles.selected : '',
        isActive ? styles.active : '',
        isEditing ? styles.editing : '',
        data.isRoot ? styles.root : '',
      ].join(' ')}
      data-selected={isSelected ? 'true' : 'false'}
      data-active={isActive ? 'true' : 'false'}
      style={{ '--branch-color': data.branchColor } as CSSProperties}
      onDoubleClick={() => startEditing(id, 'canvas')}
    >
      <Handle id={targetHandleId('left')} type="target" position={Position.Left} className={styles.handle} />
      <Handle id={targetHandleId('right')} type="target" position={Position.Right} className={styles.handle} />
      <Handle id={sourceHandleId('left')} type="source" position={Position.Left} className={styles.handle} />
      <Handle id={sourceHandleId('right')} type="source" position={Position.Right} className={styles.handle} />

      <div className={styles.content}>
        {data.isRoot ? <span className={styles.badge}>BRAINFLOW</span> : null}
        {isEditing ? (
          <input
            ref={inputRef}
            defaultValue={data.title}
            className={`${styles.input} nodrag nowheel nopan`}
            aria-label="编辑主题标题"
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commitRename()
              }

              if (event.key === 'Escape') {
                event.preventDefault()
                if (inputRef.current) {
                  inputRef.current.value = data.title
                }
                stopEditing()
              }
            }}
          />
        ) : (
          <div className={styles.titleRow}>
            <div className={styles.title}>{data.title}</div>
            {hasNote ? (
              <span
                className={styles.noteIndicator}
                data-note-indicator="true"
                role="img"
                aria-label="已添加备注"
              >
                <Icon name="note" size={12} strokeWidth={1.9} />
              </span>
            ) : null}
          </div>
        )}
      </div>

      {data.childCount > 0 ? (
        <button
          type="button"
          className={`${styles.collapse} nodrag nowheel nopan`}
          aria-label={data.isCollapsed ? '展开子主题' : '折叠子主题'}
          onClick={(event) => {
            event.stopPropagation()
            toggleCollapse(id)
          }}
        >
          {data.isCollapsed ? '+' : '−'}
        </button>
      ) : null}
    </div>
  )
}
