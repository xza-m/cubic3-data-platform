// frontend/src/v2/api/access.ts
//
// 统一身份与权限基础 API。

import { apiClient } from './client'
import type { PaginatedResponse } from './types'

interface Envelope<T> {
  code: number
  message: string
  data: T
  trace_id?: string | null
}

export type PrincipalType = 'human' | 'service'
export type RoleType = 'platform' | 'data'

export interface AccessRoleCatalogItem {
  role_code: string
  name: string
  description: string
}

export interface AccessRoleCatalog {
  platform_roles: AccessRoleCatalogItem[]
  data_roles: AccessRoleCatalogItem[]
  api_key_scopes: string[]
}

export interface AccessPermissionPackage {
  package_code: string
  name: string
  description: string
  role_codes: string[]
  role_type: RoleType | string
  data_level: string | null
}

export interface AccessPrincipal {
  principal_id: string
  principal_type: PrincipalType
  idp: string
  tenant_key: string
  display_name: string | null
  email: string | null
  employee_no: string | null
  status: 'active' | 'disabled' | 'deleted' | string
  platform_roles?: string[]
  data_roles?: string[]
  role_bindings?: AccessRoleBinding[]
  last_seen_at: string | null
  created_at: string | null
  updated_at: string | null
}

export interface AccessPrincipalAlias {
  id: number
  principal_id: string
  idp: string
  tenant_key: string
  external_id_type: 'open_id' | 'union_id' | 'employee_no' | string
  external_id: string
  status: string
  created_at: string | null
}

export interface AccessRoleBinding {
  id: number
  subject_type: 'principal' | 'feishu_group' | 'feishu_department' | 'manual_group' | string
  subject_key: string
  role_code: string
  role_type: RoleType
  source: 'feishu_sync' | 'manual' | string
  effective_from: string | null
  effective_to: string | null
  status: string
  created_by: string | null
  created_by_display_name?: string | null
  created_at: string | null
}

export interface AccessApiKey {
  key_id: string
  principal_id: string
  key_prefix: string
  scopes: string[]
  allowed_ips: string[]
  rate_limit_per_minute: number | null
  expires_at: string | null
  last_used_at: string | null
  last_rotated_at: string | null
  usage_count: number
  status: string
  /** 语义 release pin：pinned 时按不可变 release_id 解析（§6.1） */
  semantic_pin?: { pin_policy: 'pinned' | 'track_active'; release_id?: string } | null
  created_by: string | null
  created_by_display_name?: string | null
  created_at: string | null
}

export interface AccessServicePrincipal {
  principal_id: string
  display_name?: string | null
  service_type: 'bot' | 'agent' | 'skill' | 'job' | string
  owner_principal_id: string
  owner_display_name?: string | null
  owner_team: string | null
  description: string | null
  allowed_tenants: string[]
  delegation_rules: Record<string, unknown>
  status: string
  disabled_at: string | null
  disabled_by: string | null
  created_at: string | null
  updated_at: string | null
  api_keys?: AccessApiKey[]
}

export interface AccessPrincipalDetail extends AccessPrincipal {
  platform_roles: string[]
  data_roles: string[]
  role_bindings: AccessRoleBinding[]
  aliases: AccessPrincipalAlias[]
  api_keys?: AccessApiKey[]
}

export interface ListPrincipalsParams {
  principal_type?: PrincipalType | ''
  tenant_key?: string
  status?: string
  q?: string
  page?: number
  page_size?: number
}

export interface CreateServicePrincipalPayload {
  tenant_key: string
  service_type: string
  code: string
  owner_principal_id: string
  owner_team?: string
  description?: string
  allowed_tenants?: string[]
  delegation_rules?: Record<string, unknown>
}

