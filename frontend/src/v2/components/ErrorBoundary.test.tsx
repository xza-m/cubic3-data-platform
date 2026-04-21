// frontend/src/v2/components/ErrorBoundary.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ErrorBoundary } from './ErrorBoundary'

function Bomb({ shouldThrow = true }: { shouldThrow?: boolean }) {
  if (shouldThrow) throw new Error('boom-message')
  return <div>safe</div>
}

describe('ErrorBoundary', () => {
  let consoleErrSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleErrSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    consoleErrSpy.mockRestore()
  })

  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <div>hi</div>
      </ErrorBoundary>,
    )
    expect(screen.getByText('hi')).toBeInTheDocument()
  })

  it('renders default fallback after a child throws', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    )
    expect(screen.getByText('页面渲染出错')).toBeInTheDocument()
    expect(screen.getByText('boom-message')).toBeInTheDocument()
    expect(screen.getByText(/ERR-/)).toBeInTheDocument()
  })

  it('renders custom fallback when provided', () => {
    render(
      <ErrorBoundary
        fallback={({ error, errorId, retry }) => (
          <div>
            <span data-testid="msg">{error?.message}</span>
            <span data-testid="id">{errorId}</span>
            <button onClick={retry}>retry</button>
          </div>
        )}
      >
        <Bomb />
      </ErrorBoundary>,
    )
    expect(screen.getByTestId('msg')).toHaveTextContent('boom-message')
    expect(screen.getByTestId('id').textContent).toMatch(/^ERR-/)
  })

  it('retry resets state', () => {
    let throwIt = true
    function Toggle() {
      if (throwIt) throw new Error('x')
      return <div>recovered</div>
    }
    render(
      <ErrorBoundary
        fallback={({ retry }) => <button onClick={retry}>retry</button>}
      >
        <Toggle />
      </ErrorBoundary>,
    )
    expect(screen.getByText('retry')).toBeInTheDocument()
    throwIt = false
    fireEvent.click(screen.getByText('retry'))
    expect(screen.getByText('recovered')).toBeInTheDocument()
  })

  it('default fallback "back" button calls history.back', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    )
    fireEvent.click(screen.getByText('回到上一页'))
    expect(back).toHaveBeenCalled()
    back.mockRestore()
  })

  it('default fallback "retry" button resets to children', () => {
    let throwIt = true
    function Toggle() {
      if (throwIt) throw new Error('x')
      return <div>recovered</div>
    }
    render(
      <ErrorBoundary>
        <Toggle />
      </ErrorBoundary>,
    )
    expect(screen.getByText('页面渲染出错')).toBeInTheDocument()
    throwIt = false
    fireEvent.click(screen.getByText('重试'))
    expect(screen.getByText('recovered')).toBeInTheDocument()
  })
})
