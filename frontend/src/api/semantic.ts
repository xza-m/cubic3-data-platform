import apiClient from './client'

export interface SemanticDomainProjection {
  id?: string | null
  code: string
  name: string
  status?: string
}

export interface GovernanceSummary {
  cube_count: number
  active_cube_count: number
  draft_cube_count: number
  deprecated_cube_count: number
  join_count: number
  dangling_cube_count: number
}

export interface CubeSummary {
  name: string
  title: string
  description: string
  table: string
  in_domain?: boolean
  domain_id?: string | null
  domain_name?: string | null
  domain_ids: string[]
  domains: Array<SemanticDomainProjection>
  domain_count: number
  status?: 'draft' | 'active' | 'deprecated' | string
  source_id?: number | null
  source_database?: string | null
  source_schema?: string | null
  dimensions: string[]
  measures: string[]
  dimension_count: number
  measure_count: number
  join_count?: number
  type?: 'fact' | 'dimension'
  sync_status?: 'ok' | 'warn' | 'error'
  state_summary?: StateSummary
}

export interface DimensionInfo {
  title: string
  type: string
  enum?: Record<string, string>
  primary_key?: boolean
}

export interface MeasureInfo {
  name?: string
  title: string
  type: string
  description?: string | null
  certified?: boolean
  format?: string
  unit?: string
  non_additive?: boolean
}

export interface StateSummary {
  object_type?: 'cube' | 'view' | 'recipe' | 'domain' | string
  object_name?: string
  source_id?: number | null
  status?: 'draft' | 'active' | 'deprecated' | string
  definition_hash?: string | null
  last_loaded_at?: string | null
  publish_status?: string | null
  last_published_at?: string | null
  last_drift_status?: string | null
  last_drift_checked_at?: string | null
  source_binding_summary?: {
    source_id?: number | null
    source_name?: string | null
    source_type?: string | null
    database?: string | null
    schema?: string | null
    display?: string | null
  } | null
  measure_summary_snapshot?: {
    count?: number
    names?: string[]
  } | null
  certified_measure_list?: string[] | null
  domain_fingerprint?: string | null
  updated_at?: string | null
  sync_status?: 'ok' | 'warn' | 'error' | string
}

export interface CubeDetail {
  name: string
  title: string
  description: string
  table: string
  domain_id?: string | null
  domain_name?: string | null
  domain_ids: string[]
  domains: Array<SemanticDomainProjection>
  domain_count: number
  status?: 'draft' | 'active' | 'deprecated' | string
  source_id?: number | null
  source_database?: string | null
  source_schema?: string | null
  source_binding_summary?: StateSummary['source_binding_summary']
  dimensions: Record<string, DimensionInfo>
  measures: Record<string, MeasureInfo>
  segments: Record<string, { title: string }>
  joins: Record<string, { target_cube: string; type: string }>
  partition?: { field: string; format: string }
  default_filters?: Array<{ sql: string; description?: string }>
  examples?: Array<{ question: string; dsl: Record<string, any>; notes?: string }>
  diagnostics?: Array<{ level: string; kind?: string; field?: string; message: string }>
  grain?: string | null
  entity_key?: string | null
  state_summary?: StateSummary
}

export interface ViewSummary {
  name: string
  title: string
  description: string
  public: boolean
  cube_count: number
  cubes?: string[]
  status?: string
  state_summary?: StateSummary
  publish_summary?: {
    publish_status?: string | null
    last_published_at?: string | null
  }
}

export interface MaterializeResult {
  dataset_id: number
  dataset_code: string
  sql_query: string
  field_count: number
  source_view: string
  published_at?: string | null
  definition_hash?: string | null
  definition_summary?: {
    dimension_count: number
    measure_count: number
    field_count: number
  } | null
  publish_status?: string
  field_mappings: Array<{
    physical_name: string
    source_ref: string
    source_cube: string
    source_field: string
    display_name: string
    business_type: string
  }>
  updated_at?: string | null
  state_summary?: StateSummary
  action: 'created' | 'updated'
}

export interface MaterializeStatus {
  materialized: boolean
  publish_status?: string
  view_name?: string
  dataset_id?: number
  dataset_code?: string
  dataset_name?: string
  sql_query?: string
  updated_at?: string
  published_at?: string
  source_view?: string
  definition_hash?: string | null
  definition_summary?: {
    dimension_count: number
    measure_count: number
    field_count: number
  } | null
  field_mappings?: Array<{
    physical_name: string
    source_ref: string
    source_cube: string
    source_field: string
    display_name: string
    business_type: string
  }>
  state_summary?: StateSummary
}

export type BatchMaterializeStatus = Record<string, MaterializeStatus>

export interface RecipeSummary {
  name: string
  title: string
  tags: string[]
  example_count: number
  related_cubes: string[]
  state_summary?: StateSummary
}

export interface CompileResult {
  sql: string
  primary_cube: string
  joined_cubes: string[]
}

export interface QueryResult extends CompileResult {
  columns: string[]
  data: any[][]
  row_count: number
  execution_time_ms: number
  retryable: boolean
  message?: string
}

