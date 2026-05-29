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
  by_data_level: Record<string, number>
  queued_count: number
  running_count: number
  pending_count: number
  avg_queue_wait_ms: number
  max_current_queue_wait_ms: number
  avg_execute_ms: number
  remote_timeout_count: number
  client_wait_timeout_count: number
  timeout_count: number
  rejected_count: number
  export_request_count: number
  export_success_count: number
  export_failure_count: number
  publish_conflict_count: number
  result_object_count: number
  spool_object_count: number
  spool_result_total_bytes: number
  generated_at: string | null
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
  actor_type?: string | null
  actor_id?: string | null
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

export async function putAccessPrincipalRoleBindings(
  principalId: string,
  bindings: Array<Pick<AccessRoleBinding, 'role_code' | 'role_type' | 'source' | 'status'>>,
): Promise<AccessRoleBinding[]> {
  const res = await apiClient.put<Envelope<AccessRoleBinding[]>>(
    `/access/principals/${encodeURIComponent(principalId)}/role-bindings`,
    { bindings },
  )
  return res.data.data
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
  return res.data.data
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

export async function getGatewayTelemetrySummary(): Promise<GatewayTelemetrySummary> {
  const res = await apiClient.get<Envelope<GatewayTelemetrySummary>>('/governance/gateway/summary')
  const data = res.data.data
  return {
    query_count: Number(data?.query_count ?? 0),
    success_count: Number(data?.success_count ?? 0),
    failed_count: Number(data?.failed_count ?? 0),
    physical_denied_count: Number(data?.physical_denied_count ?? 0),
    stability: Number(data?.stability ?? 100),
    by_data_level: data?.by_data_level ?? {},
    queued_count: Number(data?.queued_count ?? 0),
    running_count: Number(data?.running_count ?? 0),
    pending_count: Number(data?.pending_count ?? 0),
    avg_queue_wait_ms: Number(data?.avg_queue_wait_ms ?? 0),
    max_current_queue_wait_ms: Number(data?.max_current_queue_wait_ms ?? 0),
    avg_execute_ms: Number(data?.avg_execute_ms ?? 0),
    remote_timeout_count: Number(data?.remote_timeout_count ?? 0),
    client_wait_timeout_count: Number(data?.client_wait_timeout_count ?? 0),
    timeout_count: Number(data?.timeout_count ?? 0),
    rejected_count: Number(data?.rejected_count ?? 0),
    export_request_count: Number(data?.export_request_count ?? 0),
    export_success_count: Number(data?.export_success_count ?? 0),
    export_failure_count: Number(data?.export_failure_count ?? 0),
    publish_conflict_count: Number(data?.publish_conflict_count ?? 0),
    result_object_count: Number(data?.result_object_count ?? 0),
    spool_object_count: Number(data?.spool_object_count ?? 0),
    spool_result_total_bytes: Number(data?.spool_result_total_bytes ?? 0),
    generated_at: data?.generated_at ?? null,
  }
}

export async function getGatewayRuntimeAlerts(): Promise<GatewayRuntimeAlerts> {
  const res = await apiClient.get<Envelope<GatewayRuntimeAlerts>>('/governance/gateway/alerts')
  const data = res.data.data
  return {
    status: data?.status ?? 'healthy',
    alerts: Array.isArray(data?.alerts) ? data.alerts : [],
    thresholds: data?.thresholds ?? {},
    readiness: data?.readiness ?? {},
    summary: data?.summary ?? {},
    evaluated_at: data?.evaluated_at ?? null,
  }
}

export async function listGatewayQueryRuns(params: { limit?: number } = {}): Promise<{
  items: GatewayQueryRun[]
}> {
  const res = await apiClient.get<Envelope<{ items: GatewayQueryRun[] }>>(
    '/governance/gateway/query-runs',
    { params },
  )
  const data = res.data.data
  return { items: Array.isArray(data?.items) ? data.items : [] }
}
