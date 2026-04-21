// frontend/src/v2/api/ontology.ts
//
// Ontology 域 API 层。所有 v2/pages/semantic/ontology/** 页面经由此文件访问后端，
// 禁止页面层直接调用 axios。
//
// 后端契约：app/interfaces/api/v1/ontology.py

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

const post = <T>(url: string, body?: unknown): Promise<T> =>
  apiClient.post<Envelope<T>>(url, body).then((r) => r.data.data)

// ─── 业务对象 (Objects) ─────────────────────────────────────────────────────

export interface BusinessObject {
  name: string
  title: string
  description?: string | null
  aliases?: string[]
  status?: string
}

export interface BusinessProperty {
  name: string
  title: string
  object_name: string
  property_type: string
  description?: string | null
  aliases?: string[]
  status?: string
}

export interface BusinessMetric {
  name: string
  title: string
  object_name: string
  semantic_formula?: string
  description?: string | null
  semantic_labels?: string[]
  measure_refs?: string[]
  aliases?: string[]
  status?: string
}

export interface BusinessRelation {
  name: string
  title: string
  source_object_name: string
  target_object_name: string
  relation_type?: string
  description?: string | null
  aliases?: string[]
  status?: string
}

export interface BusinessAction {
  name: string
  title: string
  object_name: string
  trigger_time_property?: string | null
  description?: string | null
  event_cube_refs?: string[]
  aliases?: string[]
  status?: string
}

export interface PolicyMetadata {
  name: string
  target_type: string
  target_name: string
  visibility?: string
  allowed_roles?: string[]
  description?: string | null
  status?: string
}

export interface GlossaryEntry {
  canonical_name: string
  title?: string
  entry_type?: string
  description?: string | null
  aliases?: string[]
  status?: string
}

export interface OntologyListResponse<T> {
  items: T[]
  total: number
}

// ─── Workbench 类型 ─────────────────────────────────────────────────────────

export interface OntologyWorkbenchObjectStats {
  property_count: number
  metric_count: number
  relation_count: number
  action_count: number
  rule_count: number
}

export interface OntologyHistoryEvent {
  id?: string
  entity_type?: string
  entity_name?: string
  action: string
  status?: string
  summary?: string
  timestamp: string
  validation?: Record<string, unknown>
}

export interface OntologyWorkbenchObjectSummary extends BusinessObject {
  stats: OntologyWorkbenchObjectStats
  risk_summary: {
    stale_count: number
    consistency_count: number
  }
  last_activity: OntologyHistoryEvent | null
}

export interface OntologyWorkbenchObjectListResponse {
  items: OntologyWorkbenchObjectSummary[]
  total: number
}

export interface OntologyWorkbenchObjectOverview {
  object: BusinessObject
  stats: OntologyWorkbenchObjectStats
  capabilities: {
    properties: BusinessProperty[]
    actions: BusinessAction[]
  }
  associations: {
    metrics: BusinessMetric[]
    relations: BusinessRelation[]
    rules: PolicyMetadata[]
  }
  governance: {
    stale_items: Array<Record<string, unknown>>
    consistency_items: Array<Record<string, unknown>>
    audit_total: number
    recent_audits: Array<Record<string, unknown>>
  }
  lifecycle: {
    history_items: OntologyHistoryEvent[]
    history_total: number
    last_activity: OntologyHistoryEvent | null
  }
}

export interface OntologyWorkbenchGovernanceItem extends PolicyMetadata {
  issue_count: number
  issues: string[]
  projection_status: string
  audit_total: number
  last_audit: Record<string, unknown> | null
}

export interface OntologyWorkbenchGovernanceSummary {
  summary: {
    policy_total: number
    stale_count: number
    consistency_count: number
    audit_total: number
  }
  items: OntologyWorkbenchGovernanceItem[]
  stale_items: Array<Record<string, unknown>>
  consistency_items: Array<Record<string, unknown>>
  recent_audits: Array<Record<string, unknown>>
}

// ─── 发布 / 影响 / 历史 ────────────────────────────────────────────────────

export interface PublishValidation {
  entity_type: string
  entity_name: string
  preview_status?: string
  issues: string[]
}

export interface PublishResult {
  entity: Record<string, unknown>
  validation: PublishValidation
}

export interface EntityImpact {
  entity_type: string
  entity_name: string
  projection?: Record<string, unknown>
  consistency?: Record<string, unknown>
  traceability?: Record<string, unknown>
}

