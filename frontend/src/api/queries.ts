/**
 * 查询中心 API 客户端
 */
import apiClient from './client'

// ========== 类型定义 ==========

export interface Query {
  id: number
  query_code: string
  query_name: string
  source_id: number
  sql_query: string
  folder_id?: number
  folder_name?: string
  tags: string[]
  description?: string
  is_favorite: boolean
  execute_count: number
  last_executed_at?: string
  created_by: string
  created_at: string
  updated_at?: string
}

export interface QueryFolder {
  id: number
  folder_name: string
  parent_id?: number
  created_by: string
  created_at: string
}

export interface QueryHistory {
  id: number
  query_id?: number
  source_id?: number
  sql_query: string
  status: 'success' | 'failed' | 'timeout'
  result_rows?: number
  row_count?: number
  execution_time_ms: number
  error_message?: string
  executed_by: string
  executed_at: string
  datasource_name?: string
  result_size?: number
}

export interface QueryStatistics {
  query_count_week: number
  saved_queries_count: number
  avg_execution_time_ms: number
}

export interface QueryTemplate {
  id: number
  template_name: string
  template_description?: string
  sql_template: string
  parameters: TemplateParameter[]
  category?: string
  tags: string[]
  use_count: number
  created_at: string
}

export interface TemplateParameter {
  name: string
  type: 'text' | 'number' | 'date' | 'select'
  default?: string | number
  default_value?: string | number
  label: string
  display_name: string
  required?: boolean
  options?: string[]  // for select type
}

export interface ExecuteQueryRequest {
  source_id: number
  sql_query: string
  query_id?: number
  limit?: number
}

export interface ExecuteQueryResponse {
  code: number
  message: string
  data: {
    columns: Array<string | { name: string; type?: string }>
    data?: Array<Record<string, unknown>> | (string | number | boolean | null)[][]
    rows?: (string | number | boolean | null)[][]
    row_count: number
    execution_time_ms: number
    status: string
  }
}

export interface CreateQueryRequest {
  query_name: string
  source_id: number
  sql_query: string
  description?: string
  folder_id?: number
  tags?: string[]
  is_favorite?: boolean
}

export interface UpdateQueryRequest {
  query_name?: string
  sql_query?: string
  description?: string
  folder_id?: number
  tags?: string[]
  source_id?: number
}

export interface CreateFolderRequest {
  folder_name: string
  parent_id?: number
}

// ========== API 函数 ==========

/**
 * 执行查询（核心）
 */
export const executeQuery = async (data: ExecuteQueryRequest) => {
  const response = await apiClient.post('/queries/execute', data)
  return response
}

/**
 * 获取查询列表
 */
export const getQueries = async (params?: {
  page?: number
  page_size?: number
  folder_id?: number
  is_favorite?: boolean
  search?: string
}): Promise<{ items: Query[]; total: number; page: number; page_size: number; total_pages: number }> => {
  const response = await apiClient.get('/queries', { params })
  return response.data
}

/**
 * 获取查询详情
 */
export const getQuery = async (id: number): Promise<Query> => {
  const response = await apiClient.get(`/queries/${id}`)
  return response.data
}

/**
 * 创建查询
 */
export const createQuery = async (data: CreateQueryRequest): Promise<{ id: number; query_code: string; query_name: string }> => {
  const response = await apiClient.post('/queries', data)
  return response.data
}

/**
 * 更新查询
 */
export const updateQuery = async (id: number, data: UpdateQueryRequest): Promise<{ id: number; query_name: string }> => {
  const response = await apiClient.put(`/queries/${id}`, data)
  return response.data
}

/**
 * 删除查询
 */
export const deleteQuery = async (id: number): Promise<void> => {
  await apiClient.delete(`/queries/${id}`)
}

/**
 * 切换收藏状态
 */
export const toggleFavorite = async (id: number): Promise<{ is_favorite: boolean }> => {
  const response = await apiClient.post(`/queries/${id}/favorite`)
  return response.data
}

/**
 * 获取文件夹列表
 */
export const getFolders = async (): Promise<QueryFolder[]> => {
  const response = await apiClient.get('/queries/folders')
  return response.data
}

/**
 * 创建文件夹
 */
export const createFolder = async (data: CreateFolderRequest): Promise<{ id: number; folder_name: string }> => {
  const response = await apiClient.post('/queries/folders', data)
  return response.data
}

/**
 * 获取查询历史
 */
export const getHistories = async (params?: {
  page?: number
  page_size?: number
  query_id?: number
  source_id?: number
  status?: string
  date_from?: string
  date_to?: string
}): Promise<{ items: QueryHistory[]; total: number; page: number; page_size: number; total_pages: number }> => {
  const response = await apiClient.get('/queries/histories', { params })
  return response.data
}

/**
 * 获取统计数据
 */
export const getStatistics = async (): Promise<QueryStatistics> => {
  const response = await apiClient.get('/queries/statistics')
  return response.data
}

/**
 * 获取模板列表
 */
export const getTemplates = async (params?: {
  page?: number
  page_size?: number
  category?: string
  search?: string
}): Promise<{ items: QueryTemplate[]; total: number; page: number; page_size: number; total_pages: number }> => {
  const response = await apiClient.get('/queries/templates', { params })
  return response.data
}

/**
 * 获取模板详情
 */
export const getTemplate = async (id: number): Promise<QueryTemplate> => {
  const response = await apiClient.get(`/queries/templates/${id}`)
  return response.data
}

/**
 * 创建模板
 */
export interface CreateTemplateRequest {
  template_name: string
  template_description?: string
  sql_template: string
  parameters?: TemplateParameter[]
  category?: string
  tags?: string[]
}

export const createTemplate = async (data: CreateTemplateRequest): Promise<{ id: number; template_name: string }> => {
  const response = await apiClient.post('/queries/templates', data)
  return response.data
}

/**
 * 更新模板
 */
export interface UpdateTemplateRequest {
  template_name?: string
  template_description?: string
  sql_template?: string
  parameters?: TemplateParameter[]
  category?: string
  tags?: string[]
}

export const updateTemplate = async (id: number, data: UpdateTemplateRequest): Promise<{ id: number; template_name: string }> => {
  const response = await apiClient.put(`/queries/templates/${id}`, data)
  return response.data
}

/**
 * 删除模板
 */
export const deleteTemplate = async (id: number): Promise<void> => {
  await apiClient.delete(`/queries/templates/${id}`)
}

/**
 * 使用模板
 */
export const applyTemplate = async (
  id: number,
  params: Record<string, unknown>,
): Promise<{ sql_query: string; template_name: string }> => {
  const response = await apiClient.post(`/queries/templates/${id}/use`, params)
  return response.data
}
