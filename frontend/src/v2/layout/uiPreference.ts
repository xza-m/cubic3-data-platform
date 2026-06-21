// frontend/src/v2/layout/uiPreference.ts
//
// UI 偏好 Context（表格密度等）——独立叶子模块。
// 抽出 AppShell 以避免底层 UI 原语（如 components/ui/Table）经 barrel 反向依赖 shell 成环。
import { createContext, useContext } from 'react'
import type { TableDensity } from '@v2/api/userPreferences'

export interface UiPreference {
  tableDensity: TableDensity
}

export const UiPreferenceContext = createContext<UiPreference>({ tableDensity: 'comfortable' })

export function useUiPreference(): UiPreference {
  return useContext(UiPreferenceContext)
}
