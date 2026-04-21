// frontend/src/v2/pages/config/users/UserDetail.tsx
//
// 用户详情页（L3，P14）。
// 接口：GET /api/v1/users/:id  PUT /api/v1/users/:id/roles
// TODO: 后端 /api/v1/users/:id 待联调

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, RefreshCcw, Shield, User } from 'lucide-react'
import { Skeleton, useToast } from '@v2/components/ui'
import { fmtDateTime } from '@v2/lib/format'
import { useUser, useUpdateUser, useAssignUserRoles } from '@v2/hooks/users'
import { useListRoles } from '@v2/hooks/roles'

const TABS = [
  { id: 'info',  label: '基本信息' },
  { id: 'roles', label: '角色绑定' },
  { id: 'login', label: '最近登录' },
] as const
type TabId = (typeof TABS)[number]['id']

export default function UserDetail() {
  const { id } = useParams<{ id: string }>()
  const numericId = Number(id)
  const navigate = useNavigate()
  const toast = useToast()
  const [tab, setTab] = useState<TabId>('info')

  const { data: user, isLoading, isError, refetch, isFetching } = useUser(numericId)
  const updateMutation = useUpdateUser()
  const assignRoles = useAssignUserRoles()
  const { data: rolesData } = useListRoles()
  const allRoles = rolesData?.items ?? []

  useEffect(() => {
    if (user) document.title = `${user.username} · 用户`
  }, [user])

  const handleToggleRole = async (roleId: number) => {
    if (!user) return
    const current = new Set(user.role_ids)
    if (current.has(roleId)) {
      current.delete(roleId)
    } else {
      current.add(roleId)
    }
    await assignRoles.mutateAsync({ id: user.id, payload: { role_ids: Array.from(current) } })
    toast.show({ tone: 'success', title: '角色已更新' })
  }

  if (!Number.isFinite(numericId) || numericId <= 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs" style={{ color: 'var(--text-3)' }}>
        非法的用户 ID
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

  if (isError || !user) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <p className="text-xs" style={{ color: 'var(--danger)' }}>未找到用户 #{numericId}</p>
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
            onClick={() => navigate('/config/users')}
            className="inline-flex items-center gap-1 text-xs hover:underline"
            style={{ color: 'var(--text-3)' }}
          >
            <ArrowLeft size={11} /> 返回用户列表
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
            <User size={14} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                {user.username}
              </span>
              {user.display_name && (
                <span className="text-xs" style={{ color: 'var(--text-3)' }}>{user.display_name}</span>
              )}
              <span
                className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium"
                style={{
                  background: user.is_active ? 'var(--success-soft)' : 'var(--bg-surface-2)',
                  color: user.is_active ? 'var(--success)' : 'var(--text-3)',
                }}
              >
                {user.is_active ? '启用' : '停用'}
              </span>
            </div>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--text-3)' }}>
              #{user.id} · {user.email ?? '无邮箱'} · 创建于 {fmtDateTime(user.created_at)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void updateMutation.mutateAsync({ id: user.id, payload: { is_active: !user.is_active } }).then(() => toast.show({ tone: user.is_active ? 'warning' : 'success', title: user.is_active ? '已停用' : '已启用' }))}
            className="rounded-md border px-3 py-1.5 text-xs transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
          >
            {user.is_active ? '停用账号' : '启用账号'}
          </button>
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
        {tab === 'info' && <UserInfoTab user={user} />}
        {tab === 'roles' && (
          <RolesTab
            userRoleIds={user.role_ids}
            allRoles={allRoles}
            isPending={assignRoles.isPending}
            onToggle={handleToggleRole}
          />
        )}
        {tab === 'login' && <LoginHistoryTab user={user} />}
      </div>
    </div>
  )
}

// ── Tab 内容 ──────────────────────────────────────────────────────────────────

