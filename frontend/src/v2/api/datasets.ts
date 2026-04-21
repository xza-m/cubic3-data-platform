// frontend/src/v2/api/datasets.ts
//
// 数据集 API 层。所有 HTTP 调用统一走 apiClient，禁止页面/hook 直接调 axios。
// 字段对齐：以 DatasetResponse / DatasetFieldSchema (dataset_schemas.py) 为准，snake_case 保留。

import { apiClient } from './client'
import type { PaginatedResponse, ListQueryParams } from './types'

// ── 类型 ──────────────────────────────────────────────────────────────────────

export interface DatasetField {
  id?: number
  physical_name: string
  data_type: string
  display_name: string | null
  business_type: string           // 'partition' | 'dimension' | 'metric'
  sensitivity_level: string       // 'public' | 'internal' | 'pii' | 'confidential' | 'secret'
  is_sensitive: boolean
  mask_rule: string | null
  comment: string | null
  field_order: number
}

export interface Dataset {
  id: number
  dataset_code: string
  dataset_name: string
  dataset_type: string            // 'physical' | 'virtual' | 'file'
  source_id: number | null
  source_type: string | null
  physical_table: string | null
  sql_query: string | null
  file_metadata: Record<string, unknown> | null
  description: string | null
  owner: string | null
  sync_status: string             // 'synced' | 'syncing' | 'failed' | 'pending'
  last_sync_at: string | null
  sync_error: string | null
  field_count: number | null
  created_at: string
  updated_at: string
  // fields 仅 include_fields=true 时返回
  fields?: DatasetField[]
}

export interface ListDatasetsParams extends ListQueryParams {
  source_id?: number
  owner?: string
  search?: string
}

export interface CreateDatasetPayload {
  dataset_code?: string
  dataset_name: string
  source_id?: number
  physical_table?: string
  fields: Array<Omit<DatasetField, 'id'>>
  description?: string
  owner?: string
  dataset_type?: string
  sql_query?: string
  file_metadata?: Record<string, unknown>
}

export interface UpdateDatasetPayload {
  dataset_name?: string
  description?: string
  owner?: string
}

export interface PreviewDatasetPayload {
  datasource_id: number
  database: string
  table: string
}

export interface PreviewDatasetResult {
  columns: string[]
  rows: unknown[][]
  total: number
}

// ── API 函数 ──────────────────────────────────────────────────────────────────

const BASE = '/data-center/datasets'

export async function listDatasets(
  params?: ListDatasetsParams,
): Promise<PaginatedResponse<Dataset>> {
  const resp = await apiClient.get(BASE, { params })
  return resp.data.data
}

export async function getDataset(id: number, includeFields = false): Promise<Dataset> {
  const resp = await apiClient.get(`${BASE}/${id}`, {
    params: { include_fields: includeFields },
  })
  return resp.data.data
}

export async function createDataset(payload: CreateDatasetPayload): Promise<Dataset> {
  const resp = await apiClient.post(BASE, payload)
  return resp.data.data
}

export async function updateDataset(id: number, payload: UpdateDatasetPayload): Promise<Dataset> {
  const resp = await apiClient.put(`${BASE}/${id}`, payload)
  return resp.data.data
}

export async function deleteDataset(id: number): Promise<void> {
  await apiClient.delete(`${BASE}/${id}`)
}

export async function syncDatasetSchema(id: number): Promise<unknown> {
  const resp = await apiClient.post(`${BASE}/${id}/sync-schema`)
  return resp.data.data
}

export async function previewDataset(payload: PreviewDatasetPayload): Promise<PreviewDatasetResult> {
  const resp = await apiClient.post(`${BASE}/preview`, payload)
  return resp.data.data
}

// ── 字段画像（P3）──────────────────────────────────────────────────────────────
// TODO: 后端 GET /api/v1/data-center/datasets/:id/profile 需在 W1 交付
// 若后端未就绪，此函数返回 mock 数据（见 getDatasetProfile）

export interface DatasetProfileColumn {
  name: string
  type: string
  null_count: number
  distinct_count: number
  min: string | null
  max: string | null
  /** 前端占位 sparkline 数据（百分比序列，后端暂不提供） */
  sample?: number[]
}

export interface DatasetProfile {
  columns: DatasetProfileColumn[]
  row_count: number
  generated_at: string
}

export async function getDatasetProfile(id: number): Promise<DatasetProfile> {
  try {
    const resp = await apiClient.get(`${BASE}/${id}/profile`)
    return resp.data.data
  } catch {
    // TODO: 后端 profile 接口未就绪 — mock 数据占位
    return {
      row_count: 0,
      generated_at: new Date().toISOString(),
      columns: [],
    }
  }
}

export async function refreshDatasetProfile(id: number): Promise<DatasetProfile> {
  try {
    const resp = await apiClient.post(`${BASE}/${id}/profile/refresh`)
    return resp.data.data
  } catch {
    // TODO: 后端 profile refresh 接口未就绪 — mock 数据占位
    return {
      row_count: 0,
      generated_at: new Date().toISOString(),
      columns: [],
    }
  }
}
