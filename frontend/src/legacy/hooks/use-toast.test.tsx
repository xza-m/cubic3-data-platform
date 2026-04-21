import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadToastModule() {
  vi.resetModules()
  return import('./use-toast')
}

describe('useToast', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reducer 支持新增、更新和移除 toast，并遵守单条上限', async () => {
    const { reducer } = await loadToastModule()
    const initialState = { toasts: [] as Array<{ id: string; title?: string; open?: boolean }> }

    const withFirst = reducer(initialState, {
      type: 'ADD_TOAST',
      toast: { id: '1', title: '第一条', open: true },
    })
    const withSecond = reducer(withFirst, {
      type: 'ADD_TOAST',
      toast: { id: '2', title: '第二条', open: true },
    })
    const updated = reducer(withSecond, {
      type: 'UPDATE_TOAST',
      toast: { id: '2', title: '已更新' },
    })
    const removedOne = reducer(updated, {
      type: 'REMOVE_TOAST',
      toastId: '2',
    })
    const removedAll = reducer(updated, {
      type: 'REMOVE_TOAST',
    })

    expect(withSecond.toasts).toHaveLength(1)
    expect(withSecond.toasts[0].id).toBe('2')
    expect(updated.toasts[0].title).toBe('已更新')
    expect(removedOne.toasts).toEqual([])
    expect(removedAll.toasts).toEqual([])
  })

  it('dismiss 可以关闭单条或全部 toast，并避免重复注册移除定时器', async () => {
    vi.useFakeTimers()
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    const { reducer } = await loadToastModule()
    const state = {
      toasts: [
        { id: '1', title: '第一条', open: true },
        { id: '2', title: '第二条', open: true },
      ],
    }

    const dismissedOne = reducer(state, {
      type: 'DISMISS_TOAST',
      toastId: '1',
    })
    reducer(dismissedOne, {
      type: 'DISMISS_TOAST',
      toastId: '1',
    })
    const dismissedAll = reducer(state, {
      type: 'DISMISS_TOAST',
    })

    expect(dismissedOne.toasts).toEqual([
      expect.objectContaining({ id: '1', open: false }),
      expect.objectContaining({ id: '2', open: true }),
    ])
    expect(dismissedAll.toasts.every((toast) => toast.open === false)).toBe(true)
    expect(timeoutSpy).toHaveBeenCalledTimes(2)
  })

  it('toast 控制器可以驱动 hook 状态更新、关闭和自动移除', async () => {
    vi.useFakeTimers()
    const { toast, useToast } = await loadToastModule()
    const { result } = renderHook(() => useToast())

    let controller!: ReturnType<typeof toast>
    act(() => {
      controller = toast({
        title: '初始通知',
        description: '待更新',
      })
    })

    expect(result.current.toasts).toHaveLength(1)
    expect(result.current.toasts[0]).toMatchObject({
      id: controller.id,
      title: '初始通知',
      description: '待更新',
      open: true,
    })

    act(() => {
      controller.update({
        id: controller.id,
        title: '已更新',
        description: '完成更新',
        open: true,
      })
    })

    expect(result.current.toasts[0]).toMatchObject({
      title: '已更新',
      description: '完成更新',
    })

    act(() => {
      controller.dismiss()
    })

    expect(result.current.toasts[0].open).toBe(false)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000_000)
    })

    expect(result.current.toasts).toEqual([])
  })

  it('toast 的 onOpenChange 和 dismiss API 都可以关闭当前通知', async () => {
    const { toast, useToast } = await loadToastModule()
    const { result } = renderHook(() => useToast())

    act(() => {
      toast({
        title: '关闭测试',
      })
    })

    await waitFor(() => {
      expect(result.current.toasts).toHaveLength(1)
    })

    act(() => {
      result.current.toasts[0].onOpenChange?.(false)
    })
    expect(result.current.toasts[0].open).toBe(false)

    act(() => {
      result.current.dismiss()
    })
    expect(result.current.toasts[0].open).toBe(false)
  })
})
