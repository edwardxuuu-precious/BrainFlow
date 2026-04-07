import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createMindMapDocument } from '../../documents/document-factory'
import type { MindMapDocument, TopicNode } from '../../documents/types'
import { PropertiesPanel } from './PropertiesPanel'

interface RenderPanelOptions {
  availableLabels?: string[]
  mutateTopic?: (topic: TopicNode, document: MindMapDocument) => void
}

function renderPanel(options: RenderPanelOptions = {}) {
  const document = createMindMapDocument('Sidebar regression')
  const firstBranch = document.topics[document.topics[document.rootTopicId].childIds[0]]
  firstBranch.title = 'Focus topic'
  firstBranch.note = 'Detailed note for the inspector.'
  options.mutateTopic?.(firstBranch, document)

  const onMetadataChange = vi.fn()

  render(
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
      availableLabels={options.availableLabels ?? []}
      onRenameChange={vi.fn()}
      onRenameCommit={vi.fn()}
      onRenameCancel={vi.fn()}
      onNoteChange={vi.fn()}
      onMetadataChange={onMetadataChange}
      onToggleAiLock={vi.fn()}
      onLockSelected={vi.fn()}
      onUnlockSelected={vi.fn()}
    />,
  )

  return {
    onMetadataChange,
  }
}

describe('PropertiesPanel', () => {
  it('keeps available label quick-add actions working', async () => {
    const user = userEvent.setup()
    const { onMetadataChange } = renderPanel({
      availableLabels: ['alpha', 'beta'],
      mutateTopic: (topic) => {
        topic.metadata.labels = ['existing']
      },
    })

    await user.click(screen.getByRole('button', { name: '+ alpha' }))

    expect(onMetadataChange).toHaveBeenCalledWith({
      labels: ['existing', 'alpha'],
    })
  })

  it('does not render task, link, or attachment sections', () => {
    renderPanel()

    expect(screen.queryByText('任务')).not.toBeInTheDocument()
    expect(screen.queryByText('链接')).not.toBeInTheDocument()
    expect(screen.queryByText('附件引用')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '启用任务' })).not.toBeInTheDocument()
  })
  it('renders long titles fully with the shared compact title tier', () => {
    const longTitle = '所以第一步不是找“大市场”，而是锁定一个足够具体的 beachhead segment'
    renderPanel({
      mutateTopic: (topic) => {
        topic.title = longTitle
      },
    })

    const heading = screen.getByRole('heading', { name: longTitle })
    expect(heading).toHaveAttribute('data-title-tier', 'small')
    expect(heading.getAttribute('style')).toContain('--topic-title-font-size: 14px')
  })
})
