// frontend/src/v2/pages/data/ExtractionRunDetail.tsx
//
// 提取执行记录详情全屏页（L3）。
// NOTE: 后端无 GET /extraction/runs/:id 单项接口；通过列表查询后 client-side find。
//   待后端补充 detail 接口后，替换为直接查询。
// 对接 GET /api/v1/extraction/runs + GET /api/v1/extraction/runs/:id/download

import { useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Activity, ArrowLeft, RefreshCcw } from 'lucide-react'
import { useExtractionRuns } from '@v2/hooks/extraction'
import type { ExtractionRun } from '@v2/api/extraction'
import {
  ExtractionRunDetailContent,
  runStatusChip,
  runTabLabel,
  fmtDuration,
} from './_shared/extraction-run-detail-content'
import { fmtDateTime, fmtRelative } from '@v2/lib/format'
// import { t } from '@v2/i18n'  // TODO: pending X-Crosscut delivery

// X-Crosscut 提供（编译错误留待 Phase 3 修复）
import { useAppShell } from '@v2/layout/AppShell'

export default function ExtractionRunDetail() {
  const { id } = useParams<{ id: string }>()
  const numericId = Number(id)
  const navigate = useNavigate()
  const { setBreadcrumbs, setTopBarActions, setContextPanel, openTab } = useAppShell()

  const { data, isLoading, isError, refetch, isFetching } = useExtractionRuns({
    page: 1,
    page_size: 100,
  })

  const allRuns = useMemo(() => data?.items ?? [], [data?.items])
  const run = useMemo(() => allRuns.find((r) => r.id === numericId) ?? null, [allRuns, numericId])

  const neighbors = useMemo(() => {
    if (!run) return { prev: null as ExtractionRun | null, next: null as ExtractionRun | null }
    const idx = allRuns.findIndex((r) => r.id === run.id)
    if (idx < 0) return { prev: null, next: null }
    return { prev: allRuns[idx - 1] ?? null, next: allRuns[idx + 1] ?? null }
  }, [allRuns, run])

  useEffect(() => {
    if (!run) return
    setBreadcrumbs(['数据', '执行记录', `#${run.id}`])
  }, [run, setBreadcrumbs])

  useEffect(() => {
    if (!run) return
    openTab({
      id: `extraction-run:${run.id}`,
      label: runTabLabel(run),
      to: `/extraction/runs/${run.id}`,
      closeable: true,
      onClose: () => {
        navigate('/extraction/runs')
        return true
      },
    })
  }, [run, openTab, navigate])

  useEffect(() => {
    setTopBarActions(
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/extraction/runs')}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs"
          style={{ color: 'var(--text-2)' }}
        >
          <ArrowLeft size={12} /> 返回列表
        </button>
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
  }, [setTopBarActions, navigate, refetch, isFetching])

  useEffect(() => {
    if (!run) return
    setContextPanel({
      title: (
        <div className="flex items-center gap-1.5">
          <Activity size={12} style={{ color: 'var(--text-3)' }} />
          运行 #{run.id}
        </div>
      ),
      subtitle: `Task #${run.task_id}`,
      body: (
        <div className="space-y-4 px-4 py-4">
          <section>
            <CtxLabel>状态</CtxLabel>
            <div className="mt-2">{runStatusChip(run.status)}</div>
          </section>
          <section>
            <CtxLabel>指标</CtxLabel>
            <div className="mt-2 space-y-1 text-xs">
              <Pair label="行数" value={run.row_count != null ? run.row_count.toLocaleString() : '—'} />
              <Pair label="耗时" value={run.duration_ms != null ? fmtDuration(run.duration_ms) : '—'} />
              <Pair label="触发" value={run.run_type} />
              <Pair label="触发人" value={run.triggered_by ?? '—'} />
            </div>
          </section>
          <section>
            <CtxLabel>时间</CtxLabel>
            <div className="mt-2 space-y-1 text-xs">
              <Pair label="开始" value={run.start_time ? fmtRelative(run.start_time) : '—'} />
              <Pair label="结束" value={run.end_time ? fmtDateTime(run.end_time) : '—'} />
            </div>
          </section>
          <section>
            <CtxLabel>邻接导航</CtxLabel>
            <div className="mt-2 space-y-1.5 text-xs">
              <NeighborBtn
                label={neighbors.prev ? `← Run #${neighbors.prev.id}` : '没有上一项'}
                disabled={!neighbors.prev}
                onClick={neighbors.prev ? () => navigate(`/extraction/runs/${neighbors.prev!.id}`) : undefined}
              />
              <NeighborBtn
                label={neighbors.next ? `Run #${neighbors.next.id} →` : '没有下一项'}
                disabled={!neighbors.next}
                onClick={neighbors.next ? () => navigate(`/extraction/runs/${neighbors.next!.id}`) : undefined}
              />
            </div>
          </section>
          <section>
            <CtxLabel>快捷跳转</CtxLabel>
            <div className="mt-2 text-xs">
              <button
                type="button"
                onClick={() => navigate(`/extraction/tasks/${run.task_id}`)}
                className="flex w-full rounded-md px-2 py-1 text-left"
                style={{ color: 'var(--text-2)' }}
              >
                查看任务 #{run.task_id}
              </button>
            </div>
          </section>
        </div>
      ),
    })
    return () => setContextPanel(null)
  }, [run, neighbors, setContextPanel, navigate])

  if (!Number.isFinite(numericId)) {
    return <div className="flex flex-1 items-center justify-center text-xs" style={{ color: 'var(--text-3)' }}>非法的运行 ID</div>
  }
  if (isLoading) {
    return <div className="flex flex-1 items-center justify-center text-xs" style={{ color: 'var(--text-3)' }}>加载中…</div>
  }
  if (isError || !run) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs" style={{ color: 'var(--danger)' }}>
        未找到运行记录 #{numericId}
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="border-b px-4 py-3" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-[10px] font-semibold"
            style={{ background: 'var(--bg-surface-2)', color: 'var(--text-2)' }}
          >
            RUN
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
              <span>Run #{run.id}</span>
              {runStatusChip(run.status)}
            </div>
            <div className="mt-0.5 text-[11px]" style={{ color: 'var(--text-3)' }}>
              Task #{run.task_id} · {run.run_type} · {run.start_time ? fmtRelative(run.start_time) : fmtDateTime(run.created_at)}
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        <ExtractionRunDetailContent
          run={run}
          onJumpTask={() => navigate(`/extraction/tasks/${run.task_id}`)}
        />
      </div>
    </div>
  )
}

// ── 内部辅助 ──────────────────────────────────────────────────────────────────

function CtxLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>{children}</div>
}

function Pair({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt style={{ color: 'var(--text-3)' }}>{label}</dt>
      <dd className="truncate" style={{ color: 'var(--text-1)' }}>{value}</dd>
    </div>
  )
}

function NeighborBtn({ label, onClick, disabled }: { label: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center rounded-md border px-2 py-1 text-left text-xs"
      style={{ borderColor: 'var(--border)', color: 'var(--text-2)', opacity: disabled ? 0.5 : 1 }}
    >
      <span className="truncate">{label}</span>
    </button>
  )
}
