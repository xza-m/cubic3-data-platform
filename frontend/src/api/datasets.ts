import apiClient from './client'
import type { PaginatedResponse, Dataset, DatasetField } from '@/types'

// API 基础路径
const API_BASE = '/data-center/datasets'

// 创建数据集请求（支持物理表、虚拟、文件三种类型）
export interface CreateDatasetRequest {
  dataset_type?: 'physical' | 'virtual' | 'file'
  dataset_name: string
  description?: string
  owner?: string
  // 物理表相关
  datasource_id?: number
  source_id?: number
  database?: string
  table_name?: string
  physical_table?: string
  // 虚拟数据集相关
  sql_query?: string
  // 文件数据集相关
  file_metadata?: {
    file_id: string
    file_path: string
    file_name: string
    file_size: number
    row_count: number
    uploaded_at: string
  }
  // 字段配置
  fields?: Array<{
    field_name?: string
    physical_name?: string
    display_name?: string
    data_type?: string
    business_type?: string
    sensitivity_level?: string
    is_partition?: boolean
    mask_rule?: string
    comment?: string
    field_order?: number
  }>
}

// 更新数据集请求
export interface UpdateDatasetRequest {
  dataset_name?: string
  description?: string
  fields?: Array<{
    field_name?: string
    physical_name?: string
    display_name?: string
    business_type?: string
    sensitivity_level?: string
    mask_rule?: string
    comment?: string
    field_order?: number
  }>
}

// 获取数据集列表
export const getDatasets = (params?: {
  source_id?: number
  sync_status?: string
  search?: string
  page?: number
  page_size?: number
}) => {
  return apiClient.get<PaginatedResponse<Dataset>>(
    API_BASE,
    { params }
  )
}

// 获取数据集详情
export const getDataset = (id: number, includeFields = true) => {
  return apiClient.get<Dataset>(`${API_BASE}/${id}`, {
    params: { include_fields: includeFields },
  })
}

// 获取数据集字段
export const getDatasetFields = (datasetId: number) => {
  return apiClient.get<DatasetField[]>(`${API_BASE}/${datasetId}/fields`)
}

// 创建数据集
export const createDataset = (data: CreateDatasetRequest) => {
  return apiClient.post<Dataset>(API_BASE, data)
}

// 更新数据集
export const updateDataset = (id: number, data: UpdateDatasetRequest) => {
  return apiClient.put<Dataset>(`${API_BASE}/${id}`, data)
}

// 删除数据集
export const deleteDataset = (id: number) => {
  return apiClient.delete<void>(`${API_BASE}/${id}`)
}

// 同步数据集元数据
export const syncDatasetSchema = async (id: number) => {
  const response = await apiClient.post(`${API_BASE}/${id}/sync-schema`)
  return response.data
}

// 获取数据集统计信息
export const getDatasetStatistics = () => {
  return apiClient.get<{
    total: number
    active: number
    syncing: number
    synced: number
    failed: number
    pending: number
  }>(`${API_BASE}/statistics`)
}

// 预览数据集（获取表Schema并自动识别字段）
export const previewDataset = (data: {
  datasource_id: number
  database: string
  table: string
}) => {
  return apiClient.post<{
    preview_limit: number
    table_info: {
      database: string
      table: string
      comment: string
      row_count: number
      size: number
      create_time?: string
      last_modified?: string
    }
    fields: Array<{
      field_name?: string
      physical_name?: string
      data_type: string
      business_type: string
      sensitivity_level: string
      mask_rule?: string
      confidence_score: number
      matched_rules: string[]
      display_name: string
      comment: string
      is_partition: boolean
      is_measure: boolean
      is_sensitive: boolean
    }>
    sample_rows: Record<string, unknown>[]
    sample_columns: string[]
    statistics: {
      total_fields: number
      partition_fields: number
      measure_fields: number
      sensitive_fields: number
    }
  }>(`${API_BASE}/preview`, data)
}
