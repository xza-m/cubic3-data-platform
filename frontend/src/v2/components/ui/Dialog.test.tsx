// frontend/src/v2/components/ui/Dialog.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Dialog } from './Dialog'

describe('Dialog', () => {
  it('renders nothing when closed', () => {
    render(
      <Dialog open={false} onClose={() => {}} title="t">
        body
      </Dialog>,
    )
    expect(screen.queryByText('body')).toBeNull()
  })

  it('renders title, body and footer when open', () => {
    render(
      <Dialog open onClose={() => {}} title="hello" footer={<button>OK</button>}>
        <span>content</span>
      </Dialog>,
    )
    expect(screen.getByText('hello')).toBeInTheDocument()
    expect(screen.getByText('content')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument()
  })

  it('omits title block when title not provided', () => {
    render(
      <Dialog open onClose={() => {}}>
        <span>content</span>
      </Dialog>,
    )
    expect(screen.getByText('content')).toBeInTheDocument()
  })

  it('closes when backdrop is clicked', async () => {
    const onClose = vi.fn()
    const { container } = render(
      <Dialog open onClose={onClose}>
        <span>content</span>
      </Dialog>,
    )
    await userEvent.click(container.firstChild as HTMLElement)
    expect(onClose).toHaveBeenCalled()
  })

  it('does not close when inner content is clicked', async () => {
    const onClose = vi.fn()
    render(
      <Dialog open onClose={onClose}>
        <span>content</span>
      </Dialog>,
    )
    await userEvent.click(screen.getByText('content'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on Escape key', () => {
    const onClose = vi.fn()
    render(
      <Dialog open onClose={onClose}>
        <span>content</span>
      </Dialog>,
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('does not subscribe to keydown when closed', () => {
    const onClose = vi.fn()
    render(
      <Dialog open={false} onClose={onClose}>
        <span>content</span>
      </Dialog>,
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})
