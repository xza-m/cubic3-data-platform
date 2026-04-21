import apiClient from './client'

export interface BusinessObject {
  name: string
  title: string
  description?: string | null
  aliases: string[]
  status: 'draft' | 'active' | 'deprecated' | string
}

export interface BusinessProperty {
  name: string
  title: string
  object_name: string
  property_type: 'string' | 'number' | 'time' | 'boolean' | 'enum' | 'unknown' | string
  description?: string | null
  aliases: string[]
  status: 'draft' | 'active' | 'deprecated' | string
}

export interface BusinessMetric {
  name: string
  title: string
  object_name: string
  semantic_formula: string
  description?: string | null
  semantic_labels: string[]
  measure_refs: string[]
  aliases: string[]
  status: 'draft' | 'active' | 'deprecated' | string
}

export interface BusinessRelation {
  name: string
  title: string
  source_object_name: string
  target_object_name: string
  relation_type: 'owns' | 'submits' | 'belongs_to' | 'linked_to' | 'custom' | string
  description?: string | null
  aliases: string[]
  status: 'draft' | 'active' | 'deprecated' | string
}

export interface BusinessAction {
  name: string
  title: string
  object_name: string
  trigger_time_property?: string | null
  description?: string | null
  event_cube_refs: string[]
  aliases: string[]
  status: 'draft' | 'active' | 'deprecated' | string
}

export interface GlossaryEntry {
  term: string
  canonical_name: string
  entry_type: 'object' | 'property' | 'metric' | 'action' | 'relation' | 'term' | string
  aliases: string[]
  description?: string | null
  status?: 'draft' | 'active' | 'deprecated' | string
}

export interface PolicyMetadata {
  name: string
  target_type: 'object' | 'property' | 'metric' | 'action' | string
  target_name: string
  visibility: 'public' | 'restricted' | 'private' | string
  allowed_roles: string[]
  description?: string | null
  status?: 'draft' | 'active' | 'deprecated' | string
}

export interface PolicyImpactResponse {
  target_type: string
  target_name: string
  visibility: string
  allowed_roles: string[]
  projection_status: string
  linked_entity_count: number
  analysis_links: {
    cubes: Array<Record<string, unknown>>
    measures: Array<Record<string, unknown>>
    join_paths: Array<Record<string, unknown>>
    event_cubes: Array<Record<string, unknown>>
  }
  governance_hooks: Array<{
    hook: string
    status: string
    effect: string
  }>
  issues: string[]
}

export interface OntologyListResponse<T> {
  items: T[]
  total: number
}

export interface MapperPreviewTarget {
  target_type: string
  target_name: string
  title?: string
  score?: number
  match_reason?: string
  cube_name?: string
  measure_title?: string
}

export interface MapperPreviewResponse {
  entity: Record<string, unknown>
  projection: {
    targets: MapperPreviewTarget[]
  }
  consistency: {
    status: 'ok' | 'warning' | 'stale' | string
    issues: string[]
  }
}

export interface MapperConsistencyReport {
  summary: Record<string, unknown>
  items: Array<Record<string, unknown>>
}

export interface MetricLinksResponse {
  metric_name: string
  metric_title: string
  object_name: string
  semantic_formula: string
  linked_measures: Array<Record<string, unknown>>
  linked_cubes: Array<Record<string, unknown>>
  consistency: {
    status: string
    issues: string[]
  }
}

export interface MeasureBacklinksResponse {
  measure_ref: string
  cube_name: string
  measure_name: string
  measure_title?: string
  cube_title?: string
  linked_metrics: Array<Record<string, unknown>>
  status: string
}

export interface CubeBacklinksResponse {
  cube_name: string
  cube_title?: string
  linked_objects: Array<Record<string, unknown>>
  linked_metrics: Array<Record<string, unknown>>
  status: string
}

export interface ExecutionCompilePreview {
  status: 'ready' | 'blocked' | string
  target_type: 'sql' | 'retrieval' | 'tool' | string
  pseudo_sql?: string
  reason?: string
  bindings: Record<string, unknown>
  traceability?: Record<string, unknown>
  policy?: Record<string, unknown>
}

export interface ExecutionPlanPreview {
  metric_name?: string
  target_type: 'sql' | 'retrieval' | 'tool' | string
  status?: 'ready' | 'blocked' | string
  steps: Array<{
    step_type: string
    title: string
    status: string
    details?: Record<string, unknown>
  }>
  bindings?: Record<string, unknown>
  traceability?: Record<string, unknown>
}

export interface ExecutionTargetPreview {
  target_type: 'sql' | 'retrieval' | 'tool' | string
  target_name?: string
  compile_preview?: Record<string, unknown>
}

