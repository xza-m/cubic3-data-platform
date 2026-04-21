// frontend/src/v2/pages/config/roles/Roles.tsx
//
// 角色管理列表页（L0 + EntityFormDialog，P14）。
// 接口：GET /api/v1/roles  POST /api/v1/roles
// TODO: 后端 /api/v1/roles 待联调，当前 API 层有 mock fallback

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, RefreshCcw, Search, Shield } from 'lucide-react'
import { Dialog, Input, Skeleton, useToast } from '@v2/components/ui'
import { fmtDateTime } from '@v2/lib/format'
import { useListRoles, useCreateRole, useDeleteRole } from '@v2/hooks/roles'
import type { Role, CreateRolePayload } from '@v2/api/roles'

export default function Roles() {
  const navigate = useNavigate()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)

  const { data, isLoading, isError, refetch, isFetching } = useListRoles({ q: search || undefined })
  const createMutation = useCreateRole()
  const deleteMutation = useDeleteRole()

  const roles = data?.items ?? []

  const handleCreate = async (payload: CreateRolePayload) => {
    await createMutation.mutateAsync(payload)
    toast.show({ tone: 'success', title: '已创建角色', description: payload.name })
    setCreating(false)
  }

  const handleDelete = async (role: Role) => {
    if (!window.confirm(`删除角色「${role.name}」？`)) return
    await deleteMutation.mutateAsync(role.id)
    toast.show({ tone: 'warning', title: '已删除角色', description: role.name })
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
            <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>角色管理</span>
            <span className="ml-2 text-xs" style={{ color: 'var(--text-3)' }}>
              共 {data?.total ?? 0} 个角色
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-3)' }} />
              <input
                className="rounded border py-1 pl-6 pr-2 text-xs outline-none focus:ring-1"
                style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-1)', width: 160 }}
                placeholder="搜索角色名…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => refetch()}
            >
              <RefreshCcw size={12} className={isFetching ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-white"
              style={{ background: 'var(--accent)' }}
            >
              <Plus size={12} /> 新建角色
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto">
          {isLoading && (
            <div className="space-y-2 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          )}

          {isError && !isLoading && (
            <div className="flex flex-col items-center gap-3 p-8">
              <p className="text-xs" style={{ color: 'var(--danger)' }}>加载失败</p>
              <button type="button" className="btn btn-sm" onClick={() => refetch()}>重试</button>
            </div>
          )}

          {!isLoading && !isError && roles.length === 0 && (
            <div className="flex items-center justify-center p-8 text-xs" style={{ color: 'var(--text-3)' }}>
              {search ? `未找到匹配「${search}」的角色` : '暂无角色'}
            </div>
          )}

          {!isLoading && !isError && roles.length > 0 && (
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr style={{ background: 'var(--bg-surface-2)', borderBottom: '1px solid var(--border)' }}>
                  {['角色名', '描述', '权限数', '创建时间', '操作'].map((h) => (
                    <th key={h} className="px-4 py-2 text-left font-medium" style={{ color: 'var(--text-3)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr
                    key={role.id}
                    className="cursor-pointer transition-colors hover:bg-[color:var(--bg-hover)]"
                    style={{ borderBottom: '1px solid var(--border)' }}
                    onClick={() => navigate(`/config/roles/${role.id}`)}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Shield size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                        <span className="font-medium" style={{ color: 'var(--text-1)' }}>{role.name}</span>
                      </div>
                    </td>
                    <td className="max-w-xs truncate px-4 py-2.5" style={{ color: 'var(--text-3)' }}>
                      {role.description ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums" style={{ color: 'var(--text-2)' }}>
                      {role.permissions.length}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums" style={{ color: 'var(--text-3)' }}>
                      {fmtDateTime(role.created_at)}
                    </td>
                    <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => void handleDelete(role)}
                        className="text-xs hover:underline"
                        style={{ color: 'var(--danger)' }}
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <CreateRoleDialog
        open={creating}
        onClose={() => setCreating(false)}
        onSubmit={handleCreate}
        isPending={createMutation.isPending}
      />
    </div>
  )
}

// ── 创建角色弹窗 ──────────────────────────────────────────────────────────────

function CreateRoleDialog({
  open,
  onClose,
  onSubmit,
  isPending,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (payload: CreateRolePayload) => Promise<void>
  isPending: boolean
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onSubmit({ name, description: description || undefined })
    setName('')
    setDescription('')
  }

  return (
    <Dialog open={open} onClose={onClose} title="新建角色">
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 p-4">
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
            角色名 *
          </label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="角色名称" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
            描述
          </label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="可选" />
        </div>
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>
          创建后在角色详情页配置权限矩阵。
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-4 py-1.5 text-xs hover:bg-[color:var(--bg-hover)]"
            style={{ borderColor: 'var(--border)' }}
          >
            取消
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            {isPending ? '创建中…' : '创建'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
