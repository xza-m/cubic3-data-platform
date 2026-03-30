import apiClient from './client'
import type { PaginatedResponse, DataSource } from '@/types'

// API 基础路径
const API_BASE = '/data-center/datasources'

// 数据源连接配置
export interface DataSourceConnectionConfig {
  host?: string
  port?: string | number
  database?: string
  username?: string
  password?: string
  // MaxCompute 专用
  project?: string
  access_id?: string
  access_key?: string
  [key: string]: string | number | undefined
}

// 创建数据源请求
export interface CreateDataSourceRequest {
  name: string
  source_type: string
  description?: string
  connection_config: DataSourceConnectionConfig
}

// 更新数据源请求
export interface UpdateDataSourceRequest {
  name?: string
  description?: string
  connection_config?: DataSourceConnectionConfig
}

// 获取数据源列表
export const getDataSources = (params?: {
  source_type?: string
  is_active?: boolean
  page?: number
  page_size?: number
}) => {
  return apiClient.get<PaginatedResponse<DataSource>>(
    API_BASE,
    { params }
  )
}

// 获取数据源详情
export const getDataSource = (id: number) => {
  return apiClient.get<DataSource>(`${API_BASE}/${id}`)
}

// 创建数据源
export const createDataSource = (data: CreateDataSourceRequest) => {
  return apiClient.post<DataSource>(API_BASE, data)
}

// 更新数据源
export const updateDataSource = (id: number, data: UpdateDataSourceRequest) => {
  return apiClient.put<DataSource>(`${API_BASE}/${id}`, data)
}

// 删除数据源
export const deleteDataSource = (id: number) => {
  return apiClient.delete<void>(`${API_BASE}/${id}`)
}

// 测试数据源连接
export const testDataSourceConnection = (id: number) => {
  return apiClient.post<{ 
    success: boolean; 
    message: string;
    details?: Record<string, unknown>;
  }>(
    `${API_BASE}/${id}/test`
  )
}

export const syncDataSourceCatalog = async (id: number) => {
  const response = await apiClient.post<{
    job_id: string
    status: 'queued'
  }>(`${API_BASE}/${id}/sync-catalog`)
  return response.data
}

// 获取数据源统计信息
export const getDataSourceStatistics = () => {
  return apiClient.get<{
    total: number
    active: number
    connected: number
    inactive: number
    by_type: Record<string, number>
  }>(`${API_BASE}/statistics`)
}

// 获取数据源的数据库列表
export const getDataSourceDatabases = (id: number) => {
  return apiClient.get<string[]>(`${API_BASE}/${id}/databases`)
}

// 获取数据源的表列表
export const getDataSourceTables = (id: number, database: string) => {
  return apiClient.get<Array<{ table_name: string; comment?: string }>>(
    `${API_BASE}/${id}/tables`,
    { params: { database } }
  )
}

export const getDataSourceSchemas = (id: number, database: string) => {
  return apiClient.get<string[]>(
    `${API_BASE}/${id}/schemas`,
    { params: { database } }
  )
}

export const getDataSourceTableSchema = (
  id: number,
  database: string,
  table: string,
  schema?: string,
) => {
  return apiClient.get<{
    table_name: string
    comment?: string
    columns: Array<{
      name: string
      type: string
      comment?: string
      is_nullable?: boolean
      is_partition?: boolean
      default_value?: string
      is_primary_key?: boolean
    }>
    partitions?: string[]
  }>(
    `${API_BASE}/${id}/table-schema`,
    { params: { database, table, schema } }
  )
}

// 预览表数据
export const previewTableData = (
  datasourceId: number,
  database: string,
  table: string
) => {
  return apiClient.get<{
    columns: Array<{ name: string; type: string; comment?: string }>
    data: Array<Record<string, any>>
    row_count: number
    table_name: string
  }>(
    `${API_BASE}/${datasourceId}/tables/${encodeURIComponent(table)}/preview`,
    { params: { database } }
  )
}

// 获取支持的数据源类型列表
export const getDataSourceTypes = () => {
  return apiClient.get<Array<{
    type: string
    display_name: string
    description?: string
    icon?: string
  }>>(`${API_BASE}/types`)
}
