// frontend/src/v2/pages/config/roles/RoleDetail.tsx
//
// 角色详情页（L3，P14）。包含权限矩阵（资源 × 动作）。
// 接口：GET /api/v1/roles/:id  PUT /api/v1/roles/:id

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, RefreshCcw, Save, Shield } from 'lucide-react'
import { Skeleton, useToast } from '@v2/components/ui'
import { fmtDateTime } from '@v2/lib/format'
import { useRole, useUpdateRole, useDeleteRole } from '@v2/hooks/roles'
import {
  PERMISSION_RESOURCES,
  PERMISSION_ACTIONS,
  permKey,
  type PermissionResource,
  type PermissionAction,
} from '@v2/api/roles'
import { t } from '@v2/i18n'

function resourceLabel(r: PermissionResource): string {
  switch (r) {
    case 'datasource':   return t('roleDetail.resource.datasource', '数据源')
    case 'dataset':      return t('roleDetail.resource.dataset', '数据集')
    case 'extraction':   return t('roleDetail.resource.extraction', '提取任务')
    case 'query':        return t('roleDetail.resource.query', '查询')
    case 'semantic':     return t('roleDetail.resource.semantic', '语义层')
    case 'ontology':     return t('roleDetail.resource.ontology', '本体')
    case 'app':          return t('roleDetail.resource.app', '应用')
    case 'app_instance': return t('roleDetail.resource.appInstance', '应用实例')
    case 'channel':      return t('roleDetail.resource.channel', '通知渠道')
    case 'subscription': return t('roleDetail.resource.subscription', '订阅')
    case 'user':         return t('roleDetail.resource.user', '用户')
    case 'role':         return t('roleDetail.resource.role', '角色')
    default:             return r
  }
}

function actionLabel(a: PermissionAction): string {
  switch (a) {
    case 'read':   return t('roleDetail.action.read', '查看')
    case 'write':  return t('roleDetail.action.write', '编辑')
    case 'delete': return t('roleDetail.action.delete', '删除')
    case 'admin':  return t('roleDetail.action.admin', '管理')
    default:       return a
  }
}

function buildTabs() {
  return [
    { id: 'permissions', label: t('roleDetail.tab.permissions', '权限矩阵') },
    { id: 'info',        label: t('roleDetail.tab.info', '基本信息') },
  ] as const
}
type TabId = 'permissions' | 'info'

