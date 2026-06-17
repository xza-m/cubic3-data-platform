// frontend/src/v2/pages/data/ExtractionRuns.tsx
//
// 同步记录列表（L0）。行点击 → L2 Peek；Peek"打开详情" → L3 ExtractionRunDetail。
// 对接 GET /api/v1/extraction/runs

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, Play } from 'lucide-react'
import { useExtractionRuns, useRerunExtractionRun } from '@v2/hooks/extraction'
import type { ExtractionRun } from '@v2/api/extraction'
import { useToast } from '@v2/components/ui/Toast'
import { RefreshButton } from '@v2/components/CommonControls'
import { RetryState } from '@v2/components/LoadState'
import {
  ExtractionRunDetailContent,
  runStatusChip,
  runTabLabel,
  fmtDuration,
} from './_shared/extraction-run-detail-content'
import { fmtDateTime, fmtRelative } from '@v2/lib/format'
import { t } from '@v2/i18n'

import { PeekPanel } from '@v2/components/PeekPanel'
import { useAppShell } from '@v2/layout/AppShell'
import { DataCenterSyncTabs } from './_shared/data-center-nav'

function statusOptions() {
  return [
    { value: '', label: t('extractionRuns.filter.status.all', '全部状态') },
    { value: 'success', label: t('extractionRuns.status.success', '成功') },
    { value: 'failed', label: t('extractionRuns.status.failed', '失败') },
    { value: 'running', label: t('extractionRuns.status.running', '运行中') },
    { value: 'pending', label: t('extractionRuns.status.pending', '排队') },
    { value: 'cancelled', label: t('extractionRuns.status.cancelled', '已取消') },
  ]
}

