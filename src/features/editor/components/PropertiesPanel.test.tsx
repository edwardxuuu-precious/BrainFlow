import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createMindMapDocument } from '../../documents/document-factory'
import { PropertiesPanel } from './PropertiesPanel'

describe('PropertiesPanel', () => {
  it('switches branch side for first-level topics', async () => {
    const document = createMindMapDocument()
    const firstBranch = document.topics[document.topics[document.rootTopicId].childIds[0]]
    const branchSpy = vi.fn()

    render(
      <PropertiesPanel
        topic={firstBranch}
        isRoot={false}
        isFirstLevel
        onRename={vi.fn()}
        onAddChild={vi.fn()}
        onAddSibling={vi.fn()}
        onDelete={vi.fn()}
        onNoteChange={vi.fn()}
        onBranchSideChange={branchSpy}
        onResetPosition={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: '右侧' }))

    expect(branchSpy).toHaveBeenCalledWith('right')
  })

  it('disables branch-side controls for non-first-level topics', () => {
    const document = createMindMapDocument()
    const topic = document.topics[document.rootTopicId]

    render(
      <PropertiesPanel
        topic={topic}
        isRoot
        isFirstLevel={false}
        onRename={vi.fn()}
        onAddChild={vi.fn()}
        onAddSibling={vi.fn()}
        onDelete={vi.fn()}
        onNoteChange={vi.fn()}
        onBranchSideChange={vi.fn()}
        onResetPosition={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: '自动' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '左侧' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '右侧' })).toBeDisabled()
  })

  it('resets manual position from the inspector', async () => {
    const document = createMindMapDocument()
    const firstBranch = document.topics[document.topics[document.rootTopicId].childIds[0]]
    const resetSpy = vi.fn()

    render(
      <PropertiesPanel
        topic={firstBranch}
        isRoot={false}
        isFirstLevel
        onRename={vi.fn()}
        onAddChild={vi.fn()}
        onAddSibling={vi.fn()}
        onDelete={vi.fn()}
        onNoteChange={vi.fn()}
        onBranchSideChange={vi.fn()}
        onResetPosition={resetSpy}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: '重置位置' }))

    expect(resetSpy).toHaveBeenCalledTimes(1)
  })
})
