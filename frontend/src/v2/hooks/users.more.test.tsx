// frontend/src/v2/hooks/users.more.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('@v2/api/users', () => ({
  listUsers: vi.fn(),
  getUser: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  assignUserRoles: vi.fn(),
}))

import * as api from '@v2/api/users'
import {
  useUser,
  useUpdateUser,
  useDeleteUser,
  useAssignUserRoles,
} from './users'
import { makeWrapper } from './test-utils'

beforeEach(() => vi.clearAllMocks())

describe('users misc hooks', () => {
  it('useUser disabled when id<=0', () => {
    const { wrapper } = makeWrapper()
    renderHook(() => useUser(0), { wrapper })
    expect(api.getUser).not.toHaveBeenCalled()
  })

  it('useUser fetches when id>0', async () => {
    (api.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useUser(1), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('useUpdateUser invalidates list+detail', async () => {
    (api.updateUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useUpdateUser(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ id: 5, payload: {} as never })
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['users'] })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['users', 'detail', 5] })
  })

  it('useDeleteUser invalidates', async () => {
    (api.deleteUser as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useDeleteUser(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(1)
    })
    expect(spy).toHaveBeenCalled()
  })

  it('useAssignUserRoles invalidates list+detail', async () => {
    (api.assignUserRoles as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useAssignUserRoles(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ id: 9, payload: { role_ids: [1] } })
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['users', 'detail', 9] })
  })
})
