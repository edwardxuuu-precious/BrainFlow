import { ReactFlowProvider, type NodeProps } from '@xyflow/react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMindMapDocument } from '../../features/documents/document-factory'
import { resetEditorStore, useEditorStore } from '../../features/editor/editor-store'
import { layoutMindMap, type MindMapFlowNode } from '../../features/editor/layout'
import { TopicNode } from './TopicNode'

function createTopicNodeProps(
  topicId: string,
  document = createMindMapDocument(),
): NodeProps<MindMapFlowNode> {
  const node = layoutMindMap(document).renderNodes.find((entry) => entry.id === topicId)

  if (!node) {
    throw new Error(`Unable to find topic node: ${topicId}`)
  }

  return {
    id: node.id,
    data: node.data,
    type: node.type,
    selected: false,
    dragging: false,
    zIndex: 0,
    isConnectable: false,
    positionAbsoluteX: node.position.x,
    positionAbsoluteY: node.position.y,
  } as unknown as NodeProps<MindMapFlowNode>
}

function renderTopicNode(props: NodeProps<MindMapFlowNode>) {
  render(
    <ReactFlowProvider>
      <TopicNode {...props} />
    </ReactFlowProvider>,
  )
}

describe('TopicNode', () => {
  beforeEach(() => {
    resetEditorStore()
  })

  it('shows a note marker when the topic note is not empty', () => {
    const document = createMindMapDocument()
    const branchId = document.topics[document.rootTopicId].childIds[0]
    document.topics[branchId].note = '记录上下文'

    useEditorStore.getState().setDocument(document)
    renderTopicNode(createTopicNodeProps(branchId, document))

    expect(screen.getByLabelText('已添加备注')).toBeInTheDocument()
    expect(screen.getByText('分支一').closest('[data-selected]')).toHaveAttribute(
      'data-selected',
      'false',
    )
  })

  it('renders the canvas title input only for canvas editing', () => {
    const document = createMindMapDocument()
    const branchId = document.topics[document.rootTopicId].childIds[0]

    useEditorStore.getState().setDocument(document)
    useEditorStore.getState().startEditing(branchId, 'canvas')

    renderTopicNode(createTopicNodeProps(branchId, document))

    const input = screen.getByRole('textbox', { name: '编辑主题标题' })
    expect(input).toBeInTheDocument()
    expect(input).toHaveFocus()
  })

  it('keeps a stronger selected state when editing happens in the inspector', () => {
    const document = createMindMapDocument()
    const [firstId, secondId] = document.topics[document.rootTopicId].childIds

    useEditorStore.getState().setDocument(document)
    useEditorStore.getState().setSelection([firstId, secondId], secondId)
    useEditorStore.getState().startEditing(secondId, 'inspector')

    renderTopicNode(createTopicNodeProps(secondId, document))

    expect(screen.queryByRole('textbox', { name: '编辑主题标题' })).not.toBeInTheDocument()
    const topicRoot = screen.getByText('分支二').closest('[data-selected]')
    expect(topicRoot).toHaveAttribute('data-selected', 'true')
    expect(topicRoot).toHaveAttribute('data-active', 'true')
  })
})
