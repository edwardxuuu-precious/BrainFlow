import type { ComponentProps } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createMindMapDocument } from '../../documents/document-factory'
import { PropertiesPanel } from './PropertiesPanel'
import styles from './PropertiesPanel.module.css'

function renderPanel(overrides?: Partial<ComponentProps<typeof PropertiesPanel>>) {
  const document = createMindMapDocument('Sidebar regression')
  const firstBranch = document.topics[document.topics[document.rootTopicId].childIds[0]]
  firstBranch.title = 'Focus topic'
  firstBranch.note = 'Detailed note for the inspector.'

  return {
    document,
    firstBranch,
    ...render(
      <PropertiesPanel
        id="inspector-sidebar"
        topic={firstBranch}
        selectionCount={1}
        selectedLockedCount={0}
        selectedUnlockedCount={1}
        isRoot={false}
        isFirstLevel
        draftTitle={firstBranch.title}
        isInspectorEditing={false}
        topicOptions={Object.values(document.topics).map((topic) => ({
          id: topic.id,
          title: topic.title,
        }))}
        onRenameChange={vi.fn()}
        onRenameCommit={vi.fn()}
        onRenameCancel={vi.fn()}
        onNoteChange={vi.fn()}
        onMetadataChange={vi.fn()}
        onToggleAiLock={vi.fn()}
        onLockSelected={vi.fn()}
        onUnlockSelected={vi.fn()}
        onCollapse={vi.fn()}
        {...overrides}
      />,
    ),
  }
}

describe('PropertiesPanel', () => {
  it('renders the detail chrome and the collapse control', async () => {
    const onCollapse = vi.fn()
    renderPanel({ onCollapse })

    const collapseButton = screen.getByRole('button', { name: '隐藏右侧栏' })
    expect(collapseButton).toHaveAttribute('aria-controls', 'inspector-sidebar')
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.getByText('详情')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '节点详情' })).toBeInTheDocument()

    await userEvent.click(collapseButton)
    expect(onCollapse).toHaveBeenCalledTimes(1)
  })

  it('shows the selected topic heading and note field by default', async () => {
    renderPanel()

    expect(screen.getByRole('heading', { name: 'Focus topic' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '详细内容' }))
    const noteField = screen.getByRole('textbox', { name: '详细内容富文本编辑器' })
    expect(noteField).not.toBeNull()
    expect(noteField).toHaveTextContent('Detailed note for the inspector.')
    expect(screen.getByRole('group', { name: '详细内容视图切换' })).toBeInTheDocument()
  })

  it('renders the inspector title input when editing is active', () => {
    const { container } = renderPanel({
      isInspectorEditing: true,
    })

    const titleInput = container.querySelector<HTMLInputElement>(`input.${styles.headingInput}`)
    expect(titleInput).not.toBeNull()
    expect(titleInput).toHaveValue('Focus topic')
    expect(titleInput).toHaveFocus()
  })

  it('hides single-topic fields for multi-selection state', () => {
    const { container } = renderPanel({
      topic: null,
      selectionCount: 3,
      selectedLockedCount: 1,
      selectedUnlockedCount: 2,
    })

    expect(container.querySelector('#topic-note')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Focus topic' })).not.toBeInTheDocument()
  })
})
