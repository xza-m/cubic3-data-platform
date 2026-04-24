// frontend/src/v2/hooks/users.test.tsx
//
// 用户域 hooks 单元测试（P14）
// - useListUsers: 正常获取用户列表
// - useCreateUser: mutation 调用 + invalidate

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

vi.mock('@v2/api/users', () => ({
  listUsers: vi.fn(),
  getUser: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  assignUserRoles: vi.fn(),
  listUserLoginHistory: vi.fn(),
}))

import { listUsers, createUser } from '@v2/api/users'
import { useListUsers, useCreateUser } from './users'
import type { User } from '@v2/api/users'

const mockListUsers = listUsers as ReturnType<typeof vi.fn>
const mockCreateUser = createUser as ReturnType<typeof vi.fn>

const MOCK_USERS: User[] = [
  {
    id: 1,
    username: 'admin',
    email: 'admin@test.com',
    display_name: '管理员',
    status: 'active',
    is_active: true,
    is_system: true,
    role_ids: [1],
    role_codes: ['admin'],
    last_login_at: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
]

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: 0 }, mutations: { retry: 0 } },
  })
  return {
    qc,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  }
}

describe('useListUsers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches user list successfully', async () => {
    mockListUsers.mockResolvedValue({ items: MOCK_USERS, total: 1, page: 1, page_size: 20 })
    const { qc, wrapper } = makeWrapper()

    const { result } = renderHook(() => useListUsers(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.items).toHaveLength(1)
    expect(result.current.data?.items[0].username).toBe('admin')
    qc.clear()
  })

  it('passes query params correctly', async () => {
    mockListUsers.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 })
    const { qc, wrapper } = makeWrapper()

    const { result } = renderHook(() => useListUsers({ q: 'test', is_active: true }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockListUsers).toHaveBeenCalledWith({ q: 'test', is_active: true })
    qc.clear()
  })
})

describe('useCreateUser', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls createUser and invalidates users query', async () => {
    const newUser: User = { ...MOCK_USERS[0], id: 99, username: 'newuser' }
    mockCreateUser.mockResolvedValue(newUser)
    mockListUsers.mockResolvedValue({ items: [newUser], total: 1, page: 1, page_size: 20 })

    const { qc, wrapper } = makeWrapper()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useCreateUser(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        username: 'newuser',
        password: 'pass',
        email: undefined,
        display_name: undefined,
      })
    })

    expect(mockCreateUser).toHaveBeenCalledWith({
      username: 'newuser',
      password: 'pass',
      email: undefined,
      display_name: undefined,
    })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['users'] })
    qc.clear()
  })
})