export interface CreateApiKeyPayload {
  scopes: string[]
  allowed_ips?: string[]
  rate_limit_per_minute?: number | null
  expires_at?: string | null
  /** 模式 A（scope，自带数据范围）/ 模式 B（delegation，委托白名单） */
  mode?: 'scope' | 'delegation'
  /** 模式 A 数据范围，写入 access_principal_scopes（source=issuance） */
  data_scopes?: Array<{ attribute: string; values: string[] }>
  /** 语义 release pin 配置（§6.1）：pinned 需提供 release_id */
  semantic_pin?: { pin_policy: 'pinned' | 'track_active'; release_id?: string }
}

export interface CreatedApiKey {
  key_id: string
  key_prefix: string
  api_key: string
  expires_at: string | null
}

export interface AccessExecutionProfile {
  profile_code: string
  name: string
  description?: string | null
  credential_mode: string
  data_level: string
  allowed_operations: string[]
  max_rows?: number | null
  timeout_seconds?: number | null
  export_allowed: boolean
  requires_strong_audit: boolean
  status: string
}

export interface AccessDataPolicy {
  policy_code: string
  name: string
  description?: string | null
  status: string
  priority: number
  subject_roles: string[]
  resource_scope: Record<string, unknown>
  actions: string[]
  effect: 'allow' | 'deny' | string
  execution_profile_code?: string | null
  reason?: string | null
  policy_version: string
  policy_epoch: number
}

export interface EffectiveRowScopeEntry {
  table: string
  column: string
  operator: string
  values: string[]
  policy_code?: string
  dimension_ref?: string
  attribute?: string
}

export interface EffectiveRowScope {
  version: string
  subject_principal_id?: string | null
  entries: EffectiveRowScopeEntry[]
}

export interface AccessPolicyDecision {
  decision_id: string
  principal_id: string
  principal_display_name?: string | null
  actor_id: string | null
  actor_display_name?: string | null
  decision: string
  reason_code: string
  reason?: string | null
  data_level: string
  resource_set: Record<string, unknown>
  sql_hashes: string[]
  matched_policies: Array<Record<string, unknown>>
  effective_row_scope?: EffectiveRowScope | null
  execution_profile_code: string | null
  policy_version: string | null
  policy_epoch: number
  decision_type: string
  governance_required: boolean
  created_at: string | null
}

export interface GatewayTelemetrySummary {
  query_count: number
  success_count: number
  failed_count: number
  physical_denied_count: number
  stability: number
  success_rate?: number
  timeout_rate?: number
  by_data_level: Record<string, number>
  queued_count: number
  running_count: number
  pending_count: number
  avg_queue_wait_ms: number
  max_current_queue_wait_ms: number
  queue_wait_p95_ms?: number
  avg_execute_ms: number
  execute_p95_ms?: number
  remote_timeout_count: number
  client_wait_timeout_count: number
  timeout_count: number
  rejected_count: number
  export_request_count: number
  export_started_count: number
  export_not_ready_count: number
  export_success_count: number
  export_failure_count: number
  export_failure_by_reason: Record<string, number>
  publish_conflict_count: number
  result_rejected_count: number
  result_rejected_by_reason: Record<string, number>
  result_too_large_rejected_count: number
  result_row_too_large_rejected_count: number
  max_result_rejected_bytes: number
  max_result_rejected_row_bytes: number
  result_object_count: number
  spool_object_count: number
  spool_result_total_bytes: number
  spool_age_buckets?: Record<string, number>
  cleanup_lag_seconds?: number
  auth_denied_count: number
  invalid_token_count?: number
  missing_token_count?: number
  legacy_protocol_count: number
  sql_guard_rejected_count?: number
  credential_missing_count?: number
  credential_invalid_count?: number
  worker_heartbeat_stale_count: number
  worker_orphan_lease_reclaimed_count: number
  worker_housekeeping_completed_count: number
  gateway_readyz_degraded_count: number
  active_worker_count?: number
  live_worker_count?: number
  draining_worker_count?: number
  worker_capacity?: number
  generated_at: string | null
  metric_version?: string | null
  source?: string | null
  window?: {
    window?: string | null
    since?: string | null
    until?: string | null
  }
}

export interface GatewayRuntimeAlert {
  code: string
  severity: 'critical' | 'warning' | 'healthy' | string
  title: string
  message: string
  value?: unknown
  threshold?: unknown
}

