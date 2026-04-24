// frontend/src/v2/hooks/roles.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('@v2/api/roles', () => ({
  listRoles: vi.fn(),
  getRole: vi.fn(),
  createRole: vi.fn(),
  updateRole: vi.fn(),
  deleteRole: vi.fn(),
  listPermissions: vi.fn(),
}))

import * as api from '@v2/api/roles'
import {
  useListRoles,
  useRole,
  useCreateRole,
  useUpdateRole,
  useDeleteRole,
} from './roles'
import { makeWrapper } from './test-utils'

beforeEach(() => vi.clearAllMocks())

describe('roles', () => {
  it('useListRoles fetches', async () => {
    (api.listRoles as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0 })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useListRoles({ page: 1 }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('useRole disabled when id<=0', () => {
    const { wrapper } = makeWrapper()
    renderHook(() => useRole(0), { wrapper })
    expect(api.getRole).not.toHaveBeenCalled()
  })

  it('useRole fetches when id>0', async () => {
    (api.getRole as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useRole(1), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('useCreateRole invalidates', async () => {
    (api.createRole as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useCreateRole(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({} as never)
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['roles'] })
  })

  it('useUpdateRole invalidates list + detail', async () => {
    (api.updateRole as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useUpdateRole(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ id: 5, payload: {} as never })
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['roles'] })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['roles', 'detail', 5] })
  })

  it('useDeleteRole invalidates', async () => {
    (api.deleteRole as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useDeleteRole(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(1)
    })
    expect(spy).toHaveBeenCalled()
  })
})
