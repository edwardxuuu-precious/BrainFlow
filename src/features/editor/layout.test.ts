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
})
