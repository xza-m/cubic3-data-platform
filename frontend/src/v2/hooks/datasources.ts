// frontend/src/v2/hooks/datasources.ts
//
// 数据源 react-query hooks。
// query key 规范：['datasources', 'list', params] / ['datasources', 'detail', id]
// mutation 必须 invalidateQueries({ queryKey: ['datasources'] })

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { qk } from './query-client'
import * as api from '@v2/api/datasources'
import { ev, obs } from '@v2/observability'

// ── 查询 ──────────────────────────────────────────────────────────────────────

export function useDatasources(params?: api.ListDatasourcesParams) {
  return useQuery({
    queryKey: qk('datasources', 'list', params),
    queryFn: () => api.listDatasources(params),
  })
}

export function useDatasource(id: number) {
  return useQuery({
    queryKey: qk('datasources', 'detail', id),
    queryFn: () => api.getDatasource(id),
    enabled: Number.isFinite(id) && id > 0,
    refetchOnWindowFocus: false,
  })
}

export function useDatasourceTypes() {
  return useQuery({
    queryKey: qk('datasources', 'types'),
    queryFn: () => api.getDatasourceTypes(),
    staleTime: 5 * 60_000,           // 类型列表 5 分钟缓存
  })
}

export function useDatasourceDatabases(id: number) {
  return useQuery({
    queryKey: qk('datasources', 'detail', id, 'databases'),
    queryFn: () => api.getDatasourceDatabases(id),
    enabled: Number.isFinite(id) && id > 0,
  })
}

// B-back-5: schema 浏览（库/表/字段）
export function useDatasourceSchema(id: number, enabled = true) {
  return useQuery({
    queryKey: qk('datasources', 'detail', id, 'schema'),
    queryFn: () => api.getDatasourceSchema(id),
    enabled: enabled && Number.isFinite(id) && id > 0,
    staleTime: 5 * 60_000,           // 与后端缓存 TTL 一致
    refetchOnWindowFocus: false,
  })
}

export function useDatasourceSchemaTables(
  id: number,
  database: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: qk('datasources', 'detail', id, 'schema', database ?? '__none__'),
    queryFn: () => api.getDatasourceSchemaTables(id, database as string),
    enabled: enabled && Number.isFinite(id) && id > 0 && !!database,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  })
}

export function useDatasourceSchemaTableColumns(
  id: number,
  database: string | null,
  table: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: qk(
      'datasources',
      'detail',
      id,
      'schema',
      database ?? '__none__',
      table ?? '__none__',
    ),
    queryFn: () =>
      api.getDatasourceSchemaTableColumns(id, database as string, table as string),
    enabled:
      enabled && Number.isFinite(id) && id > 0 && !!database && !!table,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  })
}

// ── mutation ──────────────────────────────────────────────────────────────────

export function useCreateDatasource() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: api.CreateDatasourcePayload) => api.createDatasource(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['datasources'] })
    },
  })
}

export function useUpdateDatasource() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: api.UpdateDatasourcePayload }) =>
      api.updateDatasource(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['datasources'] })
    },
  })
}

export function useDeleteDatasource() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.deleteDatasource(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['datasources'] })
    },
  })
}

export function useTestConnection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const start = performance.now()
      try {
        const result = await api.testConnection(id)
        const latency =
          typeof (result as { latency_ms?: number } | undefined)?.latency_ms === 'number'
            ? (result as { latency_ms: number }).latency_ms
            : Math.round(performance.now() - start)
        obs.track(ev.datasourceTested(id, !!result.ok, latency))
        return result
      } catch (err) {
        obs.track(
          ev.datasourceTested(id, false, Math.round(performance.now() - start)),
        )
        throw err
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['datasources'] })
    },
  })
}

export function useSyncDatasourceCatalog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.syncDatasourceCatalog(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['datasources'] })
    },
  })
}