export interface GatewayRuntimeAlerts {
  status: 'critical' | 'warning' | 'healthy' | string
  alerts: GatewayRuntimeAlert[]
  thresholds: Record<string, number | string>
  readiness: {
    status?: string
    checks?: Record<string, unknown>
    error?: string
  }
  summary: Record<string, number | string | null>
  evaluated_at: string | null
}

export interface GatewayQueryRun {
  query_id: string
  trace_id: string | null
  principal_id: string | null
  principal_display_name?: string | null
  principal_name?: string | null
  actor_type?: string | null
  actor_id?: string | null
  actor_display_name?: string | null
  actor_name?: string | null
  policy_decision_id?: string | null
  policy_epoch?: number | null
  data_level: string | null
  execution_profile_code: string | null
  credential_ref: string | null
  status: string
  reason_code: string | null
  physical_denied: boolean
  created_at?: string | null
  finished_at?: string | null
}

export interface GatewayTimeseriesPoint {
  bucket_start: string
  bucket_end?: string | null
  query_total: number
  success: number
  failed: number
  rejected: number
  timeout: number
  success_rate?: number | null
  queue_wait_p95_ms?: number | null
  execute_p95_ms?: number | null
  pending_max?: number | null
  spool_bytes_delta?: number | null
}

export interface GatewayBreakdownItem {
  key: string
  count: number
}

export interface GatewayContractCompleteness {
  total: number
  platform_governed_count: number
  gateway_only_count: number
  legacy_actor_count: number
  principal_present_rate: number
  actor_present_rate: number
  policy_decision_present_rate: number
  data_level_present_rate: number
  execution_profile_present_rate: number
  credential_ref_present_rate: number
}

export interface GatewayObservabilitySnapshot {
  window: string
  bucket: string
  since: string | null
  until: string | null
  generated_at: string | null
  metric_version: string | null
  source: string | null
  is_partial: boolean
  summary: GatewayTelemetrySummary
  overview: Record<string, unknown>
  timeseries: {
    bucket: string
    points: GatewayTimeseriesPoint[]
  }
  breakdowns: Record<string, GatewayBreakdownItem[]>
  contract_completeness: GatewayContractCompleteness
  result_export_storage: Record<string, unknown>
  security: Record<string, unknown>
  workers: Record<string, unknown>
  query_runs: {
    items: GatewayQueryRun[]
    total: number
  }
  readiness?: GatewayRuntimeAlerts['readiness']
  alerts?: GatewayRuntimeAlerts
}

export interface M2AllowlistItem {
  identifier: string
  source: 'FEISHU_M2_READER_OPEN_IDS' | 'CUBIC3_ALLOWED_USER_IDS' | string
  match_status: 'matched' | 'unmatched' | string
  principal_id: string | null
  display_name?: string | null
  data_roles: string[]
  grant_status: 'granted' | 'pending_login' | 'pending_sync' | string
  risk?: 'manual_revoke_conflict' | string | null
}

export interface M2AllowlistPrincipal {
  principal_id: string
  display_name?: string | null
  source: string
  platform_roles: string[]
  data_roles: string[]
  in_configured_allowlist: boolean
  last_bound_at: string | null
}

export interface M2AllowlistSummary {
  configured_count: number
  matched_count: number
  unmatched_count: number
  current_m2_count: number
  sync_cubic3_allowlist: boolean
}

export interface M2AllowlistResponse {
  items: M2AllowlistItem[]
  current_principals: M2AllowlistPrincipal[]
  summary: M2AllowlistSummary
  sources: {
    feishu_m2_reader_open_ids: string
    sync_cubic3_allowlist: boolean
  }
}

export async function listAccessPrincipals(
  params: ListPrincipalsParams = {},
): Promise<PaginatedResponse<AccessPrincipal>> {
  const res = await apiClient.get<Envelope<PaginatedResponse<AccessPrincipal>>>('/access/principals', {
    params,
  })
  return res.data.data
}

