// frontend/src/v2/hooks/datasets.ts
//
// 数据集 react-query hooks。
// query key 规范：['datasets', 'list', params] / ['datasets', 'detail', id]
// mutation 必须 invalidateQueries({ queryKey: ['datasets'] })

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { qk } from './query-client'
import * as api from '@v2/api/datasets'
import { ev, obs } from '@v2/observability'

// ── 查询 ──────────────────────────────────────────────────────────────────────

export function useDatasets(params?: api.ListDatasetsParams) {
  return useQuery({
    queryKey: qk('datasets', 'list', params),
    queryFn: () => api.listDatasets(params),
  })
}

export function useDataset(id: number, includeFields = false) {
  return useQuery({
    queryKey: qk('datasets', 'detail', id, { includeFields }),
    queryFn: () => api.getDataset(id, includeFields),
    enabled: Number.isFinite(id) && id > 0,
    refetchOnWindowFocus: false,
  })
}

// ── mutation ──────────────────────────────────────────────────────────────────

export function useCreateDataset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: api.CreateDatasetPayload) => api.createDataset(payload),
    onSuccess: (data) => {
      const id = (data as { id?: number } | undefined)?.id ?? -1
      obs.track(ev.datasetRegistered(id))
      qc.invalidateQueries({ queryKey: ['datasets'] })
    },
  })
}

export function useUpdateDataset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: api.UpdateDatasetPayload }) =>
      api.updateDataset(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['datasets'] })
    },
  })
}

export function useDeleteDataset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.deleteDataset(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['datasets'] })
    },
  })
}

export function useSyncDatasetSchema() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.syncDatasetSchema(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['datasets'] })
    },
  })
}

export function usePreviewDataset() {
  return useMutation({
    mutationFn: (payload: api.PreviewDatasetPayload) => api.previewDataset(payload),
  })
}

// ── 字段画像（P3）──────────────────────────────────────────────────────────────

export function useDatasetProfile(id: number) {
  return useQuery({
    queryKey: qk('datasets', 'detail', id, 'profile'),
    queryFn: () => api.getDatasetProfile(id),
    enabled: Number.isFinite(id) && id > 0,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  })
}

export function useRefreshDatasetProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.refreshDatasetProfile(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: qk('datasets', 'detail', id, 'profile') })
    },
  })
}
