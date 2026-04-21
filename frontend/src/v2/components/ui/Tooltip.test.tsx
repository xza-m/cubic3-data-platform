// frontend/src/v2/components/ui/Tooltip.test.tsx
import { describe, it, expect } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Tooltip } from './Tooltip'

describe('Tooltip', () => {
  it('hides label by default', () => {
    render(
      <Tooltip label="hint">
        <button>btn</button>
      </Tooltip>,
    )
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('shows label on mouse enter / focus, hides on leave / blur', () => {
    const { container } = render(
      <Tooltip label="hint">
        <button>btn</button>
      </Tooltip>,
    )
    const wrapper = container.firstChild as HTMLElement
    fireEvent.mouseEnter(wrapper)
    expect(screen.getByRole('tooltip')).toHaveTextContent('hint')
    fireEvent.mouseLeave(wrapper)
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.focus(wrapper)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    fireEvent.blur(wrapper)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it.each(['top', 'right', 'bottom', 'left'] as const)('applies side=%s positioning', (side) => {
    const { container } = render(
      <Tooltip label="hint" side={side}>
        <button>x</button>
      </Tooltip>,
    )
    fireEvent.mouseEnter(container.firstChild as HTMLElement)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
  })

  it('does not render when label is empty', () => {
    const { container } = render(
      <Tooltip label="">
        <button>x</button>
      </Tooltip>,
    )
    fireEvent.mouseEnter(container.firstChild as HTMLElement)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})