export async function getAccessRoleCatalog(): Promise<AccessRoleCatalog> {
  const res = await apiClient.get<Envelope<AccessRoleCatalog>>('/access/role-catalog')
  const data = res.data.data
  return {
    platform_roles: Array.isArray(data?.platform_roles) ? data.platform_roles : [],
    data_roles: Array.isArray(data?.data_roles) ? data.data_roles : [],
    api_key_scopes: Array.isArray(data?.api_key_scopes) ? data.api_key_scopes : [],
  }
}

export async function getAccessPermissionPackages(): Promise<{
  items: AccessPermissionPackage[]
  total: number
}> {
  const res = await apiClient.get<Envelope<{
    items: AccessPermissionPackage[]
    total: number
  }>>('/access/permission-packages')
  const data = res.data.data
  return {
    items: Array.isArray(data?.items) ? data.items : [],
    total: Number(data?.total ?? 0),
  }
}

export async function getM2Allowlist(): Promise<M2AllowlistResponse> {
  const res = await apiClient.get<Envelope<M2AllowlistResponse>>('/access/m2-allowlist')
  const data = res.data.data
  return {
    items: Array.isArray(data?.items) ? data.items : [],
    current_principals: Array.isArray(data?.current_principals) ? data.current_principals : [],
    summary: {
      configured_count: Number(data?.summary?.configured_count ?? 0),
      matched_count: Number(data?.summary?.matched_count ?? 0),
      unmatched_count: Number(data?.summary?.unmatched_count ?? 0),
      current_m2_count: Number(data?.summary?.current_m2_count ?? 0),
      sync_cubic3_allowlist: Boolean(data?.summary?.sync_cubic3_allowlist),
    },
    sources: {
      feishu_m2_reader_open_ids: data?.sources?.feishu_m2_reader_open_ids ?? '',
      sync_cubic3_allowlist: Boolean(data?.sources?.sync_cubic3_allowlist),
    },
  }
}

export async function getAccessPrincipal(principalId: string): Promise<AccessPrincipalDetail> {
  const res = await apiClient.get<Envelope<AccessPrincipalDetail>>(
    `/access/principals/${encodeURIComponent(principalId)}`,
  )
  return res.data.data
}

export async function resolvePrincipalDisplayNames(
  principalIds: string[],
): Promise<Record<string, string | null>> {
  const uniqueIds = Array.from(new Set(principalIds.map((id) => id.trim()).filter(Boolean)))
  if (uniqueIds.length === 0) return {}
  const res = await apiClient.post<Envelope<{
    items: Array<{ principal_id: string; display_name: string | null }>
  }>>('/access/principal-display-names', { principal_ids: uniqueIds })
  const items = Array.isArray(res.data.data?.items) ? res.data.data.items : []
  return Object.fromEntries(items.map((item) => [item.principal_id, item.display_name]))
}

export async function putAccessPrincipalPermissionPackages(
  principalId: string,
  packageCodes: string[],
): Promise<{
  principal_id: string
  package_codes: string[]
  role_codes: string[]
  role_bindings: AccessRoleBinding[]
}> {
  const res = await apiClient.put<Envelope<{
    principal_id: string
    package_codes: string[]
    role_codes: string[]
    role_bindings: AccessRoleBinding[]
  }>>(
    `/access/principals/${encodeURIComponent(principalId)}/permission-packages`,
    { package_codes: packageCodes },
  )
  return res.data.data
}

export async function listServicePrincipals(): Promise<AccessServicePrincipal[]> {
  const res = await apiClient.get<Envelope<AccessServicePrincipal[]>>('/access/service-principals')
  return Array.isArray(res.data.data) ? res.data.data : []
}

export async function getServicePrincipal(principalId: string): Promise<AccessServicePrincipal> {
  const res = await apiClient.get<Envelope<AccessServicePrincipal>>(
    `/access/service-principals/${encodeURIComponent(principalId)}`,
  )
  return res.data.data
}

