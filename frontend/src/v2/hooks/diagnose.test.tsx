// frontend/src/v2/hooks/diagnose.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('@v2/api/diagnose', () => ({
  getDiagnoseRun: vi.fn(),
  listDiagnoseRuns: vi.fn(),
  runDiagnose: vi.fn(),
}))

import * as api from '@v2/api/diagnose'
import { useDiagnoseRuns, useDiagnoseRun, useRunDiagnose } from './diagnose'
import { makeWrapper } from './test-utils'

beforeEach(() => vi.clearAllMocks())

describe('diagnose', () => {
  it('useDiagnoseRuns fetches list', async () => {
    (api.listDiagnoseRuns as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [] })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useDiagnoseRuns({ page: 1 }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('useDiagnoseRun disabled when undefined', () => {
    const { wrapper } = makeWrapper()
    renderHook(() => useDiagnoseRun(undefined), { wrapper })
    expect(api.getDiagnoseRun).not.toHaveBeenCalled()
  })

  it('useDiagnoseRun fetches when id present', async () => {
    (api.getDiagnoseRun as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useDiagnoseRun(1), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('useRunDiagnose success path tracks ok=true', async () => {
    (api.runDiagnose as ReturnType<typeof vi.fn>).mockResolvedValue({
      parse_ok: true,
      validate_ok: true,
      duration_ms: 100,
    })
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useRunDiagnose(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ input_kind: 'sql' } as never)
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['semantic', 'diagnose-runs'] })
  })

  it('useRunDiagnose tracks ok=false when validate_ok is false', async () => {
    (api.runDiagnose as ReturnType<typeof vi.fn>).mockResolvedValue({
      parse_ok: true,
      validate_ok: false,
      duration_ms: 50,
    })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useRunDiagnose(), { wrapper })
    let data: unknown
    await act(async () => {
      data = await result.current.mutateAsync({ input_kind: 'sql' } as never)
    })
    expect((data as { validate_ok: boolean }).validate_ok).toBe(false)
  })

  it('useRunDiagnose tracks ok=false when error present', async () => {
    (api.runDiagnose as ReturnType<typeof vi.fn>).mockResolvedValue({
      parse_ok: true,
      validate_ok: true,
      duration_ms: 50,
      error: 'oops',
    })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useRunDiagnose(), { wrapper })
    let data: unknown
    await act(async () => {
      data = await result.current.mutateAsync({ input_kind: 'cube' } as never)
    })
    expect((data as { error: string }).error).toBe('oops')
  })
})
