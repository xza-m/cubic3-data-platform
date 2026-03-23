/**
 * 应用中心 API
 */
import apiClient from './client'

// ========== TypeScript 接口定义 ==========

export interface AppDefinition {
  id: number
  code: string
  name: string
  category: string
  description: string
  config_schema: Record<string, any> | null
  icon: string
  author: string
  version: string
  enabled: boolean
  created_at: string
  updated_at: string | null
  instance_count?: number
}

export interface AppInstance {
  id: number
  app_code: string
  name: string
  description: string | null
  config: Record<string, any>
  schedule_type: 'cron' | 'event' | 'manual'
  schedule_config: Record<string, any> | null
  owner: string
  enabled: boolean
  last_execution_at: string | null
  next_execution_at: string | null
  created_at: string
  updated_at: string | null
  app_name?: string
  success_rate?: number
  execution_count?: number
}

export interface AppExecution {
  id: number
  instance_id: number
  trigger_type: 'scheduled' | 'manual' | 'event'
  status: 'pending' | 'running' | 'success' | 'failed'
  started_at: string | null
  ended_at: string | null
  duration_ms: number | null
  input_params: Record<string, any> | null
  output: Record<string, any> | null
  error_message: string | null
  logs: string[] | null
  created_at: string
  instance_name?: string
  app_name?: string
  app_code?: string
}

export interface AppCategory {
  category: string
  app_count: number
  display_name: string
}

export interface ExecutionStats {
  total_executions: number
  success_count: number
  failed_count: number
  success_rate: number
  avg_duration_ms: number
  period_days: number
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface ValidationResult {
  is_valid: boolean
  errors: string[]
}

// ========== API 请求参数接口 ==========

export interface GetAppsParams {
  category?: string
  enabled_only?: boolean
  include_stats?: boolean
}

export interface GetInstancesParams {
  app_code?: string
  owner?: string
  enabled?: boolean
  page?: number
  page_size?: number
}

export interface CreateInstanceInput {
  app_code: string
  name: string
  description?: string
  config: Record<string, any>
  schedule_type: 'cron' | 'event' | 'manual'
  schedule_config?: Record<string, any>
  enabled?: boolean
}

export interface UpdateInstanceInput {
  name?: string
  description?: string
  config?: Record<string, any>
  schedule_type?: string
  schedule_config?: Record<string, any>
  enabled?: boolean
}

export interface GetExecutionsParams {
  instance_id?: number
  status?: string
  trigger_type?: string
  start_date?: string
  end_date?: string
  page?: number
  page_size?: number
}

export interface GetExecutionStatsParams {
  instance_id?: number
  days?: number
}

// ========== 应用市场 API ==========

/**
 * 获取应用列表
 */
export const getApps = async (params?: GetAppsParams): Promise<AppDefinition[]> => {
  const response = await apiClient.get('/apps', { params })
  return response.data  // apiClient 已经返回 response.data，所以这里直接取 .data
}

/**
 * 获取应用详情
 */
export const getApp = async (code: string): Promise<AppDefinition> => {
  const response = await apiClient.get(`/apps/${code}`)
  return response.data  // apiClient 已经返回 response.data，所以这里直接取 .data
}

/**
 * 获取应用配置 Schema
 */
export const getConfigSchema = async (code: string): Promise<Record<string, any>> => {
  const response = await apiClient.get(`/apps/${code}/config-schema`)
  return response.data
}

/**
 * 获取应用分类列表
 */
export const getCategories = async (): Promise<AppCategory[]> => {
  const response = await apiClient.get('/apps/categories')
  return response.data
}

/**
 * 验证应用配置
 */
export const validateConfig = async (
  code: string,
  config: Record<string, any>
): Promise<ValidationResult> => {
  const response = await apiClient.post(`/apps/${code}/validate`, { config })
  return response.data
}

// ========== 应用实例 API ==========

/**
 * 获取实例列表
 */
export const getInstances = async (
  params?: GetInstancesParams
): Promise<PaginatedResponse<AppInstance>> => {
  const response = await apiClient.get('/app-instances', { params })
  return response.data
}

/**
 * 获取实例详情
 */
export const getInstance = async (id: number): Promise<AppInstance> => {
  const response = await apiClient.get(`/app-instances/${id}`)
  return response.data
}

/**
 * 创建应用实例
 */
export const createInstance = async (data: CreateInstanceInput): Promise<AppInstance> => {
  const response = await apiClient.post('/app-instances', data)
  return response.data
}

/**
 * 更新应用实例
 */
export const updateInstance = async (
  id: number,
  data: UpdateInstanceInput
): Promise<AppInstance> => {
  const response = await apiClient.put(`/app-instances/${id}`, data)
  return response.data
}

/**
 * 删除应用实例
 */
export const deleteInstance = async (id: number): Promise<void> => {
  await apiClient.delete(`/app-instances/${id}`)
}

/**
 * 启用应用实例
 */
export const enableInstance = async (id: number): Promise<AppInstance> => {
  const response = await apiClient.post(`/app-instances/${id}/enable`)
  return response.data
}

/**
 * 禁用应用实例
 */
export const disableInstance = async (id: number): Promise<AppInstance> => {
  const response = await apiClient.post(`/app-instances/${id}/disable`)
  return response.data
}

/**
 * 手动执行应用实例
 */
export const executeInstance = async (id: number): Promise<{ execution_id: number }> => {
  const response = await apiClient.post(`/app-instances/${id}/execute`)
  return response.data
}

// ========== 执行记录 API ==========

/**
 * 获取执行记录列表
 */
export const getExecutions = async (
  params?: GetExecutionsParams
): Promise<PaginatedResponse<AppExecution>> => {
  const response = await apiClient.get('/app-executions', { params })
  return response.data
}

/**
 * 获取执行记录详情
 */
export const getExecution = async (id: number): Promise<AppExecution> => {
  const response = await apiClient.get(`/app-executions/${id}`)
  return response.data
}

/**
 * 获取执行统计信息
 */
export const getExecutionStats = async (
  params?: GetExecutionStatsParams
): Promise<ExecutionStats> => {
  const response = await apiClient.get('/app-executions/stats', { params })
  return response.data
}
