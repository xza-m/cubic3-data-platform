// frontend/src/v2/components/ui/Sheet.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Sheet } from './Sheet'

describe('Sheet', () => {
  it('renders nothing when closed', () => {
    render(
      <Sheet open={false} onClose={() => {}} title="t">
        body
      </Sheet>,
    )
    expect(screen.queryByText('body')).toBeNull()
  })

  it('renders title, body, close button when open', () => {
    render(
      <Sheet open onClose={() => {}} title="hello">
        <span>content</span>
      </Sheet>,
    )
    expect(screen.getByText('hello')).toBeInTheDocument()
    expect(screen.getByText('content')).toBeInTheDocument()
    expect(screen.getByLabelText('关闭面板')).toBeInTheDocument()
  })

  it('closes via close button', async () => {
    const onClose = vi.fn()
    render(<Sheet open onClose={onClose} title="t">x</Sheet>)
    await userEvent.click(screen.getByLabelText('关闭面板'))
    expect(onClose).toHaveBeenCalled()
  })

  it('closes via backdrop click', async () => {
    const onClose = vi.fn()
    const { container } = render(<Sheet open onClose={onClose} title="t">x</Sheet>)
    await userEvent.click(container.firstChild as HTMLElement)
    expect(onClose).toHaveBeenCalled()
  })

  it('does not close when inner content clicked', async () => {
    const onClose = vi.fn()
    render(<Sheet open onClose={onClose} title="t">inside</Sheet>)
    await userEvent.click(screen.getByText('inside'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<Sheet open onClose={onClose} title="t">x</Sheet>)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('renders left side variant', () => {
    render(<Sheet open onClose={() => {}} title="t" side="left">x</Sheet>)
    expect(screen.getByText('t')).toBeInTheDocument()
  })

  it('does not subscribe to keydown when closed', () => {
    const onClose = vi.fn()
    render(<Sheet open={false} onClose={onClose} title="t">x</Sheet>)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})
