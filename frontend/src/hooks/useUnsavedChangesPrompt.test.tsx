import type { ReactNode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { UNSAFE_NavigationContext as NavigationContext } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUnsavedChangesPrompt } from './useUnsavedChangesPrompt'

describe('useUnsavedChangesPrompt', () => {
  const block = vi.fn()
  const unblock = vi.fn()
  const confirmMock = vi.spyOn(window, 'confirm')

  beforeEach(() => {
    vi.clearAllMocks()
    block.mockReturnValue(unblock)
  })

  afterEach(() => {
    confirmMock.mockReset()
  })

  function wrapper({ children }: { children: ReactNode }) {
    return (
      <NavigationContext.Provider value={{ navigator: { block } } as never}>
        {children}
      </NavigationContext.Provider>
    )
  }

  it('when=false 时不注册路由阻塞与 beforeunload', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener')

    renderHook(() => useUnsavedChangesPrompt(false), { wrapper })

    expect(block).not.toHaveBeenCalled()
    expect(addEventListenerSpy).not.toHaveBeenCalledWith('beforeunload', expect.any(Function))
  })

  it('确认离开时会解除阻塞并继续跳转', () => {
    confirmMock.mockReturnValue(true)

    renderHook(() => useUnsavedChangesPrompt(true, '确认离开吗？'), { wrapper })

    expect(block).toHaveBeenCalledTimes(1)
    const transition = { retry: vi.fn() }
    act(() => {
      block.mock.calls[0][0](transition)
    })

    expect(window.confirm).toHaveBeenCalledWith('确认离开吗？')
    expect(unblock).toHaveBeenCalledTimes(1)
    expect(transition.retry).toHaveBeenCalledTimes(1)
  })

  it('取消离开时保留阻塞且不继续跳转', () => {
    confirmMock.mockReturnValue(false)

    renderHook(() => useUnsavedChangesPrompt(true), { wrapper })

    const transition = { retry: vi.fn() }
    act(() => {
      block.mock.calls[0][0](transition)
    })

    expect(window.confirm).toHaveBeenCalledWith('当前有未保存的修改，确认离开吗？')
    expect(unblock).not.toHaveBeenCalled()
    expect(transition.retry).not.toHaveBeenCalled()
  })

  it('会注册 beforeunload 提示并在卸载时清理监听', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')

    const { unmount } = renderHook(() => useUnsavedChangesPrompt(true, '离开提示'), { wrapper })

    const beforeUnloadHandler = addEventListenerSpy.mock.calls.find((call) => call[0] === 'beforeunload')?.[1] as
      | ((event: BeforeUnloadEvent) => string)
      | undefined
    expect(beforeUnloadHandler).toBeTypeOf('function')

    const event = new Event('beforeunload') as BeforeUnloadEvent
    Object.defineProperty(event, 'returnValue', { value: undefined, writable: true, configurable: true })
    const result = beforeUnloadHandler?.(event)

    expect(event.returnValue).toBe('离开提示')
    expect(result).toBe('离开提示')

    unmount()

    expect(removeEventListenerSpy).toHaveBeenCalledWith('beforeunload', beforeUnloadHandler)
    expect(unblock).toHaveBeenCalledTimes(1)
  })
})
