// frontend/src/v2/components/Can.tsx
// 按钮级权限门控：<Can action="datasource.delete">{children}</Can>
// 无权限时：子元素 disabled + tooltip 说明原因。
//
// TODO(round-2): wire usePermissions() to GET /api/v1/users/me/permissions
import { type ReactNode, cloneElement, isValidElement } from 'react'
import { Tooltip } from '@v2/components/ui'

// 权限 hook 占位：当前始终返回 ['*'] 表示有所有权限
function usePermissions(): string[] {
  // TODO(round-2): replace with real permissions from /api/v1/users/me/permissions
  return ['*']
}

function hasPermission(permissions: string[], action: string): boolean {
  if (permissions.includes('*')) return true
  return permissions.includes(action)
}

interface CanProps {
  action: string
  children: ReactNode
  /** 无权限时的 tooltip 文案 */
  disabledTip?: string
}

export function Can({ action, children, disabledTip }: CanProps) {
  const permissions = usePermissions()
  const allowed = hasPermission(permissions, action)

  if (allowed) return <>{children}</>

  const tip = disabledTip ?? `需要权限 ${action}`

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