export async function createServicePrincipal(
  payload: CreateServicePrincipalPayload,
): Promise<AccessServicePrincipal> {
  const res = await apiClient.post<Envelope<AccessServicePrincipal>>('/access/service-principals', payload)
  return res.data.data
}

export async function createApiKey(
  principalId: string,
  payload: CreateApiKeyPayload,
): Promise<CreatedApiKey> {
  const res = await apiClient.post<Envelope<CreatedApiKey>>(
    `/access/service-principals/${encodeURIComponent(principalId)}/api-keys`,
    payload,
  )
  return res.data.data
}

export async function rotateApiKey(keyId: string): Promise<CreatedApiKey> {
  const res = await apiClient.post<Envelope<CreatedApiKey>>(`/access/api-keys/${keyId}/rotate`)
  return res.data.data
}

export async function revokeApiKey(keyId: string): Promise<{ key_id: string; status: string }> {
  const res = await apiClient.post<Envelope<{ key_id: string; status: string }>>(`/access/api-keys/${keyId}/revoke`)
  return res.data.data
}

export async function listDataPolicies(params: {
  status?: string
  data_level?: string
  q?: string
} = {}): Promise<{ items: AccessDataPolicy[]; total: number }> {
  const res = await apiClient.get<Envelope<{ items: AccessDataPolicy[]; total: number }>>(
    '/governance/data-policies',
    { params },
  )
  return res.data.data
}

export async function createDataPolicy(payload: Partial<AccessDataPolicy> & {
  policy_code: string
  name: string
}): Promise<AccessDataPolicy> {
  const res = await apiClient.post<Envelope<AccessDataPolicy>>('/governance/data-policies', payload)
  return res.data.data
}

export async function updateDataPolicy(
  policyCode: string,
  payload: Partial<AccessDataPolicy>,
): Promise<AccessDataPolicy> {
  const res = await apiClient.patch<Envelope<AccessDataPolicy>>(
    `/governance/data-policies/${encodeURIComponent(policyCode)}`,
    payload,
  )
  return res.data.data
}

export async function listExecutionProfiles(params: {
  status?: string
  data_level?: string
} = {}): Promise<{ items: AccessExecutionProfile[]; total: number }> {
  const res = await apiClient.get<Envelope<{ items: AccessExecutionProfile[]; total: number }>>(
    '/governance/execution-profiles',
    { params },
  )
  return res.data.data
}

export async function createExecutionProfile(payload: Partial<AccessExecutionProfile> & {
  profile_code: string
  name: string
  credential_mode: string
}): Promise<AccessExecutionProfile> {
  const res = await apiClient.post<Envelope<AccessExecutionProfile>>('/governance/execution-profiles', payload)
  return res.data.data
}

export async function updateExecutionProfile(
  profileCode: string,
  payload: Partial<AccessExecutionProfile>,
): Promise<AccessExecutionProfile> {
  const res = await apiClient.patch<Envelope<AccessExecutionProfile>>(
    `/governance/execution-profiles/${encodeURIComponent(profileCode)}`,
    payload,
  )
  return res.data.data
}

export async function listPolicyDecisions(params: {
  principal_id?: string
  decision?: string
  data_level?: string
  policy_code?: string
  limit?: number
} = {}): Promise<{ items: AccessPolicyDecision[]; total: number }> {
  const res = await apiClient.get<Envelope<{ items: AccessPolicyDecision[]; total: number }>>(
    '/governance/policy-decisions',
    { params },
  )
  return res.data.data
}