function triggerOptions() {
  return [
    { value: '', label: t('extractionRuns.filter.trigger.all', '全部触发') },
    { value: 'manual', label: t('extractionRuns.trigger.manual', '手动') },
    { value: 'scheduled', label: t('extractionRuns.trigger.scheduled', '调度') },
    { value: 'api', label: 'API' },
  ]
}

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
    setBreadcrumbs([
      t('extractionRuns.breadcrumb.data', '数据'),
      t('extractionRuns.breadcrumb.center', '数据中心'),
      t('extractionRuns.breadcrumb.runs', '同步记录'),
    ])
  }, [setBreadcrumbs])

  useEffect(() => {
    setTopBarActions(
      <div className="flex items-center gap-2">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder={t('extractionRuns.filter.searchTask', '搜索任务ID…')}
          className="rounded-md border px-3 py-1.5 text-xs"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)', color: 'var(--text-1)', width: 140 }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border px-2 py-1.5 text-xs"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)', color: 'var(--text-1)' }}
        >
          {statusOptions().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={triggerFilter}
          onChange={(e) => setTriggerFilter(e.target.value)}
          className="rounded-md border px-2 py-1.5 text-xs"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)', color: 'var(--text-1)' }}
        >
          {triggerOptions().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <RefreshButton
          onClick={() => refetch()}
          loading={isFetching}
          ariaLabel={t('extractionRuns.action.refresh', '刷新同步记录')}
        />
      </div>,
    )
    return () => setTopBarActions(null)
  }, [setTopBarActions, refetch, isFetching, keyword, statusFilter, triggerFilter])

  useEffect(() => {
    setContextPanel({
      title: (
        <div className="flex items-center gap-1.5">
          <Activity size={12} style={{ color: 'var(--text-3)' }} />
          {t('extractionRuns.context.title', '同步记录')}
        </div>
      ),
      subtitle: t('extractionRuns.context.subtitle', '查看最近同步任务的执行状态'),
      body: (
        <div className="space-y-4 px-4 py-4">
          <section>
            <CtxLabel>{t('extractionRuns.context.overview', '概览')}</CtxLabel>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <StatCard label={t('extractionRuns.stats.total', '总计')} value={stats.total} />
              <StatCard label={t('extractionRuns.stats.success', '成功')} value={stats.success} tone="success" />
              <StatCard label={t('extractionRuns.stats.running', '运行中')} value={stats.running} tone={stats.running ? 'accent' : 'neutral'} />
              <StatCard label={t('extractionRuns.stats.failed', '失败')} value={stats.failed} tone={stats.failed ? 'danger' : 'neutral'} />
            </div>
          </section>
          <section>
            <CtxLabel>{t('extractionRuns.context.jump', '跳转')}</CtxLabel>
            <div className="mt-2 space-y-1.5 text-xs">
              <button
                type="button"
                onClick={() => navigate('/data-center/sync/tasks')}
                className="flex w-full rounded-md px-2 py-1 text-left"
                style={{ color: 'var(--text-2)' }}
              >
                {t('extractionRuns.context.viewTasks', '查看同步任务')}
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
        to: `/data-center/sync/runs/${row.id}`,
        closeable: true,
      })
      navigate(`/data-center/sync/runs/${row.id}`)
    },
    [navigate, openTab],
  )

  const handleRowRerun = useCallback(
    async (row: ExtractionRun, e: React.MouseEvent) => {
      e.stopPropagation()
      if (rerun.isPending) return
      try {
        const result = await rerun.mutateAsync(row.id)
        toast.show({
          tone: 'success',
          title: t('extractionRuns.toast.rerunSubmitted', '已提交重跑 · 新 Run #{id}', {
            id: result.run_id,
          }),
        })
        setPeekId(result.run_id)
      } catch {
        toast.show({
          tone: 'danger',
          title: t('extractionRuns.toast.rerunFailed', '重跑失败，请稍后重试'),
        })
      }
    },
    [rerun, toast],
  )

  return (
    <>
      <DataCenterSyncTabs />
      <div className="relative flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b px-4 py-2" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
        <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
          {data ? `${rows.length} / ${data.total}` : '—'}
        </span>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {isLoading ? <SkeletonRows /> : isError ? (
          <RetryState
            message={error instanceof Error ? error.message : t('extractionRuns.state.loadFailed', '加载失败')}
            onRetry={() => refetch()}
            retryAriaLabel={t('extractionRuns.action.retry', '重试加载同步记录')}
          />
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
          title={peekRow ? `Run #${peekRow.id}` : t('extractionRuns.peek.placeholderTitle', '执行详情')}
          subtitle={peekRow ? `Task #${peekRow.task_id}` : undefined}
          badges={peekRow ? runStatusChip(peekRow.status) : null}
        >
          {peekRow ? (
            <ExtractionRunDetailContent
              run={peekRow}
              onJumpTask={() => navigate(`/data-center/sync/tasks/${peekRow.task_id}`)}
              onRerunSuccess={(newRunId) => {
                toast.show({
                  tone: 'success',
                  title: t('extractionRuns.toast.rerunSubmitted', '已提交重跑 · 新 Run #{id}', {
                    id: newRunId,
                  }),
                })
                setPeekId(newRunId)
              }}
            />
          ) : null}
        </PeekPanel>
      </div>
      </div>
    </>
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
            {[
              t('extractionRuns.col.runId', '运行 #'),
              t('extractionRuns.col.task', '任务'),
              t('extractionRuns.col.status', '状态'),
              t('extractionRuns.col.trigger', '触发'),
              t('extractionRuns.col.rows', '行数'),
              t('extractionRuns.col.duration', '耗时'),
              t('extractionRuns.col.startedAt', '开始时间'),
              t('extractionRuns.col.actions', '操作'),
            ].map((h) => (
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
                    aria-label={t('extractionRuns.rerun.ariaLabel', '重跑运行 #{id}', { id: row.id })}
                    title={
                      canRerun
                        ? t('extractionRuns.rerun.tooltipOk', '基于此次运行重新执行')
                        : t('extractionRuns.rerun.tooltipBlocked', '任务在运行中或排队，无法重跑')
                    }
                    className="inline-flex items-center gap-1 rounded border px-2 py-1 disabled:opacity-40"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-2)', background: 'var(--bg-surface-2)' }}
                  >
                    <Play size={11} className={pending ? 'animate-pulse' : ''} />
                    {pending
                      ? t('extractionRuns.rerun.pending', '提交中')
                      : t('extractionRuns.rerun.action', '重跑')}
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

function StatCard({ label, value, tone = 'neutral' }: { label: React.ReactNode; value: number; tone?: string }) {
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

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2">
      <Activity size={20} style={{ color: 'var(--text-3)' }} />
      <p className="text-xs" style={{ color: 'var(--text-3)' }}>
        {t('extractionRuns.state.empty', '暂无同步记录')}
      </p>
    </div>
  )
}
