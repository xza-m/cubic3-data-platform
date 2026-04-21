// frontend/src/v2/pages/config/roles/RoleDetail.tsx
//
// 角色详情页（L3，P14）。包含权限矩阵（资源 × 动作）。
// 接口：GET /api/v1/roles/:id  PUT /api/v1/roles/:id
// TODO: 后端 /api/v1/roles/:id 待联调

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

const RESOURCE_LABEL: Record<PermissionResource, string> = {
  datasource:   '数据源',
  dataset:      '数据集',
  extraction:   '提取任务',
  query:        '查询',
  semantic:     '语义层',
  ontology:     '本体',
  app:          '应用',
  app_instance: '应用实例',
  channel:      '通知渠道',
  subscription: '订阅',
  user:         '用户',
  role:         '角色',
}

const ACTION_LABEL: Record<PermissionAction, string> = {
  read:   '查看',
  write:  '编辑',
  delete: '删除',
  admin:  '管理',
}

const TABS = [
  { id: 'permissions', label: '权限矩阵' },
  { id: 'info',        label: '基本信息' },
] as const
type TabId = (typeof TABS)[number]['id']

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
      document.title = `${role.name} · 角色`
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
    toast.show({ tone: 'success', title: '权限已保存' })
    setDirty(false)
  }

  const handleDelete = async () => {
    if (!role) return
    if (!window.confirm(`删除角色「${role.name}」？`)) return
    await deleteMutation.mutateAsync(role.id)
    toast.show({ tone: 'warning', title: '已删除角色', description: role.name })
    navigate('/config/roles')
  }

  if (!Number.isFinite(numericId) || numericId <= 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs" style={{ color: 'var(--text-3)' }}>
        非法的角色 ID
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
        <p className="text-xs" style={{ color: 'var(--danger)' }}>未找到角色 #{numericId}</p>
        <button type="button" onClick={() => refetch()} className="rounded-md border px-3 py-1.5 text-xs" style={{ borderColor: 'var(--border)' }}>重试</button>
      </div>
    )
  }

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
            <ArrowLeft size={11} /> 返回角色列表
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
                {updateMutation.isPending ? '保存中…' : '保存权限'}
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleDelete()}
              className="rounded-md border px-3 py-1.5 text-xs transition-colors"
              style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
            >
              删除
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-3 flex items-center gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className="rounded px-2.5 py-1 text-xs"
              style={{
                background: tab === t.id ? 'var(--accent-soft)' : 'transparent',
                color: tab === t.id ? 'var(--accent)' : 'var(--text-2)',
              }}
            >
              {t.label}
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
        勾选权限后点击右上角「保存权限」生效。点击资源名可整行勾选/取消。
      </p>
      <div className="overflow-auto rounded-lg border" style={{ borderColor: 'var(--border)' }}>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr style={{ background: 'var(--bg-surface-2)', borderBottom: '1px solid var(--border)' }}>
              <th className="px-4 py-2 text-left font-medium" style={{ color: 'var(--text-3)', minWidth: 120 }}>
                资源
              </th>
              {PERMISSION_ACTIONS.map((action) => (
                <th key={action} className="px-4 py-2 text-center font-medium" style={{ color: 'var(--text-3)' }}>
                  {ACTION_LABEL[action]}
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
                      {RESOURCE_LABEL[resource]}
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
          { label: '角色名',   value: role.name },
          { label: '描述',     value: role.description ?? '—' },
          { label: 'ID',       value: `#${role.id}` },
          { label: '权限数',   value: `${role.permissions.length} 项` },
          { label: '创建时间', value: fmtDateTime(role.created_at) },
          { label: '更新时间', value: fmtDateTime(role.updated_at) },
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