export interface SchemaSyncDrift {
  cube: string
  table: string
  kind: string
  column: string
  detail: string
  severity: 'ok' | 'warn' | 'error' | string
  object_type: 'cube' | 'view' | string
  object_name: string
}

export interface SchemaSyncResult {
  total_cubes: number
  checked_cubes: number
  skipped_cubes: string[]
  drift_count: number
  drifts: SchemaSyncDrift[]
  checked_at?: string | null
  object_summaries?: Record<string, {
    object_type: 'cube' | 'view' | string
    object_name: string
    status: 'ok' | 'warn' | 'error' | string
    drift_count: number
    error_count: number
    warn_count: number
  }>
}

export interface GraphData {
  nodes: Array<{
    id: string
    title: string
    type: 'fact' | 'dimension'
    dimensions: number
    measures: number
    status?: 'draft' | 'active' | 'deprecated' | string
    source_id?: number | null
    source_database?: string | null
    source_schema?: string | null
    source_binding_summary?: StateSummary['source_binding_summary']
    state_summary?: StateSummary
  }>
  edges: Array<{
    source: string
    target: string
    relationship: string
    join_type: string
    sql: string
  }>
}

export interface DomainSummary {
  id?: string | null
  code: string
  name: string
  catalog_code?: string | null
  catalog_name?: string | null
  description?: string
  status: 'draft' | 'active' | 'archived' | string
  owner?: string | null
  cube_count: number
  join_count: number
  state_summary?: StateSummary
}

export interface DomainDetail {
  id?: string | null
  code: string
  name: string
  catalog_code?: string | null
  catalog_name?: string | null
  description?: string | null
  status: 'draft' | 'active' | 'archived' | string
  owner?: string | null
  cubes: string[]
  joins: DomainCanvasEdge[]
  state_summary?: StateSummary
  governance_summary?: GovernanceSummary
}

export interface DomainCatalogSummary {
  code: string
  name: string
  description?: string
  status: 'active' | 'archived' | string
  sort_order?: number
  domain_count: number
  active_count: number
  draft_count: number
  domains: DomainSummary[]
}

export interface DomainCatalogDetail {
  code: string
  name: string
  description?: string | null
  status: 'active' | 'archived' | string
  sort_order?: number
}

export interface DomainCanvasNode {
  id: string
  title: string
  type: 'fact' | 'dimension'
  dimensions: number
  measures: number
  status?: 'draft' | 'active' | 'deprecated' | string
  source_id?: number | null
  domain_id?: string | null
  related_domain_ids?: string[]
  related_domain_names?: string[]
  domain_count?: number
  source_binding_summary?: StateSummary['source_binding_summary']
  state_summary?: StateSummary
}

export interface DomainCanvasEdge {
  id?: string
  source: string
  target: string
  relationship: '1:1' | 'N:1' | '1:N' | string
  join_type: 'left' | 'inner' | 'right' | 'full' | string
  aggregation_strategy?: 'none' | 'aggregate_before_join' | 'latest_snapshot' | 'distinct_on_target' | string
  source_field?: string
  target_field?: string
  description?: string | null
}

export interface DomainCanvasData {
  domain: {
    id?: string | null
    code: string
    name: string
    catalog_code?: string | null
    catalog_name?: string | null
    description?: string | null
    status: 'draft' | 'active' | 'archived' | string
    owner?: string | null
    state_summary?: StateSummary | null
    governance_summary?: GovernanceSummary
  }
  nodes: DomainCanvasNode[]
  edges: DomainCanvasEdge[]
  library_cubes: CubeSummary[]
}

export interface CubeDraftPayload {
  name: string
  title: string
  description?: string
  table: string
  domain_id?: string | null
  source_id: number
  source_database?: string | null
  source_schema?: string | null
  data_source?: string
  status?: 'draft' | 'active' | 'deprecated' | string
  grain?: string | null
  entity_key?: string | null
  partition?: {
    field: string
    type: 'date' | 'string'
    format: string
    max_range_days?: number
  }
  dimensions: Record<string, DimensionInfo & { sql?: string }>
  measures: Record<string, MeasureInfo & { sql?: string }>
  segments?: Record<string, { title: string; sql?: string }>
  joins?: Record<string, { cube: string; type: string; relationship?: string; sql: string }>
}

export interface ListQueryParams {
  q?: string
  page?: number
  page_size?: number
}

export interface PaginatedListMeta {
  total: number
  page?: number
  page_size?: number
  page_count?: number
}

// Cube APIs
export const listCubes = (params?: ListQueryParams) =>
  apiClient.get<{ cubes: CubeSummary[] } & PaginatedListMeta>('/semantic/cubes', { params })

export const describeCube = (name: string) =>
  apiClient.get<CubeDetail>(`/semantic/cubes/${name}`)

export const createCubeDraftFromTable = (payload: {
  source_id: number
  database: string
  table: string
  schema?: string
  name?: string
  title?: string
  description?: string
}) => apiClient.post<CubeDraftPayload>('/semantic/cubes/draft-from-table', payload)

export const createCube = (payload: CubeDraftPayload) =>
  apiClient.post<CubeDraftPayload>('/semantic/cubes', payload)

