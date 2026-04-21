// frontend/src/v2/hooks/extraction.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('@v2/api/extraction', () => ({
  listTasks: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  executeTask: vi.fn(),
  listRuns: vi.fn(),
  updateTaskSchedule: vi.fn(),
}))

import * as api from '@v2/api/extraction'
import {
  useExtractionTasks,
  useCreateExtractionTask,
  useUpdateExtractionTask,
  useDeleteExtractionTask,
  useExecuteTask,
  useExtractionRuns,
  useUpdateTaskSchedule,
} from './extraction'
import { makeWrapper } from './test-utils'

beforeEach(() => vi.clearAllMocks())

describe('extraction', () => {
  it('useExtractionTasks fetches', async () => {
    (api.listTasks as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0 })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useExtractionTasks({ page: 1 }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('useExtractionRuns fetches', async () => {
    (api.listRuns as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0 })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useExtractionRuns(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('useCreateExtractionTask invalidates tasks', async () => {
    (api.createTask as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useCreateExtractionTask(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({} as never)
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['extraction-tasks'] })
  })

  it('useUpdateExtractionTask invalidates', async () => {
    (api.updateTask as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useUpdateExtractionTask(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ id: 1, payload: {} as never })
    })
    expect(spy).toHaveBeenCalled()
  })

  it('useDeleteExtractionTask invalidates both', async () => {
    (api.deleteTask as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useDeleteExtractionTask(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(1)
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['extraction-tasks'] })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['extraction-runs'] })
  })

  it('useExecuteTask invalidates both', async () => {
    (api.executeTask as ReturnType<typeof vi.fn>).mockResolvedValue({} as never)
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useExecuteTask(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ id: 1, triggered_by: 'me' })
    })
    expect(api.executeTask).toHaveBeenCalledWith(1, 'me')
    expect(spy).toHaveBeenCalledWith({ queryKey: ['extraction-tasks'] })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['extraction-runs'] })
  })

  it('useUpdateTaskSchedule invalidates tasks', async () => {
    (api.updateTaskSchedule as ReturnType<typeof vi.fn>).mockResolvedValue({})
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useUpdateTaskSchedule(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ id: 1, payload: {} as never })
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['extraction-tasks'] })
  })
})
