// frontend/src/v2/hooks/search.ts
//
// 全局搜索 hooks（F8）：300ms 防抖 + 仅在有关键字时发起后端搜索。

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { globalSearch } from '@v2/api/search'
import { qk } from './query-client'

/** 通用防抖值：delay 内值未再变化才向下游传播。 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return debounced
}

/** 后端全局搜索：q 为空时不发请求。 */
export function useGlobalSearch(q: string) {
  const keyword = q.trim()
  return useQuery({
    queryKey: qk('search', 'global', keyword),
    queryFn: () => globalSearch(keyword),
    enabled: keyword.length > 0,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })
}
