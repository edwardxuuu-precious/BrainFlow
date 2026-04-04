import type { ComponentProps } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createMindMapDocument } from '../../documents/document-factory'
import { HierarchySidebar } from './HierarchySidebar'

const COPY = {
  noteDescription: '已添加详细内容',
} as const

function renderSidebar(overrides?: Partial<ComponentProps<typeof HierarchySidebar>>) {
  const document = createMindMapDocument()

  return {
    document,
    ...render(
      <HierarchySidebar
        document={document}
        activeTopicId={document.rootTopicId}
        selectedTopicIds={[document.rootTopicId]}
        collapsedTopicIds={[]}
        onSelect={vi.fn()}
        onToggleBranch={vi.fn()}
        onPrimaryAction={vi.fn()}
        {...overrides}
      />,
    ),
  }
}

describe('HierarchySidebar', () => {
  it('renders the integrated sidebar structure', () => {
    const { document } = renderSidebar({
      id: 'hierarchy-sidebar',
    })

    expect(screen.getByRole('complementary')).toHaveAttribute('id', 'hierarchy-sidebar')
    expect(screen.getByText('目录')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: document.title })).toBeInTheDocument()
    expect(screen.getByRole('navigation')).toBeInTheDocument()
  })

  it('shows a note marker and accessible description for noted topics', () => {
    const document = createMindMapDocument()
    const notedTopicId = document.topics[document.rootTopicId].childIds[0]
    document.topics[notedTopicId].note = '记录上下文'

    renderSidebar({ document })

    const topicButton = screen.getByRole('button', { name: /分支一/ })
    expect(topicButton).toHaveAccessibleDescription(COPY.noteDescription)
    expect(topicButton.querySelector('[data-note-indicator="true"]')).toBeInTheDocument()
  })

  it('shows a lock marker for AI locked topics in the tree', () => {
    const document = createMindMapDocument()
    const lockedTopicId = document.topics[document.rootTopicId].childIds[0]
    document.topics[lockedTopicId].aiLocked = true

    renderSidebar({ document })

    const topicButton = screen.getByRole('button', { name: /分支一/ })
    expect(topicButton.querySelector('[data-lock-indicator="true"]')).toBeInTheDocument()
  })

  it('passes additive intent when modifier keys are pressed', () => {
    const document = createMindMapDocument()
    const branchId = document.topics[document.rootTopicId].childIds[0]
    const onSelect = vi.fn()

    renderSidebar({
      document,
      onSelect,
    })

    fireEvent.click(screen.getByRole('button', { name: /分支一/ }), {
      ctrlKey: true,
    })

    expect(onSelect).toHaveBeenCalledWith(branchId, true)
  })

  it('shows branch toggles and only collapses the tree branch when clicking the chevron', async () => {
    const document = createMindMapDocument()
    const branchId = document.topics[document.rootTopicId].childIds[0]
    const childId = 'topic_nested_child'
    document.topics[branchId].childIds.push(childId)
    document.topics[childId] = {
      id: childId,
      parentId: branchId,
      childIds: [],
      title: '深层节点',
      note: '',
      noteRich: null,
      aiLocked: false,
      isCollapsed: false,
      branchSide: 'auto',
      layout: {
        offsetX: 0,
        offsetY: 0,
      },
      metadata: {
        labels: [],
        markers: [],
        stickers: [],
        task: null,
        links: [],
        attachments: [],
      },
      style: {
        emphasis: 'normal',
        variant: 'default',
      },
    }

    const onSelect = vi.fn()
    const onToggleBranch = vi.fn()
    renderSidebar({
      document,
      onSelect,
      onToggleBranch,
    })

    await userEvent.click(screen.getByRole('button', { name: '折叠 分支一' }))

    expect(onToggleBranch).toHaveBeenCalledWith(branchId)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('hides child rows when the tree branch is collapsed', () => {
    const document = createMindMapDocument()
    const branchId = document.topics[document.rootTopicId].childIds[0]
    const childId = 'topic_nested_hidden'
    document.topics[branchId].childIds.push(childId)
    document.topics[childId] = {
      id: childId,
      parentId: branchId,
      childIds: [],
      title: '深层节点',
      note: '',
      noteRich: null,
      aiLocked: false,
      isCollapsed: false,
      branchSide: 'auto',
      layout: {
        offsetX: 0,
        offsetY: 0,
      },
      metadata: {
        labels: [],
        markers: [],
        stickers: [],
        task: null,
        links: [],
        attachments: [],
      },
      style: {
        emphasis: 'normal',
        variant: 'default',
      },
    }

    renderSidebar({
      document,
      collapsedTopicIds: [branchId],
    })

    expect(screen.queryByText('深层节点')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '展开 分支一' })).toBeInTheDocument()
  })
})
