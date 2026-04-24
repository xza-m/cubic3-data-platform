// frontend/src/v2/api/queries.ts
//
// 查询域 API 层。所有调用均通过 apiClient，禁止页面层直接调 axios。
// 后端契约：app/interfaces/api/v1/queries.py

import { apiClient } from './client'
import type { PaginatedResponse } from './types'
// ============================================================================
// 类型定义（按后端 wire 格式保持 snake_case）
// ============================================================================

export interface QueryHistoryItem {
  id: number
  sql_query: string
  source_id: number | null
  source_name: string | null
  status: string
  executed_by: string
  executed_at: string
  execution_time_ms: number | null
  row_count: number | null
  error_message: string | null
}

export interface SavedQuery {
  id: number
  query_code: string
  query_name: string
  source_id: number | null
  sql_query: string
  description: string | null
  folder_id: number | null
  tags: string[]
  is_favorite: boolean
  created_by: string
  created_at: string
  updated_at: string
}

export interface SavedQueryDetail extends SavedQuery {
  folder_name: string | null
}

export interface ExecuteQueryRequest {
  source_id: number
  sql_query: string
  query_id?: number
  limit?: number
}

export interface ExecuteQueryRaw {
  columns: Array<string | { name: string; type?: string }>
  data?: Array<Record<string, unknown>> | (string | number | boolean | null)[][]
  rows?: (string | number | boolean | null)[][]
  row_count: number
  execution_time_ms: number
  status?: string
}

export interface QueryRunResult {
  columns: string[]
  data: Record<string, unknown>[]
  row_count: number
  execution_time_ms: number
}

export interface QueryFolder {
  id: number
  folder_name: string
  parent_id: number | null
  created_by: string
  created_at: string
}

export interface CreateSavedQueryPayload {
  query_name: string
  source_id: number
  sql_query: string
  description?: string
  folder_id?: number
  tags?: string[]
  is_favorite?: boolean
}

export interface UpdateSavedQueryPayload {
  query_name?: string
  source_id?: number
  sql_query?: string
  description?: string
  folder_id?: number | null
  tags?: string[]
}

export interface HistoryListParams {
  page?: number
  page_size?: number
  source_id?: number
  status?: string
  date_from?: string
  date_to?: string
}

export interface SavedQueryListParams {
  page?: number
  page_size?: number
  folder_id?: number
  is_favorite?: boolean
  search?: string
}

// ============================================================================
// 查询执行
// ============================================================================

function normalizeColumn(col: string | { name: string; type?: string }): string {
  return typeof col === 'string' ? col : col.name
}

export async function executeQuery(payload: ExecuteQueryRequest): Promise<QueryRunResult> {
  const res = await apiClient.post<{ data: ExecuteQueryRaw }>('/queries/execute', payload)
  const raw = res.data.data
  const columns = (raw.columns || []).map(normalizeColumn)
  let data: Record<string, unknown>[] = []
  if (Array.isArray(raw.data) && raw.data.length > 0) {
    if (Array.isArray(raw.data[0])) {
      const rows = raw.data as (string | number | boolean | null)[][]
      data = rows.map((row) => {
        const obj: Record<string, unknown> = {}
        columns.forEach((c, i) => { obj[c] = row[i] })
        return obj
      })
    } else {
      data = raw.data as Record<string, unknown>[]
    }
  } else if (Array.isArray(raw.rows)) {
    data = raw.rows.map((row) => {
      const obj: Record<string, unknown> = {}
      columns.forEach((c, i) => { obj[c] = row[i] })
      return obj
    })
  }
  return {
    columns,
    data,
    row_count: raw.row_count ?? data.length,
    execution_time_ms: raw.execution_time_ms ?? 0,
  }
}

// ============================================================================
// 查询历史（GET /queries/histories）
// ============================================================================

export async function listQueryHistories(
  params: HistoryListParams = {},
): Promise<PaginatedResponse<QueryHistoryItem>> {
  const res = await apiClient.get<{ data: PaginatedResponse<QueryHistoryItem> }>(
    '/queries/histories',
    { params },
  )
  return res.data.data
}

export async function getQueryHistoryItem(id: number): Promise<QueryHistoryItem> {
  // 后端契约：GET /api/v1/queries/histories/:id
  //          （app/interfaces/api/v1/queries.py :: get_history_detail）
  const res = await apiClient.get<{ data: QueryHistoryItem }>(`/queries/histories/${id}`)
  return res.data.data
}

// ============================================================================
// 已保存查询（GET/POST/PUT/DELETE /queries）
// ============================================================================

export async function listSavedQueries(
  params: SavedQueryListParams = {},
): Promise<PaginatedResponse<SavedQuery>> {
  const res = await apiClient.get<{ data: PaginatedResponse<SavedQuery> }>('/queries', { params })
  return res.data.data
}

export async function getSavedQuery(id: number): Promise<SavedQueryDetail> {
  const res = await apiClient.get<{ data: SavedQueryDetail }>(`/queries/${id}`)
  return res.data.data
}

export async function createSavedQuery(
  payload: CreateSavedQueryPayload,
): Promise<{ id: number; query_code: string; query_name: string }> {
  const res = await apiClient.post<{ data: { id: number; query_code: string; query_name: string } }>(
    '/queries',
    payload,
  )
  return res.data.data
}

export async function updateSavedQuery(
  id: number,
  payload: UpdateSavedQueryPayload,
): Promise<{ id: number; query_name: string }> {
  const res = await apiClient.put<{ data: { id: number; query_name: string } }>(
    `/queries/${id}`,
    payload,
  )
  return res.data.data
}

