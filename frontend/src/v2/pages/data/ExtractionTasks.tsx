// frontend/src/v2/pages/data/ExtractionTasks.tsx
//
// 提取任务列表（L0）。行点击 → L2 Peek；Peek"打开详情" → L3 ExtractionTaskDetail。
// 对接 GET /api/v1/extraction/tasks
// drop-frontend: owner / source(string) / target(string) / schedule(string) / rows_synced
//   / next_run_at — 后端无设计 see plan §3.4

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExternalLink, Plus, RefreshCcw, Workflow } from 'lucide-react'
import { useExtractionTasks, useExecuteTask } from '@v2/hooks/extraction'
import type { ExtractionTask } from '@v2/api/extraction'
import { useToast } from '@v2/components/ui/Toast'
import {
  ExtractionTaskDetailContent,
  taskStatusChip,
  taskTabLabel,
  taskTypeChip,
} from './_shared/extraction-task-detail-content'
import { fmtDateTime, fmtRelative } from '@v2/lib/format'
import { t } from '@v2/i18n'

import { useAppShell } from '@v2/layout/AppShell'

function statusOptions() {
  return [
    { value: '', label: t('extractionTasks.status.all', '全部状态') },
    { value: 'success', label: t('extractionTasks.status.success', '成功') },
    { value: 'failed',  label: t('extractionTasks.status.failed', '失败') },
    { value: 'running', label: t('extractionTasks.status.running', '运行中') },
    { value: 'pending', label: t('extractionTasks.status.pending', '排队') },
  ]
}

function typeOptions() {
  return [
    { value: '',          label: t('extractionTasks.type.all', '全部类型') },
    { value: 'manual',    label: t('extractionTasks.type.manual', '手动') },
    { value: 'scheduled', label: t('extractionTasks.type.scheduled', '调度') },
    { value: 'api',       label: 'API' },
  ]
}

