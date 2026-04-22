// frontend/src/v2/pages/data/ExtractionRuns.tsx
//
// 提取执行记录列表（L0）。行点击 → L2 Peek；Peek"打开详情" → L3 ExtractionRunDetail。
// 对接 GET /api/v1/extraction/runs

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, RefreshCcw, Play } from 'lucide-react'
import { useExtractionRuns, useRerunExtractionRun } from '@v2/hooks/extraction'
import type { ExtractionRun } from '@v2/api/extraction'
import { useToast } from '@v2/components/ui/Toast'
import {
  ExtractionRunDetailContent,
  runStatusChip,
  runTabLabel,
  fmtDuration,
} from './_shared/extraction-run-detail-content'
import { fmtDateTime, fmtRelative } from '@v2/lib/format'
// import { t } from '@v2/i18n'  // TODO: pending X-Crosscut delivery

// X-Crosscut 提供（编译错误留待 Phase 3 修复）
import { PeekPanel } from '@v2/components/PeekPanel'
import { useAppShell } from '@v2/layout/AppShell'

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'success', label: '成功' },
  { value: 'failed',  label: '失败' },
  { value: 'running', label: '运行中' },
  { value: 'pending', label: '排队' },
  { value: 'cancelled', label: '已取消' },
]

const TRIGGER_OPTIONS = [
  { value: '', label: '全部触发' },
  { value: 'manual',    label: '手动' },
  { value: 'scheduled', label: '调度' },
  { value: 'api',       label: 'API' },
]

export default function ExtractionRuns() {
  const navigate = useNavigate()
  const toast = useToast()
  const { setBreadcrumbs, setTopBarActions, setContextPanel, openTab } = useAppShell()
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [triggerFilter, setTriggerFilter] = useState('')
  const [peekId, setPeekId] = useState<number | null>(null)
  const rerun = useRerunExtractionRun()

  const { data, isLoading, isError, error, refetch, isFetching } = useExtractionRuns({
    page: 1,
    page_size: 100,
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(triggerFilter ? { trigger_type: triggerFilter } : {}),
  })

  const allRows = useMemo<ExtractionRun[]>(() => data?.items ?? [], [data?.items])

  const rows = useMemo(() => {
    if (!keyword) return allRows
    const q = keyword.toLowerCase()
    return allRows.filter((r) => String(r.task_id).includes(q) || String(r.id).includes(q))
  }, [allRows, keyword])

  const stats = useMemo(() => {
    const total   = allRows.length
    const success = allRows.filter((r) => r.status === 'success').length
    const failed  = allRows.filter((r) => r.status === 'failed').length
    const running = allRows.filter((r) => r.status === 'running').length
    return { total, success, failed, running }
  }, [allRows])

  useEffect(() => {
    setBreadcrumbs(['数据', '执行记录'])
  }, [setBreadcrumbs])

  useEffect(() => {
    setTopBarActions(
      <div className="flex items-center gap-2">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索任务ID…"
          className="rounded-md border px-3 py-1.5 text-xs"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)', color: 'var(--text-1)', width: 140 }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border px-2 py-1.5 text-xs"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)', color: 'var(--text-1)' }}
        >
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={triggerFilter}
          onChange={(e) => setTriggerFilter(e.target.value)}
          className="rounded-md border px-2 py-1.5 text-xs"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)', color: 'var(--text-1)' }}
        >
          {TRIGGER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs"
          style={{ color: 'var(--text-2)' }}
        >
          <RefreshCcw size={12} className={isFetching ? 'animate-spin' : ''} /> 刷新
        </button>
      </div>,
    )
    return () => setTopBarActions(null)
  }, [setTopBarActions, refetch, isFetching, keyword, statusFilter, triggerFilter])

  useEffect(() => {
    setContextPanel({
      title: (
        <div className="flex items-center gap-1.5">
          <Activity size={12} style={{ color: 'var(--text-3)' }} />
          执行记录
        </div>
      ),
      subtitle: 'GET /api/v1/extraction/runs',
      body: (
        <div className="space-y-4 px-4 py-4">
          <section>
            <CtxLabel>概览</CtxLabel>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <StatCard label="总计" value={stats.total} />
              <StatCard label="成功" value={stats.success} tone="success" />
              <StatCard label="运行中" value={stats.running} tone={stats.running ? 'accent' : 'neutral'} />
              <StatCard label="失败" value={stats.failed} tone={stats.failed ? 'danger' : 'neutral'} />
            </div>
          </section>
          <section>
            <CtxLabel>跳转</CtxLabel>
            <div className="mt-2 space-y-1.5 text-xs">
              <button
                type="button"
                onClick={() => navigate('/extraction/tasks')}
                className="flex w-full rounded-md px-2 py-1 text-left"
                style={{ color: 'var(--text-2)' }}
              >
                查看任务列表
              </button>
            </div>
          </section>
        </div>
      ),
    })
    return () => setContextPanel(null)
  }, [setContextPanel, stats, navigate])

  const peekRow = useMemo(
    () => (peekId == null ? null : rows.find((r) => r.id === peekId) ?? null),
    [peekId, rows],
  )

  const openInTab = useCallback(
    (row: ExtractionRun) => {
      openTab({
        id: `extraction-run:${row.id}`,
        label: runTabLabel(row),
        to: `/extraction/runs/${row.id}`,
        closeable: true,
      })
      navigate(`/extraction/runs/${row.id}`)
    },
    [navigate, openTab],
  )

  const handleRowRerun = useCallback(
    async (row: ExtractionRun, e: React.MouseEvent) => {
      e.stopPropagation()
      if (rerun.isPending) return
      try {
        const result = await rerun.mutateAsync(row.id)
        toast.show({ tone: 'success', title: `已提交重跑 · 新 Run #${result.run_id}` })
        setPeekId(result.run_id)
      } catch {
        toast.show({ tone: 'danger', title: '重跑失败，请稍后重试' })
      }
    },
    [rerun, toast],
  )

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b px-4 py-2" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
        <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
          {data ? `${rows.length} / ${data.total}` : '—'}
        </span>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {isLoading ? <SkeletonRows /> : isError ? (
          <ErrorState message={error instanceof Error ? error.message : '加载失败'} onRetry={() => refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState />
        ) : (
          <RunTable
            rows={rows}
            activeId={peekId}
            onRowClick={(r) => setPeekId(r.id === peekId ? null : r.id)}
            onRerun={handleRowRerun}
            rerunPendingId={rerun.isPending ? rerun.variables ?? null : null}
          />
        )}

        <PeekPanel
          open={!!peekRow}
          onClose={() => setPeekId(null)}
          onOpenFull={peekRow ? () => openInTab(peekRow) : undefined}
          title={`Run #${peekRow?.id}`}
          subtitle={peekRow ? `Task #${peekRow.task_id}` : undefined}
          badges={peekRow ? runStatusChip(peekRow.status) : null}
        >
          {peekRow ? (
            <ExtractionRunDetailContent
              run={peekRow}
              onJumpTask={() => navigate(`/extraction/tasks/${peekRow.task_id}`)}
              onRerunSuccess={(newRunId) => {
                toast.show({ tone: 'success', title: `已提交重跑 · 新 Run #${newRunId}` })
                setPeekId(newRunId)
              }}
            />
          ) : null}
        </PeekPanel>
      </div>
    </div>
  )
}

