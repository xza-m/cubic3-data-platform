// frontend/src/v2/api/diagnose.ts
//
// 语义诊断（B-back-9）API 客户端。
// 与 api/semantic.ts 隔离以避免主线 / sub-agent 并行编辑时的写冲突。
//
// 后端契约：app/interfaces/api/v1/semantic.py
//   POST   /api/v1/semantic/diagnose            — 同步诊断并落库
//   GET    /api/v1/semantic/diagnose/runs       — 分页历史
//   GET    /api/v1/semantic/diagnose/runs/:id   — 详情

import { apiClient } from '@v2/api/client'

// ─── 通用 envelope ─────────────────────────────────────────────────────────

interface Envelope<T> {
  code: number
  message: string
  data: T
  trace_id?: string | null
}

const get = <T>(url: string, params?: Record<string, unknown>): Promise<T> =>
  apiClient.get<Envelope<T>>(url, { params }).then((r) => r.data.data)

const post = <T>(url: string, body?: unknown): Promise<T> =>
  apiClient.post<Envelope<T>>(url, body).then((r) => r.data.data)

// ─── 类型 ──────────────────────────────────────────────────────────────────

export type DiagnoseInputKind = 'nl' | 'sql' | 'yaml'

export interface DiagnoseRun {
  id: number
  user_id: number | null
  input_kind: DiagnoseInputKind
  input_text: string
  parse_ok: boolean | null
  validate_ok: boolean | null
  sql_text: string | null
  error: string | null
  duration_ms: number | null
  /** Phase 3：诊断时刻语义定义集版本标识（回放时用于识别定义漂移） */
  definition_hash?: string | null
  created_at: string | null
}

export interface DiagnoseRunListResponse {
  items: DiagnoseRun[]
  total: number
  page: number
  page_size: number
  page_count?: number
}

export interface DiagnoseRequest {
  input_kind: DiagnoseInputKind
  input_text: string
}

export interface SemanticRuntimeHealth {
  status: 'healthy' | 'unhealthy' | 'degraded' | string
  runtime?: {
    manifest_status?: string | null
    error_code?: string | null
    reason?: string | null
    version_pin?: Record<string, unknown>
    asset_count?: number
    binding_count?: number
    policy_count?: number
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface GovernanceAuditTrace {
  id?: string
  trace_id?: string
  policy_name?: string | null
  target_type?: string | null
  target_name?: string | null
  decision?: string | null
  route_type?: string | null
  principal_id?: string | null
  semantic_plan_id?: string | null
  sql_hash?: string | null
  created_at?: string | null
  [key: string]: unknown
}

export interface GovernanceAuditTraceListResponse {
  items: GovernanceAuditTrace[]
  total: number
}

export interface GovernanceAuditTraceFilters {
  semantic_plan_id?: string
  sql_hash?: string
  principal_id?: string
  decision?: string
  route_type?: string
}

export interface SemanticReleaseSummary {
  id: string
  release_no: number
  namespace: string
  status: string
  scope_json?: Record<string, unknown>
  gate_result_json?: Record<string, unknown>
  previous_release_id?: string | null
  rollback_of_release_id?: string | null
  published_by?: string | null
  published_at?: string | null
  status_reason?: string | null
  status_changed_at?: string | null
  created_at?: string | null
}

export interface SemanticReleaseListResponse {
  items: SemanticReleaseSummary[]
  total: number
  limit: number
  offset: number
}

// ─── API ───────────────────────────────────────────────────────────────────

export const runDiagnose = (body: DiagnoseRequest) =>
  post<DiagnoseRun>('/semantic/diagnose', body)

export const listDiagnoseRuns = (params?: { page?: number; page_size?: number }) =>
  get<DiagnoseRunListResponse>(
    '/semantic/diagnose/runs',
    params as Record<string, unknown>,
  )

export const getDiagnoseRun = (runId: number) =>
  get<DiagnoseRun>(`/semantic/diagnose/runs/${runId}`)

export const getSemanticRuntimeHealth = () =>
  get<SemanticRuntimeHealth>('/semantic/health')

export const listGovernanceAuditTraces = (filters: GovernanceAuditTraceFilters = {}) =>
  get<GovernanceAuditTraceListResponse>('/governance/audit-traces', filters as Record<string, unknown>)

export const listSemanticReleases = (params: { namespace?: string; status?: string; limit?: number; offset?: number } = {}) =>
  get<SemanticReleaseListResponse>('/semantic/releases', params as Record<string, unknown>)
