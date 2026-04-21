// frontend/src/v2/pages/data/Datasets.tsx
//
// 数据集列表（L0）。行点击 → L2 PeekPanel；Peek 内"打开详情" → L3 DatasetDetail (Tab)。

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Database, Plus, RefreshCcw, Search } from 'lucide-react'
import { useDatasets, useDataset } from '@v2/hooks/datasets'
import type { Dataset } from '@v2/api/datasets'
import {
  datasetTabLabel,
  datasetTypeChip,
  DatasetDetailContent,
  syncStatusChip,
} from './_shared/dataset-detail-content'
import { fmtDateTime } from '@v2/lib/format'
// import { t } from '@v2/i18n'  // TODO: pending X-Crosscut delivery

// X-Crosscut 提供（编译错误留待 Phase 3 修复）
import { PeekPanel } from '@v2/components/PeekPanel'
import { useAppShell } from '@v2/layout/AppShell'

export default function Datasets() {
  const navigate = useNavigate()
  const { setBreadcrumbs, setTopBarActions, setContextPanel, openTab } = useAppShell()
  const [keyword, setKeyword] = useState('')
  const [peekId, setPeekId] = useState<number | null>(null)

  const { data, isLoading, isError, error, refetch, isFetching } = useDatasets({
    page: 1,
    page_size: 100,
  })

  const allRows = useMemo<Dataset[]>(() => data?.items ?? [], [data?.items])

  const rows = useMemo(() => {
    if (!keyword.trim()) return allRows
    const q = keyword.trim().toLowerCase()
    return allRows.filter(
      (r) =>
        r.dataset_name.toLowerCase().includes(q) ||
        r.dataset_code.toLowerCase().includes(q) ||
        (r.physical_table ?? '').toLowerCase().includes(q),
    )
  }, [allRows, keyword])

  const stats = useMemo(() => {
    const total = allRows.length
    const synced = allRows.filter((r) => r.sync_status === 'synced').length
    const failed = allRows.filter((r) => r.sync_status === 'failed').length
    const typeMap = new Map<string, number>()
    for (const r of allRows) typeMap.set(r.dataset_type, (typeMap.get(r.dataset_type) ?? 0) + 1)
    return { total, synced, failed, typeMap }
  }, [allRows])

  useEffect(() => {
    setBreadcrumbs(['数据', '数据集'])
  }, [setBreadcrumbs])

  useEffect(() => {
    setTopBarActions(
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs"
          style={{ color: 'var(--text-2)' }}
        >
          <RefreshCcw size={12} className={isFetching ? 'animate-spin' : ''} />
          刷新
        </button>
        <button
          type="button"
          onClick={() => navigate('/data-center/datasets/new')}
          className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          <Plus size={12} />
          注册数据集
        </button>
      </div>,
    )
    return () => setTopBarActions(null)
  }, [setTopBarActions, refetch, isFetching, navigate])

  useEffect(() => {
    setContextPanel({
      title: '数据集',
      subtitle: 'GET /api/v1/data-center/datasets',
      body: (
        <div className="space-y-4 px-4 py-4">
          <CtxSection title="规模">
            <div className="grid grid-cols-3 gap-2">
              <StatCard label="总计"  value={stats.total} />
              <StatCard label="已同步" value={stats.synced} tone="success" />
              <StatCard label="失败"  value={stats.failed} tone={stats.failed ? 'danger' : 'neutral'} />
            </div>
          </CtxSection>
          <CtxSection title="类型分布">
            {Array.from(stats.typeMap.entries()).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between py-0.5 text-xs">
                {datasetTypeChip(k)}
                <span style={{ color: 'var(--text-2)' }}>{v}</span>
              </div>
            ))}
          </CtxSection>
          <CtxSection title="快捷操作">
            <div className="space-y-1.5 text-xs">
              <button
                type="button"
                onClick={() => navigate('/data-center/datasets/new')}
                className="flex w-full rounded-md px-2 py-1 text-left"
                style={{ color: 'var(--text-2)' }}
              >
                + 注册数据集
              </button>
              <button
                type="button"
                onClick={() => refetch()}
                className="flex w-full rounded-md px-2 py-1 text-left"
                style={{ color: 'var(--text-2)' }}
              >
                ↻ 刷新列表
              </button>
            </div>
          </CtxSection>
        </div>
      ),
    })
    return () => setContextPanel(null)
  }, [setContextPanel, stats, refetch, navigate])

  const peekRow = useMemo(
    () => (peekId == null ? null : rows.find((r) => r.id === peekId) ?? null),
    [peekId, rows],
  )

  const openInTab = useCallback(
    (row: Dataset) => {
      openTab({
        id: `dataset:${row.id}`,
        label: datasetTabLabel(row),
        to: `/data-center/datasets/${row.id}`,
        closeable: true,
      })
      navigate(`/data-center/datasets/${row.id}`)
    },
    [navigate, openTab],
  )

  const columns = useMemo<
    Array<{ key: string; title: string; width?: number; render?: (r: Dataset) => React.ReactNode }>
  >(() => {
    const peekOpen = peekRow != null
    const base = [
      {
        key: 'dataset_name',
        title: '名称',
        render: (r: Dataset) => (
          <div className="min-w-0">
            <div className="truncate text-xs font-medium" style={{ color: 'var(--text-1)' }}>
              {r.dataset_name}
            </div>
            <div className="truncate text-[11px]" style={{ color: 'var(--text-3)' }}>
              {r.dataset_code}
            </div>
          </div>
        ),
      },
      {
        key: 'sync_status',
        title: '同步',
        width: 100,
        render: (r: Dataset) => syncStatusChip(r.sync_status),
      },
    ]
    if (!peekOpen) {
      return [
        base[0],
        { key: 'dataset_type', title: '类型', width: 120, render: (r: Dataset) => datasetTypeChip(r.dataset_type) },
        {
          key: 'physical_table',
          title: '物理表 / SQL',
          render: (r: Dataset) =>
            r.physical_table ? (
              <code className="text-[11px]" style={{ color: 'var(--text-2)' }}>{r.physical_table}</code>
            ) : r.sql_query ? (
              <code
                className="line-clamp-1 text-[11px]"
                style={{ color: 'var(--text-2)' }}
              >
                {r.sql_query}
              </code>
            ) : (
              <span style={{ color: 'var(--text-3)' }}>—</span>
            ),
        },
        base[1],
        {
          key: 'field_count',
          title: '字段',
          width: 70,
          render: (r: Dataset) => <span style={{ color: 'var(--text-2)' }}>{r.field_count ?? '—'}</span>,
        },
        {
          key: 'updated_at',
          title: '更新于',
          width: 180,
          render: (r: Dataset) => (
            <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
              {fmtDateTime(r.updated_at)}
            </span>
          ),
        },
      ]
    }
    return base
  }, [peekRow])

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div
        className="flex items-center gap-2 border-b px-4 py-2"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        <div className="relative flex-1 max-w-xs">
          <Search
            size={12}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--text-3)' }}
          />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="按名称、编码、表名搜索…"
            className="w-full rounded-md border px-3 py-1.5 pl-7 text-xs outline-none"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--bg-surface)',
              color: 'var(--text-1)',
            }}
          />
        </div>
        <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
          {data ? `${rows.length} / ${data.total}` : '—'}
        </span>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {isLoading ? (
          <SkeletonRows />
        ) : isError ? (
          <ErrorState
            message={error instanceof Error ? error.message : '加载失败'}
            onRetry={() => refetch()}
          />
        ) : rows.length === 0 ? (
          <EmptyState />
        ) : (
          <InlineTable
            columns={columns}
            rows={rows}
            activeId={peekId}
            onRowClick={(r) => setPeekId(r.id === peekId ? null : r.id)}
          />
        )}

        <PeekPanel
          open={!!peekRow}
          onClose={() => setPeekId(null)}
          onOpenFull={peekRow ? () => openInTab(peekRow) : undefined}
          title={peekRow?.dataset_name ?? ''}
          subtitle={peekRow ? `${peekRow.dataset_type} · #${peekRow.id}` : undefined}
          badges={
            peekRow ? (
              <span className="flex items-center gap-1">
                {datasetTypeChip(peekRow.dataset_type)}
                {syncStatusChip(peekRow.sync_status)}
              </span>
            ) : null
          }
        >
          {peekRow ? <DatasetPeekBody row={peekRow} /> : null}
        </PeekPanel>
      </div>

      {/* import 保留待 Phase 3 */}
    </div>
  )
}

