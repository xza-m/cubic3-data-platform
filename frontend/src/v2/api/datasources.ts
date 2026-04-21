// frontend/src/v2/api/datasources.ts
//
// 数据源 API 层。所有 HTTP 调用统一走 apiClient，禁止页面/hook 直接调 axios。
// 字段对齐：以 DatasourceResponse (datasource_schemas.py) 为准，snake_case 保留。
// drop-frontend: demo 字段 capabilities / rating / installs — 后端无设计 see plan §3.4

import { apiClient } from './client'
import type { PaginatedResponse, ListQueryParams } from './types'

// ── 类型 ──────────────────────────────────────────────────────────────────────

export interface Datasource {
  id: number
  name: string
  source_type: string
  description: string | null
  connection_config: Record<string, unknown>
  extra_config: Record<string, unknown>
  is_active: boolean
  connection_status: string           // 'connected' | 'disconnected' | 'error' | 'testing'
  last_test_at: string | null
  last_test_error: string | null
  created_by: string
  created_at: string
  updated_at: string
  // catalog_sync_job 仅在创建时临时返回，不在列表/详情中
}

export interface DatasourceType {
  type: string
  display_name: string
  description: string
}

// B-back-4: 测试连接增强返回字段（test_connection_handler.py）
export interface TestConnectionResult {
  ok: boolean
  success: boolean              // 向后兼容字段
  message: string
  latency_ms: number
  tested_at: string             // ISO 8601
  // 成功路径
  details?: {
    server_version?: string | null
    tls?: boolean
  } | null
  // 失败路径
  error_code?:
    | 'CONNECTION_TIMEOUT'
    | 'AUTH_FAILED'
    | 'HOST_UNREACHABLE'
    | 'UNKNOWN'
  error_message?: string
  hint?: string
}

// B-back-5: schema 浏览三层粒度
export interface DatasourceDatabasesResponse {
  datasource_id: number
  databases: string[]
  fetched_at: string
}

export interface DatasourceTableSummary {
  table_name: string
  comment: string
  row_count: number | null
}

export interface DatasourceTablesResponse {
  datasource_id: number
  database: string
  tables: DatasourceTableSummary[]
  fetched_at: string
}

export interface DatasourceColumnInfo {
  name: string
  type: string
  nullable: boolean
  comment: string
}

export interface DatasourceTableSchemaResponse {
  datasource_id: number
  database: string
  table: string
  columns: DatasourceColumnInfo[]
  row_count_estimate: number | null
  fetched_at: string
}

export interface ListDatasourcesParams extends ListQueryParams {
  source_type?: string
  is_active?: boolean
  search?: string
}

export interface CreateDatasourcePayload {
  name: string
  source_type: string
  description?: string
  connection_config: Record<string, unknown>
  extra_config?: Record<string, unknown>
}

export interface UpdateDatasourcePayload {
  name?: string
  description?: string
  connection_config?: Record<string, unknown>
  extra_config?: Record<string, unknown>
  is_active?: boolean
}

// ── API 函数 ──────────────────────────────────────────────────────────────────

const BASE = '/data-center/datasources'

export async function listDatasources(
  params?: ListDatasourcesParams,
): Promise<PaginatedResponse<Datasource>> {
  const resp = await apiClient.get(BASE, { params })
  return resp.data.data
}

export async function getDatasource(id: number): Promise<Datasource> {
  const resp = await apiClient.get(`${BASE}/${id}`)
  return resp.data.data
}

export async function createDatasource(payload: CreateDatasourcePayload): Promise<Datasource> {
  const resp = await apiClient.post(BASE, payload)
  return resp.data.data
}

export async function updateDatasource(
  id: number,
  payload: UpdateDatasourcePayload,
): Promise<Datasource> {
  const resp = await apiClient.put(`${BASE}/${id}`, payload)
  return resp.data.data
}

export async function deleteDatasource(id: number): Promise<void> {
  await apiClient.delete(`${BASE}/${id}`)
}

export async function testConnection(id: number): Promise<TestConnectionResult> {
  const resp = await apiClient.post(`${BASE}/${id}/test`)
  return resp.data.data
}

export async function syncDatasourceCatalog(id: number): Promise<{ job_id: string; status: string }> {
  const resp = await apiClient.post(`${BASE}/${id}/sync-catalog`)
  return resp.data.data
}

export async function getDatasourceTypes(): Promise<DatasourceType[]> {
  const resp = await apiClient.get(`${BASE}/types`)
  return resp.data.data
}

export async function getDatasourceDatabases(id: number): Promise<string[]> {
  const resp = await apiClient.get(`${BASE}/${id}/databases`)
  return resp.data.data
}

export async function getDatasourceTables(
  id: number,
  database: string,
  force_refresh = false,
): Promise<string[]> {
  const resp = await apiClient.get(`${BASE}/${id}/tables`, {
    params: { database, force_refresh },
  })
  return resp.data.data
}

// ── B-back-5: 数据源 Schema 浏览 ────────────────────────────────────────────────

export async function getDatasourceSchema(
  id: number,
  refresh = false,
): Promise<DatasourceDatabasesResponse> {
  const resp = await apiClient.get(`${BASE}/${id}/schema`, {
    params: refresh ? { refresh: 1 } : undefined,
  })
  return resp.data.data
}

export async function getDatasourceSchemaTables(
  id: number,
  database: string,
  refresh = false,
): Promise<DatasourceTablesResponse> {
  const resp = await apiClient.get(
    `${BASE}/${id}/schema/${encodeURIComponent(database)}`,
    { params: refresh ? { refresh: 1 } : undefined },
  )
  return resp.data.data
}

export async function getDatasourceSchemaTableColumns(
  id: number,
  database: string,
  table: string,
  refresh = false,
): Promise<DatasourceTableSchemaResponse> {
  const resp = await apiClient.get(
    `${BASE}/${id}/schema/${encodeURIComponent(database)}/${encodeURIComponent(table)}`,
    { params: refresh ? { refresh: 1 } : undefined },
  )
  return resp.data.data
}
