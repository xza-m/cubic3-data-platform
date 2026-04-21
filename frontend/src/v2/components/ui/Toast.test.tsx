// frontend/src/v2/components/ui/Toast.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { ToastProvider, useToast } from './Toast'

function Trigger({
  payload,
  fallbackTone,
}: {
  payload: Parameters<ReturnType<typeof useToast>['show']>[0]
  fallbackTone?: Parameters<ReturnType<typeof useToast>['show']>[1]
}) {
  const { show } = useToast()
  return <button onClick={() => show(payload, fallbackTone)}>fire</button>
}

describe('ToastProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows string toast and auto removes after 4500ms', () => {
    render(
      <ToastProvider>
        <Trigger payload="hello" />
      </ToastProvider>,
    )
    act(() => {
      fireEvent.click(screen.getByText('fire'))
    })
    expect(screen.getByText('hello')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(4500)
    })
    expect(screen.queryByText('hello')).toBeNull()
  })

  it('shows object toast with description and tone', () => {
    render(
      <ToastProvider>
        <Trigger payload={{ tone: 'success', title: 'OK', description: 'done' }} />
      </ToastProvider>,
    )
    act(() => {
      fireEvent.click(screen.getByText('fire'))
    })
    expect(screen.getByText('OK')).toBeInTheDocument()
    expect(screen.getByText('done')).toBeInTheDocument()
  })

  it('uses fallback tone when input is plain string', () => {
    render(
      <ToastProvider>
        <Trigger payload="warn" fallbackTone="warning" />
      </ToastProvider>,
    )
    act(() => {
      fireEvent.click(screen.getByText('fire'))
    })
    expect(screen.getByText('warn')).toBeInTheDocument()
  })

  it('uses fallback tone when object omits tone', () => {
    render(
      <ToastProvider>
        <Trigger payload={{ title: 'D' }} fallbackTone="danger" />
      </ToastProvider>,
    )
    act(() => {
      fireEvent.click(screen.getByText('fire'))
    })
    expect(screen.getByText('D')).toBeInTheDocument()
  })

  it('removes toast via close button', () => {
    render(
      <ToastProvider>
        <Trigger payload={{ tone: 'info', title: 'bye' }} />
      </ToastProvider>,
    )
    act(() => {
      fireEvent.click(screen.getByText('fire'))
    })
    expect(screen.getByText('bye')).toBeInTheDocument()
    act(() => {
      fireEvent.click(screen.getByLabelText('关闭通知'))
    })
    expect(screen.queryByText('bye')).toBeNull()
  })
})

describe('useToast outside provider', () => {
  it('returns a console fallback for string input', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    function Comp() {
      const { show } = useToast()
      return <button onClick={() => show('orphan')}>x</button>
    }
    render(<Comp />)
    fireEvent.click(screen.getByText('x'))
    expect(spy).toHaveBeenCalledWith('[toast]', 'orphan')
    spy.mockRestore()
  })

  it('returns a console fallback for object input', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    function Comp() {
      const { show } = useToast()
      return <button onClick={() => show({ title: 'orphan-obj' })}>x</button>
    }
    render(<Comp />)
    fireEvent.click(screen.getByText('x'))
    expect(spy).toHaveBeenCalledWith('[toast]', 'orphan-obj')
    spy.mockRestore()
  })
})
