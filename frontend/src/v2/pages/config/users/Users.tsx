// frontend/src/v2/pages/config/users/Users.tsx
//
// 用户管理列表页（L0 + EntityFormDialog，P14）。
// 接口：GET /api/v1/users  POST /api/v1/users

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, RefreshCcw, Search, UserCheck, UserX } from 'lucide-react'
import { Dialog, Input, Skeleton, Switch, useToast } from '@v2/components/ui'
import { t } from '@v2/i18n'
import { fmtDateTime } from '@v2/lib/format'
import { useListUsers, useCreateUser, useUpdateUser, useDeleteUser } from '@v2/hooks/users'
import { useListRoles } from '@v2/hooks/roles'
import type { User, CreateUserPayload } from '@v2/api/users'

export default function Users() {
  const navigate = useNavigate()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)

  const { data, isLoading, isError, refetch, isFetching } = useListUsers({ q: search || undefined })
  const createMutation = useCreateUser()
  const updateMutation = useUpdateUser()
  const deleteMutation = useDeleteUser()
  const { data: rolesData } = useListRoles()
  const roles = rolesData?.items ?? []

  const users = data?.items ?? []

  const handleCreate = async (payload: CreateUserPayload) => {
    await createMutation.mutateAsync(payload)
    toast.show({
      tone: 'success',
      title: t('users.toast.created', '已创建用户'),
      description: payload.username,
    })
    setCreating(false)
  }

  const handleToggleActive = async (user: User) => {
    await updateMutation.mutateAsync({ id: user.id, payload: { is_active: !user.is_active } })
    toast.show({
      tone: user.is_active ? 'warning' : 'success',
      title: user.is_active
        ? t('users.toast.deactivated', '已停用')
        : t('users.toast.activated', '已启用'),
      description: user.username,
    })
  }

  const handleDelete = async (user: User) => {
    if (!window.confirm(t('users.confirm.delete', '删除用户「{name}」？此操作不可恢复。', { name: user.username }))) return
    await deleteMutation.mutateAsync(user.id)
    toast.show({
      tone: 'warning',
      title: t('users.toast.deleted', '已删除'),
      description: user.username,
    })
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden p-4">
      <div
        className="flex flex-1 flex-col overflow-hidden rounded-md border"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <div>
            <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
              {t('users.page.title', '用户管理')}
            </span>
            <span className="ml-2 text-xs" style={{ color: 'var(--text-3)' }}>
              {t('users.page.count', '共 {n} 名用户', { n: data?.total ?? 0 })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-3)' }} />
              <input
                className="rounded border py-1 pl-6 pr-2 text-xs outline-none focus:ring-1"
                style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-1)', width: 180 }}
                placeholder={t('user.search.placeholder', '搜索用户名…')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => refetch()}
              title={t('action.refresh', '刷新')}
            >
              <RefreshCcw size={12} className={isFetching ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-white"
              style={{ background: 'var(--accent)' }}
            >
              <Plus size={12} /> {t('user.action.create', '新建用户')}
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto">
          {isLoading && (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          )}

          {isError && !isLoading && (
            <div className="flex flex-col items-center gap-3 p-8">
              <p className="text-xs" style={{ color: 'var(--danger)' }}>
                {t('users.state.loadFailed', '加载失败')}
              </p>
              <button type="button" className="btn btn-sm" onClick={() => refetch()}>
                {t('users.action.retry', '重试')}
              </button>
            </div>
          )}

          {!isLoading && !isError && users.length === 0 && (
            <div className="flex items-center justify-center p-8 text-xs" style={{ color: 'var(--text-3)' }}>
              {search
                ? t('users.state.noMatch', '未找到匹配「{q}」的用户', { q: search })
                : t('users.state.empty', '暂无用户')}
            </div>
          )}

          {!isLoading && !isError && users.length > 0 && (
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr style={{ background: 'var(--bg-surface-2)', borderBottom: '1px solid var(--border)' }}>
                  {[
                    t('users.col.username', '用户名'),
                    t('users.col.displayName', '显示名'),
                    t('users.col.email', '邮箱'),
                    t('users.col.roles', '角色'),
                    t('users.col.lastLogin', '最近登录'),
                    t('users.col.status', '状态'),
                    t('users.col.actions', '操作'),
                  ].map((h) => (
                    <th key={h} className="px-4 py-2 text-left font-medium" style={{ color: 'var(--text-3)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const userRoles = roles.filter((r) => user.role_ids.includes(r.id))
                  return (
                    <tr
                      key={user.id}
                      className="cursor-pointer transition-colors hover:bg-[color:var(--bg-hover)]"
                      style={{ borderBottom: '1px solid var(--border)' }}
                      onClick={() => navigate(`/config/users/${user.id}`)}
                    >
                      <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--text-1)' }}>
                        {user.username}
                      </td>
                      <td className="px-4 py-2.5" style={{ color: 'var(--text-2)' }}>
                        {user.display_name ?? '—'}
                      </td>
                      <td className="px-4 py-2.5" style={{ color: 'var(--text-3)' }}>
                        {user.email ?? '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {userRoles.length > 0
                            ? userRoles.map((r) => (
                                <span
                                  key={r.id}
                                  className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium"
                                  style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                                >
                                  {r.name}
                                </span>
                              ))
                            : <span style={{ color: 'var(--text-3)' }}>—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 tabular-nums" style={{ color: 'var(--text-3)' }}>
                        {user.last_login_at ? fmtDateTime(user.last_login_at) : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        {user.is_active ? (
                          <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: 'var(--success-soft)', color: 'var(--success)' }}>
                            <UserCheck size={10} /> {t('users.status.active', '启用')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: 'var(--bg-surface-2)', color: 'var(--text-3)' }}>
                            <UserX size={10} /> {t('users.status.inactive', '停用')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleToggleActive(user)}
                            className="text-xs hover:underline"
                            style={{ color: 'var(--text-2)' }}
                          >
                            {user.is_active
                              ? t('users.action.deactivate', '停用')
                              : t('users.action.activate', '启用')}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(user)}
                            className="text-xs hover:underline"
                            style={{ color: 'var(--danger)' }}
                          >
                            {t('users.action.delete', '删除')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 创建用户弹窗 */}
      <CreateUserDialog
        open={creating}
        onClose={() => setCreating(false)}
        onSubmit={handleCreate}
        isPending={createMutation.isPending}
      />
    </div>
  )
}

// ── 创建用户弹窗 ──────────────────────────────────────────────────────────────

function CreateUserDialog({
  open,
  onClose,
  onSubmit,
  isPending,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (payload: CreateUserPayload) => Promise<void>
  isPending: boolean
}) {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')

  const reset = () => {
    setUsername('')
    setEmail('')
    setDisplayName('')
    setPassword('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onSubmit({ username, email: email || undefined, display_name: displayName || undefined, password })
    reset()
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('users.dialog.create.title', '新建用户')}>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 p-4">
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
            {t('users.dialog.field.username', '用户名 *')}
          </label>
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            placeholder={t('users.dialog.placeholder.username', '用户名')}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
            {t('users.dialog.field.password', '密码 *')}
          </label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder={t('users.dialog.placeholder.password', '初始密码')}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
            {t('users.dialog.field.displayName', '显示名')}
          </label>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t('users.dialog.placeholder.optional', '可选')}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
            {t('users.dialog.field.email', '邮箱')}
          </label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('users.dialog.placeholder.optional', '可选')}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-4 py-1.5 text-xs hover:bg-[color:var(--bg-hover)]"
            style={{ borderColor: 'var(--border)' }}
          >
            {t('users.dialog.cancel', '取消')}
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            {isPending
              ? t('users.dialog.creating', '创建中…')
              : t('users.dialog.submit', '创建')}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

// suppress unused import
void Switch
