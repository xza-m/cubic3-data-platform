// frontend/src/v2/hooks/semantic.ts
//
// React-Query hooks for the Semantic domain (cubes / views / domains).
// Query key 规范：qk('semantic', action, ...args)
// Mutation 必须 invalidateQueries。
//
// 后端契约：app/interfaces/api/v1/semantic.py

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { qk } from '@v2/hooks/query-client'
import { ev, obs } from '@v2/observability'
import {
  activateCube,
  addCubeToDomain,
  acceptSemanticModelingCopilotCubeDraft,
  compileDsl,
  confirmSemanticModelingCopilotAssumption,
  createCube,
  createDomain,
  createSemanticModelingCopilotSession,
  deprecateCube,
  describeCube,
  describeDomain,
  describeView,
  draftCubeFromCandidates,
  draftCubeFromSource,
  getDomainCanvas,
  getDomainPublishHistory,
  getMaterializeStatus,
  getSemanticGraph,
  getSemanticCubeBacklinks,
  getSemanticMapperConsistencyReport,
  getSemanticMapperStaleCheck,
  getSemanticMeasureBacklinks,
  getSemanticModelingCopilotReview,
  getSemanticModelingCopilotSession,
  getViewMaterializeRuns,
  listCatalogs,
  listCubes,
  listDomains,
  listViews,
  materializeView,
  publishDomain,
  previewSemanticModelingCopilotRelease,
  previewSemanticModelingCopilotSandbox,
  previewDomainContext,
  readSemanticFile,
  deleteSemanticModelingCopilotSession,
  listSemanticModelingCopilotSessions,
  publishSemanticModelingCopilotProposal,
  patchSemanticModelingCopilotSpec,
  previewFieldCandidates,
  queryDsl,
  renameSemanticModelingCopilotSession,
  startSemanticModelingCopilotRepairRun,
  startSemanticModelingCopilotReviewRun,
  saveSemanticModelingCopilotProposal,
  schemaSyncCube,
  sendSemanticModelingCopilotMessage,
  updateCube,
  updateDomain,
  validateCubeFields,
  validateSemanticFile,
  writeSemanticFile,
  dryRunMetric,
  type CubeCreateBody,
  type CubeDraftFromCandidatesBody,
  type CubeDraftBody,
  type DomainSummary,
  type FieldCandidatePreviewBody,
  type FileType,
  type QueryDslInput,
  type SemanticModelingCopilotCreateSessionBody,
  type SemanticModelingCopilotListSessionsParams,
  type SemanticModelingCopilotReview,
  type SemanticModelingCopilotSendMessageBody,
  type SemanticModelingCopilotSessionList,
} from '@v2/api/semantic'

// ─── 失效范围 helper（F7：按 qk() 细化，避免整域 ['semantic'] 粗失效） ────────

/** Cube 资产变更后的标准失效范围：详情/YAML（可选）+ 列表 + 关系图。 */
function invalidateCubeAsset(qc: QueryClient, name?: string) {
  if (name) {
    qc.invalidateQueries({ queryKey: qk('semantic', 'cube-detail', name) })
    qc.invalidateQueries({ queryKey: qk('semantic', 'cube-yaml', name) })
  }
  qc.invalidateQueries({ queryKey: qk('semantic', 'cube-list') })
  qc.invalidateQueries({ queryKey: qk('semantic', 'graph') })
}

/** Domain 结构变更后的标准失效范围：详情/画布（可选）+ 列表 + 关系图。 */
function invalidateDomainAsset(qc: QueryClient, id?: string) {
  if (id) {
    qc.invalidateQueries({ queryKey: qk('semantic', 'domain-detail', id) })
    qc.invalidateQueries({ queryKey: qk('semantic', 'domain-canvas', id) })
  }
  qc.invalidateQueries({ queryKey: qk('semantic', 'domain-list') })
  qc.invalidateQueries({ queryKey: qk('semantic', 'graph') })
}

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
      invalidateCubeAsset(qc, body.name)
    },
  })
}