export interface ExecutionExecuteResponse {
  status: 'executed' | 'blocked' | 'not_configured' | string
  target_type: 'sql' | 'retrieval' | 'tool' | string
  reason?: string
  result?: Record<string, unknown>
  bindings?: Record<string, unknown>
  traceability?: Record<string, unknown>
  policy?: Record<string, unknown>
  governance_trace?: Record<string, unknown>
  audit_trace_id?: string | null
}

export interface SemanticRoutePreview {
  question: string
  route_type: 'cube' | 'knowledge' | 'hybrid' | 'tool' | 'blocked' | string
  planning_mode?: 'single_step' | 'multi_step' | string
  targets: string[]
  matched: Record<string, unknown>
  primary_match?: Record<string, unknown>
  matched_entities?: Array<Record<string, unknown>>
  execution_preview?: Record<string, unknown> | null
  projection_preview?: Record<string, unknown> | null
  policy?: Record<string, unknown>
  traceability?: Record<string, unknown>
  reason?: string
}

export interface SemanticPlanPreview {
  question: string
  planning_mode?: 'single_step' | 'multi_step' | string
  route: SemanticRoutePreview
  dependencies?: Array<{
    step_key: string
    depends_on: string[]
  }>
  expected_outputs?: Array<{
    output_key: string
    source_step: string
  }>
  steps: Array<{
    step_key?: string
    step_type: string
    title: string
    status: string
    dependencies?: string[]
    expected_output?: string
    details: Record<string, unknown>
  }>
  traceability?: Record<string, unknown>
  execution_targets?: Array<Record<string, unknown>>
}

export interface SemanticExecutePlanPreview {
  question: string
  route: SemanticRoutePreview
  plan: SemanticPlanPreview
  dependencies?: Array<{
    step_key: string
    depends_on: string[]
  }>
  expected_outputs?: Array<{
    output_key: string
    source_step: string
  }>
  execution_targets: ExecutionTargetPreview[]
  traceability?: Record<string, unknown>
}

export interface SemanticExecutePlanResult {
  question: string
  planning_mode?: 'single_step' | 'multi_step' | string
  route: SemanticRoutePreview
  plan: SemanticPlanPreview
  dependencies?: Array<{
    step_key: string
    depends_on: string[]
  }>
  expected_outputs?: Array<{
    output_key: string
    source_step: string
  }>
  execution_targets: Array<Record<string, unknown>>
  execution_results: ExecutionExecuteResponse[]
  execution_summary?: {
    total: number
    executed: number
    blocked: number
    not_configured: number
  }
  traceability?: Record<string, unknown>
}

export interface OntologyHistoryEvent {
  id: string
  entity_type: string
  entity_name: string
  action: string
  status: string
  summary: string
  validation?: Record<string, unknown>
  timestamp: string
}

export interface OntologyHistoryResponse {
  entity_type: string
  entity_name: string
  items: OntologyHistoryEvent[]
  total: number
}

export interface OntologyEntityImpactResponse {
  entity_type: string
  entity_name: string
  projection?: Record<string, unknown>
  consistency?: {
    status?: string
    issues?: string[]
  }
  traceability?: Record<string, unknown>
  visibility?: string
  allowed_roles?: string[]
  projection_status?: string
  linked_entity_count?: number
  analysis_links?: Record<string, unknown>
  governance_hooks?: Array<Record<string, unknown>>
  issues?: string[]
}

export interface OntologyPublishResponse {
  entity: Record<string, unknown>
  validation: Record<string, unknown>
}

export interface GovernanceAuditTrace {
  id: string
  target_type: string
  target_name: string
  viewer_roles: string[]
  route_type: string
  execution_target: string
  decision: string
  policy?: string | null
  traceability?: Record<string, unknown>
  reason?: string | null
  timestamp: string
}

export interface PolicyAuditResponse {
  policy_name: string
  items: GovernanceAuditTrace[]
  total: number
}

export interface GovernanceAuditFilters {
  target_type?: string
  target_name?: string
  decision?: string
  route_type?: string
}

export interface OntologyTemplateItemSummary {
  objects: number
  properties: number
  metrics: number
  relations: number
  actions: number
  glossary: number
  policies: number
}

export interface OntologyTemplateItems {
  objects: BusinessObject[]
  properties: BusinessProperty[]
  metrics: BusinessMetric[]
  relations: BusinessRelation[]
  actions: BusinessAction[]
  glossary: GlossaryEntry[]
  policies: PolicyMetadata[]
}

export interface OntologyTemplateResponse {
  name: string
  title: string
  description: string
  summary: OntologyTemplateItemSummary
  items: OntologyTemplateItems
}

