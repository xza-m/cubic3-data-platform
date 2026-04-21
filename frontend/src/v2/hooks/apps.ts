// frontend/src/v2/hooks/apps.ts
//
// 应用市场域 react-query hooks。
// query key 规范：qk('apps', action, ...args)
// 见 plan §01 §5 & §5.1。

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { qk } from './query-client'
import {
  listApps,
  getApp,
  listAppCategories,
  validateAppConfig,
  enableApp,
  disableApp,
  type AppListParams,
} from '@v2/api/apps'

// ============================================================================
// 应用列表
// ============================================================================

export function useApps(params: AppListParams = {}) {
  return useQuery({
    queryKey: qk('apps', 'list', params),
    queryFn: () => listApps(params),
    staleTime: 30_000,
  })
}

// ============================================================================
// 应用详情
// ============================================================================

export function useApp(code: string | undefined) {
  return useQuery({
    queryKey: qk('apps', 'detail', code),
    queryFn: () => getApp(code!),
    enabled: !!code,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

// ============================================================================
// 分类列表（配置类，staleTime 5min）
// ============================================================================

export function useAppCategories() {
  return useQuery({
    queryKey: qk('apps', 'categories'),
    queryFn: listAppCategories,
    staleTime: 5 * 60 * 1000,
  })
}

// ============================================================================
// 配置校验 mutation
// ============================================================================

export function useValidateAppConfig() {
  return useMutation({
    mutationFn: ({
      code,
      config,
    }: {
      code: string
      config: Record<string, unknown>
    }) => validateAppConfig(code, config),
    retry: 0,
  })
}

// ============================================================================
// 启用 / 停用（P20）
// ============================================================================

export function useEnableApp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (code: string) => enableApp(code),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['apps'] })
    },
  })
}

export function useDisableApp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (code: string) => disableApp(code),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['apps'] })
    },
  })
}