export function useUpdateCube(name: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<CubeCreateBody>) => updateCube(name, body),
    onSuccess: () => {
      invalidateCubeAsset(qc, name)
    },
  })
}

export function useActivateCube() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => activateCube(name),
    onSuccess: (_data, name) => {
      invalidateCubeAsset(qc, name)
    },
  })
}

export function useDeprecateCube() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => deprecateCube(name),
    onSuccess: (_data, name) => {
      invalidateCubeAsset(qc, name)
    },
  })
}

export function useDraftCubeFromSource() {
  return useMutation({
    mutationFn: (body: CubeDraftBody) => draftCubeFromSource(body),
  })
}

export function usePreviewFieldCandidates() {
  return useMutation({
    mutationFn: (body: FieldCandidatePreviewBody) => previewFieldCandidates(body),
  })
}

export function useDraftCubeFromCandidates() {
  return useMutation({
    mutationFn: (body: CubeDraftFromCandidatesBody) => draftCubeFromCandidates(body),
  })
}

export function useSemanticModelingCopilotSession(sessionId: string | undefined) {
  return useQuery({
    queryKey: qk('semantic', 'modeling-copilot-session', sessionId),
    queryFn: () => getSemanticModelingCopilotSession(sessionId!),
    enabled: !!sessionId,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })
}

export function useSemanticModelingCopilotReview(sessionId: string | undefined) {
  return useQuery<SemanticModelingCopilotReview>({
    queryKey: qk('semantic', 'modeling-copilot-review', sessionId),
    queryFn: () => getSemanticModelingCopilotReview(sessionId!),
    enabled: !!sessionId,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })
}

export function useCreateSemanticModelingCopilotSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: SemanticModelingCopilotCreateSessionBody) => createSemanticModelingCopilotSession(body),
    onSuccess: (data) => {
      qc.setQueryData(qk('semantic', 'modeling-copilot-session', data.id), data)
      qc.invalidateQueries({ queryKey: qk('semantic', 'modeling-copilot-sessions') })
    },
  })
}

export function useSemanticModelingCopilotSessions(
  params: SemanticModelingCopilotListSessionsParams = {},
) {
  return useQuery<SemanticModelingCopilotSessionList>({
    queryKey: qk('semantic', 'modeling-copilot-sessions', params),
    queryFn: () => listSemanticModelingCopilotSessions(params),
    staleTime: 0,
    refetchOnWindowFocus: false,
  })
}

export function useDeleteSemanticModelingCopilotSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) => deleteSemanticModelingCopilotSession(sessionId),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: qk('semantic', 'modeling-copilot-sessions') })
      qc.removeQueries({ queryKey: qk('semantic', 'modeling-copilot-session', data.id) })
    },
  })
}

export function useRenameSemanticModelingCopilotSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sessionId, title }: { sessionId: string; title: string }) =>
      renameSemanticModelingCopilotSession(sessionId, title),
    onSuccess: (data) => {
      qc.setQueryData(qk('semantic', 'modeling-copilot-session', data.id), data)
      qc.invalidateQueries({ queryKey: qk('semantic', 'modeling-copilot-sessions') })
    },
  })
}

export function useSendSemanticModelingCopilotMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sessionId, ...body }: { sessionId: string } & SemanticModelingCopilotSendMessageBody) =>
      sendSemanticModelingCopilotMessage(sessionId, body),
    onSuccess: (data) => {
      qc.setQueryData(qk('semantic', 'modeling-copilot-session', data.id), data)
      qc.invalidateQueries({ queryKey: qk('semantic', 'modeling-copilot-review', data.id) })
    },
  })
}

export function useConfirmSemanticModelingCopilotAssumption() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sessionId, confirmationId, value }: { sessionId: string; confirmationId: string; value?: unknown }) =>
      confirmSemanticModelingCopilotAssumption(sessionId, { confirmation_id: confirmationId, value }),
    onSuccess: (data) => {
      qc.setQueryData(qk('semantic', 'modeling-copilot-session', data.id), data)
      qc.invalidateQueries({ queryKey: qk('semantic', 'modeling-copilot-review', data.id) })
    },
  })
}

