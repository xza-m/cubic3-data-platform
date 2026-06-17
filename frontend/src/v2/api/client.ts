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
const REFRESH_TOKEN_KEY = 'v2.refresh_token'
const ACCESS_EXPIRES_AT_KEY = 'v2.access_expires_at'
const REFRESH_EXPIRES_AT_KEY = 'v2.refresh_expires_at'
const tokenListeners = new Set<() => void>()
let refreshPromise: Promise<string | null> | null = null

export interface TokenPair {
  access_token: string
  refresh_token: string
  expires_in?: number
  refresh_expires_in?: number
  access_expires_at?: string | null
  refresh_expires_at?: string | null
  token_type?: string
}

interface ApiClientOptions {
  browserE2eFixtures?: boolean
}

export function getAccessToken(): string | null {
  return sessionStorage.getItem(ACCESS_TOKEN_KEY)
}

export function getRefreshToken(): string | null {
  return sessionStorage.getItem(REFRESH_TOKEN_KEY)
}

export function subscribeAccessToken(listener: () => void): () => void {
  tokenListeners.add(listener)
  return () => tokenListeners.delete(listener)
}

export function setAccessToken(token: string | null): void {
  if (token) {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, token)
  } else {
    clearTokens()
    return
  }
  tokenListeners.forEach((listener) => listener())
}

export function setTokenPair(tokenPair: TokenPair | null): void {
  if (!tokenPair) {
    clearTokens()
    return
  }
  sessionStorage.setItem(ACCESS_TOKEN_KEY, tokenPair.access_token)
  sessionStorage.setItem(REFRESH_TOKEN_KEY, tokenPair.refresh_token)
  if (tokenPair.access_expires_at) {
    sessionStorage.setItem(ACCESS_EXPIRES_AT_KEY, tokenPair.access_expires_at)
  } else {
    sessionStorage.removeItem(ACCESS_EXPIRES_AT_KEY)
  }
  if (tokenPair.refresh_expires_at) {
    sessionStorage.setItem(REFRESH_EXPIRES_AT_KEY, tokenPair.refresh_expires_at)
  } else {
    sessionStorage.removeItem(REFRESH_EXPIRES_AT_KEY)
  }
  tokenListeners.forEach((listener) => listener())
}

