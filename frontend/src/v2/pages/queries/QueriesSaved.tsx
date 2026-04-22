// frontend/src/v2/pages/queries/QueriesSaved.tsx
//
// 已保存查询列表（L0）+ Peek。
// 接 GET /api/v1/queries   POST /api/v1/queries
// 接 DELETE /api/v1/queries/:id  POST /api/v1/queries/:id/favorite

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Star } from 'lucide-react'
import {
  useSavedQueries,
  useDeleteSavedQuery,
  useToggleFavorite,
} from '@v2/hooks/queries'
import { fmtNum, fmtRelative } from '@v2/lib/format'
import type { SavedQuery } from '@v2/api/queries'
import { SavedQueryDetailContent } from './_shared/saved-query-content'
import { t } from '@v2/i18n'

export default function QueriesSaved() {
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [isFavorite, setIsFavorite] = useState(false)
  const [page, setPage] = useState(1)
  const [peekRow, setPeekRow] = useState<SavedQuery | null>(null)

  const { data, isLoading, isError, refetch } = useSavedQueries({
    page,
    page_size: 20,
    is_favorite: isFavorite || undefined,
    search: search || undefined,
  })

  const deleteMut = useDeleteSavedQuery()
  const favMut = useToggleFavorite()

  const rows = data?.items ?? []
  const total = data?.total ?? 0
  const pageSize = data?.page_size ?? 20

  async function handleDelete(row: SavedQuery) {
    if (
      !window.confirm(
        t('queries.saved.confirm.delete', '删除查询「{name}」？此操作不可撤销。', {
          name: row.query_name,
        }),
      )
    )
      return
    await deleteMut.mutateAsync(row.id)
    if (peekRow?.id === row.id) setPeekRow(null)
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Main list */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div
          className="flex items-center gap-3 border-b px-4 py-3"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
        >
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
              {t('queries.saved.title', '已保存查询')}
            </div>
            <div className="text-xs" style={{ color: 'var(--text-3)' }}>
              GET /api/v1/queries
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder={t('queries.saved.search.placeholder', '搜索名称…')}
              className="w-48 rounded border bg-transparent px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[color:var(--accent)]"
              style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
            />
            <button
              type="button"
              onClick={() => { setIsFavorite((f) => !f); setPage(1) }}
              className="flex items-center gap-1 rounded border px-2 py-1.5 text-xs transition-colors hover:bg-[color:var(--bg-hover)]"
              style={{
                borderColor: 'var(--border)',
                color: isFavorite ? 'var(--warning)' : 'var(--text-3)',
              }}
            >
              <Star size={12} fill={isFavorite ? 'currentColor' : 'none'} />
              {t('queries.saved.filter.favorites', '收藏')}
            </button>
            <button
              type="button"
              onClick={() => navigate('/queries/saved/new')}
              className="flex items-center gap-1.5 rounded-md bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white"
            >
              <Plus size={12} /> {t('queries.saved.action.create', '新建查询')}
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <SkeletonRows />
          ) : isError ? (
            <div className="flex h-full flex-col items-center justify-center gap-2">
              <span className="text-xs text-red-500">{t('queries.saved.error.load', '加载失败')}</span>
              <button
                type="button"
                onClick={() => void refetch()}
                className="text-xs underline"
                style={{ color: 'var(--accent)' }}
              >
                {t('queries.saved.action.retry', '重试')}
              </button>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                {search || isFavorite
                  ? t('queries.saved.empty.filtered', '没有匹配结果')
                  : t('queries.saved.empty.all', '暂无已保存查询')}
              </p>
              {!search && !isFavorite && (
                <button
                  type="button"
                  onClick={() => navigate('/queries/saved/new')}
                  className="rounded-md bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white"
                >
                  {t('queries.saved.action.createFirst', '新建第一个查询')}
                </button>
              )}
            </div>
          ) : (
            <table className="w-full border-collapse text-xs">
              <thead
                className="sticky top-0"
                style={{ background: 'var(--bg-surface)', color: 'var(--text-2)' }}
              >
                <tr>
                  <Th>{t('queries.saved.col.name', '名称')}</Th>
                  <Th>{t('queries.saved.col.code', '代码')}</Th>
                  <Th>{t('queries.saved.col.owner', '负责人')}</Th>
                  <Th>{t('queries.saved.col.tags', '标签')}</Th>
                  <Th>{t('queries.saved.col.favorite', '收藏')}</Th>
                  <Th>{t('queries.saved.col.updatedAt', '更新于')}</Th>
                  <Th>{t('queries.saved.col.actions', '操作')}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer transition-colors hover:bg-[color:var(--bg-hover)]"
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: peekRow?.id === row.id ? 'var(--accent-soft)' : undefined,
                    }}
                    onClick={() => setPeekRow(row)}
                    onDoubleClick={() => navigate(`/queries/saved/${row.id}`)}
                  >
                    <Td>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1 font-medium" style={{ color: 'var(--text-1)' }}>
                          {row.is_favorite && (
                            <Star size={11} className="text-yellow-500" fill="currentColor" />
                          )}
                          <span className="truncate">{row.query_name}</span>
                        </div>
                        {row.description && (
                          <div className="truncate text-xs" style={{ color: 'var(--text-3)' }}>
                            {row.description}
                          </div>
                        )}
                      </div>
                    </Td>
                    <Td>
                      <code style={{ color: 'var(--text-3)' }}>{row.query_code}</code>
                    </Td>
                    <Td>{row.created_by}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {row.tags?.map((t) => (
                          <span
                            key={t}
                            className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </Td>
                    <Td>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          void favMut.mutateAsync(row.id)
                        }}
                        className="rounded p-0.5 transition-colors hover:bg-[color:var(--bg-hover)]"
                        aria-label={
                          row.is_favorite
                            ? t('queries.saved.action.unfavorite', '取消收藏')
                            : t('queries.saved.filter.favorites', '收藏')
                        }
                      >
                        <Star
                          size={13}
                          className={row.is_favorite ? 'text-yellow-500' : ''}
                          style={{ color: row.is_favorite ? undefined : 'var(--text-4)' }}
                          fill={row.is_favorite ? 'currentColor' : 'none'}
                        />
                      </button>
                    </Td>
                    <Td>
                      <span style={{ color: 'var(--text-3)' }}>{fmtRelative(row.updated_at)}</span>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/queries/saved/${row.id}`)
                          }}
                          className="rounded px-1.5 py-0.5 text-xs transition-colors hover:bg-[color:var(--bg-hover)]"
                          style={{ color: 'var(--accent)' }}
                        >
                          {t('queries.saved.action.detail', '详情')}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            void handleDelete(row)
                          }}
                          className="rounded px-1.5 py-0.5 text-xs text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          {t('queries.saved.action.delete', '删除')}
                        </button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {total > pageSize && (
          <div
            className="flex items-center justify-between border-t px-4 py-2 text-xs"
            style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}
          >
            <span>{t('queries.saved.pagination.total', '共 {n} 条', { n: fmtNum(total) })}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded border px-2 py-1 disabled:opacity-40"
                style={{ borderColor: 'var(--border)' }}
              >
                {t('queries.saved.pagination.prev', '上一页')}
              </button>
              <span>
                {page} / {Math.ceil(total / pageSize)}
              </span>
              <button
                type="button"
                disabled={page >= Math.ceil(total / pageSize)}
                onClick={() => setPage((p) => p + 1)}
                className="rounded border px-2 py-1 disabled:opacity-40"
                style={{ borderColor: 'var(--border)' }}
              >
                {t('queries.saved.pagination.next', '下一页')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Peek panel */}
      {peekRow && (
        <aside
          className="w-80 flex-shrink-0 overflow-auto border-l"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
        >
          <div
            className="flex items-start justify-between border-b px-4 py-3"
            style={{ borderColor: 'var(--border)' }}
          >
            <div>
              <div className="flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--text-1)' }}>
                {peekRow.is_favorite && (
                  <Star size={11} className="text-yellow-500" fill="currentColor" />
                )}
                {peekRow.query_name}
              </div>
              <div className="text-xs" style={{ color: 'var(--text-3)' }}>
                #{peekRow.id} · {peekRow.query_code}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => navigate(`/queries/saved/${peekRow.id}`)}
                className="rounded px-2 py-1 text-xs transition-colors hover:bg-[color:var(--bg-hover)]"
                style={{ color: 'var(--accent)' }}
              >
                {t('queries.saved.action.detail', '详情')}
              </button>
              <button
                type="button"
                onClick={() => setPeekRow(null)}
                className="rounded p-1 text-xs transition-colors hover:bg-[color:var(--bg-hover)]"
                style={{ color: 'var(--text-3)' }}
              >
                ✕
              </button>
            </div>
          </div>
          <SavedQueryDetailContent
            row={peekRow}
            actions={{
              onOpen: () => navigate('/queries/console'),
              onEdit: () => navigate(`/queries/saved/${peekRow.id}`),
              onDelete: () => void handleDelete(peekRow),
              onToggleFavorite: () => void favMut.mutateAsync(peekRow.id),
            }}
          />
        </aside>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Internal primitives
// ──────────────────────────────────────────────────────────────────────────

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th
      className="border-b px-3 py-2 text-left font-medium"
      style={{ borderColor: 'var(--border)' }}
    >
      {children}
    </th>
  )
}

function Td({ children }: { children?: React.ReactNode }) {
  return (
    <td className="px-3 py-2" style={{ color: 'var(--text-1)' }}>
      {children}
    </td>
  )
}

function SkeletonRows() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex gap-3">
          <div className="h-4 w-32 animate-pulse rounded" style={{ background: 'var(--bg-skeleton)' }} />
          <div className="h-4 flex-1 animate-pulse rounded" style={{ background: 'var(--bg-skeleton)' }} />
          <div className="h-4 w-16 animate-pulse rounded" style={{ background: 'var(--bg-skeleton)' }} />
        </div>
      ))}
    </div>
  )
}