export function useAcceptSemanticModelingCopilotCubeDraft() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sessionId, body }: { sessionId: string; body?: Record<string, unknown> }) =>
      acceptSemanticModelingCopilotCubeDraft(sessionId, body),
    onSuccess: (data) => {
      qc.setQueryData(qk('semantic', 'modeling-copilot-session', data.id), data)
      qc.invalidateQueries({ queryKey: qk('semantic', 'modeling-copilot-review', data.id) })
      qc.invalidateQueries({ queryKey: qk('semantic', 'modeling-copilot-sessions') })
    },
  })
}

export function usePreviewSemanticModelingCopilotSandbox() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sessionId, body }: { sessionId: string; body?: Record<string, unknown> }) =>
      previewSemanticModelingCopilotSandbox(sessionId, body),
    onSuccess: (data) => {
      qc.setQueryData(qk('semantic', 'modeling-copilot-session', data.id), data)
      qc.invalidateQueries({ queryKey: qk('semantic', 'modeling-copilot-review', data.id) })
    },
  })
}

export function usePreviewSemanticModelingCopilotRelease() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sessionId, body }: { sessionId: string; body?: Record<string, unknown> }) =>
      previewSemanticModelingCopilotRelease(sessionId, body),
    onSuccess: (data) => {
      qc.setQueryData(qk('semantic', 'modeling-copilot-session', data.id), data)
      qc.invalidateQueries({ queryKey: qk('semantic', 'modeling-copilot-review', data.id) })
    },
  })
}

export function useStartSemanticModelingCopilotReviewRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sessionId, body }: { sessionId: string; body?: Record<string, unknown> }) =>
      startSemanticModelingCopilotReviewRun(sessionId, body),
    onSuccess: (data) => {
      qc.setQueryData(qk('semantic', 'modeling-copilot-session', data.id), data)
      qc.invalidateQueries({ queryKey: qk('semantic', 'modeling-copilot-review', data.id) })
      qc.invalidateQueries({ queryKey: qk('semantic', 'modeling-copilot-sessions') })
    },
  })
}

export function useStartSemanticModelingCopilotRepairRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sessionId, body }: { sessionId: string; body?: Record<string, unknown> }) =>
      startSemanticModelingCopilotRepairRun(sessionId, body),
    onSuccess: (data) => {
      qc.setQueryData(qk('semantic', 'modeling-copilot-session', data.id), data)
      qc.invalidateQueries({ queryKey: qk('semantic', 'modeling-copilot-review', data.id) })
      qc.invalidateQueries({ queryKey: qk('semantic', 'modeling-copilot-sessions') })
    },
  })
}

export function useSaveSemanticModelingCopilotProposal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sessionId, body }: { sessionId: string; body?: Record<string, unknown> }) =>
      saveSemanticModelingCopilotProposal(sessionId, body),
    onSuccess: (data) => {
      qc.setQueryData(qk('semantic', 'modeling-copilot-session', data.id), data)
      qc.invalidateQueries({ queryKey: qk('semantic', 'modeling-copilot-review', data.id) })
      qc.invalidateQueries({ queryKey: qk('semantic', 'modeling-copilot-sessions') })
    },
  })
}

export function usePublishSemanticModelingCopilotProposal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sessionId, body }: { sessionId: string; body?: Record<string, unknown> }) =>
      publishSemanticModelingCopilotProposal(sessionId, body),
    onSuccess: (data) => {
      qc.setQueryData(qk('semantic', 'modeling-copilot-session', data.id), data)
      qc.invalidateQueries({ queryKey: qk('semantic', 'modeling-copilot-review', data.id) })
      qc.invalidateQueries({ queryKey: qk('semantic', 'modeling-copilot-sessions') })
      // 发布会落地 Cube / Ontology / Domain 资产
      invalidateCubeAsset(qc)
      invalidateDomainAsset(qc)
      qc.invalidateQueries({ queryKey: qk('semantic', 'view-list') })
    },
  })
}

