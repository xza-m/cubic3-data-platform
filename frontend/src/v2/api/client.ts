// frontend/src/v2/api/client.ts
//
// 单一 axios 实例。所有 v2/api/<domain>.ts 必须从这里导入 client，
// 禁止页面层直接调 axios。
//
// 拦截器统一职责：
// - 请求：附带 JWT
// - 响应：401 清状态 + 跳登录；其他错误转 AppError

import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosResponse,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios'
import { obs } from '@v2/observability'
import { AppError, type ApiErrorPayload } from './types'

const ACCESS_TOKEN_KEY = 'v2.access_token'
const tokenListeners = new Set<() => void>()

interface ApiClientOptions {
  browserE2eFixtures?: boolean
}

export function getAccessToken(): string | null {
  return sessionStorage.getItem(ACCESS_TOKEN_KEY)
}

export function subscribeAccessToken(listener: () => void): () => void {
  tokenListeners.add(listener)
  return () => tokenListeners.delete(listener)
}

export function setAccessToken(token: string | null): void {
  if (token) {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, token)
  } else {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY)
  }
  tokenListeners.forEach((listener) => listener())
}

function attachAuth(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  const token = getAccessToken()
  if (token) {
    const headers = (config.headers ??= new AxiosHeaders()) as AxiosHeaders
    if (typeof headers.set === 'function') {
      headers.set('Authorization', `Bearer ${token}`)
    } else {
      (headers as unknown as Record<string, string>).Authorization = `Bearer ${token}`
    }
  }
  return config
}

function onLoginRedirect() {
  if (typeof window === 'undefined') return
  if (window.location.pathname.startsWith('/login')) return
  const redirect = encodeURIComponent(window.location.pathname + window.location.search)
  window.location.replace(`/login?redirect=${redirect}`)
}

function toAppError(err: AxiosError<ApiErrorPayload>): AppError {
  const status = err.response?.status ?? 0
  const payload = err.response?.data
  const code = payload?.code ?? (status >= 500 ? 'SERVER_ERROR' : status === 0 ? 'NETWORK_ERROR' : 'CLIENT_ERROR')
  const message = payload?.message ?? err.message ?? 'Unknown error'
  return new AppError(code, status, message, payload?.details)
}

export function createApiClient(baseURL: string = '/api/v1', options: ApiClientOptions = {}): AxiosInstance {
  const useBrowserFixtures =
    options.browserE2eFixtures === true || import.meta.env.VITE_BROWSER_E2E_FIXTURES === '1'
  const instance = axios.create({
    baseURL,
    timeout: 30_000,
    headers: { 'Content-Type': 'application/json' },
    adapter: useBrowserFixtures ? browserE2eFixtureAdapter : undefined,
  })

  instance.interceptors.request.use(attachAuth)

  instance.interceptors.response.use(
    (resp) => resp,
    (err: AxiosError<ApiErrorPayload>) => {
      const status = err.response?.status ?? 0
      if (status === 401) {
        setAccessToken(null)
        onLoginRedirect()
      }
      const appErr = toAppError(err)
      obs.error(appErr, {
        kind: 'api',
        url: err.config?.url,
        method: err.config?.method?.toUpperCase(),
        status,
      })
      return Promise.reject(appErr)
    },
  )

  return instance
}

export const apiClient = createApiClient()

function browserE2eFixtureAdapter(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  const method = String(config.method || 'get').toUpperCase()
  const path = normalizeFixturePath(config.url || '')
  const body = parseFixtureBody(config.data)
  const data = browserE2eFixtureData(method, path, body)
  return Promise.resolve({
    data: envelope(data),
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
    request: null,
  })
}

function normalizeFixturePath(url: string): string {
  const value = url.startsWith('http') ? new URL(url).pathname : url
  return value.replace(/^\/api\/v1/, '').split('?')[0] || '/'
}

function parseFixtureBody(data: unknown): Record<string, unknown> {
  if (!data) return {}
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data)
      return isRecord(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
  return isRecord(data) ? data : {}
}

