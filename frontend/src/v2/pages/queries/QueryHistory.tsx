// frontend/src/v2/pages/queries/QueryHistory.tsx
//
// 查询历史列表（L0）。
// 接 GET /api/v1/queries/histories

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Filter } from 'lucide-react'
import { useQueryHistories } from '@v2/hooks/queries'
import { fmtNum, fmtRelative } from '@v2/lib/format'
import type { QueryHistoryItem } from '@v2/api/queries'
import {
  QueryHistoryDetailContent,
  statusChip,
} from './_shared/query-history-content'
import { t } from '@v2/i18n'

function statusOptions() {
  return [
    { value: '', label: t('queryHistoryList.status.all', '全部状态') },
    { value: 'success', label: t('queryHistoryList.status.success', '成功') },
    { value: 'failed', label: t('queryHistoryList.status.failed', '失败') },
    { value: 'running', label: t('queryHistoryList.status.running', '运行中') },
  ]
}

export default function QueryHistory() {
  const navigate = useNavigate()

  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [peekRow, setPeekRow] = useState<QueryHistoryItem | null>(null)

  const { data, isLoading, isError, refetch } = useQueryHistories({
    page,
    page_size: 20,
    status: status || undefined,
  })

  const rows = useMemo(() => {
    const items = data?.items ?? []
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter(
      (r) =>
        r.sql_query?.toLowerCase().includes(q) ||
        r.executed_by?.toLowerCase().includes(q) ||
        r.source_name?.toLowerCase().includes(q),
    )
  }, [data?.items, search])

  const total = data?.total ?? 0
  const pageSize = data?.page_size ?? 20

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
              {t('queryHistoryList.title', '查询历史')}
            </div>
            <div className="text-xs" style={{ color: 'var(--text-3)' }}>
              GET /api/v1/queries/histories
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('queryHistoryList.search.placeholder', '按 SQL / 执行人 / 数据源搜索…')}
              className="w-56 rounded border bg-transparent px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[color:var(--accent)]"
              style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
            />
            <Filter size={14} style={{ color: 'var(--text-3)' }} />
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1) }}
              className="rounded border bg-transparent px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[color:var(--accent)]"
              style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
            >
              {statusOptions().map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <SkeletonRows />
          ) : isError ? (
            <div className="flex h-full flex-col items-center justify-center gap-2">
              <span className="text-xs text-red-500">{t('queryHistoryList.error.load', '加载失败')}</span>
              <button
                type="button"
                onClick={() => void refetch()}
                className="text-xs underline"
                style={{ color: 'var(--accent)' }}
              >
                {t('queryHistoryList.action.retry', '重试')}
              </button>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs" style={{ color: 'var(--text-3)' }}>
              {t('queryHistoryList.empty', '暂无查询历史')}
            </div>
          ) : (
            <table className="w-full border-collapse text-xs">
              <thead
                className="sticky top-0"
                style={{ background: 'var(--bg-surface)', color: 'var(--text-2)' }}
              >
                <tr>
                  <Th>#</Th>
                  <Th>SQL</Th>
                  <Th>{t('queryHistoryList.col.status', '状态')}</Th>
                  <Th>{t('queryHistoryList.col.source', '数据源')}</Th>
                  <Th>{t('queryHistoryList.col.executor', '执行人')}</Th>
                  <Th>{t('queryHistoryList.col.executedAt', '执行时间')}</Th>
                  <Th align="right">{t('queryHistoryList.col.duration', '耗时')}</Th>
                  <Th align="right">{t('queryHistoryList.col.rowCount', '行数')}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer transition-colors hover:bg-[color:var(--bg-hover)]"
                    style={{ borderBottom: '1px solid var(--border)' }}
                    onClick={() => setPeekRow(row)}
                    onDoubleClick={() => navigate(`/queries/history/${row.id}`)}
                  >
                    <Td>
                      <code style={{ color: 'var(--text-3)' }}>#{row.id}</code>
                    </Td>
                    <Td>
                      <code
                        className="block max-w-xs truncate"
                        style={{ color: 'var(--text-3)' }}
                      >
                        {row.sql_query?.slice(0, 80)}
                      </code>
                    </Td>
                    <Td>{statusChip(row.status)}</Td>
                    <Td>
                      <code style={{ color: 'var(--text-3)' }}>{row.source_name ?? '—'}</code>
                    </Td>
                    <Td>{row.executed_by}</Td>
                    <Td>
                      <span style={{ color: 'var(--text-3)' }}>{fmtRelative(row.executed_at)}</span>
                    </Td>
                    <Td align="right">
                      {row.execution_time_ms != null
                        ? `${(row.execution_time_ms / 1000).toFixed(1)}s`
                        : '—'}
                    </Td>
                    <Td align="right">
                      {row.row_count != null ? fmtNum(row.row_count) : '—'}
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
            <span>{t('queryHistoryList.pagination.total', '共 {n} 条', { n: fmtNum(total) })}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded border px-2 py-1 disabled:opacity-40"
                style={{ borderColor: 'var(--border)' }}
              >
                {t('queryHistoryList.pagination.prev', '上一页')}
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
                {t('queryHistoryList.pagination.next', '下一页')}
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
              <div className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>
                {t('queryHistoryList.peek.runId', '运行 #{id}', { id: peekRow.id })}
              </div>
              <div className="text-xs" style={{ color: 'var(--text-3)' }}>
                {peekRow.status} · {peekRow.source_name ?? '—'}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => navigate(`/queries/history/${peekRow.id}`)}
                className="rounded px-2 py-1 text-xs transition-colors hover:bg-[color:var(--bg-hover)]"
                style={{ color: 'var(--accent)' }}
              >
                {t('queryHistoryList.action.detail', '详情')}
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
          <QueryHistoryDetailContent
            row={peekRow}
            actions={{
              onReplay: () => navigate('/queries/console'),
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

function Th({ children, align }: { children?: React.ReactNode; align?: 'right' }) {
  return (
    <th
      className={`border-b px-3 py-2 font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}
      style={{ borderColor: 'var(--border)' }}
    >
      {children}
    </th>
  )
}

function Td({ children, align }: { children?: React.ReactNode; align?: 'right' }) {
  return (
    <td
      className={`px-3 py-2 ${align === 'right' ? 'text-right' : ''}`}
      style={{ color: 'var(--text-1)' }}
    >
      {children}
    </td>
  )
}

function SkeletonRows() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex gap-3">
          <div className="h-4 w-12 animate-pulse rounded" style={{ background: 'var(--bg-skeleton)' }} />
          <div className="h-4 flex-1 animate-pulse rounded" style={{ background: 'var(--bg-skeleton)' }} />
          <div className="h-4 w-20 animate-pulse rounded" style={{ background: 'var(--bg-skeleton)' }} />
        </div>
      ))}
    </div>
  )
}