export function useUpdateSemanticModelingCopilotSpec() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sessionId, body }: { sessionId: string; body: Record<string, unknown> }) =>
      patchSemanticModelingCopilotSpec(sessionId, body),
    onSuccess: (data) => {
      qc.setQueryData(qk('semantic', 'modeling-copilot-session', data.id), data)
      qc.invalidateQueries({ queryKey: qk('semantic', 'modeling-copilot-review', data.id) })
    },
  })
}

export function useWriteCubeYaml(name: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (content: string) => writeSemanticFile('cubes', name, content),
    onSuccess: () => {
      invalidateCubeAsset(qc, name)
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
    onSuccess: (_data, name) => {
      invalidateCubeAsset(qc, name)
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
  })
}

export function useMaterializeView() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, sourceId }: { name: string; sourceId?: string }) =>
      materializeView(name, sourceId),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: qk('semantic', 'view-detail', vars.name) })
      qc.invalidateQueries({ queryKey: qk('semantic', 'view-materialize-status', vars.name) })
      qc.invalidateQueries({ queryKey: qk('semantic', 'view-materialize-runs') })
      qc.invalidateQueries({ queryKey: qk('semantic', 'view-list') })
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

export function useDomainContextPreview() {
  return useMutation({
    mutationFn: (id: string) => previewDomainContext(id),
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
      invalidateDomainAsset(qc)
    },
  })
}

export function useUpdateDomain(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<DomainSummary>) => updateDomain(id, body),
    onSuccess: () => {
      invalidateDomainAsset(qc, id)
    },
  })
}

export function usePublishDomain() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body?: { cubes?: string[] } }) =>
      publishDomain(id, body),
    onSuccess: (_data, vars) => {
      invalidateDomainAsset(qc, vars.id)
      qc.invalidateQueries({ queryKey: qk('semantic', 'domain-publish-history', vars.id) })
    },
  })
}

export function useAddCubeToDomain() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ domainId, cubeName }: { domainId: string; cubeName: string }) =>
      addCubeToDomain(domainId, cubeName),
    onSuccess: (_data, vars) => {
      invalidateDomainAsset(qc, vars.domainId)
      qc.invalidateQueries({ queryKey: qk('semantic', 'cube-list') })
    },
  })
}

// ─── Diagnose / Compile / Query ──────────────────────────────────────────────

export function useCompileDsl() {
  return useMutation({
    mutationFn: (dsl: QueryDslInput) => compileDsl(dsl),
  })
}

export function useQueryDsl() {
  return useMutation({
    mutationFn: (dsl: QueryDslInput) => queryDsl(dsl),
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

export function useValidateCubeFields() {
  return useMutation({
    mutationFn: (name: string) => validateCubeFields(name),
    retry: 0,
  })
}

// ─── P5 · 指标公式 dry-run ──────────────────────────────────────────────────

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

// ─── Mapper · 影响分析 / 一致性风险 ─────────────────────────────────────────

export function useSemanticMapperStaleCheck() {
  return useQuery({
    queryKey: qk('semantic', 'mapper-stale-check'),
    queryFn: getSemanticMapperStaleCheck,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

export function useSemanticMapperConsistencyReport() {
  return useQuery({
    queryKey: qk('semantic', 'mapper-consistency-report'),
    queryFn: getSemanticMapperConsistencyReport,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

export function useSemanticCubeBacklinks(cubeName: string | undefined) {
  return useQuery({
    queryKey: qk('semantic', 'mapper-cube-backlinks', cubeName),
    queryFn: () => getSemanticCubeBacklinks(cubeName!),
    enabled: !!cubeName,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

export function useSemanticMeasureBacklinks(measureRef: string | undefined) {
  return useQuery({
    queryKey: qk('semantic', 'mapper-measure-backlinks', measureRef),
    queryFn: () => getSemanticMeasureBacklinks(measureRef!),
    enabled: !!measureRef,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

// ─── P7 · Domain 发布历史 ────────────────────────────────────────────────────

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
