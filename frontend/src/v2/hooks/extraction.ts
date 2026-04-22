// frontend/src/v2/hooks/extraction.ts
//
// 提取任务 & 执行记录 react-query hooks。
// query key 规范：
//   ['extraction-tasks', 'list', params]
//   ['extraction-runs', 'list', params]
// mutation 必须 invalidateQueries

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { qk } from './query-client'
import * as api from '@v2/api/extraction'

// ── 提取任务查询 ──────────────────────────────────────────────────────────────

export function useExtractionTasks(params?: api.ListTasksParams) {
  return useQuery({
    queryKey: qk('extraction-tasks', 'list', params),
    queryFn: () => api.listTasks(params),
  })
}

// ── 提取任务 mutation ─────────────────────────────────────────────────────────

export function useCreateExtractionTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: api.CreateTaskPayload) => api.createTask(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['extraction-tasks'] })
    },
  })
}

export function useUpdateExtractionTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: api.UpdateTaskPayload }) =>
      api.updateTask(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['extraction-tasks'] })
    },
  })
}

export function useDeleteExtractionTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.deleteTask(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['extraction-tasks'] })
      qc.invalidateQueries({ queryKey: ['extraction-runs'] })
    },
  })
}

export function useExecuteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, triggered_by }: { id: number; triggered_by?: string }) =>
      api.executeTask(id, triggered_by),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['extraction-tasks'] })
      qc.invalidateQueries({ queryKey: ['extraction-runs'] })
    },
  })
}

// ── 执行记录查询 ──────────────────────────────────────────────────────────────

export function useExtractionRuns(params?: api.ListRunsParams) {
  return useQuery({
    queryKey: qk('extraction-runs', 'list', params),
    queryFn: () => api.listRuns(params),
    // 执行中任务不使用 staleTime，让状态及时刷新
    staleTime: 0,
  })
}

// ── 调度配置（P10）────────────────────────────────────────────────────────────

export function useUpdateTaskSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: api.TaskSchedulePayload }) =>
      api.updateTaskSchedule(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['extraction-tasks'] })
    },
  })
}

// ── Round 4 · R-001-P17a / P17b Run rerun + logs ─────────────────────────────

/** 重跑一个已完成/失败的 run —— 服务端会基于 run.task_id 创建新 run */
export function useRerunExtractionRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (runId: number) => api.rerunRun(runId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['extraction-runs'] })
      qc.invalidateQueries({ queryKey: ['extraction-tasks'] })
    },
  })
}

/**
 * 读 run 日志，用于 PeekPanel。
 * staleTime 0：running 状态下面板打开时会自动 refetch。
 * 参数对象内部会参与 queryKey 相等判断，调用方稳定传入即可。
 */
export function useExtractionRunLogs(
  runId: number | null | undefined,
  params?: api.ListRunLogsParams,
) {
  return useQuery({
    queryKey: qk('extraction-runs', 'logs', runId, params),
    queryFn: () => api.listRunLogs(runId as number, params),
    enabled: runId != null,
    staleTime: 0,
  })
}
