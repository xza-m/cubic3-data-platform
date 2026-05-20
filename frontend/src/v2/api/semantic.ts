// frontend/src/v2/api/semantic.ts
//
// Semantic 域 API 层。所有 v2/pages/semantic/** 页面经由此文件访问后端，
// 禁止页面层直接调用 axios。
//
// 后端契约：app/interfaces/api/v1/semantic.py

import type { AxiosRequestConfig } from 'axios'
import { apiClient } from '@v2/api/client'

// ─── 通用 ──────────────────────────────────────────────────────────────────

interface Envelope<T> {
  code: number
  message: string
  data: T
  trace_id?: string | null
}

const get = <T>(url: string, params?: Record<string, unknown>): Promise<T> =>
  apiClient.get<Envelope<T>>(url, { params }).then((r) => r.data.data)

const post = <T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> =>
  apiClient.post<Envelope<T>>(url, body, config).then((r) => r.data.data)

const put = <T>(url: string, body?: unknown): Promise<T> =>
  apiClient.put<Envelope<T>>(url, body).then((r) => r.data.data)

const del = <T>(url: string, body?: unknown): Promise<T> =>
  apiClient.delete<Envelope<T>>(url, body ? { data: body } : undefined).then((r) => r.data.data)

const patch = <T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> =>
  apiClient.patch<Envelope<T>>(url, body, config).then((r) => r.data.data)

const MODELING_COPILOT_LONG_REQUEST: AxiosRequestConfig = { timeout: 120_000 }

// ─── Cube 类型 ──────────────────────────────────────────────────────────────

export interface CubeDimension {
  name: string
  title: string
  type: string
  expr?: string | null
  primary?: boolean
  description?: string | null
}

export interface CubeMeasure {
  name: string
  title: string
  agg: string
  expr?: string | null
  format?: string | null
  description?: string | null
}

export interface CubeJoin {
  cube: string
  type: string
  sql: string
  relationship?: string
}

export interface CubeSummary {
  name: string
  title: string
  description?: string | null
  domain_name?: string | null
  status?: string
  fact_table?: string
  source_id?: string | null
  source_dataset_id?: number | string | null
  source_database?: string | null
  source_schema?: string | null
  // B-back-7 enriched fields (server-computed; do NOT recompute client-side)
  dimension_count?: number
  measure_count?: number
  downstream_bi_count?: number
  last_modified_at?: string | null
  state_summary?: Record<string, unknown>
}

export interface CubeDetail extends CubeSummary {
  dimensions: CubeDimension[]
  measures: CubeMeasure[]
  joins?: Record<string, CubeJoin>
  state_summary?: Record<string, unknown>
}

export interface CubeListResponse {
  cubes: CubeSummary[]
  total: number
  page: number
  page_size: number
  page_count: number
}

export interface CubeCreateBody {
  name: string
  title: string
  description?: string
  fact_table?: string
  domain_name?: string
  dimensions?: CubeDimension[]
  measures?: CubeMeasure[]
  [key: string]: unknown
}

export interface CubeDraftBody {
  source_kind: 'dataset' | 'datasource' | string
  source_id?: string
  dataset_id?: string
  database?: string
  schema?: string
  table?: string
  name?: string
  title?: string
  description?: string
}

// ─── Cube API ───────────────────────────────────────────────────────────────

export const listCubes = (params?: { q?: string; page?: number; page_size?: number }) =>
  get<CubeListResponse>('/semantic/cubes', params as Record<string, unknown>)

export const describeCube = (name: string) =>
  get<CubeDetail>(`/semantic/cubes/${name}`)

export const createCube = (body: CubeCreateBody) =>
  post<CubeDetail>('/semantic/cubes', body)

export const updateCube = (name: string, body: Partial<CubeCreateBody>) =>
  put<CubeDetail>(`/semantic/cubes/${name}`, body)

export const activateCube = (name: string) =>
  post<CubeDetail>(`/semantic/cubes/${name}/activate`)

export const deprecateCube = (name: string) =>
  post<CubeDetail>(`/semantic/cubes/${name}/deprecate`)

export const createCubeRevision = (name: string) =>
  post<CubeDetail>(`/semantic/cubes/${name}/revisions`)

export const draftCubeFromSource = (body: CubeDraftBody) =>
  post<CubeDetail>('/semantic/cubes/draft-from-source', body)

