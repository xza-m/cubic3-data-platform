// frontend/src/v2/hooks/datasets.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('@v2/api/datasets', () => ({
  listDatasets: vi.fn(),
  getDataset: vi.fn(),
  createDataset: vi.fn(),
  updateDataset: vi.fn(),
  deleteDataset: vi.fn(),
  syncDatasetSchema: vi.fn(),
  previewDataset: vi.fn(),
  getDatasetProfile: vi.fn(),
  refreshDatasetProfile: vi.fn(),
}))

import * as api from '@v2/api/datasets'
import {
  useDatasets,
  useDataset,
  useCreateDataset,
  useUpdateDataset,
  useDeleteDataset,
  useSyncDatasetSchema,
  usePreviewDataset,
  useDatasetProfile,
  useRefreshDatasetProfile,
} from './datasets'
import { makeWrapper } from './test-utils'

beforeEach(() => vi.clearAllMocks())

describe('datasets queries', () => {
  it('useDatasets fetches with params', async () => {
    (api.listDatasets as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0 })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useDatasets({ page: 1 }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.listDatasets).toHaveBeenCalledWith({ page: 1 })
  })

  it('useDataset disabled when id<=0', () => {
    const { wrapper } = makeWrapper()
    renderHook(() => useDataset(0), { wrapper })
    expect(api.getDataset).not.toHaveBeenCalled()
  })

  it('useDataset enabled and passes includeFields', async () => {
    (api.getDataset as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useDataset(1, true), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.getDataset).toHaveBeenCalledWith(1, true)
  })

  it('useDatasetProfile disabled when id<=0', () => {
    const { wrapper } = makeWrapper()
    renderHook(() => useDatasetProfile(0), { wrapper })
    expect(api.getDatasetProfile).not.toHaveBeenCalled()
  })

  it('useDatasetProfile enabled when id>0', async () => {
    (api.getDatasetProfile as ReturnType<typeof vi.fn>).mockResolvedValue({})
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useDatasetProfile(2), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})

describe('datasets mutations', () => {
  it('useCreateDataset invalidates', async () => {
    (api.createDataset as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 9 })
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useCreateDataset(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({} as never)
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['datasets'] })
  })

  it('useCreateDataset handles missing id in response', async () => {
    (api.createDataset as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useCreateDataset(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({} as never)
    })
  })

  it('useUpdateDataset invalidates', async () => {
    (api.updateDataset as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useUpdateDataset(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ id: 1, payload: {} as never })
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['datasets'] })
  })

  it('useDeleteDataset invalidates', async () => {
    (api.deleteDataset as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useDeleteDataset(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(1)
    })
    expect(spy).toHaveBeenCalled()
  })

  it('useSyncDatasetSchema invalidates', async () => {
    (api.syncDatasetSchema as ReturnType<typeof vi.fn>).mockResolvedValue({})
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useSyncDatasetSchema(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(1)
    })
    expect(spy).toHaveBeenCalled()
  })

  it('usePreviewDataset calls api', async () => {
    (api.previewDataset as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [] })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => usePreviewDataset(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({} as never)
    })
    expect(api.previewDataset).toHaveBeenCalled()
  })

  it('useRefreshDatasetProfile invalidates with id key', async () => {
    (api.refreshDatasetProfile as ReturnType<typeof vi.fn>).mockResolvedValue({})
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useRefreshDatasetProfile(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(7)
    })
    expect(spy).toHaveBeenCalled()
  })
})
