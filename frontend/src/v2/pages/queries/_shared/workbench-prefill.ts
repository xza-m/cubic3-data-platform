// 查询工作台预填上下文。
//
// 视觉构建、已保存查询、查询历史都通过同一个 sessionStorage key 把 SQL
// 传给 /queries，避免跨模块按钮只跳路由但丢失上下文。

import type { NavigateFunction } from 'react-router-dom'

export const V2_QUERY_WORKBENCH_PREFILL_KEY = 'v2:queryVisual:pendingPrefill'

export type QueryWorkbenchPrefillOrigin = 'visual' | 'saved_query' | 'query_history'

export interface QueryWorkbenchPrefillPayload {
  sql: string
  source_id: number | null
  origin: QueryWorkbenchPrefillOrigin
  created_at?: number
  query_id?: number
  query_name?: string
  history_id?: number
  principal_id?: string
  principal_display_name?: string
}

interface QueryWorkbenchPrefillRouteState {
  queryWorkbenchPrefill?: unknown
}

export function normalizeQueryWorkbenchPrefill(value: unknown): QueryWorkbenchPrefillPayload | null {
  if (!value || typeof value !== 'object') return null
  const obj = value as {
    sql?: unknown
    source_id?: unknown
    origin?: unknown
    created_at?: unknown
    query_id?: unknown
    query_name?: unknown
    history_id?: unknown
    principal_id?: unknown
    principal_display_name?: unknown
  }
  if (typeof obj.sql !== 'string' || obj.sql.trim() === '') return null
  const origin =
    obj.origin === 'saved_query' || obj.origin === 'query_history' || obj.origin === 'visual'
      ? obj.origin
      : 'visual'
  return {
    sql: obj.sql,
    source_id: typeof obj.source_id === 'number' ? obj.source_id : null,
    origin,
    created_at: typeof obj.created_at === 'number' ? obj.created_at : Date.now(),
    query_id: typeof obj.query_id === 'number' ? obj.query_id : undefined,
    query_name: typeof obj.query_name === 'string' ? obj.query_name : undefined,
    history_id: typeof obj.history_id === 'number' ? obj.history_id : undefined,
    principal_id: typeof obj.principal_id === 'string' ? obj.principal_id : undefined,
    principal_display_name:
      typeof obj.principal_display_name === 'string' ? obj.principal_display_name : undefined,
  }
}

export function withCreatedAt(payload: QueryWorkbenchPrefillPayload): QueryWorkbenchPrefillPayload {
  return {
    ...payload,
    source_id: typeof payload.source_id === 'number' ? payload.source_id : null,
    created_at: payload.created_at ?? Date.now(),
  }
}

export function writeQueryWorkbenchPrefill(payload: QueryWorkbenchPrefillPayload): void {
  try {
    sessionStorage.setItem(V2_QUERY_WORKBENCH_PREFILL_KEY, JSON.stringify(withCreatedAt(payload)))
  } catch {
    // sessionStorage 不可用时仍允许正常跳转；用户可以手动复制 SQL。
  }
}

export function consumeStoredQueryWorkbenchPrefill(): QueryWorkbenchPrefillPayload | null {
  try {
    const raw = sessionStorage.getItem(V2_QUERY_WORKBENCH_PREFILL_KEY)
    if (!raw) return null
    sessionStorage.removeItem(V2_QUERY_WORKBENCH_PREFILL_KEY)
    return normalizeQueryWorkbenchPrefill(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

export function extractRouteQueryWorkbenchPrefill(
  state: unknown,
): QueryWorkbenchPrefillPayload | null {
  const routeState = state as QueryWorkbenchPrefillRouteState | null
  return normalizeQueryWorkbenchPrefill(routeState?.queryWorkbenchPrefill)
}

export function openQueryWorkbenchWithPrefill(
  payload: QueryWorkbenchPrefillPayload,
  navigate: NavigateFunction,
): void {
  const normalized = withCreatedAt(payload)
  writeQueryWorkbenchPrefill(normalized)
  navigate('/queries', { state: { queryWorkbenchPrefill: normalized } })
}