export function clearTokens(): void {
  sessionStorage.removeItem(ACCESS_TOKEN_KEY)
  sessionStorage.removeItem(REFRESH_TOKEN_KEY)
  sessionStorage.removeItem(ACCESS_EXPIRES_AT_KEY)
  sessionStorage.removeItem(REFRESH_EXPIRES_AT_KEY)
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

function isAuthEndpoint(url: string | undefined): boolean {
  if (!url) return false
  const path = normalizeFixturePath(url)
  return path === '/auth/login' || path === '/auth/refresh' || path === '/auth/logout' || path === '/auth/feishu/exchange'
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
    async (err: AxiosError<ApiErrorPayload>) => {
      const status = err.response?.status ?? 0
      if (status === 401) {
        const config = err.config as (InternalAxiosRequestConfig & { _tokenPairRetried?: boolean }) | undefined
        if (config && !isAuthEndpoint(config.url) && !config._tokenPairRetried && getRefreshToken()) {
          config._tokenPairRetried = true
          const refreshedToken = await refreshAccessToken(baseURL)
          if (refreshedToken) {
            attachAuth(config)
            return instance.request(config)
          }
        }
        clearTokens()
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

async function refreshAccessToken(baseURL: string): Promise<string | null> {
  if (refreshPromise) return refreshPromise
  const refreshToken = getRefreshToken()
  if (!refreshToken) return null
  refreshPromise = axios
    .post(resolveApiUrl(baseURL, '/auth/refresh'), { refresh_token: refreshToken })
    .then((resp) => {
      const tokenPair = extractTokenPairPayload(resp.data)
      if (!tokenPair) return null
      setTokenPair(tokenPair)
      return tokenPair.access_token
    })
    .catch(() => {
      clearTokens()
      return null
    })
    .finally(() => {
      refreshPromise = null
    })
  return refreshPromise
}

function resolveApiUrl(baseURL: string, path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  if (baseURL.startsWith('http://') || baseURL.startsWith('https://')) {
    return `${baseURL.replace(/\/$/, '')}${normalizedPath}`
  }
  return `${baseURL.replace(/\/$/, '')}${normalizedPath}`
}

function extractTokenPairPayload(payload: unknown): TokenPair | null {
  const candidate = isRecord(payload) && isRecord(payload.data) ? payload.data : payload
  if (!isRecord(candidate)) return null
  const accessToken = typeof candidate.access_token === 'string' ? candidate.access_token : ''
  const refreshToken = typeof candidate.refresh_token === 'string' ? candidate.refresh_token : ''
  if (!accessToken || !refreshToken) return null
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: typeof candidate.expires_in === 'number' ? candidate.expires_in : undefined,
    refresh_expires_in: typeof candidate.refresh_expires_in === 'number' ? candidate.refresh_expires_in : undefined,
    access_expires_at: typeof candidate.access_expires_at === 'string' ? candidate.access_expires_at : null,
    refresh_expires_at: typeof candidate.refresh_expires_at === 'string' ? candidate.refresh_expires_at : null,
    token_type: typeof candidate.token_type === 'string' ? candidate.token_type : undefined,
  }
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
  if (method === 'GET' && path === '/auth/me') {
    return {
      user_id: 'internal:test:test_admin',
      principal_id: 'internal:test:test_admin',
      user_name: 'E2E Admin',
      roles: ['platform_admin', 'governance_admin', 'viewer'],
      platform_roles: ['platform_admin', 'governance_admin', 'viewer'],
      data_roles: ['data_m0_reader', 'data_m1_reader', 'data_m2_detail_reader'],
      access_roles: [
        'platform_admin',
        'governance_admin',
        'viewer',
        'data_m0_reader',
        'data_m1_reader',
        'data_m2_detail_reader',
      ],
      permissions: ['access.read', 'access.write', 'access.audit.read', 'access.gateway.read'],
    }
  }
  if (method === 'GET' && path === '/access/me/preferences') {
    return {
      principal_id: 'internal:test:test_admin',
      theme: 'light',
      default_landing: '/dashboard',
      list_page_size: 50,
      table_density: 'comfortable',
      extra: {},
      updated_at: null,
    }
  }
  if (method === 'GET' && path === '/agent-runtime/providers/status') {
    return {
      providers: [
        {
          runtime_name: 'openai_compatible',
          label: 'OpenAI Runtime',
          configured: true,
          available: true,
          status: 'ready',
          message: 'OpenAI Runtime 已配置。',
          operations: ['test_connection'],
          details: { model: 'fixture-model' },
        },
        {
          runtime_name: 'codex_sdk',
          label: 'Codex SDK',
          configured: false,
          available: false,
          status: 'disabled',
          message: 'Codex SDK 未启用。',
          operations: [],
          details: { provider: 'codex-sdk', transport: 'sdk', ui_managed: false },
        },
      ],
      action_bindings: [
        {
          action: 'semantic.modeling.generate_candidates',
          default_runtime: 'openai_compatible',
          allowed_runtimes: ['openai_compatible'],
          expose_selector: false,
          requires_connection: false,
          reason: 'fixed_openai_low_latency',
        },
      ],
    }
  }
  if (method === 'GET' && path === '/agent-runtime/providers/codex_sdk/logs') {
    return {
      runtime_name: 'codex_sdk',
      log_path: '.cubic3/agent-codex/logs/codex-sdk.log',
      lines: [],
      truncated: false,
    }
  }
  if (method === 'GET' && path === '/agent-runtime/providers/codex_sdk/capabilities') {
    return {
      runtime_name: 'codex_sdk',
      available: false,
      actions: ['review', 'repair', 'audit'],
      artifacts: ['codex_final_response', 'codex_thread_items'],
      events: ['run.started', 'run.succeeded'],
      details: { provider: 'codex-sdk', transport: 'sdk' },
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
  if (method === 'POST' && path === '/semantic/modeling-copilot/sessions') {
    return {
      id: 'fixture_modeling_session',
      user_goal: String(body.user_goal || '创建学生评论语义模型'),
      entry_type: String(body.entry_type || 'business_question'),
      status: 'active',
      state: 'clarifying',
      conversation: [
        { role: 'user', content: String(body.user_goal || '创建学生评论语义模型') },
      ],
      workbench_state: {
        agent_message: '已创建建模 Copilot 会话',
        semantic_canvas: { objects: [], metrics: [], dimensions: [], bindings: [], policies: [] },
        suggested_actions: ['send_message'],
      },
    }
  }
  if (method === 'POST' && /^\/semantic\/modeling-copilot\/sessions\/[^/]+\/messages$/.test(path)) {
    const sessionId = path.split('/')[4] || 'fixture_modeling_session'
    return {
      id: sessionId,
      user_goal: '创建学生评论语义模型',
      entry_type: 'business_question',
      status: 'active',
      state: 'drafting',
      conversation: [
        { role: 'user', content: String(body.message || '继续') },
        { role: 'assistant', content: '已更新建模工作台状态' },
      ],
      workbench_state: {
        agent_message: '已更新建模工作台状态',
        semantic_canvas: {
          objects: [{ id: 'student_comment', name: 'student_comment', title: '学生评论', status: 'draft' }],
          metrics: [{ id: 'student_comment_total_count', name: 'student_comment_total_count', title: '学生评论总数' }],
          dimensions: [],
          bindings: [],
          policies: [],
        },
        suggested_actions: ['save_proposal'],
      },
    }
  }
  if (method === 'POST' && /^\/semantic\/modeling-copilot\/sessions\/[^/]+\/release-preview$/.test(path)) {
    const sessionId = path.split('/')[4] || 'fixture_modeling_session'
    return {
      id: sessionId,
      user_goal: '创建学生评论语义模型',
      entry_type: 'business_question',
      status: 'active',
      state: 'ready_to_publish',
      conversation: [
        { role: 'assistant', content: '已生成发布前校验预演，发布目标为语义中心。' },
      ],
      workbench_state: {
        agent_message: '已生成发布前校验预演，发布目标为语义中心。',
        semantic_canvas: {
          objects: [{ id: 'student_comment', name: 'student_comment', title: '学生评论', status: 'draft' }],
          metrics: [{ id: 'student_comment_total_count', name: 'student_comment_total_count', title: '学生评论总数' }],
          dimensions: [],
          bindings: [],
          policies: [],
        },
        release_preview: {
          target: 'semantic_center',
          semantic_compile: {
            status: 'not_configured',
            message: '语义中心编译预演未配置，未生成物理 SQL。',
          },
          compiled_sql: '',
          release_diff: { added: ['cube.student_comment'], changed: [], removed: [] },
          impact_summary: {
            affected_assets: ['cube.student_comment'],
            affected_consumers: ['Data Agent', 'BI', '数据分析'],
            risk_level: 'low',
          },
          gateway_validation: {
            status: 'not_configured',
            message: '等待语义中心返回物理 SQL，未调用 gateway SQL dry-run。',
          },
          consumer_validation: {
            status: 'pending',
            samples: Array.isArray(body.sample_questions)
              ? body.sample_questions.map((question) => ({
                  question: String(question),
                  consumer: 'semantic_center',
                  status: 'pending_gateway_validation',
                }))
              : [],
          },
        },
      },
    }
  }
  if (method === 'GET') return { items: [], total: 0, page: 1, page_size: 20 }
  return {}
}

function envelope<T>(data: T): { code: number; message: string; data: T } {
  return { code: 0, message: 'ok', data }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
