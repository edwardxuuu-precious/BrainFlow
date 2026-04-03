import type { ComponentProps } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createMindMapDocument } from '../../documents/document-factory'
import { EditorSidebarTabs } from './EditorSidebarTabs'
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
        theme={{
          surface: document.theme.surface,
          text: document.theme.text,
          accent: document.theme.accent,
        }}
        topicOptions={Object.values(document.topics).map((topic) => ({
          id: topic.id,
          title: topic.title,
        }))}
        onRenameStart={vi.fn()}
        onRenameChange={vi.fn()}
        onRenameCommit={vi.fn()}
        onRenameCancel={vi.fn()}
        onAddChild={vi.fn()}
        onAddSibling={vi.fn()}
        onDelete={vi.fn()}
        onNoteChange={vi.fn()}
        onMetadataChange={vi.fn()}
        onStyleChange={vi.fn()}
        onApplyStyleToSelected={vi.fn()}
        onBranchSideChange={vi.fn()}
        onResetPosition={vi.fn()}
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
  it('renders shared sidebar tabs and the collapse control', async () => {
    const onCollapse = vi.fn()
    const onChange = vi.fn()

    renderPanel({
      tabs: (
        <EditorSidebarTabs
          controlsId="inspector-sidebar"
          activeTab="inspector"
          onChange={onChange}
          onCollapse={onCollapse}
        />
      ),
    })

    expect(screen.getByRole('tab', { name: 'Inspector' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'AI' })).toHaveAttribute('aria-selected', 'false')

    await userEvent.click(screen.getByRole('tab', { name: 'AI' }))
    expect(onChange).toHaveBeenCalledWith('ai')

    const collapseButton = screen.getByRole('button', { name: '隐藏右侧栏' })
    expect(collapseButton).toHaveAttribute('aria-controls', 'inspector-sidebar')

    await userEvent.click(collapseButton)
    expect(onCollapse).toHaveBeenCalledTimes(1)
  })

  it('shows the selected topic heading and note field by default', () => {
    const { container } = renderPanel()

    expect(screen.getByRole('heading', { name: 'Focus topic' })).toBeInTheDocument()
    const noteField = container.querySelector<HTMLTextAreaElement>('#topic-note')
    expect(noteField).not.toBeNull()
    expect(noteField).toHaveValue('Detailed note for the inspector.')
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