export default function ExtractionTasks() {
  const navigate = useNavigate()
  const toast = useToast()
  const { setBreadcrumbs, setTopBarActions, setContextPanel, openTab } = useAppShell()
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const { data, isLoading, isError, error, refetch, isFetching } = useExtractionTasks({
    page: 1,
    page_size: 100,
    ...(statusFilter ? { /* task status filter not in list API, filter client-side */ } : {}),
    ...(typeFilter ? { task_type: typeFilter } : {}),
  })

  const executeTask = useExecuteTask()

  const allRows = useMemo<ExtractionTask[]>(() => data?.items ?? [], [data?.items])

  const rows = useMemo(() => {
    return allRows.filter((r) => {
      if (statusFilter && r.last_run_status !== statusFilter) return false
      if (typeFilter && r.task_type !== typeFilter) return false
      if (keyword) {
        const q = keyword.toLowerCase()
        if (!r.task_name.toLowerCase().includes(q) && !r.task_code.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [allRows, statusFilter, typeFilter, keyword])

  const stats = useMemo(() => {
    const total = allRows.length
    const running = allRows.filter((r) => r.last_run_status === 'running').length
    const failed  = allRows.filter((r) => r.last_run_status === 'failed').length
    const active  = allRows.filter((r) => r.is_active).length
    return { total, running, failed, active }
  }, [allRows])

  useEffect(() => {
    setBreadcrumbs([
      t('extractionTasks.breadcrumb.data', '数据'),
      t('extractionTasks.breadcrumb.tasks', '提取任务'),
    ])
  }, [setBreadcrumbs])

  useEffect(() => {
    setTopBarActions(
      <div className="flex items-center gap-2">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder={t('extractionTasks.search.placeholder', '搜索任务名…')}
          className="rounded-md border px-3 py-1.5 text-xs"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)', color: 'var(--text-1)', width: 160 }}
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
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-md border px-2 py-1.5 text-xs"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)', color: 'var(--text-1)' }}
        >
          {typeOptions().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs"
          style={{ color: 'var(--text-2)' }}
        >
          <RefreshCcw size={12} className={isFetching ? 'animate-spin' : ''} />{' '}
          {t('extractionTasks.action.refresh', '刷新')}
        </button>
        <button
          type="button"
          onClick={() => navigate('/extraction/tasks/new')}
          className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          <Plus size={12} /> {t('extractionTasks.action.create', '新建任务')}
        </button>
      </div>,
    )
    return () => setTopBarActions(null)
  }, [setTopBarActions, refetch, isFetching, navigate, keyword, statusFilter, typeFilter])

  const selectedRow = useMemo(
    () => (selectedId == null ? null : rows.find((r) => r.id === selectedId) ?? null),
    [selectedId, rows],
  )

  const openInTab = useCallback(
    (row: ExtractionTask) => {
      openTab({
        id: `extraction-task:${row.id}`,
        label: taskTabLabel(row),
        to: `/extraction/tasks/${row.id}`,
        closeable: true,
      })
      navigate(`/extraction/tasks/${row.id}`)
    },
    [navigate, openTab],
  )

  const executePendingId = executeTask.isPending ? executeTask.variables?.id ?? null : null

  const handleExecute = useCallback(
    async (row: ExtractionTask) => {
      try {
        const result = await executeTask.mutateAsync({ id: row.id })
        toast.show({
          tone: 'success',
          title: t('extractionTasks.toast.executeSubmitted', '已提交执行 · Run #{id}', {
            id: result.run_id,
          }),
          description: result.job_id
            ? t('extractionTasks.toast.executeJob', '后台任务 {jobId} 已入队', {
                jobId: result.job_id,
              })
            : undefined,
        })
        await refetch()
      } catch (err) {
        toast.show({
          tone: 'danger',
          title: t('extractionTasks.toast.executeFailed', '执行提交失败'),
          description: err instanceof Error ? err.message : undefined,
        })
      }
    },
    [executeTask, refetch, toast],
  )

  useEffect(() => {
    if (selectedRow) {
      setContextPanel({
        title: (
          <div className="flex items-center gap-1.5">
            <Workflow size={12} style={{ color: 'var(--text-3)' }} />
            {selectedRow.task_name}
          </div>
        ),
        subtitle: t('extractionTasks.context.selected', '选中任务'),
        body: (
          <div className="space-y-3">
            <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
              <button
                type="button"
                onClick={() => openInTab(selectedRow)}
                className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs"
                style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
              >
                <ExternalLink size={12} /> {t('extractionTasks.action.openDetail', '打开详情')}
              </button>
            </div>
            <ExtractionTaskDetailContent
              task={selectedRow}
              actions={{
                onExecute: () => {
                  void handleExecute(selectedRow)
                },
                executePending: executePendingId === selectedRow.id,
              }}
            />
          </div>
        ),
      })
      return () => setContextPanel(null)
    }

    setContextPanel({
      title: (
        <div className="flex items-center gap-1.5">
          <Workflow size={12} style={{ color: 'var(--text-3)' }} />
          {t('extractionTasks.context.title', '提取任务')}
        </div>
      ),
      subtitle: t('extractionTasks.context.overview', '任务列表概览'),
      body: (
        <div className="space-y-4 px-4 py-4">
          <section>
            <CtxLabel>{t('extractionTasks.context.scale', '规模')}</CtxLabel>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <StatCard label={t('extractionTasks.stats.total', '总计')} value={stats.total} />
              <StatCard label={t('extractionTasks.stats.active', '启用')} value={stats.active} tone="success" />
              <StatCard label={t('extractionTasks.stats.running', '运行中')} value={stats.running} tone={stats.running ? 'accent' : 'neutral'} />
              <StatCard label={t('extractionTasks.stats.failed', '失败')} value={stats.failed} tone={stats.failed ? 'danger' : 'neutral'} />
            </div>
          </section>
          <section>
            <CtxLabel>{t('extractionTasks.context.shortcuts', '快捷操作')}</CtxLabel>
            <div className="mt-2 space-y-1.5 text-xs">
              <button type="button" onClick={() => navigate('/extraction/tasks/new')} className="flex w-full rounded-md px-2 py-1 text-left" style={{ color: 'var(--text-2)' }}>
                + {t('extractionTasks.action.create', '新建任务')}
              </button>
              <button type="button" onClick={() => navigate('/extraction/runs')} className="flex w-full rounded-md px-2 py-1 text-left" style={{ color: 'var(--text-2)' }}>
                {t('extractionTasks.action.viewRuns', '查看执行记录')}
              </button>
            </div>
          </section>
        </div>
      ),
    })
    return () => setContextPanel(null)
  }, [executePendingId, handleExecute, navigate, openInTab, selectedRow, setContextPanel, stats])

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b px-4 py-2" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
        <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
          {data ? `${rows.length} / ${data.total}` : '—'}
        </span>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {isLoading ? <SkeletonRows /> : isError ? (
          <ErrorState
            message={error instanceof Error ? error.message : t('extractionTasks.state.loadFailed', '加载失败')}
            onRetry={() => refetch()}
          />
        ) : rows.length === 0 ? (
          <EmptyState />
        ) : (
          <TaskTable
            rows={rows}
            activeId={selectedId}
            onRowClick={(r) => setSelectedId(r.id === selectedId ? null : r.id)}
          />
        )}

      </div>
    </div>
  )
}

// ── 内部组件 ──────────────────────────────────────────────────────────────────

function TaskTable({
  rows,
  activeId,
  onRowClick,
}: {
  rows: ExtractionTask[]
  activeId: number | null
  onRowClick: (r: ExtractionTask) => void
}) {
  return (
    <div className="h-full overflow-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {[
              t('extractionTasks.col.task', '任务'),
              t('extractionTasks.col.type', '类型'),
              t('extractionTasks.col.status', '状态'),
              t('extractionTasks.col.active', '启用'),
              t('extractionTasks.col.lastRun', '最近运行'),
              t('extractionTasks.col.createdAt', '创建时间'),
            ].map((h, i) => (
              <th key={i} className="px-4 py-2 text-left font-medium" style={{ color: 'var(--text-3)' }}>{h}</th>
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
              <td className="px-4 py-2.5">
                <div className="min-w-0">
                  <div className="truncate font-medium" style={{ color: 'var(--text-1)' }}>{row.task_name}</div>
                  <code className="text-[11px]" style={{ color: 'var(--text-3)' }}>{row.task_code}</code>
                </div>
              </td>
              <td className="px-4 py-2.5">{taskTypeChip(row.task_type)}</td>
              <td className="px-4 py-2.5">{taskStatusChip(row.last_run_status)}</td>
              <td className="px-4 py-2.5">
                <span style={{ color: row.is_active ? 'var(--success)' : 'var(--text-3)' }}>
                  {row.is_active
                    ? t('extractionTasks.active.on', '启用')
                    : t('extractionTasks.active.off', '停用')}
                </span>
              </td>
              <td className="px-4 py-2.5 text-[11px]" style={{ color: 'var(--text-3)' }}>
                {row.last_run_at ? fmtRelative(row.last_run_at) : '—'}
              </td>
              <td className="px-4 py-2.5 text-[11px]" style={{ color: 'var(--text-3)' }}>
                {fmtDateTime(row.created_at)}
              </td>
            </tr>
          ))}
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
          {[40, 10, 10, 8, 12, 12].map((w, j) => (
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
      <button type="button" onClick={onRetry} className="rounded-md border px-3 py-1.5 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}>
        {t('extractionTasks.action.retry', '重试')}
      </button>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2">
      <Workflow size={20} style={{ color: 'var(--text-3)' }} />
      <p className="text-xs" style={{ color: 'var(--text-3)' }}>
        {t('extractionTasks.state.empty', '暂无提取任务')}
      </p>
    </div>
  )
}
