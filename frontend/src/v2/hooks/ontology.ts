// frontend/src/v2/hooks/ontology.ts
//
// React-Query hooks for the Ontology domain.
// Query key 规范：qk('ontology', action, ...args)
// Mutation 必须 invalidateQueries。
//
// 后端契约：app/interfaces/api/v1/ontology.py

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@v2/hooks/query-client'
import { ev, obs } from '@v2/observability'
import {
  createAction,
  createGlossary,
  createMetric,
  createObject,
  createPolicy,
  createProperty,
  createRelation,
  updateObject,
  getAction,
  getEntityHistory,
  getEntityImpact,
  getMetric,
  getMetricLinks,
  getObject,
  getPolicy,
  getPolicyAudit,
  getPolicyImpact,
  getProperty,
  getRelation,
  getWorkbenchGovernance,
  getWorkbenchObjectOverview,
  getWorkbenchObjects,
  listActions,
  listGlossary,
  listMetrics,
  listObjects,
  listPolicies,
  listProperties,
  listRelations,
  publishEntity,
  type BusinessAction,
  type BusinessMetric,
  type BusinessObject,
  type BusinessProperty,
  type BusinessRelation,
  type GlossaryEntry,
  type OntologyEntityType,
  type PolicyMetadata,
} from '@v2/api/ontology'

// ─── Workbench ───────────────────────────────────────────────────────────────

export function useWorkbenchObjects() {
  return useQuery({
    queryKey: qk('ontology', 'workbench-objects'),
    queryFn: getWorkbenchObjects,
    staleTime: 30_000,
  })
}

export function useWorkbenchObjectOverview(name: string | undefined) {
  return useQuery({
    queryKey: qk('ontology', 'workbench-object-overview', name),
    queryFn: () => getWorkbenchObjectOverview(name!),
    enabled: !!name,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

export function useWorkbenchGovernance() {
  return useQuery({
    queryKey: qk('ontology', 'workbench-governance'),
    queryFn: getWorkbenchGovernance,
    staleTime: 30_000,
  })
}

// ─── Objects ─────────────────────────────────────────────────────────────────

export function useObjectList() {
  return useQuery({
    queryKey: qk('ontology', 'object-list'),
    queryFn: listObjects,
    staleTime: 30_000,
  })
}

export function useObjectDetail(name: string | undefined) {
  return useQuery({
    queryKey: qk('ontology', 'object-detail', name),
    queryFn: () => getObject(name!),
    enabled: !!name,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

export function useCreateObject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<BusinessObject>) => createObject(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ontology'] })
    },
  })
}

// Round 4 · R-001-P04 — 幂等 upsert 编辑。
// mutationFn 形参刻意保持 { name, body, changedFields } 分开：
//   · name 用于在 optimistic update 时做 cache 置换；
//   · changedFields 用于埋点 `ontology.object_edited`，由调用方比对 dirty 字段传入；
//   · invalidate 按 object-detail/workbench/entity-history 全粒度冲。
export function useUpdateObject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      name,
      body,
    }: {
      name: string
      body: Partial<BusinessObject>
      changedFields?: readonly string[]
    }) => updateObject(name, body),
    onSuccess: (_data, { name, changedFields }) => {
      obs.track(ev.objectEdited(name, changedFields ?? []))
      qc.invalidateQueries({ queryKey: ['ontology'] })
    },
  })
}

// ─── Properties ──────────────────────────────────────────────────────────────

export function usePropertyList() {
  return useQuery({
    queryKey: qk('ontology', 'property-list'),
    queryFn: listProperties,
    staleTime: 30_000,
  })
}

export function usePropertyDetail(name: string | undefined) {
  return useQuery({
    queryKey: qk('ontology', 'property-detail', name),
    queryFn: () => getProperty(name!),
    enabled: !!name,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

export function useCreateProperty() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<BusinessProperty>) => createProperty(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ontology'] })
    },
  })
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

export function useMetricList() {
  return useQuery({
    queryKey: qk('ontology', 'metric-list'),
    queryFn: listMetrics,
    staleTime: 30_000,
  })
}