export const updateCube = (name: string, payload: Partial<CubeDraftPayload>) =>
  apiClient.put<CubeDraftPayload>(`/semantic/cubes/${name}`, payload)

export const createCubeRevision = (name: string) =>
  apiClient.post<CubeDraftPayload>(`/semantic/cubes/${name}/revisions`)

export const activateCube = (name: string) =>
  apiClient.post<CubeDraftPayload>(`/semantic/cubes/${name}/activate`)

export const deprecateCube = (name: string) =>
  apiClient.post<CubeDraftPayload>(`/semantic/cubes/${name}/deprecate`)

// View APIs
export const listViews = (params?: ListQueryParams & { include_private?: boolean }) =>
  apiClient.get<{ views: ViewSummary[] } & PaginatedListMeta>('/semantic/views', { params })

export const describeView = (name: string) =>
  apiClient.get<any>(`/semantic/views/${name}`)

export const materializeView = (name: string, sourceId?: number) =>
  apiClient.post<MaterializeResult>(`/semantic/views/${name}/materialize`, sourceId ? { source_id: sourceId } : {})

export const getMaterializeStatus = (name: string) =>
  apiClient.get<MaterializeStatus>(`/semantic/views/${name}/materialize-status`)

export const getBatchMaterializeStatus = () =>
  apiClient.get<BatchMaterializeStatus>('/semantic/views/materialize-status')

// Recipe APIs
export const listRecipes = () =>
  apiClient.get<{ recipes: RecipeSummary[]; total: number }>('/semantic/recipes')

// Compile APIs
export const compileDsl = (dsl: Record<string, any>) =>
  apiClient.post<CompileResult>('/semantic/compile', { dsl })

export const querySemantic = (dsl: Record<string, any>) =>
  apiClient.post<QueryResult>('/semantic/query', { dsl })

export const querySemanticInDomain = (dsl: Record<string, any>, domainCode: string) =>
  apiClient.post<QueryResult>('/semantic/query', { dsl: { ...dsl, domain_code: domainCode } })

export const runSchemaSync = (cubeName?: string) =>
  apiClient.post<SchemaSyncResult>('/semantic/schema-sync', cubeName ? { cube_name: cubeName } : {})

// Graph API
export const getGraph = () =>
  apiClient.get<GraphData>('/semantic/graph')

// Domain APIs
export const listDomains = (params?: ListQueryParams & { catalog_code?: string }) =>
  apiClient.get<{ domains: DomainSummary[] } & PaginatedListMeta>('/semantic/domains', { params })

export const listDomainCatalogs = () =>
  apiClient.get<{ catalogs: DomainCatalogSummary[]; total: number }>('/semantic/catalogs')

export const createCatalog = (payload: {
  code?: string
  name: string
  description?: string
  status?: 'active' | 'archived' | string
  sort_order?: number
}) => apiClient.post<DomainCatalogDetail>('/semantic/catalogs', payload)

export const updateCatalog = (
  code: string,
  payload: Partial<Pick<DomainCatalogDetail, 'name' | 'description' | 'status' | 'sort_order'>>,
) => apiClient.put<DomainCatalogDetail>(`/semantic/catalogs/${code}`, payload)

export const deleteCatalog = (code: string) =>
  apiClient.delete<{ code: string }>(`/semantic/catalogs/${code}`)

export const createDomain = (payload: { name: string; catalog_code?: string }) =>
  apiClient.post<DomainDetail>('/semantic/domains', payload)

export const describeDomain = (id: string) =>
  apiClient.get<DomainDetail>(`/semantic/domains/${id}`)

export const updateDomain = (id: string, payload: Partial<DomainDetail>) =>
  apiClient.put<DomainDetail>(`/semantic/domains/${id}`, payload)

export const getDomainCanvas = (id: string) =>
  apiClient.get<DomainCanvasData>(`/semantic/domains/${id}/canvas`)

export const addCubeToDomain = (id: string, cubeName: string) =>
  apiClient.post<DomainDetail>(`/semantic/domains/${id}/cubes`, { cube_name: cubeName })

export const addJoinToDomain = (
  id: string,
  payload: {
    name: string
    source_cube: string
    target_cube: string
    source_field: string
    target_field: string
    join_type: 'left' | 'inner' | 'right' | 'full'
    cardinality: '1:1' | 'N:1' | '1:N'
    aggregation_strategy: 'none' | 'aggregate_before_join' | 'latest_snapshot' | 'distinct_on_target'
    description?: string
  },
) => apiClient.post<DomainDetail>(`/semantic/domains/${id}/joins`, payload)

export const publishDomain = (
  id: string,
  payload: {
    cubes: string[]
    joins: Array<{
      name: string
      source_cube: string
      target_cube: string
      source_field: string
      target_field: string
      join_type: 'left' | 'inner' | 'right' | 'full'
      cardinality: '1:1' | 'N:1' | '1:N'
      aggregation_strategy: 'none' | 'aggregate_before_join' | 'latest_snapshot' | 'distinct_on_target'
      description?: string
    }>
  },
) => apiClient.post<DomainDetail>(`/semantic/domains/${id}/publish`, payload)
