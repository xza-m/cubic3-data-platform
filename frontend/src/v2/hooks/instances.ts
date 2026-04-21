// frontend/src/v2/hooks/instances.ts
//
// 应用实例 & 执行记录域 react-query hooks。
// query key 规范：
//   qk('instances', action, ...args)
//   qk('executions', action, ...args)
// 见 plan §01 §5 & §5.1。

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { qk } from './query-client'
import { ev, obs } from '@v2/observability'
import {
  listInstances,
  getInstance,
  createInstance,
  updateInstance,
  deleteInstance,
  enableInstance,
  disableInstance,
  executeInstance,
  listExecutions,
  getExecution,
  type InstanceListParams,
  type CreateInstancePayload,
  type UpdateInstancePayload,
  type ExecutionListParams,
} from '@v2/api/instances'

// ============================================================================
// 实例列表
// ============================================================================

export function useInstances(params: InstanceListParams = {}) {
  return useQuery({
    queryKey: qk('instances', 'list', params),
    queryFn: () => listInstances(params),
    staleTime: 30_000,
  })
}

// ============================================================================
// 实例详情
// ============================================================================

export function useInstance(id: number | undefined) {
  return useQuery({
    queryKey: qk('instances', 'detail', id),
    queryFn: () => getInstance(id!),
    enabled: !!id,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

// ============================================================================
// 创建实例
// ============================================================================

export function useCreateInstance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateInstancePayload) => createInstance(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instances'] })
    },
    retry: 0,
  })
}

// ============================================================================
// 更新实例
// ============================================================================

export function useUpdateInstance(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpdateInstancePayload) => updateInstance(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instances'] })
    },
    retry: 0,
  })
}

// ============================================================================
// 删除实例
// ============================================================================

export function useDeleteInstance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteInstance(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instances'] })
    },
    retry: 0,
  })
}

// ============================================================================
// 启用 / 禁用实例
// ============================================================================

export function useEnableInstance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => enableInstance(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instances'] })
    },
    retry: 0,
  })
}

export function useDisableInstance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => disableInstance(id),
    onSuccess: (_data, id) => {
      obs.track(ev.appInstanceStopped(id))
      qc.invalidateQueries({ queryKey: ['instances'] })
    },
    retry: 0,
  })
}

// ============================================================================
// 手动触发执行
// ============================================================================

export function useExecuteInstance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => executeInstance(id),
    onSuccess: (_data, id) => {
      obs.track(ev.appInstanceStarted(id))
      qc.invalidateQueries({ queryKey: ['instances'] })
      qc.invalidateQueries({ queryKey: ['executions'] })
    },
    retry: 0,
  })
}

// ============================================================================
// 执行记录列表
// ============================================================================

export function useExecutions(params: ExecutionListParams = {}) {
  return useQuery({
    queryKey: qk('executions', 'list', params),
    queryFn: () => listExecutions(params),
    staleTime: 0, // 执行类数据始终 fresh
  })
}

// ============================================================================
// 执行记录详情
// ============================================================================

export function useExecution(id: number | undefined) {
  return useQuery({
    queryKey: qk('executions', 'detail', id),
    queryFn: () => getExecution(id!),
    enabled: !!id,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })
}
