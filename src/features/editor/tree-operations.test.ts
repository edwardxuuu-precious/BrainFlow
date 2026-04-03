import { describe, expect, it } from 'vitest'
import { createMindMapDocument } from '../documents/document-factory'
import {
  addChild,
  addSibling,
  moveTopic,
  removeTopic,
  resetTopicOffset,
  resolveTopicSide,
  setTopicAiLocked,
  setTopicOffset,
  toggleCollapse,
} from './tree-operations'

describe('tree-operations', () => {
  it('adds child and sibling topics without mutating the original document', () => {
    const document = createMindMapDocument()
    const rootId = document.rootTopicId
    const firstBranchId = document.topics[rootId].childIds[0]
    const childResult = addChild(document, firstBranchId)
    const siblingResult = addSibling(childResult.document, firstBranchId)

    expect(document.topics[firstBranchId].childIds).toHaveLength(0)
    expect(childResult.topicId).toBeDefined()
    expect(childResult.document.topics[firstBranchId].childIds).toContain(childResult.topicId)
    expect(siblingResult.topicId).toBeDefined()
    expect(siblingResult.document.topics[rootId].childIds).toHaveLength(3)
  })

  it('moves a topic under another branch and inherits the new side', () => {
    const document = createMindMapDocument()
    const rootId = document.rootTopicId
    const [rightBranchId, leftBranchId] = document.topics[rootId].childIds
    const moved = moveTopic(document, leftBranchId, rightBranchId, 0)

    expect(moved.topics[rightBranchId].childIds[0]).toBe(leftBranchId)
    expect(moved.topics[leftBranchId].parentId).toBe(rightBranchId)
    expect(resolveTopicSide(moved, leftBranchId)).toBe(resolveTopicSide(moved, rightBranchId))
  })

  it('removes a subtree and keeps root protected', () => {
    const document = createMindMapDocument()
    const firstBranchId = document.topics[document.rootTopicId].childIds[0]
    const childResult = addChild(document, firstBranchId)
    const childId = childResult.topicId as string
    const removed = removeTopic(childResult.document, firstBranchId)
    const unchanged = removeTopic(document, document.rootTopicId)

    expect(removed.topics[firstBranchId]).toBeUndefined()
    expect(removed.topics[childId]).toBeUndefined()
    expect(unchanged).toEqual(document)
  })

  it('toggles collapse on non-leaf topics', () => {
    const document = createMindMapDocument()
    const firstBranchId = document.topics[document.rootTopicId].childIds[0]
    const withChild = addChild(document, firstBranchId).document
    const collapsed = toggleCollapse(withChild, firstBranchId)

    expect(collapsed.topics[firstBranchId].isCollapsed).toBe(true)
  })

  it('stores and resets manual topic offsets without mutating the source document', () => {
    const document = createMindMapDocument()
    const branchId = document.topics[document.rootTopicId].childIds[0]
    const moved = setTopicOffset(document, branchId, 40, 18)
    const reset = resetTopicOffset(moved, branchId)

    expect(document.topics[branchId].layout).toEqual({ offsetX: 0, offsetY: 0 })
    expect(moved.topics[branchId].layout).toEqual({ offsetX: 40, offsetY: 18 })
    expect(reset.topics[branchId].layout).toEqual({ offsetX: 0, offsetY: 0 })
  })

  it('toggles AI lock state without mutating the source document', () => {
    const document = createMindMapDocument()
    const branchId = document.topics[document.rootTopicId].childIds[0]
    const locked = setTopicAiLocked(document, branchId, true)
    const unlocked = setTopicAiLocked(locked, branchId, false)

    expect(document.topics[branchId].aiLocked).toBe(false)
    expect(locked.topics[branchId].aiLocked).toBe(true)
    expect(unlocked.topics[branchId].aiLocked).toBe(false)
  })
})
