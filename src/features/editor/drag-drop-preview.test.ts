import { describe, expect, it } from 'vitest'
import { createMindMapDocument } from '../documents/document-factory'
import { layoutMindMap } from './layout'
import { addChild, toggleCollapse } from './tree-operations'
import { findTopicDropPreview, getFlowNodeRect, type TopicRect } from './drag-drop-preview'

function shiftRectToCenter(rect: TopicRect, centerX: number, centerY: number): TopicRect {
  return {
    ...rect,
    x: centerX - rect.width / 2,
    y: centerY - rect.height / 2,
  }
}

function getNodeRect(document: ReturnType<typeof createMindMapDocument>, topicId: string) {
  const node = layoutMindMap(document).renderNodes.find((entry) => entry.id === topicId)
  if (!node) {
    throw new Error(`Missing layout node for topic ${topicId}`)
  }

  return {
    node,
    rect: getFlowNodeRect(node),
  }
}

describe('drag-drop-preview', () => {
  it('finds a valid cross-branch target and insert index from the target child lane', () => {
    const document = createMindMapDocument()
    const rootId = document.rootTopicId
    const [draggedTopicId, targetParentId] = document.topics[rootId].childIds
    const targetWithChild = addChild(document, targetParentId).document
    const targetChildId = targetWithChild.topics[targetParentId].childIds[0]
    const layout = layoutMindMap(targetWithChild)
    const draggedNode = layout.renderNodes.find((entry) => entry.id === draggedTopicId)
    const targetChildNode = layout.renderNodes.find((entry) => entry.id === targetChildId)

    if (!draggedNode || !targetChildNode) {
      throw new Error('Missing drag preview test nodes')
    }

    const draggedRect = shiftRectToCenter(
      getFlowNodeRect(draggedNode),
      targetChildNode.position.x + Number(targetChildNode.style?.width ?? 0) / 2,
      targetChildNode.position.y + Number(targetChildNode.style?.height ?? 0) / 2 - 12,
    )

    expect(
      findTopicDropPreview({
        document: targetWithChild,
        layout,
        topicId: draggedTopicId,
        topicRect: draggedRect,
      }),
    ).toEqual({
      targetParentId,
      targetIndex: 0,
      isStructuralMove: true,
    })
  })

  it('returns index 0 for a collapsed target branch using its fallback child lane', () => {
    const document = createMindMapDocument()
    const rootId = document.rootTopicId
    const [draggedTopicId, targetParentId] = document.topics[rootId].childIds
    const withChild = addChild(document, targetParentId).document
    const collapsed = toggleCollapse(withChild, targetParentId)
    const layout = layoutMindMap(collapsed)
    const { rect: draggedRect } = getNodeRect(collapsed, draggedTopicId)
    const { rect: targetRect } = getNodeRect(collapsed, targetParentId)
    const dropRect = shiftRectToCenter(
      draggedRect,
      targetRect.x + targetRect.width + 164,
      targetRect.y + targetRect.height / 2,
    )

    expect(
      findTopicDropPreview({
        document: collapsed,
        layout,
        topicId: draggedTopicId,
        topicRect: dropRect,
      }),
    ).toEqual({
      targetParentId,
      targetIndex: 0,
      isStructuralMove: true,
    })
  })

  it('rejects root and descendant areas as drop targets', () => {
    const document = createMindMapDocument()
    const rootId = document.rootTopicId
    const [branchId] = document.topics[rootId].childIds
    const withChild = addChild(document, branchId).document
    const childId = withChild.topics[branchId].childIds[0]
    const layout = layoutMindMap(withChild)
    const { rect: rootRect } = getNodeRect(withChild, rootId)
    const { rect: childRect } = getNodeRect(withChild, childId)

    expect(
      findTopicDropPreview({
        document: withChild,
        layout,
        topicId: branchId,
        topicRect: rootRect,
      }),
    ).toBeNull()

    expect(
      findTopicDropPreview({
        document: withChild,
        layout,
        topicId: branchId,
        topicRect: childRect,
      }),
    ).toBeNull()
  })

  it('computes same-parent reorder indexes with the dragged node excluded from siblings', () => {
    const document = createMindMapDocument()
    const branchId = document.topics[document.rootTopicId].childIds[0]
    const withFirstChild = addChild(document, branchId).document
    const firstChildId = withFirstChild.topics[branchId].childIds[0]
    const withSecondChild = addChild(withFirstChild, branchId).document
    const secondChildId = withSecondChild.topics[branchId].childIds[1]
    const withThirdChild = addChild(withSecondChild, branchId).document
    const thirdChildId = withThirdChild.topics[branchId].childIds[2]
    const layout = layoutMindMap(withThirdChild)
    const draggedNode = layout.renderNodes.find((entry) => entry.id === secondChildId)
    const thirdNode = layout.renderNodes.find((entry) => entry.id === thirdChildId)

    if (!draggedNode || !thirdNode) {
      throw new Error('Missing reorder test nodes')
    }

    const draggedRect = shiftRectToCenter(
      getFlowNodeRect(draggedNode),
      thirdNode.position.x + Number(thirdNode.style?.width ?? 0) / 2,
      thirdNode.position.y + Number(thirdNode.style?.height ?? 0) / 2 + 18,
    )

    expect(firstChildId).toBeDefined()
    expect(
      findTopicDropPreview({
        document: withThirdChild,
        layout,
        topicId: secondChildId,
        topicRect: draggedRect,
      }),
    ).toEqual({
      targetParentId: branchId,
      targetIndex: 2,
      isStructuralMove: true,
    })
  })
})
