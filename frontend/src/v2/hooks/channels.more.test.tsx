// frontend/src/v2/hooks/channels.more.test.tsx
//
// 补充 channels 域其余 hooks 的覆盖（除 useTestChannel）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('@v2/api/channels', () => ({
  listChannels: vi.fn(),
  getChannel: vi.fn(),
  createChannel: vi.fn(),
  updateChannel: vi.fn(),
  deleteChannel: vi.fn(),
  enableChannel: vi.fn(),
  disableChannel: vi.fn(),
  testChannel: vi.fn(),
}))

import * as api from '@v2/api/channels'
import {
  useChannels,
  useChannel,
  useCreateChannel,
  useUpdateChannel,
  useDeleteChannel,
  useEnableChannel,
  useDisableChannel,
  useTestChannel,
  useToggleChannel,
} from './channels'
import { makeWrapper } from './test-utils'

beforeEach(() => vi.clearAllMocks())

describe('channels misc', () => {
  it('useChannels fetches list', async () => {
    (api.listChannels as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0 })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useChannels({ page: 1 }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('useChannel disabled when id<=0', () => {
    const { wrapper } = makeWrapper()
    renderHook(() => useChannel(0), { wrapper })
    expect(api.getChannel).not.toHaveBeenCalled()
  })

  it('useChannel fetches when id>0', async () => {
    (api.getChannel as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useChannel(1), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('useCreateChannel invalidates', async () => {
    (api.createChannel as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useCreateChannel(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({} as never)
    })
    expect(spy).toHaveBeenCalled()
  })

  it('useUpdateChannel invalidates list+detail', async () => {
    (api.updateChannel as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useUpdateChannel(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ id: 9, payload: {} as never })
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['channels', 'detail', 9] })
  })

  it('useDeleteChannel invalidates', async () => {
    (api.deleteChannel as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useDeleteChannel(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(1)
    })
    expect(spy).toHaveBeenCalled()
  })

  it('useEnableChannel invalidates list+detail', async () => {
    (api.enableChannel as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useEnableChannel(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(7)
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['channels', 'detail', 7] })
  })

  it('useDisableChannel invalidates list+detail', async () => {
    (api.disableChannel as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useDisableChannel(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(8)
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['channels', 'detail', 8] })
  })

  it('useTestChannel error rethrows', async () => {
    (api.testChannel as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'))
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useTestChannel(), { wrapper })
    await expect(
      act(async () => {
        await result.current.mutateAsync(1)
      }),
    ).rejects.toThrow('boom')
  })

  it('useToggleChannel routes enable/disable', async () => {
    (api.enableChannel as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    ;(api.disableChannel as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useToggleChannel(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync(1, false)
    })
    expect(api.enableChannel).toHaveBeenCalledWith(1)

    await act(async () => {
      await result.current.mutateAsync(1, true)
    })
    expect(api.disableChannel).toHaveBeenCalledWith(1)

    act(() => {
      result.current.mutate(1, false)
    })
    act(() => {
      result.current.mutate(1, true)
    })
    await waitFor(() => true)
  })
})
