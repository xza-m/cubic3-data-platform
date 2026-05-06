// frontend/src/v2/hooks/userPreferences.test.tsx
//
// 用户偏好 hooks 单元测试
// - useMyPreferences: GET 返回默认值
// - useUpdateMyPreferences: PUT 调用正确 URL；成功后更新缓存

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

// Mock API 层
vi.mock('@v2/api/userPreferences', () => ({
  getMyPreferences: vi.fn(),
  putMyPreferences: vi.fn(),
}))

import { getMyPreferences, putMyPreferences } from '@v2/api/userPreferences'
import { setAccessToken } from '@v2/api/client'
import { useMyPreferences, useUpdateMyPreferences, PREF_QUERY_KEY } from './userPreferences'
import type { UserPreferences } from '@v2/api/userPreferences'

const mockGet = getMyPreferences as ReturnType<typeof vi.fn>
const mockPut = putMyPreferences as ReturnType<typeof vi.fn>

const DEFAULT_PREFS: UserPreferences = {
  user_id: 1,
  theme: 'system',
  default_landing: '/dashboard',
  list_page_size: 20,
  table_density: 'comfortable',
  extra: {},
  updated_at: null,
}

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

describe('useMyPreferences', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setAccessToken('test-token')
  })

  it('fetches and returns server preferences', async () => {
    mockGet.mockResolvedValue(DEFAULT_PREFS)
    const { qc, wrapper } = makeWrapper()

    const { result } = renderHook(() => useMyPreferences(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockGet).toHaveBeenCalledTimes(1)
    expect(result.current.data).toEqual(DEFAULT_PREFS)
    qc.clear()
  })

  it('does not fetch before authentication token exists', () => {
    setAccessToken(null)
    const { qc, wrapper } = makeWrapper()

    const { result } = renderHook(() => useMyPreferences(), { wrapper })

    expect(result.current.fetchStatus).toBe('idle')
    expect(mockGet).not.toHaveBeenCalled()
    qc.clear()
  })

  it('uses query key [userPreferences, me]', async () => {
    mockGet.mockResolvedValue(DEFAULT_PREFS)
    const { qc, wrapper } = makeWrapper()

    const { result } = renderHook(() => useMyPreferences(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const cached = qc.getQueryData(PREF_QUERY_KEY)
    expect(cached).toEqual(DEFAULT_PREFS)
    qc.clear()
  })
})

describe('useUpdateMyPreferences', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls putMyPreferences with the patch', async () => {
    mockGet.mockResolvedValue(DEFAULT_PREFS)
    const updated: UserPreferences = { ...DEFAULT_PREFS, theme: 'dark' }
    mockPut.mockResolvedValue(updated)

    const { qc, wrapper } = makeWrapper()
    // Pre-populate cache
    qc.setQueryData(PREF_QUERY_KEY, DEFAULT_PREFS)

    const { result } = renderHook(() => useUpdateMyPreferences(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ theme: 'dark' })
    })

    expect(mockPut).toHaveBeenCalledWith({ theme: 'dark' })
    qc.clear()
  })

  it('updates cache with server response on success', async () => {
    const updated: UserPreferences = { ...DEFAULT_PREFS, theme: 'dark' }
    mockPut.mockResolvedValue(updated)

    const { qc, wrapper } = makeWrapper()
    qc.setQueryData(PREF_QUERY_KEY, DEFAULT_PREFS)

    const { result } = renderHook(() => useUpdateMyPreferences(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ theme: 'dark' })
    })

    const cached = qc.getQueryData(PREF_QUERY_KEY)
    expect(cached).toEqual(updated)
    qc.clear()
  })

  it('does not overwrite cache directly without server data', async () => {
    // The mutation must use the server-returned object, not modify cache in place
    const serverResponse: UserPreferences = {
      ...DEFAULT_PREFS,
      theme: 'light',
      updated_at: '2026-04-21T00:00:00',
    }
    mockPut.mockResolvedValue(serverResponse)

    const { qc, wrapper } = makeWrapper()
    qc.setQueryData(PREF_QUERY_KEY, DEFAULT_PREFS)

    const { result } = renderHook(() => useUpdateMyPreferences(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ theme: 'light' })
    })

    const cached = qc.getQueryData(PREF_QUERY_KEY) as UserPreferences
    // updated_at must come from server, not be null (what would happen if we patched locally)
    expect(cached.updated_at).toBe('2026-04-21T00:00:00')
    qc.clear()
  })
})
