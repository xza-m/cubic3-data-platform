// frontend/src/v2/hooks/queries.ts
//
// 查询域 react-query hooks。
// query key 统一用 qk('queries', ...)。
// mutation 必须 invalidate 相关 key。

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from './query-client'
import { ev, obs } from '@v2/observability'
import {
  cancelExport,
  createFolder,
  createSavedQuery,
  createScheduledQuery,
  deleteSavedQuery,
  deleteScheduledQuery,
  disableScheduledQuery,
  enableScheduledQuery,
  executeQuery,
  getExport,
  getQueryHistoryItem,
  getSavedQuery,
  getScheduledQuery,
  listDatasourcesForConsole,
  listExports,
  listFolders,
  listQueryHistories,
  listSavedQueries,
  listScheduledQueries,
  listScheduledQueryRuns,
  submitExport,
  toggleFavorite,
  triggerScheduledQuery,
  updateSavedQuery,
  updateScheduledQuery,
  type CreateSavedQueryPayload,
  type CreateScheduledQueryPayload,
  type ExportListParams,
  type HistoryListParams,
  type QueryExport,
  type SavedQueryListParams,
  type ScheduledQueryListParams,
  type SubmitExportPayload,
  type UpdateSavedQueryPayload,
  type UpdateScheduledQueryPayload,
  type ExecuteQueryRequest,
} from '../api/queries'

// ============================================================================
// 数据源（查询控制台用）
// ============================================================================

export function useDatasourcesForConsole() {
  // NOTE: 独立的 cache key（'console-options'），避免和 useDatasources 共享导致
  // 返回形状不一致（分页对象 vs 数组），否则会触发 `t.find is not a function`。
  return useQuery({
    queryKey: qk('datasources', 'console-options'),
    queryFn: listDatasourcesForConsole,
    staleTime: 60_000,
  })
}

// ============================================================================
// 执行查询（mutation，不缓存结果）
// ============================================================================

export function useExecuteQuery() {
  return useMutation({
    mutationFn: async (payload: ExecuteQueryRequest) => {
      const result = await executeQuery(payload)
      obs.track(ev.queryExecuted(payload.source_id ?? null, result.execution_time_ms))
      return result
    },
  })
}

// ============================================================================
// 查询历史
// ============================================================================

export function useQueryHistories(params: HistoryListParams = {}) {
  return useQuery({
    queryKey: qk('queries', 'history', 'list', params),
    queryFn: () => listQueryHistories(params),
    staleTime: 0,
  })
}

export function useQueryHistoryDetail(id: number) {
  return useQuery({
    queryKey: qk('queries', 'history', 'detail', id),
    queryFn: () => getQueryHistoryItem(id),
    enabled: Number.isFinite(id) && id > 0,
  })
}

// ============================================================================
// 已保存查询
// ============================================================================

export function useSavedQueries(params: SavedQueryListParams = {}) {
  return useQuery({
    queryKey: qk('queries', 'saved', 'list', params),
    queryFn: () => listSavedQueries(params),
    staleTime: 30_000,
  })
}

export function useSavedQueryDetail(id: number) {
  return useQuery({
    queryKey: qk('queries', 'saved', 'detail', id),
    queryFn: () => getSavedQuery(id),
    enabled: Number.isFinite(id) && id > 0,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

export function useCreateSavedQuery() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateSavedQueryPayload) => createSavedQuery(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['queries', 'saved'] })
    },
  })
}

export function useUpdateSavedQuery() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdateSavedQueryPayload }) =>
      updateSavedQuery(id, payload),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['queries', 'saved'] })
      qc.invalidateQueries({ queryKey: qk('queries', 'saved', 'detail', id) })
    },
  })
}

export function useDeleteSavedQuery() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteSavedQuery(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['queries', 'saved'] })
    },
  })
}

export function useToggleFavorite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => toggleFavorite(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['queries', 'saved'] })
    },
  })
}

// ============================================================================
// 文件夹
// ============================================================================

export function useFolders() {
  return useQuery({
    queryKey: qk('queries', 'folders', 'list'),
    queryFn: listFolders,
    staleTime: 60_000,
  })
}

