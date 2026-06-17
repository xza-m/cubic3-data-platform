// frontend/src/v2/components/Can.tsx
// 按钮级权限门控：<Can action="datasource.delete">{children}</Can>
// 无权限时：子元素 disabled + tooltip 说明原因。
//
import { type ReactNode, cloneElement, isValidElement } from 'react'
import { Tooltip } from '@v2/components/ui'
import { hasAccessPermission, useAccessPermissions } from '@v2/hooks/accessPermissions'
import { t } from '@v2/i18n'

interface CanProps {
  action: string
  children: ReactNode
  /** 无权限时的 tooltip 文案 */
  disabledTip?: string
}

export function Can({ action, children, disabledTip }: CanProps) {
  const { permissions, isAuthenticated, isLoading } = useAccessPermissions()
  const allowed = isAuthenticated && !isLoading && hasAccessPermission(permissions, action)

  if (allowed) return <>{children}</>

  const tip = isLoading
    ? t('can.checkingPermission', '权限校验中')
    : disabledTip ?? t('can.requirePermission', '需要权限 {action}', { action })

  // 尝试给第一个有效子元素注入 disabled
  if (isValidElement<Record<string, unknown>>(children)) {
    return (
      <Tooltip label={tip} side="top">
        <span className="inline-flex cursor-not-allowed opacity-50">
          {cloneElement(children, { disabled: true, 'aria-disabled': true })}
        </span>
      </Tooltip>
    )
  }

  return (
    <Tooltip label={tip} side="top">
      <span className="inline-flex cursor-not-allowed opacity-50">{children}</span>
    </Tooltip>
  )
}