export interface OntologyTemplateApplyResponse {
  template: string
  title: string
  created: Record<string, string[]>
  skipped: Record<string, string[]>
  summary: {
    created: number
    skipped: number
  }
}

export interface OntologyWorkbenchObjectSummaryDto extends BusinessObject {
  stats: {
    property_count: number
    metric_count: number
    relation_count: number
    action_count: number
    rule_count: number
  }
  risk_summary: {
    stale_count: number
    consistency_count: number
  }
  last_activity: OntologyHistoryEvent | null
}

export interface OntologyWorkbenchObjectListResponse {
  items: OntologyWorkbenchObjectSummaryDto[]
  total: number
}

export interface OntologyWorkbenchObjectOverviewResponse {
  object: BusinessObject
  stats: {
    property_count: number
    metric_count: number
    relation_count: number
    action_count: number
    rule_count: number
  }
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
    recent_audits: GovernanceAuditTrace[]
  }
  lifecycle: {
    history_items: OntologyHistoryEvent[]
    history_total: number
    last_activity: OntologyHistoryEvent | null
  }
}

export interface OntologyWorkbenchGovernanceItemDto extends PolicyMetadata {
  issue_count: number
  issues: string[]
  projection_status: string
  audit_total: number
  last_audit: GovernanceAuditTrace | null
}

export interface OntologyWorkbenchGovernanceSummaryResponse {
  summary: {
    policy_total: number
    stale_count: number
    consistency_count: number
    audit_total: number
  }
  items: OntologyWorkbenchGovernanceItemDto[]
  stale_items: Array<Record<string, unknown>>
  consistency_items: Array<Record<string, unknown>>
  recent_audits: GovernanceAuditTrace[]
}

export const listBusinessObjects = () => apiClient.get<OntologyListResponse<BusinessObject>>('/ontology/objects')
export const getBusinessObject = (name: string) => apiClient.get<BusinessObject>(`/ontology/objects/${name}`)
export const saveBusinessObject = (payload: Partial<BusinessObject>) =>
  apiClient.post<BusinessObject>('/ontology/objects', payload)
export const getOntologyWorkbenchObjects = () =>
  apiClient.get<OntologyWorkbenchObjectListResponse>('/ontology/workbench/objects')
export const getOntologyWorkbenchObjectOverview = (name: string) =>
  apiClient.get<OntologyWorkbenchObjectOverviewResponse>(`/ontology/workbench/objects/${name}/overview`)
export const getOntologyWorkbenchGovernance = () =>
  apiClient.get<OntologyWorkbenchGovernanceSummaryResponse>('/ontology/workbench/governance')

export const listBusinessProperties = () =>
  apiClient.get<OntologyListResponse<BusinessProperty>>('/ontology/properties')
export const getBusinessProperty = (name: string) => apiClient.get<BusinessProperty>(`/ontology/properties/${name}`)
export const saveBusinessProperty = (payload: Partial<BusinessProperty>) =>
  apiClient.post<BusinessProperty>('/ontology/properties', payload)

export const listBusinessMetrics = () => apiClient.get<OntologyListResponse<BusinessMetric>>('/ontology/metrics')
export const getBusinessMetric = (name: string) => apiClient.get<BusinessMetric>(`/ontology/metrics/${name}`)
export const saveBusinessMetric = (payload: Partial<BusinessMetric>) =>
  apiClient.post<BusinessMetric>('/ontology/metrics', payload)
export const getBusinessMetricLinks = (name: string) =>
  apiClient.get<MetricLinksResponse>(`/ontology/metrics/${name}/links`)

export const listBusinessRelations = () =>
  apiClient.get<OntologyListResponse<BusinessRelation>>('/ontology/relations')
export const getBusinessRelation = (name: string) => apiClient.get<BusinessRelation>(`/ontology/relations/${name}`)
export const saveBusinessRelation = (payload: Partial<BusinessRelation>) =>
  apiClient.post<BusinessRelation>('/ontology/relations', payload)

export const listBusinessActions = () =>
  apiClient.get<OntologyListResponse<BusinessAction>>('/ontology/actions')
export const getBusinessAction = (name: string) => apiClient.get<BusinessAction>(`/ontology/actions/${name}`)
export const saveBusinessAction = (payload: Partial<BusinessAction>) =>
  apiClient.post<BusinessAction>('/ontology/actions', payload)

export const listGlossaryEntries = () => apiClient.get<OntologyListResponse<GlossaryEntry>>('/ontology/glossary')
export const getGlossaryEntry = (canonicalName: string) =>
  apiClient.get<GlossaryEntry>(`/ontology/glossary/${canonicalName}`)
