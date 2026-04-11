import { describe, expect, it } from 'vitest'
import { createMindMapDocument } from '../documents/document-factory'
import { layoutMindMap } from './layout'
import { addChild, setTopicOffset, toggleCollapse } from './tree-operations'

describe('layoutMindMap', () => {
  it('alternates first-level branches across both sides', () => {
    const document = createMindMapDocument()
    const layout = layoutMindMap(document)
    const rootId = document.rootTopicId
    const [leftBranchId, rightBranchId] = document.topics[rootId].childIds
    const leftBranch = layout.renderNodes.find((node) => node.id === leftBranchId)
    const rightBranch = layout.renderNodes.find((node) => node.id === rightBranchId)

    expect(leftBranch?.position.x).toBeLessThan(0)
    expect(rightBranch?.position.x).toBeGreaterThan(0)
  })

  it('hides descendants for collapsed branches', () => {
    const document = createMindMapDocument()
    const firstBranchId = document.topics[document.rootTopicId].childIds[0]
    const expanded = addChild(document, firstBranchId).document
    const childId = expanded.topics[firstBranchId].childIds[0]
    const collapsed = toggleCollapse(expanded, firstBranchId)
    const layout = layoutMindMap(collapsed)

    expect(layout.renderNodes.some((node) => node.id === childId)).toBe(false)
  })

  it('produces stable output for the same document', () => {
    const document = createMindMapDocument()
    const first = layoutMindMap(document)
    const second = layoutMindMap(document)

    expect(second).toEqual(first)
  })

  it('applies manual offset to the dragged topic position', () => {
    const document = createMindMapDocument()
    const branchId = document.topics[document.rootTopicId].childIds[0]
    const baseLayout = layoutMindMap(document)
    const shiftedLayout = layoutMindMap(setTopicOffset(document, branchId, 64, 28))
    const baseNode = baseLayout.renderNodes.find((node) => node.id === branchId)
    const shiftedNode = shiftedLayout.renderNodes.find((node) => node.id === branchId)

    expect(shiftedNode?.position.x).toBe((baseNode?.position.x ?? 0) + 64)
    expect(shiftedNode?.position.y).toBe((baseNode?.position.y ?? 0) + 28)
  })

  it('moves the whole subtree when a parent topic has manual offset', () => {
    const document = createMindMapDocument()
    const branchId = document.topics[document.rootTopicId].childIds[0]
    const withChild = addChild(document, branchId).document
    const childId = withChild.topics[branchId].childIds[0]
    const baseLayout = layoutMindMap(withChild)
    const shiftedLayout = layoutMindMap(setTopicOffset(withChild, branchId, 52, 20))
    const baseChild = baseLayout.renderNodes.find((node) => node.id === childId)
    const shiftedChild = shiftedLayout.renderNodes.find((node) => node.id === childId)

    expect(shiftedChild?.position.x).toBe((baseChild?.position.x ?? 0) + 52)
    expect(shiftedChild?.position.y).toBe((baseChild?.position.y ?? 0) + 20)
  })

  it('expands long-title node heights and preserves sibling spacing', () => {
    const document = createMindMapDocument()
    const branchId = document.topics[document.rootTopicId].childIds[0]
    const withFirstChild = addChild(document, branchId).document
    const firstChildId = withFirstChild.topics[branchId].childIds[0]
    const withSecondChild = addChild(withFirstChild, branchId).document
    const secondChildId = withSecondChild.topics[branchId].childIds[1]
    withSecondChild.topics[firstChildId].title =
      '所以第一步不是找“大市场”，而是锁定一个足够具体的 beachhead segment'

    const layout = layoutMindMap(withSecondChild)
    const firstChild = layout.renderNodes.find((node) => node.id === firstChildId)
    const secondChild = layout.renderNodes.find((node) => node.id === secondChildId)
    const firstChildHeight = Number(firstChild?.style?.height ?? 0)

    expect(firstChildHeight).toBeGreaterThan(54)
    expect(secondChild).toBeDefined()
    expect((secondChild?.position.y ?? 0)).toBeGreaterThanOrEqual(
      (firstChild?.position.y ?? 0) + firstChildHeight + 30,
    )
  })

  it('expands the root node height for long titles', () => {
    const document = createMindMapDocument()
    document.topics[document.rootTopicId].title =
      '所以第一步不是找“大市场”，而是锁定一个足够具体的 beachhead segment'

    const rootNode = layoutMindMap(document).renderNodes.find((node) => node.id === document.rootTopicId)

    expect(Number(rootNode?.style?.height ?? 0)).toBeGreaterThan(82)
  })

  it('allocates extra height and preview text for nodes with detailed content', () => {
    const document = createMindMapDocument()
    const branchId = document.topics[document.rootTopicId].childIds[0]
    document.topics[branchId].note =
      '准是痛点，要看现实代价，不看口头态度。优先展示真实购买信号，而不是抽象画像。'

    const layout = layoutMindMap(document)
    const branchNode = layout.renderNodes.find((node) => node.id === branchId)

    expect(branchNode).toBeDefined()
    expect(branchNode?.data.notePreview).toContain('准是痛点，要看现实代价')
    expect(Number(branchNode?.style?.height ?? 0)).toBeGreaterThan(54)
  })

  it('keeps sibling spacing stable when a node shows a multi-line inline preview', () => {
    const document = createMindMapDocument()
    const branchId = document.topics[document.rootTopicId].childIds[0]
    const withFirstChild = addChild(document, branchId).document
    const firstChildId = withFirstChild.topics[branchId].childIds[0]
    const withSecondChild = addChild(withFirstChild, branchId).document
    const secondChildId = withSecondChild.topics[branchId].childIds[1]

    withSecondChild.topics[firstChildId].note =
      '这段详细内容会被压成多行正文预览，所以必须确认它增加高度之后，下面的兄弟节点仍然会被正常推开，不会和它挤在一起。'

    const layout = layoutMindMap(withSecondChild)
    const firstChild = layout.renderNodes.find((node) => node.id === firstChildId)
    const secondChild = layout.renderNodes.find((node) => node.id === secondChildId)
    const firstChildHeight = Number(firstChild?.style?.height ?? 0)

    expect(firstChild?.data.notePreview).toContain('这段详细内容会被压成多行正文预览')
    expect(firstChildHeight).toBeGreaterThan(54)
    expect((secondChild?.position.y ?? 0)).toBeGreaterThanOrEqual(
      (firstChild?.position.y ?? 0) + firstChildHeight + 30,
    )
  })

  it('does not add a full extra status row when task and lock markers are present', () => {
    const document = createMindMapDocument()
    const branchId = document.topics[document.rootTopicId].childIds[0]
    document.topics[branchId].aiLocked = true
    document.topics[branchId].metadata.type = 'task'
    document.topics[branchId].note = '状态图标和正文会共用同一层级。'

    const branchNode = layoutMindMap(document).renderNodes.find((node) => node.id === branchId)
    const branchHeight = Number(branchNode?.style?.height ?? 0)

    expect(branchNode?.data.notePreview).toContain('状态图标和正文会共用同一层级')
    expect(branchHeight).toBeGreaterThan(54)
    expect(branchHeight).toBeLessThan(96)
  })

  it('keeps the root preview inline while still expanding the root height', () => {
    const document = createMindMapDocument()
    document.topics[document.rootTopicId].note =
      '根节点的详细内容也应该作为标题下的正文出现，同时保持中心节点应有的体量感和高度。'

    const rootNode = layoutMindMap(document).renderNodes.find((node) => node.id === document.rootTopicId)

    expect(rootNode?.data.notePreview).toContain('根节点的详细内容也应该作为标题下的正文出现')
    expect(Number(rootNode?.style?.height ?? 0)).toBeGreaterThan(82)
  })
})