function normalizeGatewayTelemetrySummary(data: Partial<GatewayTelemetrySummary> | undefined | null): GatewayTelemetrySummary {
  return {
    query_count: Number(data?.query_count ?? 0),
    success_count: Number(data?.success_count ?? 0),
    failed_count: Number(data?.failed_count ?? 0),
    physical_denied_count: Number(data?.physical_denied_count ?? 0),
    stability: Number(data?.stability ?? 100),
    success_rate: Number(data?.success_rate ?? data?.stability ?? 100),
    timeout_rate: Number(data?.timeout_rate ?? 0),
    by_data_level: data?.by_data_level ?? {},
    queued_count: Number(data?.queued_count ?? 0),
    running_count: Number(data?.running_count ?? 0),
    pending_count: Number(data?.pending_count ?? 0),
    avg_queue_wait_ms: Number(data?.avg_queue_wait_ms ?? 0),
    max_current_queue_wait_ms: Number(data?.max_current_queue_wait_ms ?? 0),
    queue_wait_p95_ms: Number(data?.queue_wait_p95_ms ?? 0),
    avg_execute_ms: Number(data?.avg_execute_ms ?? 0),
    execute_p95_ms: Number(data?.execute_p95_ms ?? 0),
    remote_timeout_count: Number(data?.remote_timeout_count ?? 0),
    client_wait_timeout_count: Number(data?.client_wait_timeout_count ?? 0),
    timeout_count: Number(data?.timeout_count ?? 0),
    rejected_count: Number(data?.rejected_count ?? 0),
    export_request_count: Number(data?.export_request_count ?? 0),
    export_started_count: Number(data?.export_started_count ?? 0),
    export_not_ready_count: Number(data?.export_not_ready_count ?? 0),
    export_success_count: Number(data?.export_success_count ?? 0),
    export_failure_count: Number(data?.export_failure_count ?? 0),
    export_failure_by_reason: data?.export_failure_by_reason ?? {},
    publish_conflict_count: Number(data?.publish_conflict_count ?? 0),
    result_rejected_count: Number(data?.result_rejected_count ?? 0),
    result_rejected_by_reason: data?.result_rejected_by_reason ?? {},
    result_too_large_rejected_count: Number(data?.result_too_large_rejected_count ?? 0),
    result_row_too_large_rejected_count: Number(data?.result_row_too_large_rejected_count ?? 0),
    max_result_rejected_bytes: Number(data?.max_result_rejected_bytes ?? 0),
    max_result_rejected_row_bytes: Number(data?.max_result_rejected_row_bytes ?? 0),
    result_object_count: Number(data?.result_object_count ?? 0),
    spool_object_count: Number(data?.spool_object_count ?? 0),
    spool_result_total_bytes: Number(data?.spool_result_total_bytes ?? 0),
    spool_age_buckets: data?.spool_age_buckets ?? {},
    cleanup_lag_seconds: Number(data?.cleanup_lag_seconds ?? 0),
    auth_denied_count: Number(data?.auth_denied_count ?? 0),
    invalid_token_count: Number(data?.invalid_token_count ?? 0),
    missing_token_count: Number(data?.missing_token_count ?? 0),
    legacy_protocol_count: Number(data?.legacy_protocol_count ?? 0),
    sql_guard_rejected_count: Number(data?.sql_guard_rejected_count ?? data?.rejected_count ?? 0),
    credential_missing_count: Number(data?.credential_missing_count ?? 0),
    credential_invalid_count: Number(data?.credential_invalid_count ?? 0),
    worker_heartbeat_stale_count: Number(data?.worker_heartbeat_stale_count ?? 0),
    worker_orphan_lease_reclaimed_count: Number(data?.worker_orphan_lease_reclaimed_count ?? 0),
    worker_housekeeping_completed_count: Number(data?.worker_housekeeping_completed_count ?? 0),
    gateway_readyz_degraded_count: Number(data?.gateway_readyz_degraded_count ?? 0),
    active_worker_count: Number(data?.active_worker_count ?? 0),
    live_worker_count: Number(data?.live_worker_count ?? 0),
    draining_worker_count: Number(data?.draining_worker_count ?? 0),
    worker_capacity: Number(data?.worker_capacity ?? 0),
    generated_at: data?.generated_at ?? null,
    metric_version: data?.metric_version ?? null,
    source: data?.source ?? null,
    window: data?.window ?? undefined,
  }
}

