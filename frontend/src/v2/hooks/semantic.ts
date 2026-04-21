// frontend/src/v2/hooks/semantic.ts
//
// React-Query hooks for the Semantic domain (cubes / views / domains).
// Query key 规范：qk('semantic', action, ...args)
// Mutation 必须 invalidateQueries。
//
// 后端契约：app/interfaces/api/v1/semantic.py

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@v2/hooks/query-client'
import { ev, obs } from '@v2/observability'
import {
  activateCube,
  addCubeToDomain,
  addJoinToDomain,
  compileDsl,
  createCube,
  createDomain,
  deprecateCube,
  describeCube,
  describeDomain,
  describeView,
  draftCubeFromSource,
  getDomainCanvas,
  getDomainPublishHistory,
  getMaterializeStatus,
  getSemanticGraph,
  getViewMaterializeRuns,
  listCatalogs,
  listCubes,
  listDomains,
  listViews,
  materializeView,
  publishDomain,
  readSemanticFile,
  schemaSyncCube,
  updateCube,
  updateDomain,
  validateCubeFields,
  validateSemanticFile,
  writeSemanticFile,
  dryRunMetric,
  type CubeCreateBody,
  type CubeDraftBody,
  type DomainSummary,
  type FileType,
} from '@v2/api/semantic'

// ─── Cubes ──────────────────────────────────────────────────────────────────

export function useCubeList(params?: { q?: string; page?: number; page_size?: number }) {
  return useQuery({
    queryKey: qk('semantic', 'cube-list', params),
    queryFn: () => listCubes(params),
    staleTime: 30_000,
  })
}

export function useCubeDetail(name: string | undefined) {
  return useQuery({
    queryKey: qk('semantic', 'cube-detail', name),
    queryFn: () => describeCube(name!),
    enabled: !!name,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

export function useCubeYaml(name: string | undefined) {
  return useQuery({
    queryKey: qk('semantic', 'cube-yaml', name),
    queryFn: () => readSemanticFile('cubes', name!),
    enabled: !!name,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })
}

export function useCreateCube() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CubeCreateBody) => createCube(body),
    onSuccess: (_data, body) => {
      obs.track(ev.cubeCreated(body.name ?? '(unknown)'))
      qc.invalidateQueries({ queryKey: ['semantic'] })
    },
  })
}

export function useUpdateCube(name: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<CubeCreateBody>) => updateCube(name, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['semantic'] })
    },
  })
}

export function useActivateCube() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => activateCube(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['semantic'] })
    },
  })
}

export function useDeprecateCube() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => deprecateCube(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['semantic'] })
    },
  })
}

export function useDraftCubeFromSource() {
  return useMutation({
    mutationFn: (body: CubeDraftBody) => draftCubeFromSource(body),
  })
}

export function useWriteCubeYaml(name: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (content: string) => writeSemanticFile('cubes', name, content),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['semantic'] })
    },
  })
}

export function useValidateCubeYaml(name: string) {
  return useMutation({
    mutationFn: (content: string) => validateSemanticFile('cubes', name, content),
  })
}

export function useSchemaSyncCube() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => schemaSyncCube(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['semantic'] })
    },
  })
}

// ─── Views ──────────────────────────────────────────────────────────────────

export function useViewList(params?: { q?: string; include_private?: boolean; page?: number }) {
  return useQuery({
    queryKey: qk('semantic', 'view-list', params),
    queryFn: () => listViews(params),
    staleTime: 30_000,
  })
}

export function useViewDetail(name: string | undefined, includePrivate = false) {
  return useQuery({
    queryKey: qk('semantic', 'view-detail', name, includePrivate),
    queryFn: () => describeView(name!, includePrivate),
    enabled: !!name,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

export function useViewMaterializeStatus(name: string | undefined) {
  return useQuery({
    queryKey: qk('semantic', 'view-materialize-status', name),
    queryFn: () => getMaterializeStatus(name!),
    enabled: !!name,
    staleTime: 0,
    // B-back-3: materialize status polling — upstream not yet available
    // TODO(B-back-3): enable polling once backend delivers materialized_at
  })
}

export function useMaterializeView() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, sourceId }: { name: string; sourceId?: string }) =>
      materializeView(name, sourceId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['semantic'] })
    },
  })
}

