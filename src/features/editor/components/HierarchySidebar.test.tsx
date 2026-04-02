import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createMindMapDocument } from '../../documents/document-factory'
import { HierarchySidebar } from './HierarchySidebar'

const COPY = {
  collapse: '隐藏层级栏',
  noteDescription: '已添加备注',
} as const

describe('HierarchySidebar', () => {
  it('renders the integrated sidebar structure and collapse control', async () => {
    const document = createMindMapDocument()
    const onCollapse = vi.fn()

    render(
      <HierarchySidebar
        id="hierarchy-sidebar"
        document={document}
        activeTopicId={document.rootTopicId}
        selectedTopicIds={[document.rootTopicId]}
        onSelect={vi.fn()}
        onPrimaryAction={vi.fn()}
        onCollapse={onCollapse}
      />,
    )

    expect(screen.getByRole('heading', { name: document.title })).toBeInTheDocument()
    expect(screen.getByRole('navigation')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: COPY.collapse })).toHaveAttribute(
      'aria-controls',
      'hierarchy-sidebar',
    )

    await userEvent.click(screen.getByRole('button', { name: COPY.collapse }))
    expect(onCollapse).toHaveBeenCalledTimes(1)
  })

  it('shows a note marker and accessible description for noted topics', () => {
    const document = createMindMapDocument()
    const notedTopicId = document.topics[document.rootTopicId].childIds[0]
    document.topics[notedTopicId].note = '记录上下文'

    render(
      <HierarchySidebar
        document={document}
        activeTopicId={document.rootTopicId}
        selectedTopicIds={[document.rootTopicId]}
        onSelect={vi.fn()}
        onPrimaryAction={vi.fn()}
      />,
    )

    const topicButton = screen.getByRole('button', { name: /分支一/ })
    expect(topicButton).toHaveAccessibleDescription(COPY.noteDescription)
    expect(topicButton.querySelector('[data-note-indicator="true"]')).toBeInTheDocument()
  })

  it('passes additive intent when modifier keys are pressed', async () => {
    const document = createMindMapDocument()
    const notedTopicId = document.topics[document.rootTopicId].childIds[0]
    const onSelect = vi.fn()

    render(
      <HierarchySidebar
        document={document}
        activeTopicId={document.rootTopicId}
        selectedTopicIds={[document.rootTopicId]}
        onSelect={onSelect}
        onPrimaryAction={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /分支一/ }), {
      ctrlKey: true,
    })

    expect(onSelect).toHaveBeenCalledWith(notedTopicId, true)
  })
})
