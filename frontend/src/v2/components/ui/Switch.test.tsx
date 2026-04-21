// frontend/src/v2/components/ui/Switch.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Switch } from './Switch'

describe('Switch', () => {
  it('renders unchecked by default', () => {
    render(<Switch ariaLabel="s" />)
    const sw = screen.getByRole('switch', { name: 's' })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    expect(sw.className).not.toContain('on')
  })

  it('renders checked', () => {
    render(<Switch ariaLabel="s" checked />)
    const sw = screen.getByRole('switch', { name: 's' })
    expect(sw).toHaveAttribute('aria-checked', 'true')
    expect(sw.className).toContain('on')
  })

  it('toggles via onChange when clicked', async () => {
    const onChange = vi.fn()
    render(<Switch ariaLabel="s" checked={false} onChange={onChange} />)
    await userEvent.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('toggles to false when checked', async () => {
    const onChange = vi.fn()
    render(<Switch ariaLabel="s" checked onChange={onChange} />)
    await userEvent.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('disabled prevents click handling', () => {
    const onChange = vi.fn()
    render(<Switch ariaLabel="s" disabled onChange={onChange} />)
    const sw = screen.getByRole('switch')
    expect(sw).toBeDisabled()
    expect(sw.className).toContain('opacity-50')
  })

  it('omits onChange callback gracefully', async () => {
    render(<Switch ariaLabel="s" />)
    await userEvent.click(screen.getByRole('switch'))
  })
})
