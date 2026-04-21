// frontend/src/v2/components/ui/Button.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button, RailButton } from './Button'

describe('Button', () => {
  it('renders children with default variant/size', () => {
    render(<Button>OK</Button>)
    const btn = screen.getByRole('button', { name: 'OK' })
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveAttribute('type', 'button')
    expect(btn.className).toContain('btn')
  })

  it('applies primary/ghost/danger/sm classes', () => {
    const { rerender } = render(<Button variant="primary">A</Button>)
    expect(screen.getByRole('button').className).toContain('btn-primary')
    rerender(<Button variant="ghost">A</Button>)
    expect(screen.getByRole('button').className).toContain('btn-ghost')
    rerender(<Button variant="danger">A</Button>)
    expect(screen.getByRole('button').className).toContain('btn-danger')
    rerender(<Button size="sm">A</Button>)
    expect(screen.getByRole('button').className).toContain('btn-sm')
  })

  it('shows loading spinner and is disabled when loading', () => {
    render(<Button loading>Save</Button>)
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-busy', 'true')
  })

  it('respects explicit disabled prop', () => {
    render(<Button disabled>X</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('honors custom type attribute', () => {
    render(<Button type="submit">S</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
  })

  it('forwards click events when not disabled', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>C</Button>)
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('loading uses smaller spinner for sm', () => {
    render(<Button loading size="sm">A</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true')
  })
})

describe('RailButton', () => {
  it('renders with active class when active=true', () => {
    render(<RailButton active aria-label="rail" />)
    const btn = screen.getByLabelText('rail')
    expect(btn.className).toContain('active')
  })

  it('omits active class when not active', () => {
    render(<RailButton aria-label="rail" />)
    expect(screen.getByLabelText('rail').className).not.toContain('active')
  })

  it('honors custom type', () => {
    render(<RailButton type="submit" aria-label="rail" />)
    expect(screen.getByLabelText('rail')).toHaveAttribute('type', 'submit')
  })
})