export async function deleteSavedQuery(id: number): Promise<void> {
  await apiClient.delete(`/queries/${id}`)
}

export async function toggleFavorite(id: number): Promise<unknown> {
  const res = await apiClient.post<{ data: unknown }>(`/queries/${id}/favorite`)
  return res.data.data
}

// ============================================================================
// 文件夹
// ============================================================================

export async function listFolders(): Promise<QueryFolder[]> {
  const res = await apiClient.get<{ data: QueryFolder[] }>('/queries/folders')
  return res.data.data
}

export async function createFolder(payload: {
  folder_name: string
  parent_id?: number
}): Promise<QueryFolder> {
  const res = await apiClient.post<{ data: QueryFolder }>('/queries/folders', payload)
  return res.data.data
}

// ============================================================================
// 数据源列表（查询控制台用）
// ============================================================================

export interface DatasourceSimple {
  id: number
  name: string
  source_type: string
  connection_status: string
  is_active: boolean
}

export async function listDatasourcesForConsole(): Promise<DatasourceSimple[]> {
  const res = await apiClient.get<{ data: { items: DatasourceSimple[] } }>(
    '/data-center/datasources',
    { params: { page: 1, page_size: 100 } },
  )
  return res.data.data.items
}

// ============================================================================
// 调度查询（B-back-8）
// 后端契约：app/interfaces/api/v1/scheduled_queries.py
//   - GET   /api/v1/queries/scheduled                  分页列表
//   - POST  /api/v1/queries/scheduled                  新建
//   - GET   /api/v1/queries/scheduled/:id              详情
//   - PATCH /api/v1/queries/scheduled/:id              更新
//   - DELETE /api/v1/queries/scheduled/:id             删除
//   - POST  /api/v1/queries/scheduled/:id/enable       幂等启用 + 同步 APScheduler
//   - POST  /api/v1/queries/scheduled/:id/disable      幂等禁用
//   - POST  /api/v1/queries/scheduled/:id/trigger      手动触发（不修改 next_run_at）
//   - GET   /api/v1/queries/scheduled/:id/runs         runs 分页
// ============================================================================

const SCHED_BASE = '/queries/scheduled'

export interface ScheduledQuery {
  id: number
  name: string
  description: string | null
  sql: string
  datasource_id: number
  cron: string
  timezone: string
  enabled: boolean
  next_run_at: string | null
  last_run_at: string | null
  last_status: string | null
  owner_id: number | string
  created_at: string
  updated_at: string
}

export interface ScheduledQueryRun {
  id: number
  query_id: number
  status: 'running' | 'success' | 'failed' | 'timeout' | string
  started_at: string
  finished_at: string | null
  rows_returned: number | null
  error: string | null
}

export interface ScheduledQueryListParams {
  page?: number
  page_size?: number
}

export interface CreateScheduledQueryPayload {
  name: string
  description?: string | null
  sql: string
  datasource_id: number
  cron: string
  timezone?: string
  enabled?: boolean
}

export interface UpdateScheduledQueryPayload {
  name?: string
  description?: string | null
  sql?: string
  datasource_id?: number
  cron?: string
  timezone?: string
}

export async function listScheduledQueries(
  params: ScheduledQueryListParams = {},
): Promise<PaginatedResponse<ScheduledQuery>> {
  const res = await apiClient.get<{ data: PaginatedResponse<ScheduledQuery> }>(SCHED_BASE, {
    params,
  })
  return res.data.data
}

export async function getScheduledQuery(id: number): Promise<ScheduledQuery> {
  const res = await apiClient.get<{ data: ScheduledQuery }>(`${SCHED_BASE}/${id}`)
  return res.data.data
}

export async function createScheduledQuery(
  payload: CreateScheduledQueryPayload,
): Promise<ScheduledQuery> {
  const res = await apiClient.post<{ data: ScheduledQuery }>(SCHED_BASE, payload)
  return res.data.data
}

export async function updateScheduledQuery(
  id: number,
  payload: UpdateScheduledQueryPayload,
): Promise<ScheduledQuery> {
  const res = await apiClient.patch<{ data: ScheduledQuery }>(`${SCHED_BASE}/${id}`, payload)
  return res.data.data
}

export async function deleteScheduledQuery(id: number): Promise<void> {
  await apiClient.delete(`${SCHED_BASE}/${id}`)
}

export async function enableScheduledQuery(id: number): Promise<ScheduledQuery> {
  const res = await apiClient.post<{ data: ScheduledQuery }>(`${SCHED_BASE}/${id}/enable`)
  return res.data.data
}

export async function disableScheduledQuery(id: number): Promise<ScheduledQuery> {
  const res = await apiClient.post<{ data: ScheduledQuery }>(`${SCHED_BASE}/${id}/disable`)
  return res.data.data
}

export async function triggerScheduledQuery(id: number): Promise<ScheduledQueryRun> {
  const res = await apiClient.post<{ data: ScheduledQueryRun }>(`${SCHED_BASE}/${id}/trigger`)
  return res.data.data
}

export async function listScheduledQueryRuns(
  id: number,
  params: { page?: number; page_size?: number } = {},
): Promise<PaginatedResponse<ScheduledQueryRun>> {
  const res = await apiClient.get<{ data: PaginatedResponse<ScheduledQueryRun> }>(
    `${SCHED_BASE}/${id}/runs`,
    { params },
  )
  return res.data.data
}