function normalizeGatewayTimeseriesPoint(item: Partial<GatewayTimeseriesPoint>): GatewayTimeseriesPoint {
  return {
    bucket_start: String(item?.bucket_start ?? ''),
    bucket_end: item?.bucket_end ?? null,
    query_total: Number(item?.query_total ?? 0),
    success: Number(item?.success ?? 0),
    failed: Number(item?.failed ?? 0),
    rejected: Number(item?.rejected ?? 0),
    timeout: Number(item?.timeout ?? 0),
    success_rate: item?.success_rate == null ? null : Number(item.success_rate),
    queue_wait_p95_ms: item?.queue_wait_p95_ms == null ? null : Number(item.queue_wait_p95_ms),
    execute_p95_ms: item?.execute_p95_ms == null ? null : Number(item.execute_p95_ms),
    pending_max: item?.pending_max == null ? null : Number(item.pending_max),
    spool_bytes_delta: item?.spool_bytes_delta == null ? null : Number(item.spool_bytes_delta),
  }
}

function normalizeGatewayBreakdowns(value: unknown): Record<string, GatewayBreakdownItem[]> {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return Object.fromEntries(Object.entries(source).map(([key, rows]) => [
    key,
    Array.isArray(rows)
      ? rows.map((row) => {
        const item = row && typeof row === 'object' ? row as Partial<GatewayBreakdownItem> : {}
        return { key: String(item.key ?? ''), count: Number(item.count ?? 0) }
      }).filter((row) => row.key)
      : [],
  ]))
}

function normalizeGatewayContractCompleteness(
  data: Partial<GatewayContractCompleteness> | undefined | null,
): GatewayContractCompleteness {
  return {
    total: Number(data?.total ?? 0),
    platform_governed_count: Number(data?.platform_governed_count ?? 0),
    gateway_only_count: Number(data?.gateway_only_count ?? 0),
    legacy_actor_count: Number(data?.legacy_actor_count ?? 0),
    principal_present_rate: Number(data?.principal_present_rate ?? 100),
    actor_present_rate: Number(data?.actor_present_rate ?? 100),
    policy_decision_present_rate: Number(data?.policy_decision_present_rate ?? 100),
    data_level_present_rate: Number(data?.data_level_present_rate ?? 100),
    execution_profile_present_rate: Number(data?.execution_profile_present_rate ?? 100),
    credential_ref_present_rate: Number(data?.credential_ref_present_rate ?? 100),
  }
}

export async function getGatewayObservability(params: {
  window?: string
  bucket?: string
  limit?: number
} = {}): Promise<GatewayObservabilitySnapshot> {
  const res = await apiClient.get<Envelope<GatewayObservabilitySnapshot>>(
    '/governance/gateway/observability',
    { params },
  )
  const data = res.data.data
  const queryRuns = Array.isArray(data?.query_runs?.items) ? data.query_runs.items : []
  return {
    window: data?.window ?? params.window ?? '24h',
    bucket: data?.bucket ?? params.bucket ?? '1h',
    since: data?.since ?? null,
    until: data?.until ?? null,
    generated_at: data?.generated_at ?? null,
    metric_version: data?.metric_version ?? null,
    source: data?.source ?? null,
    is_partial: Boolean(data?.is_partial),
    summary: normalizeGatewayTelemetrySummary(data?.summary),
    overview: data?.overview ?? {},
    timeseries: {
      bucket: data?.timeseries?.bucket ?? params.bucket ?? '1h',
      points: Array.isArray(data?.timeseries?.points)
        ? data.timeseries.points.map(normalizeGatewayTimeseriesPoint)
        : [],
    },
    breakdowns: normalizeGatewayBreakdowns(data?.breakdowns),
    contract_completeness: normalizeGatewayContractCompleteness(data?.contract_completeness),
    result_export_storage: data?.result_export_storage ?? {},
    security: data?.security ?? {},
    workers: data?.workers ?? {},
    query_runs: {
      items: queryRuns,
      total: Number(data?.query_runs?.total ?? queryRuns.length),
    },
    readiness: data?.readiness ?? undefined,
    alerts: data?.alerts ?? undefined,
  }
}
