// frontend/src/v2/hooks/userPreferences.ts
//
// 用户偏好 react-query hooks（B-back-1 / P21）
//
// query key: ['userPreferences', 'me']
// staleTime: 5 分钟（偏好很少变化，无需频繁刷新）

import { useSyncExternalStore } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from '@v2/api/userPreferences'
import { getAccessToken, subscribeAccessToken } from '@v2/api/client'
import { ev, obs } from '@v2/observability'

export const PREF_QUERY_KEY = ['userPreferences', 'me'] as const

function useAccessTokenSnapshot() {
  return useSyncExternalStore(
    subscribeAccessToken,
    getAccessToken,
    () => null,
  )
}

export function useMyPreferences() {
  const token = useAccessTokenSnapshot()
  return useQuery({
    queryKey: PREF_QUERY_KEY,
    queryFn: api.getMyPreferences,
    enabled: Boolean(token),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  })
}

export function useUpdateMyPreferences() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: api.UserPreferencesPatch) => api.putMyPreferences(patch),
    onSuccess: (updated, patch) => {
      obs.track(ev.preferencesUpdated(Object.keys(patch ?? {})))
      // 用服务端返回的完整对象直接写入缓存，然后失效整个 userPreferences 域
      qc.setQueryData(PREF_QUERY_KEY, updated)
      qc.invalidateQueries({ queryKey: ['userPreferences'] })
    },
  })
}