// ─── Domains ─────────────────────────────────────────────────────────────────

export function useDomainList(params?: { q?: string; catalog_code?: string; page?: number; page_size?: number }) {
  return useQuery({
    queryKey: qk('semantic', 'domain-list', params),
    queryFn: () => listDomains(params),
    staleTime: 30_000,
  })
}

export function useDomainDetail(id: string | undefined) {
  return useQuery({
    queryKey: qk('semantic', 'domain-detail', id),
    queryFn: () => describeDomain(id!),
    enabled: !!id,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

export function useDomainCanvas(id: string | undefined) {
  return useQuery({
    queryKey: qk('semantic', 'domain-canvas', id),
    queryFn: () => getDomainCanvas(id!),
    enabled: !!id,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

export function useCatalogList() {
  return useQuery({
    queryKey: qk('semantic', 'catalog-list'),
    queryFn: listCatalogs,
    staleTime: 300_000,
  })
}

export function useCreateDomain() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<DomainSummary>) => createDomain(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['semantic'] })
    },
  })
}

export function useUpdateDomain(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<DomainSummary>) => updateDomain(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['semantic'] })
    },
  })
}

export function usePublishDomain() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body?: { cubes?: string[]; joins?: unknown[] } }) =>
      publishDomain(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['semantic'] })
    },
  })
}

export function useAddCubeToDomain() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ domainId, cubeName }: { domainId: string; cubeName: string }) =>
      addCubeToDomain(domainId, cubeName),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['semantic'] })
    },
  })
}

export function useAddJoinToDomain() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ domainId, body }: { domainId: string; body: Record<string, unknown> }) =>
      addJoinToDomain(domainId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['semantic'] })
    },
  })
}

// ─── Diagnose / Compile ──────────────────────────────────────────────────────

export function useCompileDsl() {
  return useMutation({
    mutationFn: (dsl: string) => compileDsl(dsl),
  })
}

// ─── Shared: File type hook ──────────────────────────────────────────────────

export function useSemanticFile(type: FileType, name: string | undefined) {
  return useQuery({
    queryKey: qk('semantic', 'file', type, name),
    queryFn: () => readSemanticFile(type, name!),
    enabled: !!name,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })
}

// ─── P4 · Cube 字段校验 ──────────────────────────────────────────────────────
// TODO(B-back-P4): POST /semantic/cubes/:name/validate-fields — 后端上线后更新 mutationFn

export function useValidateCubeFields() {
  return useMutation({
    mutationFn: (name: string) => validateCubeFields(name),
    retry: 0,
  })
}

// ─── P5 · 指标公式 dry-run ──────────────────────────────────────────────────
// TODO(B-back-P5): POST /semantic/metrics/dry-run — 后端上线后更新 mutationFn

export function useDryRunMetric() {
  return useMutation({
    mutationFn: async ({ name, formula }: { name: string; formula: string }) => {
      try {
        const result = await dryRunMetric(name, formula)
        const ok = !(result.errors && result.errors.length > 0)
        obs.track(ev.metricDryrun(name, ok))
        return result
      } catch (err) {
        obs.track(ev.metricDryrun(name, false))
        throw err
      }
    },
    retry: 0,
  })
}

// ─── P6 · 语义关系图 ─────────────────────────────────────────────────────────

export function useSemanticGraph() {
  return useQuery({
    queryKey: qk('semantic', 'graph'),
    queryFn: getSemanticGraph,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
}

// ─── P7 · Domain 发布历史 ────────────────────────────────────────────────────
// TODO(B-back-P7): GET /semantic/domains/:id/publish/history — 后端上线后更新 queryFn

export function useDomainPublishHistory(id: string | undefined) {
  return useQuery({
    queryKey: qk('semantic', 'domain-publish-history', id),
    queryFn: () => getDomainPublishHistory(id!),
    enabled: !!id,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

// ─── P8 · View 物化运行历史 ──────────────────────────────────────────────────

export function useViewMaterializeRuns(
  viewId: number | undefined,
  params?: { page?: number; page_size?: number },
) {
  return useQuery({
    queryKey: qk('semantic', 'view-materialize-runs', viewId, params),
    queryFn: () => getViewMaterializeRuns(viewId!, params),
    enabled: !!viewId,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })
}
