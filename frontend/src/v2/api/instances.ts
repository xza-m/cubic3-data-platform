// frontend/src/v2/api/instances.ts
//
// 应用实例 & 执行记录 API 层。
// 后端契约：
//   app/interfaces/api/v1/app_instances.py
//   app/interfaces/api/v1/app_executions.py
// 所有调用均通过 apiClient，禁止页面层直接调 axios。

import { apiClient } from './client'
import type { PaginatedResponse } from './types'

// ============================================================================
// 类型定义（与后端 wire 格式保持 snake_case）
// ============================================================================

export interface InstanceStats {
  total_executions: number
  success_count: number
  failed_count: number
  success_rate: number
  avg_duration_ms: number | null
}

export interface InstanceAppInfo {
  code: string
  name: string
  category: string
  icon: string | null
}

export interface AppInstance {
  id: number
  app_code: string
  name: string
  description: string | null
  config: Record<string, unknown>
  schedule_type: string
  schedule_config: Record<string, unknown> | null
  enabled: boolean
  owner: string
  created_at: string | null
  updated_at: string | null
  last_execution_at: string | null
  last_execution_status: string | null
  // include_stats=true 时返回
  stats?: InstanceStats
  // include_app_info=true 时返回
  app?: InstanceAppInfo

  // P22: 实例健康状态（后端可选返回，缺省按 'unknown' 处理）
  health?: import('./apps').HealthStatus | null
}

export interface InstanceListParams {
  app_code?: string
  owner?: string
  enabled?: boolean
  page?: number
  page_size?: number
}

export interface CreateInstancePayload {
  app_code: string
  name: string
  description?: string
  config: Record<string, unknown>
  schedule_type?: string
  schedule_config?: Record<string, unknown>
  enabled?: boolean
}

export interface UpdateInstancePayload {
  name?: string
  description?: string
  config?: Record<string, unknown>
  schedule_type?: string
  schedule_config?: Record<string, unknown>
}

// ============================================================================
// 执行记录类型
// ============================================================================

export interface ExecutionInstanceInfo {
  id: number
  name: string
  app_code: string
}

export interface ExecutionAppInfo {
  code: string
  name: string
  icon: string | null
}

export interface AppExecution {
  id: number
  instance_id: number
  trigger_type: string
  trigger_display_name: string
  status: 'pending' | 'running' | 'success' | 'failed'
  status_display_name: string
  started_at: string | null
  ended_at: string | null
  duration_ms: number | null
  duration_seconds: number | null
  input_params: Record<string, unknown> | null
  output: Record<string, unknown> | null
  error_message: string | null
  created_at: string | null
  // include_instance_info=true 时返回
  instance?: ExecutionInstanceInfo
  app?: ExecutionAppInfo
}

export interface ExecutionListParams {
  app_code?: string
  instance_id?: number
  status?: string
  trigger_type?: string
  start_date?: string
  end_date?: string
  page?: number
  page_size?: number
}

export interface ExecutionStats {
  [key: string]: unknown
}

// ============================================================================
// 应用实例接口
// ============================================================================

export async function listInstances(
  params: InstanceListParams = {},
): Promise<PaginatedResponse<AppInstance>> {
  const res = await apiClient.get<{ data: PaginatedResponse<AppInstance> }>(
    '/app-instances',
    { params },
  )
  return res.data.data
}

export async function getInstance(id: number): Promise<AppInstance> {
  const res = await apiClient.get<{ data: AppInstance }>(`/app-instances/${id}`)
  return res.data.data
}

export async function createInstance(
  payload: CreateInstancePayload,
): Promise<AppInstance> {
  const res = await apiClient.post<{ data: AppInstance }>(
    '/app-instances',
    payload,
  )
  return res.data.data
}

export async function updateInstance(
  id: number,
  payload: UpdateInstancePayload,
): Promise<AppInstance> {
  const res = await apiClient.put<{ data: AppInstance }>(
    `/app-instances/${id}`,
    payload,
  )
  return res.data.data
}

export async function deleteInstance(id: number): Promise<void> {
  await apiClient.delete(`/app-instances/${id}`)
}

export async function enableInstance(id: number): Promise<AppInstance> {
  const res = await apiClient.post<{ data: AppInstance }>(
    `/app-instances/${id}/enable`,
  )
  return res.data.data
}

export async function disableInstance(id: number): Promise<AppInstance> {
  const res = await apiClient.post<{ data: AppInstance }>(
    `/app-instances/${id}/disable`,
  )
  return res.data.data
}

export async function executeInstance(
  id: number,
): Promise<{ execution_id: number }> {
  const res = await apiClient.post<{ data: { execution_id: number } }>(
    `/app-instances/${id}/execute`,
  )
  return res.data.data
}

// ============================================================================
// 执行记录接口
// ============================================================================

export async function listExecutions(
  params: ExecutionListParams = {},
): Promise<PaginatedResponse<AppExecution>> {
  const res = await apiClient.get<{ data: PaginatedResponse<AppExecution> }>(
    '/app-executions',
    { params },
  )
  return res.data.data
}

export async function getExecution(id: number): Promise<AppExecution> {
  const res = await apiClient.get<{ data: AppExecution }>(
    `/app-executions/${id}`,
  )
  return res.data.data
}

export async function getExecutionStats(
  instanceId?: number,
  days = 7,
): Promise<ExecutionStats> {
  const res = await apiClient.get<{ data: ExecutionStats }>(
    '/app-executions/stats',
    { params: { instance_id: instanceId, days } },
  )
  return res.data.data
}
