// frontend/src/v2/api/search.ts
//
// 全局搜索 API（F8）：CommandPalette 走后端聚合搜索，替代客户端整列表过滤。

import { apiClient } from './client'

export type SearchItemType = 'cube' | 'domain' | 'metric'

export interface SearchItem {
  type: SearchItemType
  name: string
  title?: string | null
  description?: string | null
  /** domain 专用：跳转用 id/code */
  id?: string | null
  /** metric 专用：所属分析对象 */
  object_name?: string | null
}

export interface SearchResult {
  items: SearchItem[]
  total: number
}

export async function globalSearch(q: string, types?: SearchItemType[], limit = 20): Promise<SearchResult> {
  const resp = await apiClient.get('/search', {
    params: { q, types: types?.join(','), limit },
  })
  return resp.data.data
}
