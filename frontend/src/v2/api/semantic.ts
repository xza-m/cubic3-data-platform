// frontend/src/v2/api/semantic.ts
//
// Semantic 域 API 层。所有 v2/pages/semantic/** 页面经由此文件访问后端，
// 禁止页面层直接调用 axios。
//
// 后端契约：app/interfaces/api/v1/semantic.py

import { apiClient } from '@v2/api/client'
import { t } from '@v2/i18n'

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

const put = <T>(url: string, body?: unknown): Promise<T> =>
  apiClient.put<Envelope<T>>(url, body).then((r) => r.data.data)

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
  joins?: unknown[]
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

export const addCubeToDomain = (id: string, cubeName: string) =>
  post<DomainDetail>(`/semantic/domains/${id}/cubes`, { cube_name: cubeName })

export const addJoinToDomain = (id: string, body: Record<string, unknown>) =>
  post<DomainDetail>(`/semantic/domains/${id}/joins`, body)

export const publishDomain = (id: string, body?: { cubes?: string[]; joins?: unknown[] }) =>
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
  // B-back-3: materialized_at 字段上线后补充
  // TODO(B-back-3): add materialized_at?: string | null
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
// TODO(B-back-P4): POST /api/v1/semantic/cubes/:name/validate-fields 尚未实现，
//   前端使用 mock 结果。上线后删除 simulateNetworkDelay 和 _mockValidateFields。

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

function _mockValidateFields(cubeName: string): Promise<CubeFieldValidationResult> {
  // TODO(B-back-P4): replace with real API call
  return new Promise((resolve) =>
    setTimeout(() => {
      // 演示数据：后端上线前展示典型问题示例
      const sampleIssues: CubeFieldIssue[] = cubeName
        ? [
            { field: 'order_date', code: 'TYPE_MISMATCH', message: t('semantic.validate.typeMismatch', '字段类型 string 与期望 time 不一致'), severity: 'error' },
            { field: 'amount', code: 'MISSING_AGG', message: t('semantic.validate.missingAgg', '度量字段建议设置聚合函数'), severity: 'warning' },
            { field: 'status', code: 'LOW_CARDINALITY', message: t('semantic.validate.lowCardinality', '枚举字段建议设置 distinct values'), severity: 'info' },
          ]
        : []
      resolve({ ok: sampleIssues.filter((i) => i.severity === 'error').length === 0, issues: sampleIssues })
    }, 600),
  )
}

export const validateCubeFields = (name: string): Promise<CubeFieldValidationResult> =>
  // TODO(B-back-P4): 后端接口上线后替换为：
  //   post<CubeFieldValidationResult>(`/semantic/cubes/${name}/validate-fields`)
  _mockValidateFields(name)

// ─── P5 · 指标公式 dry-run ──────────────────────────────────────────────────
// TODO(B-back-P5): POST /api/v1/semantic/metrics/dry-run 尚未实现，前端使用 mock。

export interface MetricDryRunResult {
  sql_preview: string
  sample_rows?: Record<string, unknown>[]
  errors?: Array<{ code: string; message: string }>
}

function _mockDryRunMetric(formula: string): Promise<MetricDryRunResult> {
  // TODO(B-back-P5): replace with real API call
  return new Promise((resolve) =>
    setTimeout(() => {
      if (!formula || formula.trim() === '') {
        resolve({ sql_preview: '', errors: [{ code: 'EMPTY_FORMULA', message: t('semantic.metric.emptyFormula', '公式不能为空') }] })
        return
      }
      resolve({
        sql_preview: `SELECT SUM(${formula.replace(/[^a-zA-Z0-9_.]/g, '_')}) AS metric_value\nFROM orders\nWHERE created_at >= CURRENT_DATE - INTERVAL '30' DAY`,
        sample_rows: [
          { metric_value: 128450.5 },
          { metric_value: 97320.0 },
          { metric_value: 134200.75 },
        ],
        errors: [],
      })
    }, 800),
  )
}

export const dryRunMetric = (name: string, formula: string): Promise<MetricDryRunResult> =>
  // TODO(B-back-P5): 后端接口上线后替换为：
  //   post<MetricDryRunResult>(`/semantic/metrics/${name}/dry-run`, { formula })
  _mockDryRunMetric(formula)

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
// TODO(B-back-P7): GET /api/v1/semantic/domains/:id/publish/history 尚未实现，
//   前端使用 mock 数据。

export interface DomainPublishRecord {
  version: string
  published_at: string
  published_by: string
  status: 'success' | 'failed' | 'pending'
  diff_summary?: string
  note?: string
}

function _mockDomainPublishHistory(domainId: string): Promise<{ records: DomainPublishRecord[]; total: number }> {
  // TODO(B-back-P7): replace with real API call
  return new Promise((resolve) =>
    setTimeout(() => {
      if (!domainId) {
        resolve({ records: [], total: 0 })
        return
      }
      resolve({
        records: [
          {
            version: 'v3',
            published_at: new Date(Date.now() - 3600_000).toISOString(),
            published_by: 'admin',
            status: 'success',
            diff_summary: '+2 cubes, -1 join',
          },
          {
            version: 'v2',
            published_at: new Date(Date.now() - 86400_000).toISOString(),
            published_by: 'user1',
            status: 'success',
            diff_summary: '+1 cube',
          },
          {
            version: 'v1',
            published_at: new Date(Date.now() - 7 * 86400_000).toISOString(),
            published_by: 'admin',
            status: 'success',
            diff_summary: t('semantic.publish.initial', '初始发布'),
          },
        ],
        total: 3,
      })
    }, 400),
  )
}

export const getDomainPublishHistory = (id: string) =>
  // TODO(B-back-P7): 后端接口上线后替换为：
  //   get<{ records: DomainPublishRecord[]; total: number }>(`/semantic/domains/${id}/publish/history`)
  _mockDomainPublishHistory(id)

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
