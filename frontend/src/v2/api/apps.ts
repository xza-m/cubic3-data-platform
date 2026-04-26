// frontend/src/v2/api/apps.ts
//
// 应用市场 & 应用域 API 层。
// 后端契约：app/interfaces/api/v1/apps.py
// 所有调用均通过 apiClient，禁止页面层直接调 axios。

import { apiClient } from './client'

// ============================================================================
// 类型定义（与后端 wire 格式保持 snake_case）
// ============================================================================

export interface App {
  id: number
  code: string
  name: string
  category: string
  description: string | null
  config_schema: Record<string, unknown> | null
  icon: string | null
  author: string | null
  version: string | null
  enabled: boolean
  created_at: string | null
  updated_at: string | null
  // include_stats=true 时以下字段非 null
  instance_count: number | null
  active_instance_count: number | null
  total_execution_count: number | null

  // P22: 应用整体健康状态（后端可选返回，缺省按 'unknown' 处理）
  health?: HealthStatus | null

  // drop-frontend: backend has no design for App.rating — see plan §3.4
  // drop-frontend: backend has no design for App.installs — see plan §3.4
  // drop-frontend: backend has no design for App.capabilities — see plan §3.4
}

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'down' | 'unknown'

export interface AppListParams {
  category?: string
  enabled_only?: boolean
  include_stats?: boolean
}

export interface AppConfigValidateResult {
  is_valid: boolean
  errors: string[]
}

export interface AppCategoryOption {
  value: string
  label: string
  app_count: number | null
}

type AppCategoryWire =
  | string
  | {
      category?: unknown
      display_name?: unknown
      app_count?: unknown
    }

function normalizeCategoryOption(item: AppCategoryWire): AppCategoryOption | null {
  if (typeof item === 'string') {
    const value = item.trim()
    return value ? { value, label: value, app_count: null } : null
  }

  if (!item || typeof item !== 'object') return null
  const value = typeof item.category === 'string' ? item.category.trim() : ''
  if (!value) return null
  const label =
    typeof item.display_name === 'string' && item.display_name.trim()
      ? item.display_name.trim()
      : value
  const appCount = typeof item.app_count === 'number' ? item.app_count : null
  return { value, label, app_count: appCount }
}

// ============================================================================
// 应用市场接口
// ============================================================================

export async function listApps(params: AppListParams = {}): Promise<App[]> {
  const res = await apiClient.get<{ data: App[] }>('/apps', { params })
  return res.data.data
}

export async function getApp(code: string): Promise<App> {
  const res = await apiClient.get<{ data: App }>(`/apps/${code}`)
  return res.data.data
}

export async function getAppConfigSchema(
  code: string,
): Promise<Record<string, unknown>> {
  const res = await apiClient.get<{ data: Record<string, unknown> }>(
    `/apps/${code}/config-schema`,
  )
  return res.data.data
}

export async function listAppCategories(): Promise<AppCategoryOption[]> {
  const res = await apiClient.get<{ data: AppCategoryWire[] }>('/apps/categories')
  return (res.data.data ?? [])
    .map(normalizeCategoryOption)
    .filter((item): item is AppCategoryOption => item != null)
}

export async function validateAppConfig(
  code: string,
  config: Record<string, unknown>,
): Promise<AppConfigValidateResult> {
  const res = await apiClient.post<{ data: AppConfigValidateResult }>(
    `/apps/${code}/validate`,
    { config },
  )
  return res.data.data
}

// ── 启用 / 停用（P20）────────────────────────────────────────────────────────

export async function enableApp(code: string): Promise<App> {
  const res = await apiClient.post<{ data: App }>(`/apps/${code}/enable`)
  return res.data.data
}

export async function disableApp(code: string): Promise<App> {
  const res = await apiClient.post<{ data: App }>(`/apps/${code}/disable`)
  return res.data.data
}
