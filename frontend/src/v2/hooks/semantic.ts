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
  acceptSemanticModelingCopilotCubeDraft,
  applySemanticModelingProposal,
  approveSemanticModelingProposal,
  closeSemanticModelingProposal,
  compileDsl,
  confirmSemanticModelingCopilotAssumption,
  createCube,
  createDomain,
  createSemanticModelingCopilotSession,
  createSemanticModelingProposal,
  deprecateCube,
  describeCube,
  describeDomain,
  describeView,
  draftSemanticModelingProposal,
  draftCubeFromSource,
  getDomainCanvas,
  getDomainPublishHistory,
  getMaterializeStatus,
  getSemanticGraph,
  getSemanticModelingCopilotReview,
  getSemanticModelingCopilotSession,
  getSemanticModelingProposal,
  getSemanticModelingProposalGapView,
  getViewMaterializeRuns,
  listCatalogs,
  listCubes,
  listDomains,
  listViews,
  materializeView,
  publishDomain,
  publishSemanticModelingProposal,
  previewSemanticModelingCopilotSandbox,
  previewDomainContext,
  readSemanticFile,
  deleteSemanticModelingCopilotSession,
  listSemanticModelingCopilotSessions,
  publishSemanticModelingCopilotProposal,
  patchSemanticModelingCopilotSpec,
  renameSemanticModelingCopilotSession,
  saveSemanticModelingCopilotProposal,
  schemaSyncCube,
  sendSemanticModelingCopilotMessage,
  updateCube,
  updateDomain,
  validateSemanticModelingProposal,
  validateCubeFields,
  validateSemanticFile,
  writeSemanticFile,
  dryRunMetric,
  type CubeCreateBody,
  type CubeDraftBody,
  type DomainSummary,
  type FileType,
  type SemanticModelingProposalApproveBody,
  type SemanticModelingProposalCloseRequest,
  type SemanticModelingProposalCreateBody,
  type SemanticModelingProposalPublishRequest,
  type SemanticModelingCopilotCreateSessionBody,
  type SemanticModelingCopilotListSessionsParams,
  type SemanticModelingCopilotReview,
  type SemanticModelingCopilotSendMessageBody,
  type SemanticModelingCopilotSessionList,
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

export function useSemanticModelingProposal(proposalId: string | undefined) {
  return useQuery({
    queryKey: qk('semantic', 'modeling-proposal', proposalId),
    queryFn: () => getSemanticModelingProposal(proposalId!),
    enabled: !!proposalId,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })
}

export function useSemanticModelingProposalGapView(proposalId: string | undefined) {
  return useQuery({
    queryKey: qk('semantic', 'modeling-proposal-gap-view', proposalId),
    queryFn: () => getSemanticModelingProposalGapView(proposalId!),
    enabled: !!proposalId,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })
}

export function useCreateSemanticModelingProposal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: SemanticModelingProposalCreateBody) => createSemanticModelingProposal(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['semantic'] })
    },
  })
}

export function useDraftSemanticModelingProposal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (proposalId: string) => draftSemanticModelingProposal(proposalId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['semantic'] })
    },
  })
}

export function useValidateSemanticModelingProposal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (proposalId: string) => validateSemanticModelingProposal(proposalId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['semantic'] })
    },
  })
}

export function useApproveSemanticModelingProposal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ proposalId, ...body }: { proposalId: string } & SemanticModelingProposalApproveBody) =>
      approveSemanticModelingProposal(proposalId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['semantic'] })
    },
  })
}

export function useApplySemanticModelingProposal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (proposalId: string) => applySemanticModelingProposal(proposalId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['semantic'] })
    },
  })
}

export function usePublishSemanticModelingProposal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      proposalId,
      publishTargets,
    }: {
      proposalId: string
      publishTargets?: NonNullable<SemanticModelingProposalPublishRequest['publish_targets']>
    }) => publishSemanticModelingProposal(proposalId, publishTargets ? { publish_targets: publishTargets } : undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['semantic'] })
    },
  })
}

export function useCloseSemanticModelingProposal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      proposalId,
      closeReason,
      ...body
    }: {
      proposalId: string
      closeReason: SemanticModelingProposalCloseRequest['close_reason']
    } & Omit<SemanticModelingProposalCloseRequest, 'close_reason'>) =>
      closeSemanticModelingProposal(proposalId, { ...body, close_reason: closeReason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['semantic'] })
    },
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

export function useSaveSemanticModelingCopilotProposal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sessionId, body }: { sessionId: string; body?: Record<string, unknown> }) =>
      saveSemanticModelingCopilotProposal(sessionId, body),
    onSuccess: (data) => {
      qc.setQueryData(qk('semantic', 'modeling-copilot-session', data.id), data)
      qc.invalidateQueries({ queryKey: qk('semantic', 'modeling-copilot-review', data.id) })
      qc.invalidateQueries({ queryKey: qk('semantic', 'modeling-copilot-sessions') })
      qc.invalidateQueries({ queryKey: ['semantic'] })
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
      qc.invalidateQueries({ queryKey: ['semantic'] })
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
    mutationFn: ({ id, body }: { id: string; body?: { cubes?: string[] } }) =>
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