// ─── Workbench API ──────────────────────────────────────────────────────────

export const getWorkbenchObjects = () =>
  get<OntologyWorkbenchObjectListResponse>('/ontology/workbench/objects')

export const getWorkbenchObjectOverview = (name: string) =>
  get<OntologyWorkbenchObjectOverview>(`/ontology/workbench/objects/${name}/overview`)

export const getWorkbenchGovernance = () =>
  get<OntologyWorkbenchGovernanceSummary>('/ontology/workbench/governance')

// ─── Objects API ────────────────────────────────────────────────────────────

export const listObjects = () =>
  get<OntologyListResponse<BusinessObject>>('/ontology/objects')

export const getObject = (name: string) =>
  get<BusinessObject>(`/ontology/objects/${name}`)

export const createObject = (body: Partial<BusinessObject>) =>
  post<BusinessObject>('/ontology/objects', body)

// ─── Properties API ─────────────────────────────────────────────────────────

export const listProperties = () =>
  get<OntologyListResponse<BusinessProperty>>('/ontology/properties')

export const getProperty = (name: string) =>
  get<BusinessProperty>(`/ontology/properties/${name}`)

export const createProperty = (body: Partial<BusinessProperty>) =>
  post<BusinessProperty>('/ontology/properties', body)

// ─── Metrics API ─────────────────────────────────────────────────────────────

export const listMetrics = () =>
  get<OntologyListResponse<BusinessMetric>>('/ontology/metrics')

export const getMetric = (name: string) =>
  get<BusinessMetric>(`/ontology/metrics/${name}`)

export const getMetricLinks = (name: string) =>
  get<Record<string, unknown>>(`/ontology/metrics/${name}/links`)

export const createMetric = (body: Partial<BusinessMetric>) =>
  post<BusinessMetric>('/ontology/metrics', body)

// ─── Relations API ───────────────────────────────────────────────────────────

export const listRelations = () =>
  get<OntologyListResponse<BusinessRelation>>('/ontology/relations')

export const getRelation = (name: string) =>
  get<BusinessRelation>(`/ontology/relations/${name}`)

export const createRelation = (body: Partial<BusinessRelation>) =>
  post<BusinessRelation>('/ontology/relations', body)

// ─── Actions API ─────────────────────────────────────────────────────────────

export const listActions = () =>
  get<OntologyListResponse<BusinessAction>>('/ontology/actions')

export const getAction = (name: string) =>
  get<BusinessAction>(`/ontology/actions/${name}`)

export const createAction = (body: Partial<BusinessAction>) =>
  post<BusinessAction>('/ontology/actions', body)

// ─── Policies API ─────────────────────────────────────────────────────────────

export const listPolicies = () =>
  get<OntologyListResponse<PolicyMetadata>>('/ontology/policies')

export const getPolicy = (name: string) =>
  get<PolicyMetadata>(`/ontology/policies/${name}`)

export const getPolicyImpact = (name: string) =>
  get<Record<string, unknown>>(`/ontology/policies/${name}/impact`)

export const getPolicyAudit = (name: string, params?: { target_type?: string; target_name?: string; decision?: string }) =>
  get<{ policy_name: string; items: unknown[]; total: number }>(
    `/ontology/policies/${name}/audit`,
    params as Record<string, unknown>,
  )

export const createPolicy = (body: Partial<PolicyMetadata>) =>
  post<PolicyMetadata>('/ontology/policies', body)

// ─── Glossary API ─────────────────────────────────────────────────────────────

export const listGlossary = () =>
  get<OntologyListResponse<GlossaryEntry>>('/ontology/glossary')

export const createGlossary = (body: Partial<GlossaryEntry>) =>
  post<GlossaryEntry>('/ontology/glossary', body)

// ─── 发布 / 影响 / 历史 ────────────────────────────────────────────────────

export type OntologyEntityType =
  | 'objects'
  | 'metrics'
  | 'relations'
  | 'properties'
  | 'actions'
  | 'glossary'
  | 'policies'

export const publishEntity = (entityType: OntologyEntityType, entityName: string) =>
  post<PublishResult>(`/ontology/${entityType}/${entityName}/publish`)

export const getEntityImpact = (entityType: OntologyEntityType, entityName: string) =>
  get<EntityImpact>(`/ontology/${entityType}/${entityName}/impact`)

export const getEntityHistory = (entityType: OntologyEntityType, entityName: string) =>
  get<OntologyHistoryEvent[]>(`/ontology/${entityType}/${entityName}/history`)
