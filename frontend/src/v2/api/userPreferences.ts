// frontend/src/v2/api/userPreferences.ts
//
// Access Principal 偏好 API 层。
// GET  /api/v1/access/me/preferences
// PUT  /api/v1/access/me/preferences（部分 merge）

import { apiClient } from './client'

// ── 类型 ──────────────────────────────────────────────────────────────────────

export type ThemePreference = 'light' | 'dark' | 'system'
export type TableDensity = 'comfortable' | 'compact'

export interface UserPreferences {
  principal_id: string
  theme: ThemePreference
  default_landing: string
  list_page_size: number
  table_density: TableDensity
  extra: Record<string, unknown>
  updated_at: string | null
}

export type UserPreferencesPatch = Partial<
  Pick<UserPreferences, 'theme' | 'default_landing' | 'list_page_size' | 'table_density' | 'extra'>
>

// ── API 函数 ──────────────────────────────────────────────────────────────────

export async function getMyPreferences(): Promise<UserPreferences> {
  const resp = await apiClient.get('/access/me/preferences')
  return resp.data.data
}

export async function putMyPreferences(patch: UserPreferencesPatch): Promise<UserPreferences> {
  const resp = await apiClient.put('/access/me/preferences', patch)
  return resp.data.data
}
