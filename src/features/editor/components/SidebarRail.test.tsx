import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SidebarRail } from './SidebarRail'

describe('SidebarRail', () => {
  it('renders the rail toggle with sidebar accessibility metadata', async () => {
    const onToggle = vi.fn()

    render(
      <SidebarRail
        side="left"
        controlsId="editor-hierarchy-sidebar"
        expanded={false}
        label="显示层级栏"
        onToggle={onToggle}
      />,
    )

    const toggle = screen.getByRole('button', { name: '显示层级栏' })
    expect(toggle).toHaveAttribute('aria-controls', 'editor-hierarchy-sidebar')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(toggle)
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})
