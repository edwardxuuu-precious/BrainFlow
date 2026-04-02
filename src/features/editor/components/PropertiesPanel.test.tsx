import type { ComponentProps } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createMindMapDocument } from '../../documents/document-factory'
import { PropertiesPanel } from './PropertiesPanel'
import styles from './PropertiesPanel.module.css'

const COPY = {
  auto: '自动',
  left: '左侧',
  right: '右侧',
  reset: '重置位置',
  addChild: '新增子主题',
  deleteTopic: '删除主题',
  rename: '重命名',
  renameField: '编辑主题标题',
  renameHint: '正在编辑右侧标题，按 Enter 保存，Esc 取消。',
  collapse: '隐藏右侧栏',
} as const

function renderPanel(overrides?: Partial<ComponentProps<typeof PropertiesPanel>>) {
  const document = createMindMapDocument()
  const firstBranch = document.topics[document.topics[document.rootTopicId].childIds[0]]

  return {
    document,
    firstBranch,
    ...render(
      <PropertiesPanel
        id="inspector-sidebar"
        topic={firstBranch}
        selectionCount={1}
        isRoot={false}
        isFirstLevel
        draftTitle={firstBranch.title}
        isInspectorEditing={false}
        onRenameStart={vi.fn()}
        onRenameChange={vi.fn()}
        onRenameCommit={vi.fn()}
        onRenameCancel={vi.fn()}
        onAddChild={vi.fn()}
        onAddSibling={vi.fn()}
        onDelete={vi.fn()}
        onNoteChange={vi.fn()}
        onBranchSideChange={vi.fn()}
        onResetPosition={vi.fn()}
        onCollapse={vi.fn()}
        {...overrides}
      />,
    ),
  }
}

describe('PropertiesPanel', () => {
  it('renders the integrated inspector chrome and collapse control', async () => {
    const onCollapse = vi.fn()

    renderPanel({ onCollapse })

    const collapseButton = screen.getByRole('button', { name: COPY.collapse })
    expect(collapseButton).toHaveAttribute('aria-controls', 'inspector-sidebar')

    await userEvent.click(collapseButton)
    expect(onCollapse).toHaveBeenCalledTimes(1)
  })

  it('shows the heading by default and starts inspector rename from the button', async () => {
    const renameStartSpy = vi.fn()
    const { firstBranch } = renderPanel({ onRenameStart: renameStartSpy })

    const renameButton = screen.getByRole('button', { name: COPY.rename })
    await userEvent.click(renameButton)

    expect(screen.getByRole('heading', { name: firstBranch.title })).toBeInTheDocument()
    expect(renameButton).toHaveAttribute('aria-pressed', 'false')
    expect(renameStartSpy).toHaveBeenCalledTimes(1)
  })

  it('renders an inspector title input and handles commit and cancel keys', async () => {
    const commitSpy = vi.fn()
    const cancelSpy = vi.fn()
    const changeSpy = vi.fn()
    const { firstBranch } = renderPanel({
      isInspectorEditing: true,
      onRenameCommit: commitSpy,
      onRenameCancel: cancelSpy,
      onRenameChange: changeSpy,
    })

    const renameButton = screen.getByRole('button', { name: COPY.rename })
    const renameField = screen.getByRole('textbox', { name: COPY.renameField })

    expect(renameField).toHaveFocus()
    expect(renameField).toHaveDisplayValue(firstBranch.title)
    expect(renameButton).toHaveAttribute('aria-pressed', 'true')
    expect(renameButton).toHaveClass(styles.renameButtonActive)
    expect(screen.getByText(COPY.renameHint)).toBeInTheDocument()

    await userEvent.type(renameField, 'X')
    expect(changeSpy).toHaveBeenCalled()

    await userEvent.type(renameField, '{enter}')
    expect(commitSpy).toHaveBeenCalledTimes(1)

    await userEvent.type(renameField, '{escape}')
    expect(cancelSpy).toHaveBeenCalledTimes(1)
  })

  it('switches branch side for first-level topics', async () => {
    const branchSpy = vi.fn()
    renderPanel({ onBranchSideChange: branchSpy })

    await userEvent.click(screen.getByRole('button', { name: COPY.right }))

    expect(branchSpy).toHaveBeenCalledWith('right')
  })

  it('disables branch-side controls for non-first-level topics', () => {
    const document = createMindMapDocument()
    const topic = document.topics[document.rootTopicId]

    renderPanel({
      topic,
      isRoot: true,
      isFirstLevel: false,
      draftTitle: topic.title,
    })

    expect(screen.getByRole('button', { name: COPY.auto })).toBeDisabled()
    expect(screen.getByRole('button', { name: COPY.left })).toBeDisabled()
    expect(screen.getByRole('button', { name: COPY.right })).toBeDisabled()
  })

  it('resets manual position from the inspector', async () => {
    const resetSpy = vi.fn()
    renderPanel({ onResetPosition: resetSpy })

    await userEvent.click(screen.getByRole('button', { name: COPY.reset }))

    expect(resetSpy).toHaveBeenCalledTimes(1)
  })

  it('triggers create and delete actions for regular topics', async () => {
    const addChildSpy = vi.fn()
    const deleteSpy = vi.fn()
    renderPanel({ onAddChild: addChildSpy, onDelete: deleteSpy })

    await userEvent.click(screen.getByRole('button', { name: COPY.addChild }))
    await userEvent.click(screen.getByRole('button', { name: COPY.deleteTopic }))

    expect(addChildSpy).toHaveBeenCalledTimes(1)
    expect(deleteSpy).toHaveBeenCalledTimes(1)
  })

  it('shows a multi-selection summary instead of single-topic controls', () => {
    renderPanel({
      topic: null,
      selectionCount: 3,
    })

    expect(screen.getByRole('heading', { name: '已选择 3 个节点' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: '备注' })).not.toBeInTheDocument()
  })
})
