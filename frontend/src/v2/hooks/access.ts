// frontend/src/v2/hooks/access.ts
//
// 统一身份与权限基础 hooks。

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from './query-client'
import {
  createApiKey,
  createDataPolicy,
  createExecutionProfile,
  createServicePrincipal,
  getAccessPermissionPackages,
  getAccessPrincipal,
  getAccessRoleCatalog,
  getGatewayTelemetrySummary,
  getServicePrincipal,
  listGatewayQueryRuns,
  listAccessPrincipals,
  listDataPolicies,
  listExecutionProfiles,
  listPolicyDecisions,
  listServicePrincipals,
  putAccessPrincipalPermissionPackages,
  putAccessPrincipalRoleBindings,
  resolvePrincipalDisplayNames,
  revokeApiKey,
  rotateApiKey,
  updateDataPolicy,
  updateExecutionProfile,
  type AccessDataPolicy,
  type AccessExecutionProfile,
  type CreateApiKeyPayload,
  type CreateServicePrincipalPayload,
  type ListPrincipalsParams,
} from '../api/access'

export function useAccessRoleCatalog() {
  return useQuery({
    queryKey: qk('access', 'role-catalog'),
    queryFn: getAccessRoleCatalog,
    staleTime: 5 * 60 * 1000,
  })
}

export function useGatewayTelemetrySummary() {
  return useQuery({
    queryKey: qk('access', 'gateway', 'summary'),
    queryFn: getGatewayTelemetrySummary,
  })
}

export function useGatewayQueryRuns(params: { limit?: number } = {}) {
  return useQuery({
    queryKey: qk('access', 'gateway', 'query-runs', params),
    queryFn: () => listGatewayQueryRuns(params),
  })
}

export function useAccessPermissionPackages() {
  return useQuery({
    queryKey: qk('access', 'permission-packages'),
    queryFn: getAccessPermissionPackages,
    staleTime: 5 * 60 * 1000,
  })
}

export function useAccessPrincipals(params: ListPrincipalsParams = {}) {
  return useQuery({
    queryKey: qk('access', 'principals', params),
    queryFn: () => listAccessPrincipals(params),
  })
}

export function useAccessPrincipal(principalId: string | null) {
  return useQuery({
    queryKey: qk('access', 'principal', principalId),
    queryFn: () => getAccessPrincipal(principalId as string),
    enabled: Boolean(principalId),
  })
}

export function usePrincipalDisplayNames(principalIds: string[]) {
  const uniqueIds = Array.from(new Set(principalIds.map((id) => id.trim()).filter(Boolean)))
  return useQuery({
    queryKey: qk('access', 'principal-display-names', uniqueIds),
    queryFn: () => resolvePrincipalDisplayNames(uniqueIds),
    enabled: uniqueIds.length > 0,
    staleTime: 5 * 60 * 1000,
  })
}

export function useUpdateAccessRoleBindings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      principalId,
      bindings,
    }: {
      principalId: string
      bindings: Array<{ role_code: string; role_type: 'platform' | 'data'; source: string; status: string }>
    }) => putAccessPrincipalRoleBindings(principalId, bindings),
    onSuccess: (_data, { principalId }) => {
      qc.invalidateQueries({ queryKey: ['access'] })
      qc.invalidateQueries({ queryKey: qk('access', 'principal', principalId) })
    },
  })
}

export function useUpdateAccessPermissionPackages() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      principalId,
      packageCodes,
    }: {
      principalId: string
      packageCodes: string[]
    }) => putAccessPrincipalPermissionPackages(principalId, packageCodes),
    onSuccess: (_data, { principalId }) => {
      qc.invalidateQueries({ queryKey: ['access'] })
      qc.invalidateQueries({ queryKey: qk('access', 'principal', principalId) })
    },
  })
}

export function useServicePrincipals() {
  return useQuery({
    queryKey: qk('access', 'service-principals'),
    queryFn: listServicePrincipals,
  })
}

export function useServicePrincipal(principalId: string | null) {
  return useQuery({
    queryKey: qk('access', 'service-principal', principalId),
    queryFn: () => getServicePrincipal(principalId as string),
    enabled: Boolean(principalId),
  })
}

export function useCreateServicePrincipal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateServicePrincipalPayload) => createServicePrincipal(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['access'] })
    },
  })
}

export function useCreateApiKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ principalId, payload }: { principalId: string; payload: CreateApiKeyPayload }) =>
      createApiKey(principalId, payload),
    onSuccess: (_data, { principalId }) => {
      qc.invalidateQueries({ queryKey: ['access'] })
      qc.invalidateQueries({ queryKey: qk('access', 'service-principal', principalId) })
    },
  })
}

export function useRotateApiKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: rotateApiKey,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['access'] })
    },
  })
}

export function useRevokeApiKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: revokeApiKey,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['access'] })
    },
  })
}

export function useDataPolicies(params: { status?: string; data_level?: string; q?: string } = {}) {
  return useQuery({
    queryKey: qk('access', 'data-policies', params),
    queryFn: () => listDataPolicies(params),
  })
}

export function useCreateDataPolicy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createDataPolicy,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['access'] })
    },
  })
}

export function useUpdateDataPolicy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ policyCode, payload }: { policyCode: string; payload: Partial<AccessDataPolicy> }) =>
      updateDataPolicy(policyCode, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['access'] })
    },
  })
}

export function useExecutionProfiles(params: { status?: string; data_level?: string } = {}) {
  return useQuery({
    queryKey: qk('access', 'execution-profiles', params),
    queryFn: () => listExecutionProfiles(params),
  })
}

export function useCreateExecutionProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createExecutionProfile,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['access'] })
    },
  })
}

export function useUpdateExecutionProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ profileCode, payload }: { profileCode: string; payload: Partial<AccessExecutionProfile> }) =>
      updateExecutionProfile(profileCode, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['access'] })
    },
  })
}

export function usePolicyDecisions(params: {
  principal_id?: string
  decision?: string
  data_level?: string
  policy_code?: string
  limit?: number
} = {}) {
  return useQuery({
    queryKey: qk('access', 'policy-decisions', params),
    queryFn: () => listPolicyDecisions(params),
  })
}
