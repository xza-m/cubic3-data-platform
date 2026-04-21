// frontend/src/v2/pages/queries/QueriesSavedDetail.tsx
//
// 已保存查询 L3 详情页。
// 接 GET /api/v1/queries/:id  PUT /api/v1/queries/:id  DELETE /api/v1/queries/:id
// 接 POST /api/v1/queries/:id/favorite

import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Edit2, Star, Trash2 } from 'lucide-react'
import {
  useSavedQueryDetail,
  useSavedQueries,
  useUpdateSavedQuery,
  useDeleteSavedQuery,
  useToggleFavorite,
} from '@v2/hooks/queries'
import { fmtDateTime, fmtRelative } from '@v2/lib/format'
import {
  SavedQueryDetailContent,
  SavedQueryInlineForm,
} from './_shared/saved-query-content'

export default function QueriesSavedDetail() {
  const { id } = useParams<{ id: string }>()
  const numericId = Number(id)
  const navigate = useNavigate()

  const [editing, setEditing] = useState(false)

  const { data: row, isLoading, isError } = useSavedQueryDetail(numericId)
  const { data: listData } = useSavedQueries({ page: 1, page_size: 200 })

  const updateMut = useUpdateSavedQuery()
  const deleteMut = useDeleteSavedQuery()
  const favMut = useToggleFavorite()

  const neighbors = useMemo(() => {
    const items = listData?.items ?? []
    const idx = items.findIndex((r) => r.id === numericId)
    return {
      prev: idx > 0 ? items[idx - 1] : null,
      next: idx >= 0 && idx < items.length - 1 ? items[idx + 1] : null,
    }
  }, [listData?.items, numericId])

  async function handleDelete() {
    if (!row) return
    if (!window.confirm(`删除查询「${row.query_name}」？此操作不可撤销。`)) return
    await deleteMut.mutateAsync(row.id)
    navigate('/queries/saved')
  }

  if (!Number.isFinite(numericId) || numericId <= 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs" style={{ color: 'var(--text-3)' }}>
        非法的查询 ID
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs" style={{ color: 'var(--text-3)' }}>
        加载中…
      </div>
    )
  }

  if (isError || !row) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-red-500 dark:text-red-400">
        未找到查询 #{numericId}
      </div>
    )
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <div
          className="flex items-center gap-2 border-b px-4 py-2"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
        >
          <button
            type="button"
            onClick={() => navigate('/queries/saved')}
            className="flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs transition-colors hover:bg-[color:var(--bg-hover)]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
          >
            <ArrowLeft size={12} /> 返回列表
          </button>
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            className="flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs transition-colors hover:bg-[color:var(--bg-hover)]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
          >
            <Edit2 size={12} /> {editing ? '取消编辑' : '编辑'}
          </button>
          <button
            type="button"
            onClick={() => void favMut.mutateAsync(row.id)}
            disabled={favMut.isPending}
            className="flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs transition-colors hover:bg-[color:var(--bg-hover)]"
            style={{
              borderColor: 'var(--border)',
              color: row.is_favorite ? 'var(--warning)' : 'var(--text-2)',
            }}
          >
            <Star
              size={12}
              fill={row.is_favorite ? 'currentColor' : 'none'}
            />
            {row.is_favorite ? '取消收藏' : '收藏'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/queries/console')}
            className="rounded-md bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white"
          >
            在工作台打开
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={deleteMut.isPending}
            className="ml-auto flex items-center gap-1.5 rounded border border-red-300 px-3 py-1.5 text-xs text-red-600 transition-colors hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            <Trash2 size={12} /> 删除
          </button>
        </div>

        {/* Detail header */}
        <header
          className="border-b px-4 py-3"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-xs font-bold text-white"
              style={{ background: 'var(--accent)' }}
            >
              SQ
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                {row.is_favorite && (
                  <Star size={12} className="text-yellow-500" fill="currentColor" />
                )}
                <span className="truncate">{row.query_name}</span>
                <span
                  className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-normal dark:bg-neutral-800"
                  style={{ color: 'var(--text-3)' }}
                >
                  {row.query_code}
                </span>
              </div>
              <div className="mt-0.5 text-xs" style={{ color: 'var(--text-3)' }}>
                {row.created_by} · 更新于 {fmtRelative(row.updated_at)}
              </div>
            </div>
          </div>
        </header>

        {/* Content or edit form */}
        <div className="flex-1 overflow-auto">
          {editing ? (
            <SavedQueryInlineForm
              initial={{
                query_name: row.query_name,
                sql_query: row.sql_query,
                description: row.description ?? '',
                tags: row.tags?.join(', ') ?? '',
              }}
              onSubmit={async (payload) => {
                await updateMut.mutateAsync({ id: row.id, payload })
                setEditing(false)
              }}
              onCancel={() => setEditing(false)}
              loading={updateMut.isPending}
            />
          ) : (
            <SavedQueryDetailContent
              row={row}
              actions={{
                onOpen: () => navigate('/queries/console'),
                onEdit: () => setEditing(true),
                onDelete: () => void handleDelete(),
                onToggleFavorite: () => void favMut.mutateAsync(row.id),
              }}
            />
          )}
        </div>
      </div>

      {/* Context panel */}
      <aside
        className="w-60 flex-shrink-0 border-l"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        <div
          className="border-b px-4 py-3 text-xs font-medium"
          style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
        >
          <div className="flex items-center gap-1">
            {row.is_favorite && (
              <Star size={11} className="text-yellow-500" fill="currentColor" />
            )}
            <span className="truncate">{row.query_name}</span>
          </div>
          <div className="mt-0.5 text-xs font-normal" style={{ color: 'var(--text-3)' }}>
            #{row.id} · {row.query_code}
          </div>
        </div>
        <div className="space-y-4 px-4 py-4">
          <section>
            <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
              信息
            </div>
            <dl className="mt-2 space-y-1 text-xs">
              <CtxPair label="负责人" value={row.created_by} />
              <CtxPair label="创建" value={fmtDateTime(row.created_at)} />
              <CtxPair label="更新" value={fmtRelative(row.updated_at)} />
            </dl>
          </section>
          {row.tags?.length ? (
            <section>
              <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                标签
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {row.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </section>
          ) : null}
          <section>
            <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
              邻接导航
            </div>
            <div className="mt-2 space-y-1.5 text-xs">
              <NavButton
                label={neighbors.prev ? `← ${neighbors.prev.query_name}` : '没有上一项'}
                disabled={!neighbors.prev}
                onClick={
                  neighbors.prev
                    ? () => navigate(`/queries/saved/${neighbors.prev!.id}`)
                    : undefined
                }
              />
              <NavButton
                label={neighbors.next ? `${neighbors.next.query_name} →` : '没有下一项'}
                disabled={!neighbors.next}
                onClick={
                  neighbors.next
                    ? () => navigate(`/queries/saved/${neighbors.next!.id}`)
                    : undefined
                }
              />
            </div>
          </section>
        </div>
      </aside>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Internal primitives
// ──────────────────────────────────────────────────────────────────────────

function CtxPair({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt style={{ color: 'var(--text-3)' }}>{label}</dt>
      <dd className="truncate" style={{ color: 'var(--text-1)' }}>
        {value}
      </dd>
    </div>
  )
}

function NavButton({
  label,
  onClick,
  disabled,
}: {
  label: string
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-md border px-2 py-1 text-left text-xs transition-colors hover:bg-[color:var(--bg-hover)] hover:text-[color:var(--text-1)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
      style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
    >
      <span className="truncate">{label}</span>
    </button>
  )
}
