// frontend/src/v2/hooks/datasources.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('@v2/api/datasources', () => ({
  listDatasources: vi.fn(),
  getDatasource: vi.fn(),
  createDatasource: vi.fn(),
  updateDatasource: vi.fn(),
  deleteDatasource: vi.fn(),
  testConnection: vi.fn(),
  syncDatasourceCatalog: vi.fn(),
  getDatasourceTypes: vi.fn(),
  getDatasourceDatabases: vi.fn(),
  getDatasourceSchema: vi.fn(),
  getDatasourceSchemaTables: vi.fn(),
  getDatasourceSchemaTableColumns: vi.fn(),
}))

import * as api from '@v2/api/datasources'
import {
  useDatasources,
  useDatasource,
  useDatasourceTypes,
  useDatasourceDatabases,
  useDatasourceSchema,
  useDatasourceSchemaTables,
  useDatasourceSchemaTableColumns,
  useCreateDatasource,
  useUpdateDatasource,
  useDeleteDatasource,
  useTestConnection,
  useSyncDatasourceCatalog,
} from './datasources'
import { makeWrapper } from './test-utils'

beforeEach(() => vi.clearAllMocks())

describe('queries (datasources)', () => {
  it('useDatasources fetches', async () => {
    (api.listDatasources as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0 })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useDatasources({ page: 1 }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.listDatasources).toHaveBeenCalledWith({ page: 1 })
  })

  it('useDatasource enabled only when id>0', async () => {
    (api.getDatasource as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { wrapper } = makeWrapper()
    renderHook(() => useDatasource(0), { wrapper })
    expect(api.getDatasource).not.toHaveBeenCalled()

    const { result } = renderHook(() => useDatasource(1), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.getDatasource).toHaveBeenCalledWith(1)
  })

  it('useDatasourceTypes fetches', async () => {
    (api.getDatasourceTypes as ReturnType<typeof vi.fn>).mockResolvedValue([])
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useDatasourceTypes(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('useDatasourceDatabases enabled only when id>0', async () => {
    (api.getDatasourceDatabases as ReturnType<typeof vi.fn>).mockResolvedValue([])
    const { wrapper } = makeWrapper()
    renderHook(() => useDatasourceDatabases(0), { wrapper })
    expect(api.getDatasourceDatabases).not.toHaveBeenCalled()
    const { result } = renderHook(() => useDatasourceDatabases(1), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('useDatasourceSchema gated by enabled flag', async () => {
    (api.getDatasourceSchema as ReturnType<typeof vi.fn>).mockResolvedValue({})
    const { wrapper } = makeWrapper()
    renderHook(() => useDatasourceSchema(1, false), { wrapper })
    expect(api.getDatasourceSchema).not.toHaveBeenCalled()
    const { result } = renderHook(() => useDatasourceSchema(1, true), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('useDatasourceSchemaTables disabled when database empty', async () => {
    (api.getDatasourceSchemaTables as ReturnType<typeof vi.fn>).mockResolvedValue([])
    const { wrapper } = makeWrapper()
    renderHook(() => useDatasourceSchemaTables(1, null), { wrapper })
    expect(api.getDatasourceSchemaTables).not.toHaveBeenCalled()
    const { result } = renderHook(() => useDatasourceSchemaTables(1, 'db'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.getDatasourceSchemaTables).toHaveBeenCalledWith(1, 'db')
  })

  it('useDatasourceSchemaTableColumns disabled when missing args', async () => {
    (api.getDatasourceSchemaTableColumns as ReturnType<typeof vi.fn>).mockResolvedValue([])
    const { wrapper } = makeWrapper()
    renderHook(() => useDatasourceSchemaTableColumns(1, null, null), { wrapper })
    expect(api.getDatasourceSchemaTableColumns).not.toHaveBeenCalled()
    const { result } = renderHook(
      () => useDatasourceSchemaTableColumns(1, 'db', 't'),
      { wrapper },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.getDatasourceSchemaTableColumns).toHaveBeenCalledWith(1, 'db', 't')
  })
})

describe('mutations (datasources)', () => {
  it('useCreateDatasource invalidates', async () => {
    (api.createDatasource as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useCreateDatasource(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ name: 'x' } as never)
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['datasources'] })
  })

  it('useUpdateDatasource invalidates', async () => {
    (api.updateDatasource as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useUpdateDatasource(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ id: 1, payload: {} as never })
    })
    expect(spy).toHaveBeenCalled()
  })

  it('useDeleteDatasource invalidates', async () => {
    (api.deleteDatasource as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useDeleteDatasource(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(1)
    })
    expect(spy).toHaveBeenCalled()
  })

  it('useTestConnection success path uses latency_ms when present', async () => {
    (api.testConnection as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      latency_ms: 50,
    })
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useTestConnection(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(1)
    })
    expect(spy).toHaveBeenCalled()
  })

  it('useTestConnection success path falls back to performance.now diff', async () => {
    (api.testConnection as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useTestConnection(), { wrapper })
    let data: unknown
    await act(async () => {
      data = await result.current.mutateAsync(2)
    })
    expect((data as { ok: boolean }).ok).toBe(false)
  })

  it('useTestConnection error rethrows', async () => {
    (api.testConnection as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('nope'))
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useTestConnection(), { wrapper })
    await expect(
      act(async () => {
        await result.current.mutateAsync(3)
      }),
    ).rejects.toThrow('nope')
  })

  it('useSyncDatasourceCatalog invalidates', async () => {
    (api.syncDatasourceCatalog as ReturnType<typeof vi.fn>).mockResolvedValue({
      job_id: 'j',
      status: 'ok',
    })
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useSyncDatasourceCatalog(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(1)
    })
    expect(spy).toHaveBeenCalled()
  })
})
