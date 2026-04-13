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
  options?: {
    selected?: boolean
    dropTarget?: boolean
  },
): NodeProps<MindMapFlowNode> {
  const node = layoutMindMap(document).renderNodes.find((entry) => entry.id === topicId)

  if (!node) {
    throw new Error(`Unable to find topic node: ${topicId}`)
  }

  return {
    id: node.id,
    data: {
      ...node.data,
      dropTarget: options?.dropTarget ?? false,
    },
    type: node.type,
    selected: options?.selected ?? false,
    dragging: false,
    zIndex: 0,
    isConnectable: false,
    positionAbsoluteX: node.position.x,
    positionAbsoluteY: node.position.y,
  } as unknown as NodeProps<MindMapFlowNode>
}

function renderTopicNode(props: NodeProps<MindMapFlowNode>) {
  return render(
    <ReactFlowProvider>
      <TopicNode {...props} />
    </ReactFlowProvider>,
  )
}

describe('TopicNode', () => {
  beforeEach(() => {
    resetEditorStore()
  })

  it('shows an inline note preview instead of a standalone note marker', () => {
    const document = createMindMapDocument()
    const branchId = document.topics[document.rootTopicId].childIds[0]
    const branchTitle = document.topics[branchId].title
    document.topics[branchId].note = '谁最先愿意为这个结果付费，谁就更接近第一波目标用户。'

    useEditorStore.getState().setDocument(document)
    renderTopicNode(createTopicNodeProps(branchId, document))

    const title = screen.getByText(branchTitle)
    const preview = screen.getByText('谁最先愿意为这个结果付费，谁就更接近第一波目标用户。')

    expect(
      preview,
    ).toBeInTheDocument()
    expect(preview).toHaveAttribute('data-inline-detail', 'true')
    expect(preview.previousElementSibling).toBe(title)
    expect(screen.queryByRole('img', { name: '已添加详细内容' })).not.toBeInTheDocument()
    expect(title.closest('[data-selected]')).toHaveAttribute(
      'data-selected',
      'false',
    )
  })

  it('shows a visible lock badge when the topic is AI locked', () => {
    const document = createMindMapDocument()
    const branchId = document.topics[document.rootTopicId].childIds[0]
    const branchTitle = document.topics[branchId].title
    document.topics[branchId].aiLocked = true

    useEditorStore.getState().setDocument(document)
    renderTopicNode(createTopicNodeProps(branchId, document))

    expect(screen.getByRole('img', { name: 'AI 锁定节点' })).toBeInTheDocument()
    expect(screen.getByText(branchTitle).closest('[data-locked]')).toHaveAttribute('data-locked', 'true')
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
    const [, secondId] = document.topics[document.rootTopicId].childIds
    const secondTitle = document.topics[secondId].title

    useEditorStore.getState().setDocument(document)
    useEditorStore.getState().setSelection([secondId], secondId)
    useEditorStore.getState().startEditing(secondId, 'inspector')

    renderTopicNode(createTopicNodeProps(secondId, document, { selected: true }))

    expect(screen.queryByRole('textbox', { name: '编辑主题标题' })).not.toBeInTheDocument()
    const topicRoot = screen.getByText(secondTitle).closest('[data-selected]')
    expect(topicRoot).toHaveAttribute('data-selected', 'true')
    expect(topicRoot).toHaveAttribute('data-active', 'true')
  })

  it('keeps the lock badge visible while the node is selected', () => {
    const document = createMindMapDocument()
    const branchId = document.topics[document.rootTopicId].childIds[0]
    const branchTitle = document.topics[branchId].title
    document.topics[branchId].aiLocked = true
    document.topics[branchId].note = '锁定状态下也要继续显示这段详细内容。'

    useEditorStore.getState().setDocument(document)
    useEditorStore.getState().setSelection([branchId], branchId)

    renderTopicNode(createTopicNodeProps(branchId, document, { selected: true }))

    const preview = screen.getByText('锁定状态下也要继续显示这段详细内容。')
    expect(screen.getByRole('img', { name: 'AI 锁定节点' })).toBeInTheDocument()
    expect(preview).toHaveAttribute('data-inline-detail', 'true')
    expect(screen.getByText(branchTitle).closest('[data-selected]')).toHaveAttribute('data-selected', 'true')
  })

  it('relies on the React Flow selected prop instead of the store selection fallback', () => {
    const document = createMindMapDocument()
    const branchId = document.topics[document.rootTopicId].childIds[0]
    const branchTitle = document.topics[branchId].title

    useEditorStore.getState().setDocument(document)
    useEditorStore.getState().setSelection([branchId], branchId)

    renderTopicNode(createTopicNodeProps(branchId, document, { selected: false }))

    expect(screen.getByText(branchTitle).closest('[data-selected]')).toHaveAttribute(
      'data-selected',
      'false',
    )
  })

  it('shows sticker badges and overflow count in the node meta row', () => {
    const document = createMindMapDocument()
    const branchId = document.topics[document.rootTopicId].childIds[0]
    document.topics[branchId].metadata.stickers = ['smile', 'rocket', 'heart']

    useEditorStore.getState().setDocument(document)
    renderTopicNode(createTopicNodeProps(branchId, document))

    expect(screen.getAllByRole('img', { name: /贴纸：/ })).toHaveLength(2)
    expect(screen.getByText('+1')).toBeInTheDocument()
  })

  it('keeps task status icons inside the title row with the inline detail text', () => {
    const document = createMindMapDocument()
    const branchId = document.topics[document.rootTopicId].childIds[0]
    const branchTitle = document.topics[branchId].title
    document.topics[branchId].metadata.type = 'task'
    document.topics[branchId].note = '任务说明会直接显示在标题下面，而不是进入一个单独提示框。'

    useEditorStore.getState().setDocument(document)
    renderTopicNode(createTopicNodeProps(branchId, document))

    const title = screen.getByText(branchTitle)
    const taskIcon = screen.getByRole('img', { name: '任务' })
    const titleRow = title.parentElement?.parentElement

    expect(titleRow).toContainElement(taskIcon)
    expect(screen.getByText('任务说明会直接显示在标题下面，而不是进入一个单独提示框。')).toHaveAttribute(
      'data-inline-detail',
      'true',
    )
  })

  it('uses the same inline detail element for root and regular nodes', () => {
    const document = createMindMapDocument()
    const branchId = document.topics[document.rootTopicId].childIds[0]
    document.topics[document.rootTopicId].note = '根节点也应该沿用同一套正文预览样式。'
    document.topics[branchId].note = '普通节点也应该沿用同一套正文预览样式。'

    useEditorStore.getState().setDocument(document)
    const rootView = renderTopicNode(createTopicNodeProps(document.rootTopicId, document))
    const rootPreview = screen.getByText('根节点也应该沿用同一套正文预览样式。')
    const rootPreviewClassName = rootPreview.className
    rootView.unmount()

    renderTopicNode(createTopicNodeProps(branchId, document))
    const branchPreview = screen.getByText('普通节点也应该沿用同一套正文预览样式。')

    expect(rootPreviewClassName).toBe(branchPreview.className)
    expect(branchPreview).toHaveAttribute('data-inline-detail', 'true')
  })

  it('uses the shared compact title tier and taller layout for long node titles', () => {
    const document = createMindMapDocument()
    const branchId = document.topics[document.rootTopicId].childIds[0]
    const longTitle =
      '所以第一步不是找“大市场”，而是锁定一个足够具体的 beachhead segment'
    document.topics[branchId].title = longTitle

    useEditorStore.getState().setDocument(document)
    renderTopicNode(createTopicNodeProps(branchId, document))

    const title = screen.getByText(longTitle)
    expect(title).toHaveAttribute('data-title-tier', 'small')
    expect(title.getAttribute('style')).toContain('--topic-title-font-size: 14px')

    const measuredNode = layoutMindMap(document).renderNodes.find((entry) => entry.id === branchId)
    expect(Number(measuredNode?.style?.height ?? 0)).toBeGreaterThan(54)
  })

  it('shows a distinct drop target preview state without relying on selection', () => {
    const document = createMindMapDocument()
    const branchId = document.topics[document.rootTopicId].childIds[0]
    const branchTitle = document.topics[branchId].title

    useEditorStore.getState().setDocument(document)
    renderTopicNode(createTopicNodeProps(branchId, document, { dropTarget: true }))

    expect(screen.getByText(branchTitle).closest('[data-drop-target]')).toHaveAttribute(
      'data-drop-target',
      'true',
    )
    expect(screen.getByText(branchTitle).closest('[data-selected]')).toHaveAttribute(
      'data-selected',
      'false',
    )
  })
})
