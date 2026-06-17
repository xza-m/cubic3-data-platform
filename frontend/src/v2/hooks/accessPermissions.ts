import { useMemo, useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAccessToken, subscribeAccessToken } from '@v2/api/client'
import { getCurrentUser, type CurrentUser } from '@v2/api/auth'
import { qk } from './query-client'

// F6：除访问网关 access.* 外，语义域 / 数据域的 destructive 操作分别由
// semantic.write / data.write 门控（发布域、发布语义、删除会话、提取任务启停等）。
const ADMIN_PERMISSIONS = [
  'access.read',
  'access.write',
  'access.audit.read',
  'access.gateway.read',
  'semantic.write',
  'data.write',
]

const PERMISSIONS_BY_PLATFORM_ROLE: Record<string, string[]> = {
  platform_admin: ADMIN_PERMISSIONS,
  governance_admin: ADMIN_PERMISSIONS,
  auditor: ['access.read', 'access.audit.read', 'access.gateway.read'],
  viewer: [],
  admin: ADMIN_PERMISSIONS,
}

const AUTH_BYPASS_PERMISSIONS = ADMIN_PERMISSIONS

function useAccessTokenSnapshot() {
  return useSyncExternalStore(
    subscribeAccessToken,
    getAccessToken,
    () => null,
  )
}

export function permissionsFromUser(user: CurrentUser | undefined | null): string[] {
  const explicit = user?.permissions ?? []
  if (explicit.length > 0) return dedupe(explicit)
  const platformRoles = user?.platform_roles?.length ? user.platform_roles : user?.roles ?? []
  return dedupe(platformRoles.flatMap((role) => PERMISSIONS_BY_PLATFORM_ROLE[role] ?? []))
}

export function hasAccessPermission(permissions: string[], required: string): boolean {
  if (!required) return true
  if (permissions.includes('*')) return true
  return permissions.includes(required)
}

export function useAccessPermissions() {
  const token = useAccessTokenSnapshot()
  const useBrowserFixtures = import.meta.env.VITE_BROWSER_E2E_FIXTURES === '1'
  const useAuthBypass = import.meta.env.VITE_AUTH_BYPASS === '1'
  const canLoadCurrentUser = Boolean(token) || useBrowserFixtures
  const isAuthenticated = canLoadCurrentUser || useAuthBypass
  const query = useQuery({
    queryKey: qk('auth', 'me'),
    queryFn: getCurrentUser,
    enabled: canLoadCurrentUser,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
  const permissions = useMemo(
    () => (useAuthBypass ? AUTH_BYPASS_PERMISSIONS : permissionsFromUser(query.data)),
    [query.data, useAuthBypass],
  )
  return {
    ...query,
    permissions,
    isAuthenticated,
  }
}

function dedupe(values: string[]): string[] {
  const result: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const item = String(value || '').trim()
    if (!item || seen.has(item)) continue
    seen.add(item)
    result.push(item)
  }
  return result
}