function DatasetPeekBody({ row }: { row: Dataset }) {
  const { data, isLoading, isError, error } = useDataset(row.id, true)
  if (isLoading) {
    return (
      <div className="px-4 py-6 text-xs" style={{ color: 'var(--text-3)' }}>
        加载详情…
      </div>
    )
  }
  if (isError) {
    return (
      <div className="px-4 py-6 text-xs" style={{ color: 'var(--danger)' }}>
        {error instanceof Error ? error.message : '加载失败'}
      </div>
    )
  }
  return <DatasetDetailContent item={data ?? row} />
}

// ── 内部辅助组件 ──────────────────────────────────────────────────────────────

function CtxSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
        {title}
      </div>
      {children}
    </section>
  )
}

function StatCard({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: string }) {
  const color = tone === 'success' ? 'var(--success)' : tone === 'danger' ? 'var(--danger)' : 'var(--text-1)'
  return (
    <div className="rounded-md border px-2 py-1.5" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)' }}>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>{label}</div>
      <div className="text-base font-semibold tabular-nums" style={{ color }}>{value}</div>
    </div>
  )
}

function SkeletonRows() {
  return (
    <div className="space-y-px">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-2.5">
          {[40, 12, 18, 10, 8, 12].map((w, j) => (
            <div key={j} className="h-3 animate-pulse rounded" style={{ width: `${w}%`, background: 'var(--bg-surface-2)' }} />
          ))}
        </div>
      ))}
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2">
      <p className="text-xs" style={{ color: 'var(--danger)' }}>{message}</p>
      <button type="button" onClick={onRetry} className="rounded-md border px-3 py-1.5 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}>重试</button>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2">
      <Database size={20} style={{ color: 'var(--text-3)' }} />
      <p className="text-xs" style={{ color: 'var(--text-3)' }}>暂无数据集</p>
    </div>
  )
}

function InlineTable<T extends { id: number }>({
  columns,
  rows,
  activeId,
  onRowClick,
}: {
  columns: Array<{ key: string; title: string; width?: number; render?: (r: T) => React.ReactNode }>
  rows: T[]
  activeId: number | null
  onRowClick: (r: T) => void
}) {
  return (
    <div className="h-full overflow-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {columns.map((col) => (
              <th key={col.key} className="px-4 py-2 text-left font-medium" style={{ color: 'var(--text-3)', width: col.width }}>
                {col.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => onRowClick(row)}
              className="cursor-pointer"
              style={{ borderBottom: '1px solid var(--border)', background: activeId === row.id ? 'var(--bg-hover)' : undefined }}
            >
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-2.5" style={{ width: col.width }}>
                  {col.render ? col.render(row) : String((row as unknown as Record<string, unknown>)[col.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
