// frontend/src/v2/pages/data/Datasources.tsx
//
// 数据源列表（L0）。Progressive Disclosure 范式：
//   行点击 → L2 PeekPanel；Peek 内"打开详情" → L3 DatasourceDetail (Tab)。
// ContextPanel：模块级摘要（数量/连通率/类型分布），随数据变化。

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Database, Filter, Plus, RefreshCcw, Search, ServerCog } from 'lucide-react'
import { useDatasources } from '@v2/hooks/datasources'
import type { Datasource } from '@v2/api/datasources'
import {
  connectionStatusChip,
  datasourceTabLabel,
  DatasourceDetailContent,
  sourceTypeChip,
} from './_shared/datasource-detail-content'
import { fmtDateTime } from '@v2/lib/format'
// import { t } from '@v2/i18n'  // TODO: pending X-Crosscut delivery

// X-Crosscut 提供的共享组件（编译错误留待 Phase 3 修复）
import { PeekPanel } from '@v2/components/PeekPanel'
import { useAppShell } from '@v2/layout/AppShell'

export default function Datasources() {
  const navigate = useNavigate()
  const { setBreadcrumbs, setTopBarActions, setContextPanel, openTab } = useAppShell()
  const [keyword, setKeyword] = useState('')
  const [peekId, setPeekId] = useState<number | null>(null)

  const { data, isLoading, isError, error, refetch, isFetching } = useDatasources({
    page: 1,
    page_size: 100,
  })

  // 面包屑
  useEffect(() => {
    setBreadcrumbs(['数据', '数据源'])
  }, [setBreadcrumbs])

  // TopBar 操作
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
          onClick={() => navigate('/data-center/datasources/new')}
          className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          <Plus size={12} />
          新建数据源
        </button>
      </div>,
    )
    return () => setTopBarActions(null)
  }, [setTopBarActions, refetch, isFetching, navigate])

  const allRows = useMemo<Datasource[]>(() => data?.items ?? [], [data?.items])

  const rows = useMemo(() => {
    if (!keyword.trim()) return allRows
    const q = keyword.trim().toLowerCase()
    return allRows.filter(
      (it) =>
        it.name.toLowerCase().includes(q) ||
        it.source_type.toLowerCase().includes(q) ||
        (it.description ?? '').toLowerCase().includes(q),
    )
  }, [allRows, keyword])

  // 模块摘要
  const summary = useMemo(() => {
    const total = allRows.length
    const connected = allRows.filter((it) => it.connection_status === 'connected').length
    const errors = allRows.filter((it) => it.connection_status === 'error').length
    const byType = new Map<string, number>()
    for (const it of allRows) {
      byType.set(it.source_type, (byType.get(it.source_type) ?? 0) + 1)
    }
    return { total, connected, errors, byType: Array.from(byType.entries()) }
  }, [allRows])

  // ContextPanel
  useEffect(() => {
    setContextPanel({
      title: (
        <div className="flex items-center gap-1.5">
          <ServerCog size={12} style={{ color: 'var(--text-3)' }} />
          数据源概览
        </div>
      ),
      subtitle: 'GET /api/v1/data-center/datasources',
      body: (
        <div className="space-y-4 px-4 py-4">
          <CtxSection title="规模">
            <div className="grid grid-cols-3 gap-2">
              <StatCard label="总计"  value={summary.total} />
              <StatCard label="已连接" value={summary.connected} tone="success" />
              <StatCard
                label="异常"
                value={summary.errors}
                tone={summary.errors ? 'danger' : 'neutral'}
              />
            </div>
          </CtxSection>
          <CtxSection title="类型分布">
            {summary.byType.length === 0 ? (
              <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>暂无数据</p>
            ) : (
              <div className="space-y-1">
                {summary.byType.map(([t, n]) => (
                  <div key={t} className="flex items-center justify-between text-[12px]">
                    {sourceTypeChip(t)}
                    <span style={{ color: 'var(--text-2)' }}>{n}</span>
                  </div>
                ))}
              </div>
            )}
          </CtxSection>
          <CtxSection title="快捷操作">
            <div className="space-y-1.5 text-[12px]">
              <button
                type="button"
                onClick={() => navigate('/data-center/datasources/new')}
                className="flex w-full items-center rounded-md px-2 py-1 text-left"
                style={{ color: 'var(--text-2)' }}
              >
                + 新建数据源
              </button>
              <button
                type="button"
                onClick={() => refetch()}
                className="flex w-full items-center rounded-md px-2 py-1 text-left"
                style={{ color: 'var(--text-2)' }}
              >
                ↻ 重新拉取
              </button>
            </div>
          </CtxSection>
          <CtxSection title="使用提示">
            <ul className="space-y-1 text-[11px] leading-5" style={{ color: 'var(--text-3)' }}>
              <li>· 单击行 → 打开预览 (Peek)</li>
              <li>· ↑/↓ 切换预览对象</li>
              <li>· ⌘↵ 升级到全屏 Tab</li>
              <li>· Esc 关闭预览</li>
            </ul>
          </CtxSection>
        </div>
      ),
    })
    return () => setContextPanel(null)
  }, [setContextPanel, summary, refetch, navigate])

  const peekRow = useMemo(
    () => (peekId == null ? null : rows.find((r) => r.id === peekId) ?? null),
    [peekId, rows],
  )

  const openInTab = useCallback(
    (row: Datasource) => {
      openTab({
        id: `datasource:${row.id}`,
        label: datasourceTabLabel(row),
        to: `/data-center/datasources/${row.id}`,
        closeable: true,
      })
      navigate(`/data-center/datasources/${row.id}`)
    },
    [navigate, openTab],
  )

  const columns = useMemo<
    Array<{ key: string; title: string; width?: number; render?: (r: Datasource) => React.ReactNode }>
  >(() => {
    const peekOpen = peekRow != null
    const base = [
      {
        key: 'name',
        title: '名称',
        render: (row: Datasource) => (
          <div className="flex min-w-0 items-center gap-2">
            <div
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[10px] font-semibold"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
            >
              DS
            </div>
            <div className="min-w-0">
              <div className="truncate text-xs font-medium" style={{ color: 'var(--text-1)' }}>
                {row.name}
              </div>
              <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                {row.description || row.source_type}
              </div>
            </div>
          </div>
        ),
      },
      {
        key: 'connection_status',
        title: '连通',
        width: 96,
        render: (row: Datasource) => connectionStatusChip(row.connection_status),
      },
    ]

    if (!peekOpen) {
      return [
        base[0],
        { key: 'source_type', title: '类型', width: 140, render: (r: Datasource) => sourceTypeChip(r.source_type) },
        base[1],
        {
          key: 'is_active',
          title: '状态',
          width: 88,
          render: (r: Datasource) => (
            <span
              className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium"
              style={{
                background: r.is_active ? 'var(--success-soft)' : 'var(--bg-surface-2)',
                color: r.is_active ? 'var(--success)' : 'var(--text-3)',
              }}
            >
              {r.is_active ? '启用' : '停用'}
            </span>
          ),
        },
        {
          key: 'last_test_at',
          title: '最近测试',
          width: 170,
          render: (r: Datasource) => (
            <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
              {fmtDateTime(r.last_test_at)}
            </span>
          ),
        },
        {
          key: 'updated_at',
          title: '更新于',
          width: 160,
          render: (r: Datasource) => (
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
      {/* 搜索栏 */}
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
            placeholder="按名称、类型搜索…"
            className="w-full rounded-md border px-3 py-1.5 pl-7 text-xs outline-none focus:ring-1"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--bg-surface)',
              color: 'var(--text-1)',
            }}
          />
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
          style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
        >
          <Filter size={12} /> 过滤
        </button>
        <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
          {data ? `${rows.length} / ${data.total}` : '—'}
        </span>
      </div>

      {/* 列表区 */}
      <div className="relative flex-1 overflow-hidden">
        {isLoading ? (
          <SkeletonRows rows={8} columns={6} />
        ) : isError ? (
          <ErrorState
            message={error instanceof Error ? error.message : '加载失败'}
            onRetry={() => refetch()}
          />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Database size={20} />} message="暂无数据源" />
        ) : (
          // ResourceListPage 由 X-Crosscut 提供；此处回退到内联 Table
          // 编译错误留待 Phase 3 修复（X-Crosscut 交付后切换至 ResourceListPage）
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
          title={peekRow?.name ?? ''}
          subtitle={peekRow ? `${peekRow.source_type} · #${peekRow.id}` : undefined}
          badges={
            peekRow ? (
              <span className="flex items-center gap-1">
                {connectionStatusChip(peekRow.connection_status)}
              </span>
            ) : null
          }
          footer={
            peekRow ? (
              <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                最近更新 {fmtDateTime(peekRow.updated_at)}
              </span>
            ) : null
          }
        >
          {peekRow ? <DatasourceDetailContent item={peekRow} /> : null}
        </PeekPanel>
      </div>

      {/* 不使用 ResourceListPage — import 保留待 Phase 3 */}
    </div>
  )
}

// ── 内部辅助组件 ──────────────────────────────────────────────────────────────

function CtxSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div
        className="mb-2 text-[11px] font-medium uppercase tracking-wide"
        style={{ color: 'var(--text-3)' }}
      >
        {title}
      </div>
      {children}
    </section>
  )
}

