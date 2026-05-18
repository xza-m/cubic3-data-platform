// frontend/src/v2/components/RouteGuard.tsx
// 路由级权限门控：<RouteGuard required="role:semantic.editor">...</RouteGuard>
// 无权跳 /forbidden。
//
// TODO(access): wire usePermissions() to Access Principal role bindings.
import { type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

// 权限 hook 占位：当前始终返回 ['*'] 表示有所有权限
function usePermissions(): string[] {
  // TODO(access): replace with real Access Principal permissions.
  return ['*']
}

function hasPermission(permissions: string[], required: string): boolean {
  if (permissions.includes('*')) return true
  return permissions.includes(required)
}

interface RouteGuardProps {
  required: string
  children: ReactNode
}

export function RouteGuard({ required, children }: RouteGuardProps) {
  const permissions = usePermissions()
  const location = useLocation()

  if (!hasPermission(permissions, required)) {
    return (
      <Navigate
        to="/forbidden"
        state={{ from: location.pathname, required }}
        replace
      />
    )
  }

  return <>{children}</>
}