export function useMetricDetail(name: string | undefined) {
  return useQuery({
    queryKey: qk('ontology', 'metric-detail', name),
    queryFn: () => getMetric(name!),
    enabled: !!name,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

export function useMetricLinks(name: string | undefined) {
  return useQuery({
    queryKey: qk('ontology', 'metric-links', name),
    queryFn: () => getMetricLinks(name!),
    enabled: !!name,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

export function useCreateMetric() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<BusinessMetric>) => createMetric(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ontology'] })
    },
  })
}

// ─── Relations ───────────────────────────────────────────────────────────────

export function useRelationList() {
  return useQuery({
    queryKey: qk('ontology', 'relation-list'),
    queryFn: listRelations,
    staleTime: 30_000,
  })
}

export function useRelationDetail(name: string | undefined) {
  return useQuery({
    queryKey: qk('ontology', 'relation-detail', name),
    queryFn: () => getRelation(name!),
    enabled: !!name,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

export function useCreateRelation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<BusinessRelation>) => createRelation(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ontology'] })
    },
  })
}

// ─── Actions ─────────────────────────────────────────────────────────────────

export function useActionList() {
  return useQuery({
    queryKey: qk('ontology', 'action-list'),
    queryFn: listActions,
    staleTime: 30_000,
  })
}

export function useActionDetail(name: string | undefined) {
  return useQuery({
    queryKey: qk('ontology', 'action-detail', name),
    queryFn: () => getAction(name!),
    enabled: !!name,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

export function useCreateAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<BusinessAction>) => createAction(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ontology'] })
    },
  })
}

// ─── Policies ────────────────────────────────────────────────────────────────

export function usePolicyList() {
  return useQuery({
    queryKey: qk('ontology', 'policy-list'),
    queryFn: listPolicies,
    staleTime: 30_000,
  })
}

export function usePolicyDetail(name: string | undefined) {
  return useQuery({
    queryKey: qk('ontology', 'policy-detail', name),
    queryFn: () => getPolicy(name!),
    enabled: !!name,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

export function usePolicyImpact(name: string | undefined) {
  return useQuery({
    queryKey: qk('ontology', 'policy-impact', name),
    queryFn: () => getPolicyImpact(name!),
    enabled: !!name,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

export function usePolicyAudit(
  name: string | undefined,
  params?: { target_type?: string; target_name?: string; decision?: string },
) {
  return useQuery({
    queryKey: qk('ontology', 'policy-audit', name, params),
    queryFn: () => getPolicyAudit(name!, params),
    enabled: !!name,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

export function useCreatePolicy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<PolicyMetadata>) => createPolicy(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ontology'] })
    },
  })
}

// ─── Glossary ────────────────────────────────────────────────────────────────

export function useGlossaryList() {
  return useQuery({
    queryKey: qk('ontology', 'glossary-list'),
    queryFn: listGlossary,
    staleTime: 30_000,
  })
}

export function useCreateGlossary() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<GlossaryEntry>) => createGlossary(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ontology'] })
    },
  })
}

// ─── Publish / Impact / History ──────────────────────────────────────────────

export function usePublishEntity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ entityType, entityName }: { entityType: OntologyEntityType; entityName: string }) =>
      publishEntity(entityType, entityName),
    onSuccess: (_data, { entityType, entityName }) => {
      // 发布前后端会执行 impact 校验；视为对象/实体校验通过事件
      obs.track(ev.objectValidated(entityType, entityName))
      qc.invalidateQueries({ queryKey: ['ontology'] })
    },
  })
}

export function useEntityImpact(entityType: OntologyEntityType, name: string | undefined) {
  return useQuery({
    queryKey: qk('ontology', 'entity-impact', entityType, name),
    queryFn: () => getEntityImpact(entityType, name!),
    enabled: !!name,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

export function useEntityHistory(entityType: OntologyEntityType, name: string | undefined) {
  return useQuery({
    queryKey: qk('ontology', 'entity-history', entityType, name),
    queryFn: () => getEntityHistory(entityType, name!),
    enabled: !!name,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}