function StatCard({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: number
  tone?: 'neutral' | 'success' | 'danger'
}) {
  const color =
    tone === 'success'
      ? 'var(--success)'
      : tone === 'danger'
        ? 'var(--danger)'
        : 'var(--text-1)'
  return (
    <div
      className="rounded-md border px-2 py-1.5"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)' }}
    >
      <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
        {label}
      </div>
      <div className="text-base font-semibold tabular-nums" style={{ color }}>
        {value}
      </div>
    </div>
  )
}

function SkeletonRows({ rows, columns }: { rows: number; columns: number }) {
  return (
    <div className="space-y-px">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-2.5">
          {Array.from({ length: columns }).map((_, j) => (
            <div
              key={j}
              className="h-3 animate-pulse rounded"
              style={{
                width: j === 0 ? '40%' : '12%',
                background: 'var(--bg-surface-2)',
              }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2">
      <p className="text-xs" style={{ color: 'var(--danger)' }}>
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md border px-3 py-1.5 text-xs"
        style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
      >
        重试
      </button>
    </div>
  )
}

function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2">
      <div style={{ color: 'var(--text-3)' }}>{icon}</div>
      <p className="text-xs" style={{ color: 'var(--text-3)' }}>
        {message}
      </p>
    </div>
  )
}

/** 回退 Table — 等待 X-Crosscut 交付后替换为 ResourceListPage */
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
              <th
                key={col.key}
                className="px-4 py-2 text-left font-medium"
                style={{ color: 'var(--text-3)', width: col.width }}
              >
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
              style={{
                borderBottom: '1px solid var(--border)',
                background: activeId === row.id ? 'var(--bg-hover)' : undefined,
              }}
              onMouseEnter={(e) => {
                if (activeId !== row.id) {
                  (e.currentTarget as HTMLTableRowElement).style.background = 'var(--bg-hover)'
                }
              }}
              onMouseLeave={(e) => {
                if (activeId !== row.id) {
                  (e.currentTarget as HTMLTableRowElement).style.background = ''
                }
              }}
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
