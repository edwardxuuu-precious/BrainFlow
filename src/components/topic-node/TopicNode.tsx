import { Handle, Position, type NodeProps } from '@xyflow/react'
import { type CSSProperties, useEffect, useRef } from 'react'
import { useEditorStore } from '../../features/editor/editor-store'
import type { MindMapFlowNode } from '../../features/editor/layout'
import styles from './TopicNode.module.css'

function sourceHandleId(side: 'left' | 'right'): string {
  return `source-${side}`
}

function targetHandleId(side: 'left' | 'right'): string {
  return `target-${side}`
}

export function TopicNode({ id, data, selected }: NodeProps<MindMapFlowNode>) {
  const selectedTopicId = useEditorStore((state) => state.selectedTopicId)
  const editingTopicId = useEditorStore((state) => state.editingTopicId)
  const setSelectedTopicId = useEditorStore((state) => state.setSelectedTopicId)
  const startEditing = useEditorStore((state) => state.startEditing)
  const stopEditing = useEditorStore((state) => state.stopEditing)
  const renameTopic = useEditorStore((state) => state.renameTopic)
  const toggleCollapse = useEditorStore((state) => state.toggleCollapse)
  const inputRef = useRef<HTMLInputElement>(null)

  const isEditing = editingTopicId === id
  const isSelected = selected || selectedTopicId === id

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
        data.isRoot ? styles.root : '',
      ].join(' ')}
      style={{ '--branch-color': data.branchColor } as CSSProperties}
      onClick={() => setSelectedTopicId(id)}
      onDoubleClick={() => startEditing(id)}
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
          <div className={styles.title}>{data.title}</div>
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
          {data.isCollapsed ? '+' : '-'}
        </button>
      ) : null}
    </div>
  )
}
