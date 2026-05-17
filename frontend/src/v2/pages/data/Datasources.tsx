// frontend/src/v2/pages/data/Datasources.tsx
//
// 数据源列表（L0）。Progressive Disclosure 范式：
//   行点击 → L2 PeekPanel；Peek 内"打开详情" → L3 DatasourceDetail (Tab)。
// ContextPanel：模块级摘要（数量/连通率/类型分布），随数据变化。

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Database, Filter, Search, ServerCog } from 'lucide-react'
import { useDatasources } from '@v2/hooks/datasources'
import type { Datasource } from '@v2/api/datasources'
import { CreateButton, RefreshButton, Toolbar } from '@v2/components/CommonControls'
import { RetryState } from '@v2/components/LoadState'
import {
  connectionStatusChip,
  datasourceTabLabel,
  DatasourceDetailContent,
  sourceTypeChip,
} from './_shared/datasource-detail-content'
import { fmtDateTime } from '@v2/lib/format'
import { t } from '@v2/i18n'

import { PeekPanel } from '@v2/components/PeekPanel'
import { useAppShell } from '@v2/layout/AppShell'
import { useToast } from '@v2/components/ui/Toast'

export default function Datasources() {
  const navigate = useNavigate()
  const { setBreadcrumbs, setTopBarActions, setContextPanel, openTab } = useAppShell()
  const toast = useToast()
  const [keyword, setKeyword] = useState('')
  const [peekId, setPeekId] = useState<number | null>(null)

  const { data, isLoading, isError, error, refetch, isFetching } = useDatasources({
    page: 1,
    page_size: 100,
  })

  const handleRefresh = useCallback(async () => {
    const result = await refetch()
    if (result.status === 'success') {
      toast.show({
        title: t('datasources.toast.refreshed', '已刷新数据源列表'),
        tone: 'success',
      })
    } else if (result.status === 'error') {
      toast.show({
        title: t('datasources.toast.refreshFailed', '刷新失败'),
        tone: 'danger',
      })
    }
  }, [refetch, toast])

  // 面包屑
  useEffect(() => {
    setBreadcrumbs([
      t('datasources.breadcrumb.data', '数据'),
      t('datasources.breadcrumb.datasources', '数据源'),
    ])
  }, [setBreadcrumbs])

  // TopBar 操作
  useEffect(() => {
    setTopBarActions(
      <Toolbar>
        <RefreshButton
          onClick={() => void handleRefresh()}
          loading={isFetching}
          ariaLabel={t('datasources.action.refreshList', '刷新数据源')}
        />
        <CreateButton
          label={t('datasources.action.create', '新建数据源')}
          onClick={() => navigate('/data-center/datasources/new')}
        />
      </Toolbar>,
    )
    return () => setTopBarActions(null)
  }, [setTopBarActions, handleRefresh, isFetching, navigate])

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
          {t('datasources.context.title', '数据源概览')}
        </div>
      ),
      subtitle: t('datasources.context.subtitle', '统一管理外部连接与同步状态'),
      body: (
        <div className="space-y-4 px-4 py-4">
          <CtxSection title={t('datasources.context.scale', '规模')}>
            <div className="grid grid-cols-3 gap-2">
              <StatCard label={t('datasources.stats.total', '总计')} value={summary.total} />
              <StatCard label={t('datasources.stats.connected', '已连接')} value={summary.connected} tone="success" />
              <StatCard
                label={t('datasources.stats.errors', '异常')}
                value={summary.errors}
                tone={summary.errors ? 'danger' : 'neutral'}
              />
            </div>
          </CtxSection>
          <CtxSection title={t('datasources.context.typeDist', '类型分布')}>
            {summary.byType.length === 0 ? (
              <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>
                {t('datasources.context.noData', '暂无数据')}
              </p>
            ) : (
              <div className="space-y-1">
                {summary.byType.map(([type, n]) => (
                  <div key={type} className="flex items-center justify-between text-[12px]">
                    {sourceTypeChip(type)}
                    <span style={{ color: 'var(--text-2)' }}>{n}</span>
                  </div>
                ))}
              </div>
            )}
          </CtxSection>
          <CtxSection title={t('datasources.context.shortcuts', '快捷操作')}>
            <div className="space-y-1.5 text-[12px]">
              <button
                type="button"
                onClick={() => navigate('/data-center/datasources/new')}
                className="flex w-full items-center rounded-md px-2 py-1 text-left"
                style={{ color: 'var(--text-2)' }}
              >
                + {t('datasources.action.create', '新建数据源')}
              </button>
              <RefreshButton
                onClick={handleRefresh}
                loading={isFetching}
                label={t('datasources.action.refetch', '重新拉取')}
                loadingLabel={t('datasources.action.refetching', '重新拉取中…')}
                ariaLabel={t('datasources.action.refreshList', '刷新数据源')}
              />
            </div>
          </CtxSection>
          <CtxSection title={t('datasources.context.hints', '使用提示')}>
            <ul className="space-y-1 text-[11px] leading-5" style={{ color: 'var(--text-3)' }}>
              <li>{t('datasources.hint.clickPeek', '· 单击行 → 打开预览 (Peek)')}</li>
              <li>{t('datasources.hint.arrowNav', '· ↑/↓ 切换预览对象')}</li>
              <li>{t('datasources.hint.cmdEnter', '· ⌘↵ 升级到全屏 Tab')}</li>
              <li>{t('datasources.hint.esc', '· Esc 关闭预览')}</li>
            </ul>
          </CtxSection>
        </div>
      ),
    })
    return () => setContextPanel(null)
  }, [handleRefresh, isFetching, setContextPanel, summary, navigate])

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

  // 键盘快捷键：↑/↓ 切换 peek 行、⌘↵ 升级为 Tab、Esc 关闭 peek
  useEffect(() => {
    if (rows.length === 0) return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }
      if (e.key === 'Escape') {
        if (peekId != null) {
          e.preventDefault()
          setPeekId(null)
        }
        return
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const idx = peekId == null ? -1 : rows.findIndex((r) => r.id === peekId)
        const nextIdx =
          e.key === 'ArrowDown'
            ? Math.min(rows.length - 1, idx + 1)
            : Math.max(0, idx === -1 ? 0 : idx - 1)
        setPeekId(rows[nextIdx]?.id ?? null)
        return
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && peekRow) {
        e.preventDefault()
        openInTab(peekRow)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rows, peekId, peekRow, openInTab])

  const columns = useMemo<
    Array<{ key: string; title: React.ReactNode; width?: number; render?: (r: Datasource) => React.ReactNode }>
  >(() => {
    const peekOpen = peekRow != null
    const base = [
      {
        key: 'name',
        title: t('datasources.col.name', '名称'),
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
        title: t('datasources.col.connection', '连通'),
        width: 96,
        render: (row: Datasource) => connectionStatusChip(row.connection_status),
      },
    ]

    if (!peekOpen) {
      return [
        base[0],
        {
          key: 'source_type',
          title: t('datasources.col.type', '类型'),
          width: 140,
          render: (r: Datasource) => sourceTypeChip(r.source_type),
        },
        base[1],
        {
          key: 'is_active',
          title: t('datasources.col.status', '状态'),
          width: 88,
          render: (r: Datasource) => (
            <span
              className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium"
              style={{
                background: r.is_active ? 'var(--success-soft)' : 'var(--bg-surface-2)',
                color: r.is_active ? 'var(--success)' : 'var(--text-3)',
              }}
            >
              {r.is_active
                ? t('datasources.status.active', '启用')
                : t('datasources.status.inactive', '停用')}
            </span>
          ),
        },
        {
          key: 'last_test_at',
          title: t('datasources.col.lastTest', '最近测试'),
          width: 170,
          render: (r: Datasource) => (
            <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
              {fmtDateTime(r.last_test_at)}
            </span>
          ),
        },
        {
          key: 'updated_at',
          title: t('datasources.col.updated', '更新于'),
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
            placeholder={t('datasources.search.placeholder', '按名称、类型搜索…')}
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
          <Filter size={12} /> {t('datasources.action.filter', '过滤')}
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
          <RetryState
            message={error instanceof Error ? error.message : t('datasources.state.loadFailed', '加载失败')}
            onRetry={() => refetch()}
            retryAriaLabel={t('datasources.action.retry', '重试加载数据源')}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Database size={20} />}
            message={t('datasources.state.empty', '暂无数据源')}
          />
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
                {t('datasources.peek.lastUpdate', '最近更新 {time}', {
                  time: fmtDateTime(peekRow.updated_at),
                })}
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

function CtxSection({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
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
  label: React.ReactNode
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
  columns: Array<{ key: string; title: React.ReactNode; width?: number; render?: (r: T) => React.ReactNode }>
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