// ── 内部组件 ──────────────────────────────────────────────────────────────────

function RunTable({
  rows,
  activeId,
  onRowClick,
  onRerun,
  rerunPendingId,
}: {
  rows: ExtractionRun[]
  activeId: number | null
  onRowClick: (r: ExtractionRun) => void
  onRerun: (r: ExtractionRun, e: React.MouseEvent) => void
  rerunPendingId: number | null
}) {
  return (
    <div className="h-full overflow-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['运行 #', '任务', '状态', '触发', '行数', '耗时', '开始时间', '操作'].map((h) => (
              <th key={h} className="px-4 py-2 text-left font-medium" style={{ color: 'var(--text-3)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const canRerun =
              row.status === 'success' || row.status === 'failed' || row.status === 'cancelled'
            const pending = rerunPendingId === row.id
            return (
              <tr
                key={row.id}
                onClick={() => onRowClick(row)}
                className="cursor-pointer"
                style={{ borderBottom: '1px solid var(--border)', background: activeId === row.id ? 'var(--bg-hover)' : undefined }}
              >
                <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--text-1)' }}>#{row.id}</td>
                <td className="px-4 py-2.5">
                  <code className="text-[11px]" style={{ color: 'var(--text-2)' }}>Task #{row.task_id}</code>
                </td>
                <td className="px-4 py-2.5">{runStatusChip(row.status)}</td>
                <td className="px-4 py-2.5 text-[11px]" style={{ color: 'var(--text-3)' }}>{row.run_type}</td>
                <td className="px-4 py-2.5 text-[11px] tabular-nums" style={{ color: 'var(--text-2)' }}>
                  {row.row_count != null ? row.row_count.toLocaleString() : '—'}
                </td>
                <td className="px-4 py-2.5 text-[11px] tabular-nums" style={{ color: 'var(--text-3)' }}>
                  {row.duration_ms != null ? fmtDuration(row.duration_ms) : '—'}
                </td>
                <td className="px-4 py-2.5 text-[11px]" style={{ color: 'var(--text-3)' }}>
                  {row.start_time ? fmtRelative(row.start_time) : fmtDateTime(row.created_at)}
                </td>
                <td className="px-4 py-2.5 text-[11px]">
                  <button
                    type="button"
                    onClick={(e) => onRerun(row, e)}
                    disabled={!canRerun || pending}
                    data-testid={`run-rerun-${row.id}`}
                    aria-label={`重跑运行 #${row.id}`}
                    title={canRerun ? '基于此次运行重新执行' : '任务在运行中或排队，无法重跑'}
                    className="inline-flex items-center gap-1 rounded border px-2 py-1 disabled:opacity-40"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-2)', background: 'var(--bg-surface-2)' }}
                  >
                    <Play size={11} className={pending ? 'animate-pulse' : ''} />
                    {pending ? '提交中' : '重跑'}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function CtxLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>{children}</div>
}

function StatCard({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: string }) {
  const color = tone === 'success' ? 'var(--success)' : tone === 'danger' ? 'var(--danger)' : tone === 'accent' ? 'var(--accent)' : 'var(--text-1)'
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
          {[8, 15, 10, 8, 10, 8, 12].map((w, j) => (
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
      <Activity size={20} style={{ color: 'var(--text-3)' }} />
      <p className="text-xs" style={{ color: 'var(--text-3)' }}>暂无执行记录</p>
    </div>
  )
}