function browserE2eFixtureData(method: string, path: string, body: Record<string, unknown>): unknown {
  if (method === 'GET' && path === '/users/me/preferences') {
    return {
      user_id: 1,
      theme: 'light',
      default_landing: '/dashboard',
      list_page_size: 50,
      table_density: 'comfortable',
      extra: {},
      updated_at: null,
    }
  }
  if (method === 'GET' && path === '/semantic/cubes') {
    return { cubes: [], total: 0, page: 1, page_size: 200, page_count: 0 }
  }
  if (method === 'GET' && path === '/semantic/domains') {
    return { items: [], total: 0, page: 1, page_size: 200 }
  }
  if (method === 'GET' && path.startsWith('/ontology/')) {
    return { items: [], total: 0, page: 1, page_size: 20 }
  }
  if (method === 'POST' && path === '/semantic/modeling-agent/spec-draft') {
    const spec = buildBrowserE2eSpec(body)
    return {
      spec,
      next_actions: {
        default_publish_target: 'cube_only',
        requires_ontology_confirmation: true,
      },
    }
  }
  if (method === 'POST' && path === '/semantic/modeling-agent/draft-from-spec') {
    const spec = getFixtureSpec(body)
    return {
      cube: spec.cube,
      ontology: spec.ontology,
      published: false,
      diff: { source: 'browser_e2e_fixture', has_user_editable_spec: true },
      audit: { action: 'draft_from_spec', spec_is_runtime_source: 'false' },
    }
  }
  if (method === 'POST' && path === '/semantic/modeling-agent/validate') {
    return {
      status: 'ready',
      issues: [],
      checks: {
        cube_structure: 'passed',
        metric_binding: 'passed',
        ontology_publish: 'passed',
        projection: 'passed',
        permission_impact: { restricted_policy_count: 1, sensitive_fields: ['comment_content'] },
      },
      agent_sandbox_preview: {
        status: 'ready',
        mode: 'draft_spec',
        pollutes_official_route: false,
        official_route: '/api/v1/agent/semantic/plan',
      },
    }
  }
  if (method === 'POST' && path === '/semantic/modeling-agent/agent-ready-check') {
    const spec = getFixtureSpec(body)
    const cube = spec.cube as Record<string, unknown>
    const ontology = spec.ontology as Record<string, unknown>
    const metric = ((ontology.metrics as Array<Record<string, unknown>> | undefined) || [])[0] || {}
    return {
      status: 'ready',
      cube_status: 'active',
      ontology_status: 'active',
      bindings: {
        metrics: [
          {
            business_metric: metric.name,
            measure_ref: `${cube.name}.total_count`,
            status: 'linked',
          },
        ],
      },
      issues: [],
      checks: {
        metric_binding: 'passed',
        projection: 'passed',
        permission_impact: { restricted_policy_count: 1, sensitive_fields: ['comment_content'] },
        agent_sandbox: 'ready',
      },
      truth_sources: {
        business: 'ontology',
        execution: 'cube',
        domain: 'business_context',
      },
    }
  }
  if (method === 'POST' && path === '/semantic/modeling-agent/apply') {
    const spec = getFixtureSpec(body)
    return {
      published: false,
      assets: { cube: spec.cube, ontology: spec.ontology },
      spec,
      audit: { action: 'apply', spec_is_runtime_source: 'false' },
    }
  }
  if (method === 'POST' && path === '/semantic/modeling-agent/publish') {
    const spec = getFixtureSpec(body)
    return {
      publish_targets: { cube: true, ontology: false },
      published: { cube: { ...(spec.cube as Record<string, unknown>), status: 'active' } },
      audit: { action: 'publish', spec_is_runtime_source: 'false' },
    }
  }
  if (method === 'GET') return { items: [], total: 0, page: 1, page_size: 20 }
  return {}
}

function buildBrowserE2eSpec(body: Record<string, unknown>): Record<string, unknown> {
  const table = String(body.table || 'dwd_student_comment_events')
  const cubeName = normalizeCubeName(table)
  const subject = String(body.business_subject || '学生评论')
  return {
    spec_version: 'v1',
    source: {
      source_kind: body.source_kind || 'physical_table',
      source_id: body.source_id || 1,
      database: body.database || 'dw',
      schema: body.schema || 'dwd',
      table,
    },
    business: {
      subject,
      use_cases: normalizeStringList(body.use_cases),
      default_roles: normalizeStringList(body.default_roles),
      sensitivity_level: body.sensitivity_level || 'restricted',
    },
    cube: {
      name: cubeName,
      title: `${subject}事实`,
      description: `${subject}事实表 Cube 草稿`,
      status: 'active',
      sql_table: `dw.dwd.${table}`,
      dimensions: {
        student_id: { title: '学生ID', type: 'string' },
        comment_content: { title: '评论内容', type: 'string' },
        comment_date: { title: '评论日期', type: 'time' },
      },
      measures: {
        total_count: { title: '总数', type: 'count', certified: true },
      },
    },
    ontology: {
      object: {
        name: 'student_comment',
        title: subject,
        description: `${subject}业务对象`,
        aliases: [subject],
        status: 'active',
      },
      properties: [],
      metrics: [
        {
          name: 'student_comment_total_count',
          title: `${subject}总数`,
          object_name: 'student_comment',
          semantic_formula: `按 Cube measure ${cubeName}.total_count 计算`,
          measure_refs: [`${cubeName}.total_count`],
          aliases: [`${subject}数`],
          status: 'active',
        },
      ],
      glossary: [
        {
          term: subject,
          canonical_name: 'student_comment',
          entry_type: 'object',
          aliases: [],
          description: `${subject}标准业务称谓`,
          status: 'active',
        },
      ],
      policies: [
        {
          name: 'student_comment_total_count_policy',
          target_type: 'metric',
          target_name: 'student_comment_total_count',
          visibility: 'restricted',
          allowed_roles: normalizeStringList(body.default_roles),
          description: `${subject}指标访问策略`,
          status: 'active',
        },
      ],
      relations: [],
      actions: [],
    },
    governance: {
      sensitivity_level: body.sensitivity_level || 'restricted',
      sensitive_fields: ['comment_content'],
      official_agent_consumes_spec: false,
    },
    audit: { action: 'browser_e2e_fixture', spec_is_runtime_source: 'false' },
    sample_questions: [`最近一段时间${subject}总数是多少？`],
    warnings: [{ code: 'sensitive_fields_restricted', message: '疑似敏感字段已默认按 restricted 处理' }],
  }
}

function getFixtureSpec(body: Record<string, unknown>): Record<string, unknown> {
  return isRecord(body.spec) ? body.spec : buildBrowserE2eSpec(body)
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  if (typeof value === 'string') return value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean)
  return []
}

function normalizeCubeName(table: string): string {
  return table.replace(/^(ods|dwd|dws|ads|dim|fct)_/, '') || 'student_comment_events'
}

function envelope<T>(data: T): { code: number; message: string; data: T } {
  return { code: 0, message: 'ok', data }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
