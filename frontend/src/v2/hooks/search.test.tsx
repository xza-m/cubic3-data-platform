// frontend/src/v2/hooks/search.test.tsx
//
// F8：useDebouncedValue 防抖 + useGlobalSearch 仅在有关键字时发起请求。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useDebouncedValue, useGlobalSearch } from './search'

const globalSearchMock = vi.fn()

vi.mock('@v2/api/search', () => ({
  globalSearch: (...args: unknown[]) => globalSearchMock(...args),
}))

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('延迟期内的中间值不向下游传播', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'a' },
    })
    expect(result.current).toBe('a')

    rerender({ value: 'ab' })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    rerender({ value: 'abc' })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    // 'ab' 在 300ms 内被 'abc' 覆盖，不应出现
    expect(result.current).toBe('a')

    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current).toBe('abc')
  })
})

describe('useGlobalSearch', () => {
  beforeEach(() => {
    globalSearchMock.mockReset()
    globalSearchMock.mockResolvedValue({ items: [{ type: 'cube', name: 'orders' }], total: 1 })
  })

  it('q 为空时不发请求', () => {
    renderHook(() => useGlobalSearch('  '), { wrapper })
    expect(globalSearchMock).not.toHaveBeenCalled()
  })

  it('q 非空时调用后端搜索并返回结果', async () => {
    const { result } = renderHook(() => useGlobalSearch('order'), { wrapper })
    await waitFor(() => {
      expect(result.current.data?.total).toBe(1)
    })
    expect(globalSearchMock).toHaveBeenCalledWith('order')
  })
})
