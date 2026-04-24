// frontend/src/v2/pages/config/users/UserDetail.tsx
//
// 用户详情页（L3，P14）。
// 接口：GET /api/v1/users/:id  PUT /api/v1/users/:id/roles

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, RefreshCcw, Shield, User } from 'lucide-react'
import { Skeleton, useToast } from '@v2/components/ui'
import { fmtDateTime } from '@v2/lib/format'
import { useUser, useUpdateUser, useAssignUserRoles, useUserLoginHistory } from '@v2/hooks/users'
import { useListRoles } from '@v2/hooks/roles'
import { t } from '@v2/i18n'

const TAB_IDS = ['info', 'roles', 'login'] as const
type TabId = (typeof TAB_IDS)[number]

function buildTabs(): { id: TabId; label: string }[] {
  return [
    { id: 'info',  label: t('userDetail.tab.info', '基本信息') },
    { id: 'roles', label: t('userDetail.tab.roles', '角色绑定') },
    { id: 'login', label: t('userDetail.tab.login', '最近登录') },
  ]
}

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
    if (user) document.title = t('userDetail.docTitle', '{name} · 用户', { name: user.username })
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
    toast.show({ tone: 'success', title: t('userDetail.toast.rolesUpdated', '角色已更新') })
  }

  if (!Number.isFinite(numericId) || numericId <= 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs" style={{ color: 'var(--text-3)' }}>
        {t('userDetail.state.invalidId', '非法的用户 ID')}
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
        <p className="text-xs" style={{ color: 'var(--danger)' }}>
          {t('userDetail.state.notFound', '未找到用户 #{id}', { id: numericId })}
        </p>
        <button type="button" onClick={() => refetch()} className="rounded-md border px-3 py-1.5 text-xs" style={{ borderColor: 'var(--border)' }}>
          {t('userDetail.action.retry', '重试')}
        </button>
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
            <ArrowLeft size={11} /> {t('userDetail.action.back', '返回用户列表')}
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
                {user.is_active
                  ? t('userDetail.status.active', '启用')
                  : t('userDetail.status.inactive', '停用')}
              </span>
            </div>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--text-3)' }}>
              #{user.id} · {user.email ?? t('userDetail.meta.noEmail', '无邮箱')} ·{' '}
              {t('userDetail.meta.createdAt', '创建于 {time}', { time: fmtDateTime(user.created_at) })}
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              void updateMutation
                .mutateAsync({ id: user.id, payload: { is_active: !user.is_active } })
                .then(() =>
                  toast.show({
                    tone: user.is_active ? 'warning' : 'success',
                    title: user.is_active
                      ? t('userDetail.toast.deactivated', '已停用')
                      : t('userDetail.toast.activated', '已启用'),
                  }),
                )
            }
            className="rounded-md border px-3 py-1.5 text-xs transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
          >
            {user.is_active
              ? t('userDetail.action.deactivate', '停用账号')
              : t('userDetail.action.activate', '启用账号')}
          </button>
        </div>

        {/* Tabs */}
        <div className="mt-3 flex items-center gap-1">
          {buildTabs().map((tb) => (
            <button
              key={tb.id}
              type="button"
              onClick={() => setTab(tb.id)}
              className="rounded px-2.5 py-1 text-xs"
              style={{
                background: tab === tb.id ? 'var(--accent-soft)' : 'transparent',
                color: tab === tb.id ? 'var(--accent)' : 'var(--text-2)',
              }}
            >
              {tb.label}
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
          { label: t('userDetail.info.username', '用户名'),    value: user.username },
          { label: t('userDetail.info.displayName', '显示名'), value: user.display_name ?? '—' },
          { label: t('userDetail.info.email', '邮箱'),         value: user.email ?? '—' },
          { label: 'ID',                                         value: `#${user.id}` },
          {
            label: t('userDetail.info.status', '状态'),
            value: user.is_active
              ? t('userDetail.status.active', '启用')
              : t('userDetail.status.inactive', '停用'),
          },
          {
            label: t('userDetail.info.lastLogin', '最近登录'),
            value: user.last_login_at ? fmtDateTime(user.last_login_at) : t('userDetail.info.neverLogin', '从未登录'),
          },
          { label: t('userDetail.info.createdAt', '创建时间'), value: fmtDateTime(user.created_at) },
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
        {t('userDetail.roles.hint', '点击勾选/取消角色绑定，立即生效。')}
      </p>
      {allRoles.length === 0 ? (
        <div className="rounded-lg border p-6 text-center text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-3)', borderStyle: 'dashed' }}>
          {t('userDetail.roles.empty', '暂无可分配角色')}
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
                    {t('userDetail.roles.permCount', '{n} 项权限', { n: role.permissions.length })}
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
  const [page, setPage] = useState(1)
  const { data, isLoading, isError } = useUserLoginHistory(user.id, { page, page_size: 20 })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const pageSize = data?.page_size ?? 20
  const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1

  return (
    <div className="p-4">
      <p className="mb-3 text-xs" style={{ color: 'var(--text-3)' }}>
        {t('userDetail.login.hint', '最近登录事件（成功 / 失败）')}
      </p>
      {isLoading ? (
        <div className="mx-auto max-w-2xl space-y-2">
          {[0, 1, 2].map((k) => (
            <Skeleton key={k} className="h-8 w-full" />
          ))}
        </div>
      ) : isError ? (
        <div
          className="rounded-lg border p-6 text-center text-xs"
          style={{ borderColor: 'var(--border)', color: 'var(--danger)', borderStyle: 'dashed' }}
        >
          {t('userDetail.login.loadError', '加载登录历史失败')}
        </div>
      ) : items.length === 0 ? (
        <div
          className="rounded-lg border p-6 text-center text-xs"
          style={{ borderColor: 'var(--border)', color: 'var(--text-3)', borderStyle: 'dashed' }}
        >
          {t('userDetail.login.empty', '暂无登录记录')}
        </div>
      ) : (
        <>
          <div className="mx-auto max-w-2xl overflow-hidden rounded-lg border" style={{ borderColor: 'var(--border)' }}>
            <div
              className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b px-3 py-2 text-[11px] font-medium"
              style={{ borderColor: 'var(--border)', color: 'var(--text-3)', background: 'var(--bg-surface-2)' }}
            >
              <span>{t('userDetail.login.col.time', '时间')}</span>
              <span>{t('userDetail.login.col.ip', 'IP')}</span>
              <span>{t('userDetail.login.col.status', '状态')}</span>
            </div>
            {items.map((entry) => (
              <div
                key={entry.id}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b px-3 py-2 last:border-0 text-xs"
                style={{ borderColor: 'var(--border)' }}
              >
                <span style={{ color: 'var(--text-2)' }}>{entry.logged_at ? fmtDateTime(entry.logged_at) : '—'}</span>
                <span className="font-mono text-[11px]" style={{ color: 'var(--text-3)' }}>
                  {entry.ip || '—'}
                </span>
                {entry.status === 'success' ? (
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px]"
                    style={{ background: 'var(--success-soft)', color: 'var(--success)' }}
                  >
                    {t('userDetail.login.success', '成功')}
                  </span>
                ) : (
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px]"
                    title={entry.error_reason || undefined}
                    style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
                  >
                    {t('userDetail.login.failed', '失败')}
                  </span>
                )}
              </div>
            ))}
          </div>
          {totalPages > 1 ? (
            <div className="mx-auto mt-3 flex max-w-2xl items-center justify-between text-xs" style={{ color: 'var(--text-3)' }}>
              <span>
                {t('userDetail.login.total', '共 {n} 条', { n: String(total) })}
              </span>
              <div className="flex items-center gap-1">
                <button
                  className="rounded border px-2 py-0.5 disabled:opacity-40"
                  style={{ borderColor: 'var(--border)' }}
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t('pagination.prev', '上一页')}
                </button>
                <span>
                  {page} / {totalPages}
                </span>
                <button
                  className="rounded border px-2 py-0.5 disabled:opacity-40"
                  style={{ borderColor: 'var(--border)' }}
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  {t('pagination.next', '下一页')}
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