export function useCreateFolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { folder_name: string; parent_id?: number }) => createFolder(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['queries', 'folders'] })
    },
  })
}

// ============================================================================
// 调度查询（B-back-8）
// ============================================================================

export function useScheduledQueries(params: ScheduledQueryListParams = {}) {
  return useQuery({
    queryKey: qk('queries', 'scheduled', 'list', params),
    queryFn: () => listScheduledQueries(params),
    staleTime: 15_000,
  })
}

export function useScheduledQuery(id: number) {
  return useQuery({
    queryKey: qk('queries', 'scheduled', 'detail', id),
    queryFn: () => getScheduledQuery(id),
    enabled: Number.isFinite(id) && id > 0,
    staleTime: 15_000,
  })
}

export function useScheduledQueryRuns(
  id: number,
  params: { page?: number; page_size?: number } = {},
) {
  return useQuery({
    queryKey: qk('queries', 'scheduled', 'runs', id, params),
    queryFn: () => listScheduledQueryRuns(id, params),
    enabled: Number.isFinite(id) && id > 0,
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  })
}

export function useCreateScheduledQuery() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateScheduledQueryPayload) => createScheduledQuery(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['queries', 'scheduled'] })
    },
  })
}

export function useUpdateScheduledQuery() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdateScheduledQueryPayload }) =>
      updateScheduledQuery(id, payload),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['queries', 'scheduled'] })
      qc.invalidateQueries({ queryKey: qk('queries', 'scheduled', 'detail', id) })
    },
  })
}

export function useDeleteScheduledQuery() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteScheduledQuery(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['queries', 'scheduled'] })
    },
  })
}

export function useEnableScheduledQuery() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => enableScheduledQuery(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['queries', 'scheduled'] })
      qc.invalidateQueries({ queryKey: qk('queries', 'scheduled', 'detail', id) })
    },
  })
}

export function useDisableScheduledQuery() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => disableScheduledQuery(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['queries', 'scheduled'] })
      qc.invalidateQueries({ queryKey: qk('queries', 'scheduled', 'detail', id) })
    },
  })
}

export function useTriggerScheduledQuery() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => triggerScheduledQuery(id),
    onSuccess: (_data, id) => {
      obs.track(ev.scheduledQueryTriggered(id))
      qc.invalidateQueries({ queryKey: qk('queries', 'scheduled', 'detail', id) })
      qc.invalidateQueries({ queryKey: qk('queries', 'scheduled', 'runs', id) })
    },
  })
}

// ============================================================================
// 异步数据导出（add-query-export）
// ============================================================================

const EXPORT_ACTIVE_STATUSES: QueryExport['status'][] = ['pending', 'running', 'cancelling']

export function useExports(params: ExportListParams = {}) {
  return useQuery({
    queryKey: qk('queries', 'exports', 'list', params),
    queryFn: () => listExports(params),
    staleTime: 5_000,
    // 列表轮询：只要列表里有进行中的任务就每 5s 拉一次
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data?.items) return false
      const hasActive = data.items.some((item) => EXPORT_ACTIVE_STATUSES.includes(item.status))
      return hasActive ? 5_000 : false
    },
    refetchOnWindowFocus: true,
  })
}

export function useExport(exportId: number | null | undefined) {
  const enabled = typeof exportId === 'number' && Number.isFinite(exportId) && exportId > 0
  return useQuery({
    queryKey: qk('queries', 'exports', 'detail', exportId ?? 0),
    queryFn: () => getExport(exportId as number),
    enabled,
    staleTime: 2_000,
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return 3_000
      if (EXPORT_ACTIVE_STATUSES.includes(data.status)) return 3_000
      return false
    },
  })
}

export function useSubmitExport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: SubmitExportPayload) => submitExport(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['queries', 'exports'] })
    },
  })
}

export function useCancelExport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (exportId: number) => cancelExport(exportId),
    onSuccess: (_data, exportId) => {
      qc.invalidateQueries({ queryKey: ['queries', 'exports'] })
      qc.invalidateQueries({ queryKey: qk('queries', 'exports', 'detail', exportId) })
    },
  })
}
