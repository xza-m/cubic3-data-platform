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
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios'
import { obs } from '@v2/observability'
import { AppError, type ApiErrorPayload } from './types'

const ACCESS_TOKEN_KEY = 'v2.access_token'

export function getAccessToken(): string | null {
  return sessionStorage.getItem(ACCESS_TOKEN_KEY)
}

export function setAccessToken(token: string | null): void {
  if (token) {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, token)
  } else {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY)
  }
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

export function createApiClient(baseURL: string = '/api/v1'): AxiosInstance {
  const instance = axios.create({
    baseURL,
    timeout: 30_000,
    headers: { 'Content-Type': 'application/json' },
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