// ─── 建模助手 Agent 类型 / API ──────────────────────────────────────────────

export interface SemanticModelingAgentSource {
  source_kind: 'physical_table' | 'dataset' | 'datasource' | string
  source_id?: string | number | null
  dataset_id?: string | number | null
  database?: string | null
  schema?: string | null
  table?: string | null
  name?: string | null
  title?: string | null
  description?: string | null
}

export interface SemanticModelingAgentSpecDraftBody extends SemanticModelingAgentSource {
  business_subject?: string
  use_cases?: string[] | string
  default_roles?: string[] | string
  sensitivity_level?: 'public' | 'restricted' | 'private' | string
}

export interface SemanticModelingAgentSpec {
  spec_version: string
  source?: SemanticModelingAgentSource
  business?: Record<string, unknown>
  cube?: Record<string, unknown>
  ontology?: Record<string, unknown>
  governance?: Record<string, unknown>
  audit?: Record<string, unknown>
  sample_questions?: string[]
  warnings?: Array<Record<string, unknown>>
  [key: string]: unknown
}

export interface SemanticModelingAgentSpecDraftResult {
  spec: SemanticModelingAgentSpec
  next_actions?: Record<string, unknown>
}

export interface SemanticModelingAgentDraftResult {
  cube: Record<string, unknown>
  ontology: Record<string, unknown>
  published: boolean
  diff?: Record<string, unknown>
  audit?: Record<string, unknown>
}

export interface SemanticModelingAgentValidationIssue {
  severity: 'error' | 'warning' | 'info' | string
  path: string
  message: string
}

export interface SemanticModelingAgentValidationResult {
  status: 'ready' | 'blocked' | string
  issues: SemanticModelingAgentValidationIssue[]
  checks?: Record<string, unknown>
  agent_sandbox_preview?: Record<string, unknown>
}

export interface SemanticModelingAgentReadyResult {
  status: 'ready' | 'pending_validation' | 'blocked' | string
  cube_status?: string
  ontology_status?: string
  bindings?: Record<string, unknown>
  issues?: SemanticModelingAgentValidationIssue[]
  checks?: Record<string, unknown>
  truth_sources?: {
    business?: string
    execution?: string
    domain?: string
    [key: string]: unknown
  }
}

export interface SemanticModelingAgentApplyResult {
  published: boolean
  assets: Record<string, unknown>
  spec?: SemanticModelingAgentSpec
  audit?: Record<string, unknown>
}

export interface SemanticModelingAgentPublishRequest {
  spec: SemanticModelingAgentSpec
  publish_targets?: {
    cube?: boolean
    ontology?: boolean
  }
}

export interface SemanticModelingAgentPublishResult {
  publish_targets: {
    cube: boolean
    ontology: boolean
  }
  published?: Record<string, unknown>
  audit?: Record<string, unknown>
}

export const createSemanticModelingAgentSpecDraft = (body: SemanticModelingAgentSpecDraftBody) =>
  post<SemanticModelingAgentSpecDraftResult>('/semantic/modeling-agent/spec-draft', body)

export const draftSemanticModelingAgentFromSpec = (spec: SemanticModelingAgentSpec) =>
  post<SemanticModelingAgentDraftResult>('/semantic/modeling-agent/draft-from-spec', { spec })

export const validateSemanticModelingAgent = (spec: SemanticModelingAgentSpec) =>
  post<SemanticModelingAgentValidationResult>('/semantic/modeling-agent/validate', { spec })

export const checkSemanticModelingAgentReady = (spec: SemanticModelingAgentSpec) =>
  post<SemanticModelingAgentReadyResult>('/semantic/modeling-agent/agent-ready-check', { spec })

export const applySemanticModelingAgent = (spec: SemanticModelingAgentSpec) =>
  post<SemanticModelingAgentApplyResult>('/semantic/modeling-agent/apply', { spec })

export const publishSemanticModelingAgent = (body: SemanticModelingAgentPublishRequest) =>
  post<SemanticModelingAgentPublishResult>('/semantic/modeling-agent/publish', body)

export type SemanticModelingProposalStatus =
  | 'created'
  | 'drafted'
  | 'validated'
  | 'blocked'
  | 'approved'
  | 'applied'
  | 'published'
  | 'closed'
  | string