function UserInfoTab({ user }: { user: import('@v2/api/users').User }) {
  return (
    <div className="p-4">
      <dl className="mx-auto max-w-lg divide-y rounded-lg border text-xs" style={{ borderColor: 'var(--border)' }}>
        {[
          { label: '用户名',   value: user.username },
          { label: '显示名',   value: user.display_name ?? '—' },
          { label: '邮箱',     value: user.email ?? '—' },
          { label: 'ID',       value: `#${user.id}` },
          { label: '状态',     value: user.is_active ? '启用' : '停用' },
          { label: '最近登录', value: user.last_login_at ? fmtDateTime(user.last_login_at) : '从未登录' },
          { label: '创建时间', value: fmtDateTime(user.created_at) },
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

function RolesTab({
  userRoleIds,
  allRoles,
  isPending,
  onToggle,
}: {
  userRoleIds: number[]
  allRoles: import('@v2/api/roles').Role[]
  isPending: boolean
  onToggle: (roleId: number) => void
}) {
  const current = new Set(userRoleIds)
  return (
    <div className="p-4">
      <p className="mb-3 text-xs" style={{ color: 'var(--text-3)' }}>
        点击勾选/取消角色绑定，立即生效。
      </p>
      {allRoles.length === 0 ? (
        <div className="rounded-lg border p-6 text-center text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-3)', borderStyle: 'dashed' }}>
          暂无可分配角色
        </div>
      ) : (
        <div className="mx-auto max-w-lg space-y-2">
          {allRoles.map((role) => {
            const checked = current.has(role.id)
            return (
              <button
                key={role.id}
                type="button"
                disabled={isPending}
                onClick={() => onToggle(role.id)}
                className="flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors"
                style={{
                  borderColor: checked ? 'var(--accent)' : 'var(--border)',
                  background: checked ? 'var(--accent-soft)' : 'var(--bg-surface)',
                }}
              >
                <Shield size={14} style={{ color: checked ? 'var(--accent)' : 'var(--text-3)', flexShrink: 0 }} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium" style={{ color: checked ? 'var(--accent)' : 'var(--text-1)' }}>
                    {role.name}
                  </div>
                  {role.description && (
                    <div className="mt-0.5 truncate text-[11px]" style={{ color: 'var(--text-3)' }}>
                      {role.description}
                    </div>
                  )}
                  <div className="mt-0.5 text-[11px]" style={{ color: 'var(--text-3)' }}>
                    {role.permissions.length} 项权限
                  </div>
                </div>
                <div
                  className="flex size-4 shrink-0 items-center justify-center rounded border transition-colors"
                  style={{
                    borderColor: checked ? 'var(--accent)' : 'var(--border)',
                    background: checked ? 'var(--accent)' : 'transparent',
                  }}
                >
                  {checked && <span className="text-[10px] text-white">✓</span>}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function LoginHistoryTab({ user }: { user: import('@v2/api/users').User }) {
  // TODO: 后端暂无 /api/v1/users/:id/login-history 接口，mock 展示最近登录
  const mockHistory = user.last_login_at
    ? [
        { at: user.last_login_at, ip: '—', ua: '—', status: 'success' as const },
      ]
    : []

  return (
    <div className="p-4">
      <p className="mb-3 text-xs" style={{ color: 'var(--text-3)' }}>
        {/* TODO: 后端 /api/v1/users/:id/login-history 未就绪，仅展示最近一次 */}
        最近登录记录（后端待补完整历史接口）
      </p>
      {mockHistory.length === 0 ? (
        <div
          className="rounded-lg border p-6 text-center text-xs"
          style={{ borderColor: 'var(--border)', color: 'var(--text-3)', borderStyle: 'dashed' }}
        >
          暂无登录记录
        </div>
      ) : (
        <div className="mx-auto max-w-lg rounded-lg border" style={{ borderColor: 'var(--border)' }}>
          {mockHistory.map((entry, i) => (
            <div key={i} className="flex items-center justify-between border-b px-3 py-2 last:border-0 text-xs" style={{ borderColor: 'var(--border)' }}>
              <span style={{ color: 'var(--text-2)' }}>{fmtDateTime(entry.at)}</span>
              <span className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: 'var(--success-soft)', color: 'var(--success)' }}>
                成功
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
