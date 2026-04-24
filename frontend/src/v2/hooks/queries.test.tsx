// frontend/src/v2/hooks/queries.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('@v2/api/queries', () => ({
  createFolder: vi.fn(),
  createSavedQuery: vi.fn(),
  createScheduledQuery: vi.fn(),
  deleteSavedQuery: vi.fn(),
  deleteScheduledQuery: vi.fn(),
  disableScheduledQuery: vi.fn(),
  enableScheduledQuery: vi.fn(),
  executeQuery: vi.fn(),
  getQueryHistoryItem: vi.fn(),
  getSavedQuery: vi.fn(),
  getScheduledQuery: vi.fn(),
  listDatasourcesForConsole: vi.fn(),
  listFolders: vi.fn(),
  listQueryHistories: vi.fn(),
  listSavedQueries: vi.fn(),
  listScheduledQueries: vi.fn(),
  listScheduledQueryRuns: vi.fn(),
  toggleFavorite: vi.fn(),
  triggerScheduledQuery: vi.fn(),
  updateSavedQuery: vi.fn(),
  updateScheduledQuery: vi.fn(),
}))

import * as api from '@v2/api/queries'
import {
  useDatasourcesForConsole,
  useExecuteQuery,
  useQueryHistories,
  useQueryHistoryDetail,
  useSavedQueries,
  useSavedQueryDetail,
  useCreateSavedQuery,
  useUpdateSavedQuery,
  useDeleteSavedQuery,
  useToggleFavorite,
  useFolders,
  useCreateFolder,
  useScheduledQueries,
  useScheduledQuery,
  useScheduledQueryRuns,
  useCreateScheduledQuery,
  useUpdateScheduledQuery,
  useDeleteScheduledQuery,
  useEnableScheduledQuery,
  useDisableScheduledQuery,
  useTriggerScheduledQuery,
} from './queries'
import { makeWrapper } from './test-utils'

beforeEach(() => vi.clearAllMocks())

describe('queries hooks - lists', () => {
  it('useDatasourcesForConsole', async () => {
    (api.listDatasourcesForConsole as ReturnType<typeof vi.fn>).mockResolvedValue([])
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useDatasourcesForConsole(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('useQueryHistories', async () => {
    (api.listQueryHistories as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [] })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useQueryHistories(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('useQueryHistoryDetail fetches via histories/:id endpoint', async () => {
    (api.getQueryHistoryItem as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 5, name: 'a' })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useQueryHistoryDetail(5), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ id: 5, name: 'a' })
    expect(api.getQueryHistoryItem).toHaveBeenCalledWith(5)
  })

  it('useQueryHistoryDetail reports error when backend 404', async () => {
    (api.getQueryHistoryItem as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('not found'))
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useQueryHistoryDetail(99), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it('useQueryHistoryDetail disabled when id<=0', () => {
    const { wrapper } = makeWrapper()
    renderHook(() => useQueryHistoryDetail(0), { wrapper })
    expect(api.listQueryHistories).not.toHaveBeenCalled()
  })

  it('useSavedQueries', async () => {
    (api.listSavedQueries as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [] })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useSavedQueries(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('useSavedQueryDetail enabled by id', async () => {
    (api.getSavedQuery as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { wrapper } = makeWrapper()
    renderHook(() => useSavedQueryDetail(0), { wrapper })
    expect(api.getSavedQuery).not.toHaveBeenCalled()
    const { result } = renderHook(() => useSavedQueryDetail(1), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('useFolders', async () => {
    (api.listFolders as ReturnType<typeof vi.fn>).mockResolvedValue([])
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useFolders(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('useScheduledQueries', async () => {
    (api.listScheduledQueries as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [] })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useScheduledQueries(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('useScheduledQuery enabled by id', async () => {
    (api.getScheduledQuery as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { wrapper } = makeWrapper()
    renderHook(() => useScheduledQuery(0), { wrapper })
    expect(api.getScheduledQuery).not.toHaveBeenCalled()
    const { result } = renderHook(() => useScheduledQuery(1), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('useScheduledQueryRuns enabled by id', async () => {
    (api.listScheduledQueryRuns as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [] })
    const { wrapper } = makeWrapper()
    renderHook(() => useScheduledQueryRuns(0), { wrapper })
    expect(api.listScheduledQueryRuns).not.toHaveBeenCalled()
    const { result } = renderHook(() => useScheduledQueryRuns(1), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})

describe('queries hooks - mutations', () => {
  it('useExecuteQuery tracks event', async () => {
    (api.executeQuery as ReturnType<typeof vi.fn>).mockResolvedValue({ execution_time_ms: 10 })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useExecuteQuery(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ source_id: 1, sql: 'select 1' } as never)
    })
    expect(api.executeQuery).toHaveBeenCalled()
  })

  it('useExecuteQuery with null source_id', async () => {
    (api.executeQuery as ReturnType<typeof vi.fn>).mockResolvedValue({ execution_time_ms: 5 })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useExecuteQuery(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ sql: 'select 1' } as never)
    })
  })

  it('useCreateSavedQuery invalidates', async () => {
    (api.createSavedQuery as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useCreateSavedQuery(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({} as never)
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['queries', 'saved'] })
  })

  it('useUpdateSavedQuery invalidates list+detail', async () => {
    (api.updateSavedQuery as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 3 })
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useUpdateSavedQuery(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ id: 3, payload: {} as never })
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['queries', 'saved'] })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['queries', 'saved', 'detail', 3] })
  })

  it('useDeleteSavedQuery invalidates', async () => {
    (api.deleteSavedQuery as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useDeleteSavedQuery(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(1)
    })
    expect(spy).toHaveBeenCalled()
  })

  it('useToggleFavorite invalidates', async () => {
    (api.toggleFavorite as ReturnType<typeof vi.fn>).mockResolvedValue({})
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useToggleFavorite(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(1)
    })
    expect(spy).toHaveBeenCalled()
  })

  it('useCreateFolder invalidates', async () => {
    (api.createFolder as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useCreateFolder(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ folder_name: 'x' })
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['queries', 'folders'] })
  })

  it('useCreateScheduledQuery invalidates', async () => {
    (api.createScheduledQuery as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useCreateScheduledQuery(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({} as never)
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['queries', 'scheduled'] })
  })

  it('useUpdateScheduledQuery invalidates list+detail', async () => {
    (api.updateScheduledQuery as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 3 })
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useUpdateScheduledQuery(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ id: 3, payload: {} as never })
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['queries', 'scheduled', 'detail', 3] })
  })

  it('useDeleteScheduledQuery invalidates', async () => {
    (api.deleteScheduledQuery as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useDeleteScheduledQuery(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(1)
    })
    expect(spy).toHaveBeenCalled()
  })

  it('useEnableScheduledQuery invalidates', async () => {
    (api.enableScheduledQuery as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useEnableScheduledQuery(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(7)
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['queries', 'scheduled', 'detail', 7] })
  })

  it('useDisableScheduledQuery invalidates', async () => {
    (api.disableScheduledQuery as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useDisableScheduledQuery(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(8)
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['queries', 'scheduled', 'detail', 8] })
  })

  it('useTriggerScheduledQuery invalidates detail+runs', async () => {
    (api.triggerScheduledQuery as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useTriggerScheduledQuery(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(2)
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['queries', 'scheduled', 'detail', 2] })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['queries', 'scheduled', 'runs', 2] })
  })
})