export const saveGlossaryEntry = (payload: Partial<GlossaryEntry>) =>
  apiClient.post<GlossaryEntry>('/ontology/glossary', payload)

export const listPolicyMetadata = () => apiClient.get<OntologyListResponse<PolicyMetadata>>('/ontology/policies')
export const getPolicyMetadata = (name: string) => apiClient.get<PolicyMetadata>(`/ontology/policies/${name}`)
export const getPolicyImpact = (name: string) => apiClient.get<PolicyImpactResponse>(`/ontology/policies/${name}/impact`)
export const savePolicyMetadata = (payload: Partial<PolicyMetadata>) =>
  apiClient.post<PolicyMetadata>('/ontology/policies', payload)
export const getPolicyAudit = (name: string, filters: GovernanceAuditFilters = {}) =>
  apiClient.get<PolicyAuditResponse>(`/ontology/policies/${name}/audit`, {
    params: {
      target_type: filters.target_type,
      target_name: filters.target_name,
      decision: filters.decision,
      route_type: filters.route_type,
    },
  })

export const getOntologyTemplate = (templateName: string) =>
  apiClient.get<OntologyTemplateResponse>(`/ontology/templates/${templateName}`)

export const applyOntologyTemplate = (templateName: string) =>
  apiClient.post<OntologyTemplateApplyResponse>(`/ontology/templates/${templateName}/apply`, {})

export const publishOntologyEntity = (entityType: string, entityName: string) =>
  apiClient.post<OntologyPublishResponse>(`/ontology/${entityType}/${entityName}/publish`, {})

export const getOntologyEntityImpact = (entityType: string, entityName: string) =>
  apiClient.get<OntologyEntityImpactResponse>(`/ontology/${entityType}/${entityName}/impact`)

export const getOntologyEntityHistory = (entityType: string, entityName: string) =>
  apiClient.get<OntologyHistoryResponse>(`/ontology/${entityType}/${entityName}/history`)

export const previewSemanticMapping = (payload: { entity_type: string; entity_name: string }) =>
  apiClient.post<MapperPreviewResponse>('/semantic-mapper/preview', payload)
export const getSemanticStaleCheck = () => apiClient.get<MapperConsistencyReport>('/semantic-mapper/stale-check')
export const getSemanticConsistencyReport = () =>
  apiClient.get<MapperConsistencyReport>('/semantic-mapper/consistency-report')
export const getSemanticDiff = () => apiClient.get<{ items: Array<Record<string, unknown>>; total: number }>('/semantic-mapper/diff')
export const getMeasureBacklinks = (measureRef: string) =>
  apiClient.get<MeasureBacklinksResponse>('/semantic-mapper/measure-backlinks', {
    params: { measure_ref: measureRef },
  })
export const getCubeBacklinks = (cubeName: string) =>
  apiClient.get<CubeBacklinksResponse>('/semantic-mapper/cube-backlinks', {
    params: { cube_name: cubeName },
  })

export const getExecutionCompilePreview = (metricName: string, viewerRoles: string[] = []) =>
  apiClient.post<ExecutionCompilePreview>('/execution-compiler/compile-preview', {
    metric_name: metricName,
    viewer_roles: viewerRoles,
  })
export const getExecutionPlanPreview = (metricName: string) =>
  apiClient.post<ExecutionPlanPreview>('/execution-compiler/plan-preview', { metric_name: metricName })
export const getExecutionExecute = (metricName: string, viewerRoles: string[] = []) =>
  apiClient.post<ExecutionExecuteResponse>('/execution-compiler/execute', {
    metric_name: metricName,
    viewer_roles: viewerRoles,
  })
export const getSemanticRoutePreview = (question: string, viewerRoles: string[] = []) =>
  apiClient.post<SemanticRoutePreview>('/semantic-router/route', {
    question,
    viewer_roles: viewerRoles,
  })
export const getSemanticPlanPreview = (question: string, viewerRoles: string[] = []) =>
  apiClient.post<SemanticPlanPreview>('/semantic-router/plan', {
    question,
    viewer_roles: viewerRoles,
  })
export const getSemanticExecutePlanPreview = (question: string, viewerRoles: string[] = []) =>
  apiClient.post<SemanticExecutePlanPreview>('/semantic-router/execute-plan-preview', {
    question,
    viewer_roles: viewerRoles,
  })
export const getSemanticExecutePlan = (question: string, viewerRoles: string[] = []) =>
  apiClient.post<SemanticExecutePlanResult>('/semantic-router/execute-plan', {
    question,
    viewer_roles: viewerRoles,
  })
