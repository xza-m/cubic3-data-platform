// frontend/src/v2/api/extraction.ts
//
// 提取任务 & 执行记录 API 层。
// 字段对齐：以 TaskListItemSchema / TaskDetailSchema / RunDetailSchema (task_schemas.py) 为准。
// drop-frontend: demo 字段 source(string) / target(string) / owner / rows_synced / duration_sec(task级)
//   / schedule(string) / next_run_at / failure_reason(task级) — 后端无设计 see plan §3.4
// NOTE: GET /extraction/tasks/:id 与 GET /extraction/runs/:id 后端暂无单项查询接口；
//       detail 页面通过列表过滤。如需独立接口，待后端补充。

import { apiClient } from './client'
import type { PaginatedResponse, ListQueryParams } from './types'

// ── 类型 ──────────────────────────────────────────────────────────────────────

/** 列表视图项（对应 TaskListItemSchema） */
export interface ExtractionTask {
  id: number
  task_name: string
  task_code: string
  dataset_id: number
  task_type: string               // 'manual' | 'scheduled' | 'api'
  is_active: boolean
  last_run_at: string | null
  last_run_status: string | null  // 'success' | 'failed' | 'running' | null
  created_at: string
}

/** 详情视图（对应 TaskDetailSchema，由 create/update 返回） */
export interface ExtractionTaskDetail extends ExtractionTask {
  select_fields: string[]
  filter_conditions: Record<string, unknown>
  sql_template: string | null
  row_limit: number
  schedule_config: Record<string, unknown> | null
  subscription_config: Record<string, unknown> | null
  created_by: string
  updated_at: string
}

/** 执行记录（对应 RunDetailSchema） */
export interface ExtractionRun {
  id: number
  task_id: number
  run_type: string
  triggered_by: string
  status: string                  // 'success' | 'failed' | 'running' | 'pending'
  start_time: string | null
  end_time: string | null
  duration_ms: number | null
  row_count: number | null
  result_file_path: string | null
  result_size_mb: number | null
  delivery_method: string | null
  delivery_info: Record<string, unknown> | null
  error_message: string | null
  created_at: string
}

export interface ListTasksParams extends ListQueryParams {
  dataset_id?: number
  task_type?: string
  is_active?: boolean
}

export interface ListRunsParams extends ListQueryParams {
  task_id?: number
  status?: string
}

export interface CreateTaskPayload {
  task_name: string
  dataset_id: number
  select_fields?: string[]
  filter_conditions?: Record<string, unknown>
  row_limit?: number
  task_type?: string
  schedule_config?: Record<string, unknown>
  subscription_config?: Record<string, unknown>
}

export interface UpdateTaskPayload {
  task_name?: string
  select_fields?: string[]
  filter_conditions?: Record<string, unknown>
  row_limit?: number
  schedule_config?: Record<string, unknown>
  subscription_config?: Record<string, unknown>
  is_active?: boolean
}

export interface ExecuteTaskResult {
  run_id: number
  status: string
  message: string
  job_id: string | null
}

// ── API 函数 ──────────────────────────────────────────────────────────────────

const TASKS_BASE = '/extraction/tasks'
const RUNS_BASE = '/extraction/runs'

export async function listTasks(
  params?: ListTasksParams,
): Promise<PaginatedResponse<ExtractionTask>> {
  const resp = await apiClient.get(TASKS_BASE, { params })
  return resp.data.data
}

export async function createTask(payload: CreateTaskPayload): Promise<ExtractionTaskDetail> {
  const resp = await apiClient.post(TASKS_BASE, payload)
  return resp.data.data
}

export async function updateTask(
  id: number,
  payload: UpdateTaskPayload,
): Promise<ExtractionTaskDetail> {
  const resp = await apiClient.put(`${TASKS_BASE}/${id}`, payload)
  return resp.data.data
}

export async function deleteTask(id: number): Promise<void> {
  await apiClient.delete(`${TASKS_BASE}/${id}`)
}

export async function executeTask(id: number, triggered_by?: string): Promise<ExecuteTaskResult> {
  const resp = await apiClient.post(`${TASKS_BASE}/${id}/execute`, { triggered_by })
  return resp.data.data
}

export async function listRuns(
  params?: ListRunsParams,
): Promise<PaginatedResponse<ExtractionRun>> {
  const resp = await apiClient.get(RUNS_BASE, { params })
  return resp.data.data
}

/** 下载执行结果 — 直接构造 URL，由浏览器触发下载 */
export function getRunDownloadUrl(runId: number): string {
  return `/api/v1/extraction/runs/${runId}/download`
}

// ── 调度配置（P10）────────────────────────────────────────────────────────────
// TODO: 后端 PATCH /api/v1/extraction/tasks/:id 需接受 schedule_cron / schedule_enabled / schedule_timezone
// 目前暂存在 schedule_config JSONB 字段，等后端补字段后迁移

export interface TaskSchedulePayload {
  schedule_cron?: string
  schedule_enabled?: boolean
  schedule_timezone?: string
}

export async function updateTaskSchedule(
  id: number,
  payload: TaskSchedulePayload,
): Promise<ExtractionTaskDetail> {
  // TODO: 后端待补 PATCH 独立调度字段；暂用 schedule_config 桥接
  const scheduleConfig: Record<string, unknown> = {
    cron: payload.schedule_cron,
    enabled: payload.schedule_enabled,
    timezone: payload.schedule_timezone ?? 'Asia/Shanghai',
  }
  const resp = await apiClient.patch(`${TASKS_BASE}/${id}`, { schedule_config: scheduleConfig })
  return resp.data.data
}
