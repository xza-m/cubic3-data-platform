// frontend/src/v2/components/RouteGuard.tsx
// 路由级权限门控：<RouteGuard required="role:semantic.editor">...</RouteGuard>
// 无权跳 /forbidden。
//
import { type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { hasAccessPermission, useAccessPermissions } from '@v2/hooks/accessPermissions'
import { t } from '@v2/i18n'

interface RouteGuardProps {
  required: string
  children: ReactNode
}

export function RouteGuard({ required, children }: RouteGuardProps) {
  const { permissions, isAuthenticated, isLoading } = useAccessPermissions()
  const location = useLocation()

  if (isLoading) {
    return <div className="flex flex-1 items-center justify-center text-[12px] text-3">{t('common.loading', '加载中…')}</div>
  }

  if (!isAuthenticated || !hasAccessPermission(permissions, required)) {
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
