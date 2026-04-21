// frontend/src/v2/hooks/subscriptions.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('@v2/api/subscriptions', () => ({
  createSubscription: vi.fn(),
  deleteSubscription: vi.fn(),
  disableSubscription: vi.fn(),
  enableSubscription: vi.fn(),
  getSubscription: vi.fn(),
  listSubscriptions: vi.fn(),
  listSubscriptionsByInstance: vi.fn(),
  listSubscriptionHistory: vi.fn(),
  updateSubscription: vi.fn(),
}))

import * as api from '@v2/api/subscriptions'
import {
  useSubscriptions,
  useSubscriptionsByInstance,
  useSubscription,
  useCreateSubscription,
  useUpdateSubscription,
  useDeleteSubscription,
  useEnableSubscription,
  useDisableSubscription,
  useSubscriptionHistory,
  useToggleSubscription,
} from './subscriptions'
import { makeWrapper } from './test-utils'

beforeEach(() => vi.clearAllMocks())

describe('subscriptions', () => {
  it('useSubscriptions fetches', async () => {
    (api.listSubscriptions as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0 })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useSubscriptions({ page: 1 }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('useSubscriptionsByInstance disabled when id<=0', () => {
    const { wrapper } = makeWrapper()
    renderHook(() => useSubscriptionsByInstance(0), { wrapper })
    expect(api.listSubscriptionsByInstance).not.toHaveBeenCalled()
  })

  it('useSubscriptionsByInstance fetches when id>0', async () => {
    (api.listSubscriptionsByInstance as ReturnType<typeof vi.fn>).mockResolvedValue([])
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useSubscriptionsByInstance(2), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('useSubscription disabled when id<=0', () => {
    const { wrapper } = makeWrapper()
    renderHook(() => useSubscription(0), { wrapper })
    expect(api.getSubscription).not.toHaveBeenCalled()
  })

  it('useSubscription fetches when id>0', async () => {
    (api.getSubscription as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useSubscription(1), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('useSubscriptionHistory fetches', async () => {
    (api.listSubscriptionHistory as ReturnType<typeof vi.fn>).mockResolvedValue([])
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useSubscriptionHistory(1), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('useCreateSubscription invalidates', async () => {
    (api.createSubscription as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useCreateSubscription(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({} as never)
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['subscriptions'] })
  })

  it('useUpdateSubscription invalidates list + detail', async () => {
    (api.updateSubscription as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useUpdateSubscription(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ id: 9, payload: {} as never })
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['subscriptions'] })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['subscriptions', 'detail', 9] })
  })

  it('useDeleteSubscription invalidates', async () => {
    (api.deleteSubscription as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useDeleteSubscription(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(1)
    })
    expect(spy).toHaveBeenCalled()
  })

  it('useEnableSubscription invalidates list + detail', async () => {
    (api.enableSubscription as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useEnableSubscription(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(7)
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['subscriptions'] })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['subscriptions', 'detail', 7] })
  })

  it('useDisableSubscription invalidates list + detail', async () => {
    (api.disableSubscription as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useDisableSubscription(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(8)
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['subscriptions', 'detail', 8] })
  })

  it('useToggleSubscription dispatches enable when not enabled', async () => {
    (api.enableSubscription as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useToggleSubscription(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(1, false)
    })
    expect(api.enableSubscription).toHaveBeenCalledWith(1)
  })

  it('useToggleSubscription dispatches disable when enabled', async () => {
    (api.disableSubscription as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useToggleSubscription(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(1, true)
    })
    expect(api.disableSubscription).toHaveBeenCalledWith(1)
  })

  it('useToggleSubscription mutate (sync) routes properly', async () => {
    (api.enableSubscription as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    ;(api.disableSubscription as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useToggleSubscription(), { wrapper })
    act(() => {
      result.current.mutate(1, false)
    })
    await waitFor(() => expect(api.enableSubscription).toHaveBeenCalled())
    act(() => {
      result.current.mutate(2, true)
    })
    await waitFor(() => expect(api.disableSubscription).toHaveBeenCalled())
  })
})
