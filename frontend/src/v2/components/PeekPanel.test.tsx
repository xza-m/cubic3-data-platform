// frontend/src/v2/components/PeekPanel.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const setPeekActive = vi.fn()
vi.mock('@v2/layout/AppShell', () => ({
  useAppShell: () => ({ setPeekActive }),
}))

import { PeekPanel } from './PeekPanel'

describe('PeekPanel', () => {
  beforeEach(() => {
    setPeekActive.mockReset()
  })

  it('renders title, subtitle, badges, footer when open', () => {
    render(
      <PeekPanel
        open
        onClose={() => {}}
        title="HelloTitle"
        subtitle="HelloSub"
        badges={<span>BADGE</span>}
        footer={<div>FOOTER</div>}
        actions={<span>ACT</span>}
      >
        body-text
      </PeekPanel>,
    )
    expect(screen.getByText('HelloTitle')).toBeInTheDocument()
    expect(screen.getByText('HelloSub')).toBeInTheDocument()
    expect(screen.getByText('BADGE')).toBeInTheDocument()
    expect(screen.getByText('body-text')).toBeInTheDocument()
    expect(screen.getByText('FOOTER')).toBeInTheDocument()
    expect(screen.getByText('ACT')).toBeInTheDocument()
  })

  it('does not show "打开" button when onOpenFull omitted', () => {
    render(
      <PeekPanel open onClose={() => {}} title="t">
        x
      </PeekPanel>,
    )
    expect(screen.queryByText('打开')).toBeNull()
  })

  it('shows "打开" button when onOpenFull is given', () => {
    const onOpenFull = vi.fn()
    render(
      <PeekPanel open onClose={() => {}} onOpenFull={onOpenFull} title="t">
        x
      </PeekPanel>,
    )
    expect(screen.getByText('打开')).toBeInTheDocument()
    fireEvent.click(screen.getByText('打开'))
    expect(onOpenFull).toHaveBeenCalled()
  })

  it('Esc key closes when open', () => {
    const onClose = vi.fn()
    render(
      <PeekPanel open onClose={onClose} title="t">
        x
      </PeekPanel>,
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('does NOT close on Esc when not open', () => {
    const onClose = vi.fn()
    render(
      <PeekPanel open={false} onClose={onClose} title="t">
        x
      </PeekPanel>,
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Cmd+Enter opens full when handler set', () => {
    const onOpenFull = vi.fn()
    render(
      <PeekPanel open onClose={() => {}} onOpenFull={onOpenFull} title="t">
        x
      </PeekPanel>,
    )
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true })
    expect(onOpenFull).toHaveBeenCalled()
  })

  it('Ctrl+Enter opens full when handler set', () => {
    const onOpenFull = vi.fn()
    render(
      <PeekPanel open onClose={() => {}} onOpenFull={onOpenFull} title="t">
        x
      </PeekPanel>,
    )
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true })
    expect(onOpenFull).toHaveBeenCalled()
  })

  it('Cmd+Enter does nothing when no onOpenFull', () => {
    render(
      <PeekPanel open onClose={() => {}} title="t">
        x
      </PeekPanel>,
    )
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true })
  })

  it('inner Esc keydown also closes via panel handler', () => {
    const onClose = vi.fn()
    render(
      <PeekPanel open onClose={onClose} title="t">
        x
      </PeekPanel>,
    )
    fireEvent.keyDown(screen.getByRole('complementary'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('close button calls onClose', () => {
    const onClose = vi.fn()
    render(
      <PeekPanel open onClose={onClose} title="t">
        x
      </PeekPanel>,
    )
    fireEvent.click(screen.getByLabelText('关闭预览'))
    expect(onClose).toHaveBeenCalled()
  })

  it('toggles setPeekActive based on open prop', () => {
    const { rerender } = render(
      <PeekPanel open onClose={() => {}} title="t">
        x
      </PeekPanel>,
    )
    expect(setPeekActive).toHaveBeenCalledWith(true)
    rerender(
      <PeekPanel open={false} onClose={() => {}} title="t">
        x
      </PeekPanel>,
    )
    expect(setPeekActive).toHaveBeenCalledWith(false)
  })

  it('renders all size variants', () => {
    const { rerender } = render(
      <PeekPanel open onClose={() => {}} title="t" size="narrow">
        x
      </PeekPanel>,
    )
    expect(screen.getByRole('complementary')).toBeInTheDocument()
    rerender(
      <PeekPanel open onClose={() => {}} title="t" size="medium">
        x
      </PeekPanel>,
    )
    rerender(
      <PeekPanel open onClose={() => {}} title="t" size="wide">
        x
      </PeekPanel>,
    )
  })

  it('omits subtitle block when not provided', () => {
    render(
      <PeekPanel open onClose={() => {}} title="t">
        x
      </PeekPanel>,
    )
    expect(screen.getByText('t')).toBeInTheDocument()
  })

  it('backdrop click invokes onClose', () => {
    const onClose = vi.fn()
    const { container } = render(
      <PeekPanel open onClose={onClose} title="t">
        x
      </PeekPanel>,
    )
    const backdrop = container.querySelectorAll('div')[0]
    fireEvent.click(backdrop!)
    expect(onClose).toHaveBeenCalled()
  })
})
