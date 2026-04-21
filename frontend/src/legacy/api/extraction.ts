import apiClient from './client'
import type {
  PaginatedResponse,
  ExtractionTask,
  ExtractionRun,
  CreateTaskRequest,
  ExecuteTaskRequest,
} from '@/types'
import type { FilterGroup } from '@/types/filter'

export type { CreateTaskRequest } from '@/types'

// 获取任务列表
export const getTasks = (params?: {
  dataset_id?: number
  task_type?: string
  is_active?: boolean
  page?: number
  page_size?: number
}) => {
  return apiClient.get<PaginatedResponse<ExtractionTask>>(
    '/extraction/tasks',
    { params }
  )
}

// 获取任务详情
export const getTask = (id: number) => {
  return apiClient.get<ExtractionTask>(`/extraction/tasks/${id}`)
}

// 创建任务
export const createTask = (data: CreateTaskRequest) => {
  return apiClient.post<ExtractionTask>('/extraction/tasks', data)
}

// 更新任务
export const updateTask = (id: number, data: Partial<CreateTaskRequest>) => {
  return apiClient.put<ExtractionTask>(`/extraction/tasks/${id}`, data)
}

// 删除任务
export const deleteTask = (id: number) => {
  return apiClient.delete<void>(`/extraction/tasks/${id}`)
}

// 执行任务
export const executeTask = (id: number, data?: ExecuteTaskRequest) => {
  return apiClient.post<{ run_id: number; status: string; job_id?: string }>(
    `/extraction/tasks/${id}/execute`,
    data || {}
  )
}

// 获取执行历史
export const getRuns = (params?: {
  task_id?: number
  status?: string
  page?: number
  page_size?: number
}) => {
  return apiClient.get<PaginatedResponse<ExtractionRun>>(
    '/extraction/runs',
    { params }
  )
}

// 预览数据
export const previewData = (data: {
  dataset_id: number
  select_fields: string[]
  filter_conditions: Record<string, unknown> | FilterGroup
  limit?: number
}) => {
  return apiClient.post<{
    sql: string
    columns: string[]
    data: Record<string, unknown>[]
    total: number
  }>('/extraction/preview', data)
}

// 下载执行结果
export const downloadRun = (runId: number) => {
  window.location.href = `/api/v1/extraction/runs/${runId}/download`
}