export interface SemanticModelingProposal {
  id: string
  source_mode: 'human_led' | 'agent_led' | string
  status: SemanticModelingProposalStatus
  close_reason?: string | null
  intent?: Record<string, unknown>
  source_context?: Record<string, unknown>
  spec?: SemanticModelingAgentSpec | null
  drafts?: Record<string, unknown>
  coverage_result?: Record<string, unknown>
  semantic_diff?: Record<string, unknown>
  validation_matrix?: Record<string, unknown>
  review_records?: Array<Record<string, unknown>>
  publish_result?: Record<string, unknown> | null
  runtime_consumption_result?: Record<string, unknown>
  readiness_label?: string
  approved_spec_hash?: string | null
  applied_spec_hash?: string | null
  last_transition_actor?: string | null
  last_transition_at?: string | null
  audit_snapshot?: Record<string, unknown>
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export interface SemanticModelingProposalGapView {
  id: string
  status: SemanticModelingProposalStatus
  display_status: string
  question: {
    text: string
    extracted_context: Array<{ key: string; label: string; value: string }>
  }
  coverage: {
    decision: string
    label: string
    summary: string
    reusable_assets: unknown[]
  }
  gaps: Array<{
    id: string
    type: string
    severity: 'required' | 'needs_confirmation' | 'optional' | string
    title: string
    description: string
    technical_hint?: string
    requires_confirmation?: boolean
  }>
  patch_plan: Array<{
    id: string
    type: string
    title: string
    business_name: string
    technical_name?: string | null
    description: string
  }>
  validation: {
    summary: string
    checks: Array<{
      id: string
      status: 'passed' | 'failed' | 'needs_confirmation' | string
      title: string
      description: string
      technical_hint?: string
    }>
  }
  technical_change: {
    changed_objects: Array<{
      type: string
      name: string
      operation: 'create' | 'update' | 'delete' | string
    }>
    yaml_diff?: string
    sql_validation?: string
    impact_summary?: string[]
    approval_wording?: string
  }
  primary_action: {
    label: string
    action: 'draft' | 'validate' | 'approve' | 'apply' | 'publish' | 'inspect_failure' | 'open_query' | 'none' | string
    disabled: boolean
    tone: 'primary' | 'success' | 'warning' | 'danger' | 'neutral' | string
  }
}

export interface SemanticModelingProposalCreateBody extends SemanticModelingAgentSpecDraftBody {
  source_mode?: 'human_led' | 'agent_led' | string
  user_question?: string
}

export interface SemanticModelingProposalApproveBody {
  reviewer?: string
  comment?: string
  [key: string]: unknown
}

export interface SemanticModelingProposalPublishRequest {
  publish_targets?: {
    cube?: boolean
    ontology?: boolean
  }
}

export interface SemanticModelingProposalCloseRequest {
  close_reason: 'reused_existing' | 'rejected' | 'abandoned' | string
  actor?: string
  reviewer?: string
  comment?: string
}

export const createSemanticModelingProposal = (body: SemanticModelingProposalCreateBody) =>
  post<SemanticModelingProposal>('/semantic/modeling-agent/proposals', body)

export const getSemanticModelingProposal = (proposalId: string) =>
  get<SemanticModelingProposal>(`/semantic/modeling-agent/proposals/${proposalId}`)

export const getSemanticModelingProposalGapView = (proposalId: string) =>
  get<SemanticModelingProposalGapView>(`/semantic/modeling-agent/proposals/${proposalId}/gap-view`)

export const draftSemanticModelingProposal = (proposalId: string) =>
  post<SemanticModelingProposal>(`/semantic/modeling-agent/proposals/${proposalId}/draft`)

export const validateSemanticModelingProposal = (proposalId: string) =>
  post<SemanticModelingProposal>(`/semantic/modeling-agent/proposals/${proposalId}/validate`)

export const approveSemanticModelingProposal = (
  proposalId: string,
  body?: SemanticModelingProposalApproveBody,
) =>
  post<SemanticModelingProposal>(`/semantic/modeling-agent/proposals/${proposalId}/approve`, body)

export const applySemanticModelingProposal = (proposalId: string) =>
  post<SemanticModelingProposal>(`/semantic/modeling-agent/proposals/${proposalId}/apply`)

export const publishSemanticModelingProposal = (
  proposalId: string,
  body?: SemanticModelingProposalPublishRequest,
) =>
  post<SemanticModelingProposal>(`/semantic/modeling-agent/proposals/${proposalId}/publish`, body)

export const closeSemanticModelingProposal = (
  proposalId: string,
  body: SemanticModelingProposalCloseRequest,
) =>
  post<SemanticModelingProposal>(`/semantic/modeling-agent/proposals/${proposalId}/close`, body)

export type SemanticModelingCopilotEntryType = 'table_known' | 'business_question' | 'semantic_gap' | string

export interface SemanticModelingCopilotMessage {
  role: 'user' | 'assistant' | 'system' | string
  content: string
  created_at?: string
}

// ── 结构化 workbench_state 字段：用于对话原生 UI 直接渲染卡片 ──────────────────
// 字段全部可选 / 兼容未知字段；后端默认形状会满足这些；前端 adapter 仅做投影。

export interface CopilotCanvasObjectItem {
  id?: string
  name?: string
  title?: string
  status?: string
  domain?: string
  description?: string
  [key: string]: unknown
}

export interface CopilotCanvasMetricItem {
  id?: string
  name?: string
  title?: string
  status?: string
  measure_ref?: string
  binding_status?: string
  description?: string
  [key: string]: unknown
}

export interface CopilotCanvasDimensionItem {
  id?: string
  name?: string
  title?: string
  status?: string
  source?: string
  [key: string]: unknown
}

export interface CopilotCanvasBindingItem {
  id?: string
  metric?: string
  measure_ref?: string
  status?: string
  score?: number
  [key: string]: unknown
}

export interface CopilotCanvasPolicyItem {
  id?: string
  name?: string
  visibility?: string
  status?: string
  [key: string]: unknown
}

export interface CopilotCandidateCard {
  id?: string
  name?: string
  title?: string
  recommended_value?: unknown
  score?: number
  source?: string
  [key: string]: unknown
}

export interface CopilotSourceCandidate {
  id?: string
  asset_type?: string
  source_kind?: 'physical_table' | 'dataset' | string
  source_id?: string | number | null
  dataset_id?: string | number | null
  database?: string | null
  schema?: string | null
  table?: string | null
  name?: string | null
  title?: string | null
  score?: number
  confidence?: 'high' | 'medium' | 'low' | string
  matched_terms?: string[]
  evidence?: string[]
  rank?: number
  score_breakdown?: Record<string, number>
  why_selected?: string
  why_not_selected?: string
  selected?: boolean
  [key: string]: unknown
}

export interface CopilotConfirmation {
  id: string
  title?: string
  question?: string
  explain?: string
  recommended_value?: unknown
  recommended_reason?: string
  blocking?: boolean
  confirmed?: boolean
  value?: unknown
  [key: string]: unknown
}

export type CopilotEvidenceLevel = 'P0' | 'P1' | 'P2' | 'P3' | string

export interface CopilotEvidenceItem {
  id?: string
  type?: string
  trust_level?: CopilotEvidenceLevel
  extracted_claim?: string
  source_uri?: string
  text?: string
  [key: string]: unknown
}

export interface CopilotSandboxPreview {
  status?: string
  summary?: string
  pollutes_official_route?: boolean
  sample_questions?: string[]
  [key: string]: unknown
}

export interface CopilotSourceEvidence {
  source_table?: Record<string, unknown>
  fields?: Array<Record<string, unknown>>
  sample_rows?: Array<Record<string, unknown>>
  recommendations?: Array<Record<string, unknown>>
  [key: string]: unknown
}

export interface CopilotTraceState {
  events?: Array<Record<string, unknown>>
  [key: string]: unknown
}

export interface CopilotPublishGate {
  state?: string
  label?: string
  steps?: Array<Record<string, unknown>>
  [key: string]: unknown
}

export interface CopilotPostPublishValidation {
  status?: string
  label?: string
  sample_question?: string | null
  runtime_route?: string | null
  result_summary?: string | null
  [key: string]: unknown
}

export interface CopilotProposalSummary {
  id?: string
  status?: string
  spec?: unknown
  runtime_consumption_result?: Record<string, unknown>
  [key: string]: unknown
}

export interface CopilotReadiness {
  canonical_ready?: boolean
  exploratory_ready?: boolean
  reasons?: string[]
  [key: string]: unknown
}

export interface CopilotToolTrace {
  tool?: string
  status?: string
  summary?: string
  error?: string
  [key: string]: unknown
}

export interface SemanticModelingCopilotWorkbenchState {
  agent_message?: string
  semantic_canvas?: {
    objects?: CopilotCanvasObjectItem[]
    metrics?: CopilotCanvasMetricItem[]
    dimensions?: CopilotCanvasDimensionItem[]
    bindings?: CopilotCanvasBindingItem[]
    policies?: CopilotCanvasPolicyItem[]
  }
  candidate_cards?: CopilotCandidateCard[]
  source_candidates?: CopilotSourceCandidate[]
  required_confirmations?: CopilotConfirmation[]
  evidence_summary?: CopilotEvidenceItem[]
  validation_summary?: Array<Record<string, unknown>>
  readiness?: CopilotReadiness
  suggested_actions?: string[]
  proposal_summary?: CopilotProposalSummary
  proposal_patch?: Record<string, unknown>
  sandbox_preview?: CopilotSandboxPreview
  source_evidence?: CopilotSourceEvidence
  trace_state?: CopilotTraceState
  publish_gate?: CopilotPublishGate
  post_publish_validation?: CopilotPostPublishValidation
  save_result?: { status?: string; proposal_id?: string; idempotent?: boolean; [key: string]: unknown }
  next_steps?: Array<{ id?: string; title?: string; description?: string; href?: string; [key: string]: unknown }>
  raw_spec?: SemanticModelingAgentSpec | Record<string, unknown>
  advanced_refs?: Record<string, unknown>
  [key: string]: unknown
}

export interface SemanticModelingCopilotSession {
  id: string
  user_goal: string
  entry_type: SemanticModelingCopilotEntryType
  status: 'active' | 'completed' | 'abandoned' | string
  state?: string
  state_version?: number
  state_history?: Array<Record<string, unknown>>
  event_log?: Array<Record<string, unknown>>
  principal_id?: string | null
  title?: string | null
  conversation?: SemanticModelingCopilotMessage[]
  working_memory?: Record<string, unknown>
  current_proposal_id?: string | null
  workbench_state: SemanticModelingCopilotWorkbenchState
  tool_traces?: CopilotToolTrace[]
  created_at?: string
  updated_at?: string
}

export interface SemanticModelingCopilotReview {
  session_id: string
  proposal_id?: string | null
  status: 'drafting' | 'reviewing' | 'blocked' | 'ready_to_save' | 'ready_to_publish' | 'published' | string
  status_label: string
  changes: Array<{
    id: string
    type: string
    title: string
    technical_name?: string | null
    operation?: string
    reason?: string
    impact?: string
    risk?: string
    [key: string]: unknown
  }>
  blockers: Array<{
    id: string
    severity: 'required' | 'needs_confirmation' | 'warning' | string
    title: string
    description: string
    technical_hint?: unknown
    source?: string
    [key: string]: unknown
  }>
  reason_explanations: Array<{
    target_id: string
    question: string
    answer: string
    evidence_refs?: string[]
    [key: string]: unknown
  }>
  data_agent_consumption: {
    state: 'unavailable' | 'draft_only' | 'ready_after_publish' | 'available' | string
    label: string
    reasons?: string[]
  }
  source_evidence?: CopilotSourceEvidence
  trace_state?: CopilotTraceState
  publish_gate?: CopilotPublishGate
  post_publish_validation?: CopilotPostPublishValidation
  primary_action: {
    action: 'generate_spec' | 'save_proposal' | 'publish' | 'none' | string
    label: string
    disabled: boolean
    disabled_reason?: string | null
  }
  [key: string]: unknown
}

export interface SemanticModelingCopilotSessionList {
  items: SemanticModelingCopilotSession[]
  total: number
  limit?: number
  offset?: number
}

export interface SemanticModelingCopilotListSessionsParams {
  status?: string
  limit?: number
  offset?: number
  include_legacy?: boolean
}

export interface SemanticModelingCopilotCreateSessionBody {
  user_goal: string
  entry_type?: SemanticModelingCopilotEntryType
  table?: string
  dataset_id?: string
  miss_trace_id?: string
  [key: string]: unknown
}

export interface SemanticModelingCopilotSendMessageBody {
  message: string
  [key: string]: unknown
}

export const createSemanticModelingCopilotSession = (body: SemanticModelingCopilotCreateSessionBody) =>
  post<SemanticModelingCopilotSession>('/semantic/modeling-copilot/sessions', body)

export const getSemanticModelingCopilotSession = (sessionId: string) =>
  get<SemanticModelingCopilotSession>(`/semantic/modeling-copilot/sessions/${sessionId}`)

export const getSemanticModelingCopilotReview = (sessionId: string) =>
  get<SemanticModelingCopilotReview>(`/semantic/modeling-copilot/sessions/${sessionId}/review`)

export const sendSemanticModelingCopilotMessage = (
  sessionId: string,
  body: SemanticModelingCopilotSendMessageBody,
) =>
  post<SemanticModelingCopilotSession>(
    `/semantic/modeling-copilot/sessions/${sessionId}/messages`,
    body,
    MODELING_COPILOT_LONG_REQUEST,
  )

export const confirmSemanticModelingCopilotAssumption = (
  sessionId: string,
  body: { confirmation_id: string; value?: unknown },
) =>
  post<SemanticModelingCopilotSession>(`/semantic/modeling-copilot/sessions/${sessionId}/confirmations`, body)

export const acceptSemanticModelingCopilotCubeDraft = (sessionId: string, body?: Record<string, unknown>) =>
  post<SemanticModelingCopilotSession>(`/semantic/modeling-copilot/sessions/${sessionId}/accept-cube-draft`, body)

export const previewSemanticModelingCopilotSandbox = (sessionId: string, body?: Record<string, unknown>) =>
  post<SemanticModelingCopilotSession>(
    `/semantic/modeling-copilot/sessions/${sessionId}/sandbox`,
    body,
    MODELING_COPILOT_LONG_REQUEST,
  )

export const saveSemanticModelingCopilotProposal = (sessionId: string, body?: Record<string, unknown>) =>
  post<SemanticModelingCopilotSession>(
    `/semantic/modeling-copilot/sessions/${sessionId}/save-proposal`,
    body,
    MODELING_COPILOT_LONG_REQUEST,
  )

export const publishSemanticModelingCopilotProposal = (sessionId: string, body?: Record<string, unknown>) =>
  post<SemanticModelingCopilotSession>(
    `/semantic/modeling-copilot/sessions/${sessionId}/publish`,
    body,
    MODELING_COPILOT_LONG_REQUEST,
  )

export const patchSemanticModelingCopilotSpec = (sessionId: string, body: Record<string, unknown>) =>
  patch<SemanticModelingCopilotSession>(
    `/semantic/modeling-copilot/sessions/${sessionId}/spec`,
    body,
    MODELING_COPILOT_LONG_REQUEST,
  )

export const listSemanticModelingCopilotSessions = (
  params: SemanticModelingCopilotListSessionsParams = {},
) => {
  const query: Record<string, unknown> = {}
  if (params.status !== undefined) query.status = params.status
  if (params.limit !== undefined) query.limit = params.limit
  if (params.offset !== undefined) query.offset = params.offset
  if (params.include_legacy !== undefined) query.include_legacy = params.include_legacy
  return get<SemanticModelingCopilotSessionList>('/semantic/modeling-copilot/sessions', query)
}

export const deleteSemanticModelingCopilotSession = (sessionId: string) =>
  del<{ deleted: boolean; id: string }>(`/semantic/modeling-copilot/sessions/${sessionId}`)

export const renameSemanticModelingCopilotSession = (sessionId: string, title: string) =>
  patch<SemanticModelingCopilotSession>(`/semantic/modeling-copilot/sessions/${sessionId}`, { title })

// ─── Domain 类型 ────────────────────────────────────────────────────────────

export interface DomainSummary {
  id?: string | null
  code?: string
  name: string
  title?: string | null
  description?: string | null
  status?: string
  catalog_code?: string | null
  catalog_name?: string | null
  owner?: string | null
}

export interface DomainDetail extends DomainSummary {
  cubes?: string[]
}

export interface DomainListResponse {
  domains: DomainSummary[]
  total: number
  page: number
  page_size: number
  page_count: number
}

export interface DomainCanvasNode {
  id: string
  title: string
  type: 'fact' | 'dimension' | string
  dimensions: number
  measures: number
  status?: string | null
  source_id?: string | null
  source_database?: string | null
  source_schema?: string | null
  source_binding_summary?: string | null
}

export interface DomainCanvasEdge {
  source: string
  target: string
  relationship?: string
  join_type?: string
  sql?: string
}

export interface DomainCanvas {
  nodes: DomainCanvasNode[]
  edges: DomainCanvasEdge[]
}

export interface DomainContextPreview {
  domain?: DomainDetail
  role: 'business_context' | string
  candidate_scope: {
    cube_refs?: string[]
    cube_candidates?: unknown[]
    ontology_refs?: Record<string, unknown>
    [key: string]: unknown
  }
  default_context?: Record<string, unknown>
  agent_hints?: Record<string, unknown>
  execution_truth_source?: string
  business_truth_source?: string
  issues?: SemanticModelingAgentValidationIssue[]
  [key: string]: unknown
}

export interface CatalogSummary {
  code: string
  name: string
  description?: string | null
}

// ─── Domain API ─────────────────────────────────────────────────────────────

export const listDomains = (params?: { q?: string; catalog_code?: string; page?: number; page_size?: number }) =>
  get<DomainListResponse>('/semantic/domains', params as Record<string, unknown>)

export const describeDomain = (id: string) =>
  get<DomainDetail>(`/semantic/domains/${id}`)

export const createDomain = (body: Partial<DomainSummary>) =>
  post<DomainDetail>('/semantic/domains', body)

export const updateDomain = (id: string, body: Partial<DomainSummary>) =>
  put<DomainDetail>(`/semantic/domains/${id}`, body)

export const getDomainCanvas = (id: string) =>
  get<DomainCanvas>(`/semantic/domains/${id}/canvas`)

export const previewDomainContext = (id: string) =>
  post<DomainContextPreview>(`/semantic/domains/${id}/context-preview`)

export const addCubeToDomain = (id: string, cubeName: string) =>
  post<DomainDetail>(`/semantic/domains/${id}/cubes`, { cube_name: cubeName })

export const publishDomain = (id: string, body?: { cubes?: string[] }) =>
  post<DomainDetail>(`/semantic/domains/${id}/publish`, body)

export const listCatalogs = () =>
  get<{ catalogs: CatalogSummary[]; total: number }>('/semantic/catalogs')

// ─── View 类型 ──────────────────────────────────────────────────────────────

export interface ViewSummary {
  name: string
  title?: string | null
  description?: string | null
  public?: boolean
  cube_count?: number
  cubes?: string[]
}

export interface ViewDetail {
  name: string
  title?: string | null
  description?: string | null
  public?: boolean
  cubes?: unknown[]
  [key: string]: unknown
}

export interface ViewListResponse {
  views: ViewSummary[]
  total: number
  page: number
  page_size: number
  page_count: number
}

export interface MaterializeStatus {
  name: string
  status?: string | null
  materialize_status?: string | null
  materialized_at?: string | null
}

// ─── View API ───────────────────────────────────────────────────────────────

export const listViews = (params?: { q?: string; include_private?: boolean; page?: number; page_size?: number }) =>
  get<ViewListResponse>('/semantic/views', params as Record<string, unknown>)

export const describeView = (name: string, includePrivate = false) =>
  get<ViewDetail>(`/semantic/views/${name}`, { include_private: includePrivate })

export const materializeView = (name: string, sourceId?: string) =>
  post<MaterializeStatus>(`/semantic/views/${name}/materialize`, sourceId ? { source_id: sourceId } : undefined)

export const getMaterializeStatus = (name: string) =>
  get<MaterializeStatus>(`/semantic/views/${name}/materialize-status`)

// ─── Files API (YAML 读写，CubeEdit 使用) ────────────────────────────────────

export interface FileContent {
  name: string
  type: string
  content: string
}

export type FileType = 'cubes' | 'views' | 'recipes' | 'domains'

export const readSemanticFile = (type: FileType, name: string) =>
  get<FileContent>(`/semantic/files/${type}/${name}`)

export const writeSemanticFile = (type: FileType, name: string, content: string) =>
  put<{ message: string }>(`/semantic/files/${type}/${name}`, { content })

export const validateSemanticFile = (type: FileType, name: string, content: string) =>
  post<{ valid: boolean; diagnostics: Array<{ level: string; message: string }> }>(
    `/semantic/files/${type}/${name}/validate`,
    { content },
  )

// ─── Compile / Diagnose API ──────────────────────────────────────────────────

export interface CompileResult {
  sql: string
  primary_cube: string
  joined_cubes: string[]
}

export const compileDsl = (dsl: string) =>
  post<CompileResult>('/semantic/compile', { dsl })

// ─── Schema sync ─────────────────────────────────────────────────────────────

export const schemaSyncAll = () =>
  post<Record<string, unknown>>('/semantic/schema-sync', {})

export const schemaSyncCube = (cubeName: string) =>
  post<Record<string, unknown>>('/semantic/schema-sync', { cube_name: cubeName })

// ─── P4 · Cube 字段类型校验 ────────────────────────────────────────────────────
// 后端契约：POST /api/v1/semantic/cubes/:name/validate-fields
//          （app/interfaces/api/v1/semantic.py :: validate_cube_fields）

export interface CubeFieldIssue {
  field: string          // 维度/度量名称
  code: string           // 错误码
  message: string        // 可读描述
  severity: 'error' | 'warning' | 'info'
}

export interface CubeFieldValidationResult {
  ok: boolean
  issues: CubeFieldIssue[]
}

export const validateCubeFields = (name: string): Promise<CubeFieldValidationResult> =>
  post<CubeFieldValidationResult>(`/semantic/cubes/${name}/validate-fields`)

// ─── P5 · 指标公式 dry-run ──────────────────────────────────────────────────
// 后端契约：POST /api/v1/semantic/metrics/dry-run
//          （app/interfaces/api/v1/semantic.py :: dry_run_metric）

export interface MetricDryRunResult {
  sql_preview: string
  sample_rows?: Record<string, unknown>[]
  errors?: Array<{ code: string; message: string }>
}

export const dryRunMetric = (name: string, formula: string): Promise<MetricDryRunResult> =>
  post<MetricDryRunResult>('/semantic/metrics/dry-run', { name, formula })

// ─── P6 · 语义关系图 ─────────────────────────────────────────────────────────
// 后端契约：GET /api/v1/semantic/graph （真实接口，已存在）

export interface SemanticGraphNode {
  id: string
  title: string
  type: 'fact' | 'dimension' | string
  dimensions: number
  measures: number
  status?: string | null
  source_id?: string | null
  source_database?: string | null
  source_schema?: string | null
  source_binding_summary?: string | null
}

export interface SemanticGraphEdge {
  source: string
  target: string
  relationship?: string
  join_type?: string
  sql?: string
}

export interface SemanticGraphData {
  nodes: SemanticGraphNode[]
  edges: SemanticGraphEdge[]
}

export const getSemanticGraph = () =>
  get<SemanticGraphData>('/semantic/graph')

// ─── P7 · Domain 发布历史 ────────────────────────────────────────────────────
// 后端契约：GET /api/v1/semantic/domains/:id/publish/history
//          （app/interfaces/api/v1/semantic.py :: get_domain_publish_history）

export interface DomainPublishRecord {
  version: string
  published_at: string
  published_by: string
  status: 'success' | 'failed' | 'pending'
  diff_summary?: string | null
  note?: string | null
}

export const getDomainPublishHistory = (id: string) =>
  get<{ records: DomainPublishRecord[]; total: number }>(
    `/semantic/domains/${id}/publish/history`,
  )

// ─── P8 · View 物化运行历史 ──────────────────────────────────────────────────
// 后端契约：GET /api/v1/semantic/views/:id/materialize/runs （真实接口，已存在）

export interface ViewMaterializeRun {
  id: number
  view_id: number
  status: 'running' | 'success' | 'failed' | string
  started_at: string
  finished_at?: string | null
  error?: string | null
  rows?: number | null
  duration_ms?: number | null
}

export interface ViewMaterializeRunsResponse {
  runs: ViewMaterializeRun[]
  total: number
  page: number
  page_size: number
  page_count: number
}

export const getViewMaterializeRuns = (
  viewId: number,
  params?: { page?: number; page_size?: number },
) =>
  get<ViewMaterializeRunsResponse>(`/semantic/views/${viewId}/materialize/runs`, params as Record<string, unknown>)
