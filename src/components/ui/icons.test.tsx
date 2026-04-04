import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Icon } from './icons'

describe('Icon', () => {
  it('renders redesigned custom icons with richer svg primitives', () => {
    const { container } = render(
      <div>
        <Icon name="note" data-testid="icon-note" />
        <Icon name="tag" data-testid="icon-tag" />
        <Icon name="palette" data-testid="icon-palette" />
        <Icon name="chat" data-testid="icon-chat" />
      </div>,
    )

    expect(screen.getByTestId('icon-note').querySelector('rect')).not.toBeNull()
    expect(screen.getByTestId('icon-tag').querySelector('circle')).not.toBeNull()
    expect(screen.getByTestId('icon-palette').querySelectorAll('circle')).toHaveLength(3)
    expect(screen.getByTestId('icon-chat').querySelector('circle')).not.toBeNull()
    expect(container.querySelectorAll('svg')).toHaveLength(4)
  })

  it('keeps legacy path-based icons working without caller changes', () => {
    render(<Icon name="undo" data-testid="icon-undo" size={20} strokeWidth={2.2} />)

    const svg = screen.getByTestId('icon-undo')
    expect(svg.getAttribute('width')).toBe('20')
    expect(svg.getAttribute('stroke-width')).toBe('2.2')
    expect(svg.querySelectorAll('path').length).toBeGreaterThan(0)
  })
})
