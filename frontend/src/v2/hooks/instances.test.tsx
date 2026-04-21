// frontend/src/v2/hooks/instances.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('@v2/api/instances', () => ({
  listInstances: vi.fn(),
  getInstance: vi.fn(),
  createInstance: vi.fn(),
  updateInstance: vi.fn(),
  deleteInstance: vi.fn(),
  enableInstance: vi.fn(),
  disableInstance: vi.fn(),
  executeInstance: vi.fn(),
  listExecutions: vi.fn(),
  getExecution: vi.fn(),
}))

import * as api from '@v2/api/instances'
import {
  useInstances,
  useInstance,
  useCreateInstance,
  useUpdateInstance,
  useDeleteInstance,
  useEnableInstance,
  useDisableInstance,
  useExecuteInstance,
  useExecutions,
  useExecution,
} from './instances'
import { makeWrapper } from './test-utils'

beforeEach(() => vi.clearAllMocks())

describe('instances queries', () => {
  it('useInstances fetches', async () => {
    (api.listInstances as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0 })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useInstances({ page: 1 }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('useInstance disabled when id undefined', () => {
    const { wrapper } = makeWrapper()
    renderHook(() => useInstance(undefined), { wrapper })
    expect(api.getInstance).not.toHaveBeenCalled()
  })

  it('useInstance enabled with id', async () => {
    (api.getInstance as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useInstance(1), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('useExecutions fetches', async () => {
    (api.listExecutions as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0 })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useExecutions(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('useExecution disabled when id undefined', () => {
    const { wrapper } = makeWrapper()
    renderHook(() => useExecution(undefined), { wrapper })
    expect(api.getExecution).not.toHaveBeenCalled()
  })

  it('useExecution fetches when id present', async () => {
    (api.getExecution as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useExecution(1), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})

describe('instances mutations', () => {
  it('useCreateInstance invalidates', async () => {
    (api.createInstance as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useCreateInstance(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({} as never)
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['instances'] })
  })

  it('useUpdateInstance invalidates', async () => {
    (api.updateInstance as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useUpdateInstance(1), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({} as never)
    })
    expect(spy).toHaveBeenCalled()
  })

  it('useDeleteInstance invalidates', async () => {
    (api.deleteInstance as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useDeleteInstance(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(1)
    })
    expect(spy).toHaveBeenCalled()
  })

  it('useEnableInstance invalidates', async () => {
    (api.enableInstance as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useEnableInstance(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(1)
    })
    expect(spy).toHaveBeenCalled()
  })

  it('useDisableInstance invalidates and tracks', async () => {
    (api.disableInstance as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useDisableInstance(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(1)
    })
    expect(spy).toHaveBeenCalled()
  })

  it('useExecuteInstance invalidates instances+executions', async () => {
    (api.executeInstance as ReturnType<typeof vi.fn>).mockResolvedValue({})
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useExecuteInstance(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(1)
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['instances'] })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['executions'] })
  })
})
