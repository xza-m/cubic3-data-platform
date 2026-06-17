// frontend/src/v2/pages/queries/QueriesSavedDetail.tsx
//
// 已保存查询 L3 详情页。
// 接 GET /api/v1/queries/:id  PUT /api/v1/queries/:id  DELETE /api/v1/queries/:id
// 接 POST /api/v1/queries/:id/favorite

import { useMemo, useState } from 'react'
import { useNavigate, useParams, type NavigateFunction } from 'react-router-dom'
import { ArrowLeft, Edit2, ExternalLink, Star, Trash2 } from 'lucide-react'
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
import { ActionIconButton } from '@v2/components/ActionIconButton'
import { IdentityName } from '@v2/components/IdentityName'
import { useConfirm } from '@v2/components/ui'
import { openQueryWorkbenchWithPrefill } from './_shared/workbench-prefill'
import { t } from '@v2/i18n'
import type { SavedQuery, SavedQueryDetail } from '@v2/api/queries'

function openSavedQueryInWorkbench(row: SavedQuery | SavedQueryDetail, navigate: NavigateFunction) {
  openQueryWorkbenchWithPrefill(
    {
      sql: row.sql_query,
      source_id: row.source_id,
      origin: 'saved_query',
      query_id: row.id,
      query_name: row.query_name,
      principal_id: row.created_by,
      principal_display_name: row.created_by_display_name ?? undefined,
    },
    navigate,
  )
}

export default function QueriesSavedDetail() {
  const { id } = useParams<{ id: string }>()
  const numericId = Number(id)
  const navigate = useNavigate()
  const confirm = useConfirm()

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
    if (
      !(await confirm({
        title: t('queriesSavedDetail.confirm.delete', '删除查询「{name}」？此操作不可撤销。', {
          name: row.query_name,
        }),
        tone: 'danger',
      }))
    )
      return
    await deleteMut.mutateAsync(row.id)
    navigate('/queries/my')
  }

  if (!Number.isFinite(numericId) || numericId <= 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs" style={{ color: 'var(--text-3)' }}>
        {t('queriesSavedDetail.error.invalidId', '非法的查询 ID')}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs" style={{ color: 'var(--text-3)' }}>
        {t('queriesSavedDetail.loading', '加载中…')}
      </div>
    )
  }

  if (isError || !row) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-red-500 dark:text-red-400">
        {t('queriesSavedDetail.error.notFound', '未找到查询 #{id}', { id: numericId })}
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
            onClick={() => navigate('/queries/my')}
            className="flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs transition-colors hover:bg-[color:var(--bg-hover)]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
          >
            <ArrowLeft size={12} /> {t('queriesSavedDetail.action.back', '返回列表')}
          </button>
          <div className="ml-auto flex items-center gap-1.5">
            <ActionIconButton
              label={
                editing
                  ? t('queriesSavedDetail.action.cancelEdit', '取消编辑')
                  : t('queriesSavedDetail.action.edit', '编辑')
              }
              icon={Edit2}
              onClick={() => setEditing((e) => !e)}
            />
            <ActionIconButton
              label={
                row.is_favorite
                  ? t('queriesSavedDetail.action.unfavorite', '取消收藏')
                  : t('queriesSavedDetail.action.favorite', '收藏')
              }
              icon={Star}
              loading={favMut.isPending}
              onClick={() => void favMut.mutateAsync(row.id)}
            />
            <ActionIconButton
              label={t('queriesSavedDetail.action.openInConsole', '在工作台打开')}
              icon={ExternalLink}
              variant="primary"
              onClick={() => openSavedQueryInWorkbench(row, navigate)}
            />
            <ActionIconButton
              label={t('queriesSavedDetail.action.delete', '删除')}
              icon={Trash2}
              variant="danger"
              loading={deleteMut.isPending}
              onClick={() => void handleDelete()}
            />
          </div>
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
                <IdentityName value={row.created_by} displayName={row.created_by_display_name} /> ·{' '}
                {t('queriesSavedDetail.meta.updatedAt', '更新于 {time}', { time: fmtRelative(row.updated_at) })}
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
                onOpen: () => openSavedQueryInWorkbench(row, navigate),
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
              {t('queriesSavedDetail.ctx.info', '信息')}
            </div>
            <dl className="mt-2 space-y-1 text-xs">
              <CtxPair
                label={t('queriesSavedDetail.info.owner', '负责人')}
                value={<IdentityName value={row.created_by} displayName={row.created_by_display_name} />}
              />
              <CtxPair label={t('queriesSavedDetail.info.createdAt', '创建')} value={fmtDateTime(row.created_at)} />
              <CtxPair label={t('queriesSavedDetail.info.updatedAt', '更新')} value={fmtRelative(row.updated_at)} />
            </dl>
          </section>
          {row.tags?.length ? (
            <section>
              <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                {t('queriesSavedDetail.ctx.tags', '标签')}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {row.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </section>
          ) : null}
          <section>
            <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
              {t('queriesSavedDetail.ctx.neighbors', '邻接导航')}
            </div>
            <div className="mt-2 space-y-1.5 text-xs">
              <NavButton
                label={neighbors.prev ? `← ${neighbors.prev.query_name}` : t('queriesSavedDetail.neighbor.noPrev', '没有上一项')}
                disabled={!neighbors.prev}
                onClick={
                  neighbors.prev
                    ? () => navigate(`/queries/my/${neighbors.prev!.id}`)
                    : undefined
                }
              />
              <NavButton
                label={neighbors.next ? `${neighbors.next.query_name} →` : t('queriesSavedDetail.neighbor.noNext', '没有下一项')}
                disabled={!neighbors.next}
                onClick={
                  neighbors.next
                    ? () => navigate(`/queries/my/${neighbors.next!.id}`)
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

function CtxPair({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
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
  label: React.ReactNode
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