export default function RoleDetail() {
  const { id } = useParams<{ id: string }>()
  const numericId = Number(id)
  const navigate = useNavigate()
  const toast = useToast()
  const [tab, setTab] = useState<TabId>('permissions')

  const { data: role, isLoading, isError, refetch, isFetching } = useRole(numericId)
  const updateMutation = useUpdateRole()
  const deleteMutation = useDeleteRole()

  // 本地权限状态（用于矩阵编辑，保存前不提交）
  const [localPerms, setLocalPerms] = useState<Set<string>>(new Set())
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (role) {
      setLocalPerms(new Set(role.permissions))
      setDirty(false)
      document.title = t('roleDetail.documentTitle', '{name} · 角色', { name: role.name })
    }
  }, [role])

  const toggle = (resource: PermissionResource, action: PermissionAction) => {
    const key = permKey(resource, action)
    setLocalPerms((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
    setDirty(true)
  }

  const toggleRow = (resource: PermissionResource) => {
    const rowKeys = PERMISSION_ACTIONS.map((a) => permKey(resource, a))
    const allChecked = rowKeys.every((k) => localPerms.has(k))
    setLocalPerms((prev) => {
      const next = new Set(prev)
      if (allChecked) {
        rowKeys.forEach((k) => next.delete(k))
      } else {
        rowKeys.forEach((k) => next.add(k))
      }
      return next
    })
    setDirty(true)
  }

  const handleSave = async () => {
    if (!role) return
    await updateMutation.mutateAsync({
      id: role.id,
      payload: { permissions: Array.from(localPerms) },
    })
    toast.show({ tone: 'success', title: t('roleDetail.toast.saved', '权限已保存') })
    setDirty(false)
  }

  const handleDelete = async () => {
    if (!role) return
    if (role.is_system) {
      toast.show({
        tone: 'warning',
        title: t('roleDetail.toast.systemProtected', '系统内置角色不可删除'),
      })
      return
    }
    if (!window.confirm(t('roleDetail.confirm.delete', '删除角色「{name}」？', { name: role.name }))) return
    await deleteMutation.mutateAsync(role.id)
    toast.show({
      tone: 'warning',
      title: t('roleDetail.toast.deleted', '已删除角色'),
      description: role.name,
    })
    navigate('/config/roles')
  }

  if (!Number.isFinite(numericId) || numericId <= 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs" style={{ color: 'var(--text-3)' }}>
        {t('roleDetail.state.invalidId', '非法的角色 ID')}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (isError || !role) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <p className="text-xs" style={{ color: 'var(--danger)' }}>
          {t('roleDetail.state.notFound', '未找到角色 #{id}', { id: numericId })}
        </p>
        <button type="button" onClick={() => refetch()} className="rounded-md border px-3 py-1.5 text-xs" style={{ borderColor: 'var(--border)' }}>
          {t('roleDetail.action.retry', '重试')}
        </button>
      </div>
    )
  }
  const tabs = buildTabs()

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b px-4 py-3" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
        <div className="mb-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/config/roles')}
            className="inline-flex items-center gap-1 text-xs hover:underline"
            style={{ color: 'var(--text-3)' }}
          >
            <ArrowLeft size={11} /> {t('roleDetail.action.back', '返回角色列表')}
          </button>
          <button
            type="button"
            onClick={() => refetch()}
            className="ml-2 inline-flex items-center gap-1 text-xs"
            style={{ color: 'var(--text-3)' }}
          >
            <RefreshCcw size={11} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white"
            style={{ background: 'var(--accent)' }}
          >
            <Shield size={14} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{role.name}</span>
            {role.description && (
              <p className="mt-0.5 text-xs" style={{ color: 'var(--text-3)' }}>{role.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {dirty && (
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={updateMutation.isPending}
                className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-50"
                style={{ background: 'var(--accent)' }}
              >
                <Save size={12} />
                {updateMutation.isPending
                  ? t('roleDetail.action.saving', '保存中…')
                  : t('roleDetail.action.savePerms', '保存权限')}
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={role.is_system}
              title={role.is_system ? t('roleDetail.tip.systemProtected', '系统内置角色不可删除') : undefined}
              className="rounded-md border px-3 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
            >
              {t('roleDetail.action.delete', '删除')}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-3 flex items-center gap-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className="rounded px-2.5 py-1 text-xs"
              style={{
                background: tab === item.id ? 'var(--accent-soft)' : 'transparent',
                color: tab === item.id ? 'var(--accent)' : 'var(--text-2)',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {tab === 'permissions' && (
          <PermissionMatrix
            localPerms={localPerms}
            onToggle={toggle}
            onToggleRow={toggleRow}
          />
        )}
        {tab === 'info' && <RoleInfoTab role={role} />}
      </div>
    </div>
  )
}

// ── 权限矩阵 ──────────────────────────────────────────────────────────────────

function PermissionMatrix({
  localPerms,
  onToggle,
  onToggleRow,
}: {
  localPerms: Set<string>
  onToggle: (resource: PermissionResource, action: PermissionAction) => void
  onToggleRow: (resource: PermissionResource) => void
}) {
  return (
    <div className="p-4">
      <p className="mb-3 text-xs" style={{ color: 'var(--text-3)' }}>
        {t(
          'roleDetail.perms.hint',
          '勾选权限后点击右上角「保存权限」生效。点击资源名可整行勾选/取消。',
        )}
      </p>
      <div className="overflow-auto rounded-lg border" style={{ borderColor: 'var(--border)' }}>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr style={{ background: 'var(--bg-surface-2)', borderBottom: '1px solid var(--border)' }}>
              <th className="px-4 py-2 text-left font-medium" style={{ color: 'var(--text-3)', minWidth: 120 }}>
                {t('roleDetail.perms.colResource', '资源')}
              </th>
              {PERMISSION_ACTIONS.map((action) => (
                <th key={action} className="px-4 py-2 text-center font-medium" style={{ color: 'var(--text-3)' }}>
                  {actionLabel(action)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_RESOURCES.map((resource) => {
              const rowKeys = PERMISSION_ACTIONS.map((a) => permKey(resource, a))
              const allChecked = rowKeys.every((k) => localPerms.has(k))
              const someChecked = rowKeys.some((k) => localPerms.has(k))
              return (
                <tr key={resource} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => onToggleRow(resource)}
                      className="text-left text-xs font-medium transition-colors hover:underline"
                      style={{ color: (allChecked || someChecked) ? 'var(--accent)' : 'var(--text-2)' }}
                    >
                      {resourceLabel(resource)}
                    </button>
                  </td>
                  {PERMISSION_ACTIONS.map((action) => {
                    const key = permKey(resource, action)
                    const checked = localPerms.has(key)
                    return (
                      <td key={action} className="px-4 py-2.5 text-center">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={checked}
                          onClick={() => onToggle(resource, action)}
                          className="mx-auto flex size-4 items-center justify-center rounded border transition-colors"
                          style={{
                            borderColor: checked ? 'var(--accent)' : 'var(--border)',
                            background: checked ? 'var(--accent)' : 'transparent',
                          }}
                        >
                          {checked && <span className="text-[10px] font-bold text-white">✓</span>}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── 基本信息 Tab ──────────────────────────────────────────────────────────────

function RoleInfoTab({ role }: { role: import('@v2/api/roles').Role }) {
  return (
    <div className="p-4">
      <dl className="mx-auto max-w-lg divide-y rounded-lg border text-xs" style={{ borderColor: 'var(--border)' }}>
        {[
          { label: t('roleDetail.info.name', '角色名'),       value: role.name },
          { label: t('roleDetail.info.code', 'code'),         value: role.code },
          { label: t('roleDetail.info.description', '描述'),  value: role.description ?? '—' },
          { label: 'ID',                                       value: `#${role.id}` },
          { label: t('roleDetail.info.isSystem', '内置角色'), value: role.is_system ? t('common.yes', '是') : t('common.no', '否') },
          { label: t('roleDetail.info.permCount', '权限数'),  value: t('roleDetail.info.permCountValue', '{n} 项', { n: role.permissions.length }) },
          { label: t('roleDetail.info.createdAt', '创建时间'), value: fmtDateTime(role.created_at) },
          { label: t('roleDetail.info.updatedAt', '更新时间'), value: fmtDateTime(role.updated_at) },
        ].map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between px-3 py-2">
            <dt style={{ color: 'var(--text-3)' }}>{label}</dt>
            <dd style={{ color: 'var(--text-1)' }}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
