// frontend/src/v2/pages/queries/QueryHistoryDetail.tsx
//
// 查询历史 L3 详情页。
// 主体数据走 GET /api/v1/queries/histories/:id；邻接导航仍借助 list 拉取。

import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Play } from 'lucide-react'
import { useQueryHistories, useQueryHistoryDetail } from '@v2/hooks/queries'
import { t } from '@v2/i18n'
import { fmtNum, fmtRelative } from '@v2/lib/format'
import {
  QueryHistoryDetailContent,
  statusChip,
} from './_shared/query-history-content'

export default function QueryHistoryDetail() {
  const { id } = useParams<{ id: string }>()
  const numericId = Number(id)
  const navigate = useNavigate()

  const { data: row, isLoading, isError } = useQueryHistoryDetail(numericId)
  // 邻接导航使用 list（同一 page_size 内相邻的 id）。
  const { data: listData } = useQueryHistories({ page: 1, page_size: 200 })

  const neighbors = useMemo(() => {
    const items = listData?.items ?? []
    const idx = items.findIndex((r) => r.id === numericId)
    return {
      prev: idx > 0 ? items[idx - 1] : null,
      next: idx >= 0 && idx < items.length - 1 ? items[idx + 1] : null,
    }
  }, [listData?.items, numericId])

  if (!Number.isFinite(numericId) || numericId <= 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs" style={{ color: 'var(--text-3)' }}>
        {t('queryHistoryDetail.error.invalidId', '非法的运行 ID')}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs" style={{ color: 'var(--text-3)' }}>
        {t('common.loading', '加载中…')}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-red-500">
        {t('common.loadError', '加载失败')}
      </div>
    )
  }

  if (!row) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-red-500 dark:text-red-400">
        {t('queryHistoryDetail.error.notFound', '未找到运行记录 #{id}', { id: numericId })}
      </div>
    )
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar actions */}
        <div
          className="flex items-center gap-2 border-b px-4 py-2"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
        >
          <button
            type="button"
            onClick={() => navigate('/queries/history')}
            className="flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs transition-colors hover:bg-[color:var(--bg-hover)]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
          >
            <ArrowLeft size={12} /> {t('common.backToList', '返回列表')}
          </button>
          <button
            type="button"
            onClick={() => navigate('/queries/console')}
            className="flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs transition-colors hover:bg-[color:var(--bg-hover)]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
          >
            <Play size={12} /> {t('queryHistoryDetail.action.replay', '在工作台重跑')}
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
              QH
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                <span>{t('queryHistoryDetail.run', '运行 #{id}', { id: row.id })}</span>
                {statusChip(row.status)}
              </div>
              <div className="mt-0.5 text-xs" style={{ color: 'var(--text-3)' }}>
                {row.source_name ? <code>{row.source_name}</code> : '—'} · {row.executed_by} ·{' '}
                {fmtRelative(row.executed_at)}
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          <QueryHistoryDetailContent
            row={row}
            actions={{
              onReplay: () => navigate('/queries/console'),
            }}
          />
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
          {t('queryHistoryDetail.run', '运行 #{id}', { id: row.id })}
          <div className="mt-0.5 text-xs font-normal" style={{ color: 'var(--text-3)' }}>
            {row.source_name ?? '—'}
          </div>
        </div>
        <div className="space-y-4 px-4 py-4">
          <section>
            <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
              {t('queryHistoryDetail.ctx.status', '状态')}
            </div>
            <div className="mt-2 flex items-center gap-1.5">{statusChip(row.status)}</div>
          </section>
          <section>
            <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
              {t('queryHistoryDetail.ctx.exec', '执行')}
            </div>
            <dl className="mt-2 space-y-1 text-xs">
              <CtxPair
                label={t('queryHistoryDetail.ctx.duration', '耗时')}
                value={
                  row.execution_time_ms != null
                    ? `${(row.execution_time_ms / 1000).toFixed(2)}s`
                    : '—'
                }
              />
              <CtxPair
                label={t('queryHistoryDetail.ctx.rowCount', '行数')}
                value={row.row_count != null ? fmtNum(row.row_count) : '—'}
              />
              <CtxPair label={t('queryHistoryDetail.ctx.executedBy', '执行人')} value={row.executed_by} />
              <CtxPair label={t('queryHistoryDetail.ctx.executedAt', '时间')} value={fmtRelative(row.executed_at)} />
            </dl>
          </section>
          <section>
            <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
              {t('queryHistoryDetail.ctx.nav', '邻接导航')}
            </div>
            <div className="mt-2 space-y-1.5 text-xs">
              <NavButton
                label={neighbors.prev ? `← #${neighbors.prev.id}` : t('queryHistoryDetail.nav.noPrev', '没有上一项')}
                disabled={!neighbors.prev}
                onClick={
                  neighbors.prev
                    ? () => navigate(`/queries/history/${neighbors.prev!.id}`)
                    : undefined
                }
              />
              <NavButton
                label={neighbors.next ? `#${neighbors.next.id} →` : t('queryHistoryDetail.nav.noNext', '没有下一项')}
                disabled={!neighbors.next}
                onClick={
                  neighbors.next
                    ? () => navigate(`/queries/history/${neighbors.next!.id}`)
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
