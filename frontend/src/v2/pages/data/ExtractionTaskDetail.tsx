// frontend/src/v2/pages/data/ExtractionTaskDetail.tsx
//
// 提取任务详情全屏页（L3）。
// NOTE: 后端无 GET /extraction/tasks/:id 单项接口；通过列表查询后 client-side find。
//   待后端补充 detail 接口后，替换为直接查询。
// 对接 GET /api/v1/extraction/tasks + POST /api/v1/extraction/tasks/:id/execute

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Workflow, Clock, Save } from 'lucide-react'
import { useExtractionTasks, useExecuteTask, useUpdateExtractionTask, useUpdateTaskSchedule } from '@v2/hooks/extraction'
import type { ExtractionTask } from '@v2/api/extraction'
import { useToast } from '@v2/components/ui/Toast'
import { RefreshButton } from '@v2/components/CommonControls'
import {
  ExtractionTaskDetailContent,
  taskStatusChip,
  taskTabLabel,
} from './_shared/extraction-task-detail-content'
import { fmtRelative } from '@v2/lib/format'
import { t } from '@v2/i18n'

// X-Crosscut 提供（编译错误留待 Phase 3 修复）
import { useAppShell } from '@v2/layout/AppShell'

function buildDetailTabs() {
  return [
    { id: 'overview', label: t('extractionTaskDetail.tab.overview', '概览') },
    { id: 'schedule', label: t('extractionTaskDetail.tab.schedule', '调度') },
  ] as const
}
type DetailTabId = 'overview' | 'schedule'

export default function ExtractionTaskDetail() {
  const { id } = useParams<{ id: string }>()
  const numericId = Number(id)
  const navigate = useNavigate()
  const toast = useToast()
  const { setBreadcrumbs, setTopBarActions, setContextPanel, openTab } = useAppShell()
  const [detailTab, setDetailTab] = useState<DetailTabId>('overview')

  const { data, isLoading, isError, refetch, isFetching } = useExtractionTasks({
    page: 1,
    page_size: 100,
  })
  const executeTask = useExecuteTask()
  const updateTask = useUpdateExtractionTask()
  const updateSchedule = useUpdateTaskSchedule()

  const allTasks = useMemo(() => data?.items ?? [], [data?.items])
  const task = useMemo(() => allTasks.find((t) => t.id === numericId) ?? null, [allTasks, numericId])

  const neighbors = useMemo(() => {
    if (!task) return { prev: null as ExtractionTask | null, next: null as ExtractionTask | null }
    const idx = allTasks.findIndex((t) => t.id === task.id)
    if (idx < 0) return { prev: null, next: null }
    return { prev: allTasks[idx - 1] ?? null, next: allTasks[idx + 1] ?? null }
  }, [allTasks, task])

  const handleExecute = useCallback(async () => {
    if (!task) return
    try {
      const result = await executeTask.mutateAsync({ id: task.id })
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
  }, [executeTask, refetch, task, toast])

  useEffect(() => {
    if (!task) return
    setBreadcrumbs([
      t('extractionTaskDetail.breadcrumb.data', '数据'),
      t('extractionTaskDetail.breadcrumb.tasks', '提取任务'),
      task.task_name,
    ])
  }, [task, setBreadcrumbs])

  useEffect(() => {
    if (!task) return
    openTab({
      id: `extraction-task:${task.id}`,
      label: taskTabLabel(task),
      to: `/extraction/tasks/${task.id}`,
      closeable: true,
      onClose: () => {
        navigate('/extraction/tasks')
        return true
      },
    })
  }, [task, openTab, navigate])

  useEffect(() => {
    setTopBarActions(
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/extraction/tasks')}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs"
          style={{ color: 'var(--text-2)' }}
        >
          <ArrowLeft size={12} /> {t('extractionTaskDetail.action.back', '返回列表')}
        </button>
        <RefreshButton
          onClick={() => refetch()}
          loading={isFetching}
          ariaLabel={t('extractionTaskDetail.action.refresh', '刷新提取任务')}
        />
        <button
          type="button"
          onClick={() => navigate('/extraction/runs')}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
          style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
        >
          <ExternalLink size={12} /> {t('extractionTaskDetail.action.viewRuns', '查看执行记录')}
        </button>
      </div>,
    )
    return () => setTopBarActions(null)
  }, [setTopBarActions, navigate, refetch, isFetching])

  useEffect(() => {
    if (!task) return
    setContextPanel({
      title: (
        <div className="flex items-center gap-1.5">
          <Workflow size={12} style={{ color: 'var(--text-3)' }} />
          {task.task_name}
        </div>
      ),
      subtitle: `#${task.id} · ${task.task_type}`,
      body: (
        <div className="space-y-4 px-4 py-4">
          <section>
            <CtxLabel>{t('extractionTaskDetail.context.status', '状态')}</CtxLabel>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {taskStatusChip(task.last_run_status)}
              <span
                className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium"
                style={{
                  background: task.is_active ? 'var(--success-soft)' : 'var(--bg-surface-2)',
                  color: task.is_active ? 'var(--success)' : 'var(--text-3)',
                }}
              >
                {task.is_active
                  ? t('extractionTaskDetail.state.active', '启用')
                  : t('extractionTaskDetail.state.inactive', '停用')}
              </span>
            </div>
          </section>
          <section>
            <CtxLabel>{t('extractionTaskDetail.context.lastRun', '最近运行')}</CtxLabel>
            <div className="mt-2 space-y-1 text-xs">
              <Pair
                label={t('extractionTaskDetail.pair.last', '最近')}
                value={task.last_run_at ? fmtRelative(task.last_run_at) : '—'}
              />
              <Pair
                label={t('extractionTaskDetail.pair.dataset', '数据集')}
                value={`#${task.dataset_id}`}
              />
            </div>
          </section>
          <section>
            <CtxLabel>{t('extractionTaskDetail.context.neighbors', '邻接导航')}</CtxLabel>
            <div className="mt-2 space-y-1.5 text-xs">
              <NeighborBtn
                label={
                  neighbors.prev
                    ? `← ${neighbors.prev.task_name}`
                    : t('extractionTaskDetail.neighbor.noPrev', '没有上一项')
                }
                disabled={!neighbors.prev}
                onClick={neighbors.prev ? () => navigate(`/extraction/tasks/${neighbors.prev!.id}`) : undefined}
              />
              <NeighborBtn
                label={
                  neighbors.next
                    ? `${neighbors.next.task_name} →`
                    : t('extractionTaskDetail.neighbor.noNext', '没有下一项')
                }
                disabled={!neighbors.next}
                onClick={neighbors.next ? () => navigate(`/extraction/tasks/${neighbors.next!.id}`) : undefined}
              />
            </div>
          </section>
        </div>
      ),
    })
    return () => setContextPanel(null)
  }, [task, neighbors, setContextPanel, navigate])

  if (!Number.isFinite(numericId)) {
    return (
      <div
        className="flex flex-1 items-center justify-center text-xs"
        style={{ color: 'var(--text-3)' }}
      >
        {t('extractionTaskDetail.state.invalidId', '非法的任务 ID')}
      </div>
    )
  }
  if (isLoading) {
    return (
      <div
        className="flex flex-1 items-center justify-center text-xs"
        style={{ color: 'var(--text-3)' }}
      >
        {t('extractionTaskDetail.state.loading', '加载中…')}
      </div>
    )
  }
  if (isError || !task) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs" style={{ color: 'var(--danger)' }}>
        {t('extractionTaskDetail.state.notFound', '未找到任务 #{id}', { id: numericId })}
      </div>
    )
  }
  const detailTabs = buildDetailTabs()

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="border-b px-4 py-3" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-[10px] font-semibold"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            EX
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
              <span className="truncate">{task.task_name}</span>
              {taskStatusChip(task.last_run_status)}
            </div>
            <div className="mt-0.5 text-[11px]" style={{ color: 'var(--text-3)' }}>
              <code>{task.task_code}</code> · dataset #{task.dataset_id} · {task.task_type}
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1">
          {detailTabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setDetailTab(item.id)}
              className="rounded px-2.5 py-1 text-xs"
              style={{
                background: detailTab === item.id ? 'var(--accent-soft)' : 'transparent',
                color: detailTab === item.id ? 'var(--accent)' : 'var(--text-2)',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        {detailTab === 'overview' && (
          <ExtractionTaskDetailContent
            task={task}
            actions={{
              onExecute: () => {
                void handleExecute()
              },
              executePending: executeTask.isPending,
              onToggleActive: () =>
                updateTask.mutate({ id: task.id, payload: { is_active: !task.is_active } }),
            }}
          />
        )}
        {detailTab === 'schedule' && (
          <ScheduleTab
            task={task}
            onSave={(payload) => updateSchedule.mutateAsync({ id: task.id, payload })}
            isSaving={updateSchedule.isPending}
          />
        )}
      </div>
    </div>
  )
}

// ── 调度 Tab ──────────────────────────────────────────────────────────────────

const COMMON_TIMEZONES = [
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Singapore',
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
]

function buildCronPresets() {
  return [
    { label: t('extractionTaskDetail.cronPreset.everyMinute', '每分钟'), value: '* * * * *' },
    { label: t('extractionTaskDetail.cronPreset.every5Min', '每 5 分钟'), value: '*/5 * * * *' },
    { label: t('extractionTaskDetail.cronPreset.hourly', '每小时'), value: '0 * * * *' },
    { label: t('extractionTaskDetail.cronPreset.daily0', '每天 0:00'), value: '0 0 * * *' },
    { label: t('extractionTaskDetail.cronPreset.daily8', '每天 8:00'), value: '0 8 * * *' },
    { label: t('extractionTaskDetail.cronPreset.mon9', '每周一 9:00'), value: '0 9 * * 1' },
    { label: t('extractionTaskDetail.cronPreset.monthly1', '每月 1 号'), value: '0 0 1 * *' },
  ]
}

/**
 * 简版 5 段 cron 解析，计算下一次触发时间（前端只做简单整分钟级别）
 * 支持 * / 固定数字，不支持 L/W/# 特殊字符
 */
function getNextCronRun(cron: string): Date | null {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const [minutePart, hourPart, domPart, monthPart, dowPart] = parts
  const now = new Date()
  const candidate = new Date(now)
  candidate.setSeconds(0, 0)
  candidate.setMinutes(candidate.getMinutes() + 1)

  const matches = (part: string, value: number, _max: number): boolean => {
    if (part === '*') return true
    if (part.startsWith('*/')) {
      const step = parseInt(part.slice(2), 10)
      return value % step === 0
    }
    const vals = part.split(',').map((v) => {
      if (v.includes('-')) {
        const [lo, hi] = v.split('-').map(Number)
        return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
      }
      return [parseInt(v, 10)]
    }).flat()
    return vals.includes(value)
  }

  for (let i = 0; i < 60 * 24 * 366; i++) {
    const m = candidate.getMinutes()
    const h = candidate.getHours()
    const dom = candidate.getDate()
    const month = candidate.getMonth() + 1
    const dow = candidate.getDay()
    if (
      matches(monthPart, month, 12) &&
      matches(domPart, dom, 31) &&
      matches(dowPart, dow, 6) &&
      matches(hourPart, h, 23) &&
      matches(minutePart, m, 59)
    ) {
      return candidate
    }
    candidate.setMinutes(candidate.getMinutes() + 1)
  }
  return null
}

function ScheduleTab({
  task,
  onSave,
  isSaving,
}: {
  task: ExtractionTask
  onSave: (payload: import('@v2/api/extraction').TaskSchedulePayload) => Promise<unknown>
  isSaving: boolean
}) {
  const existingConfig = (task as import('@v2/api/extraction').ExtractionTaskDetail).schedule_config as Record<string, unknown> | null
  const [cron, setCron] = useState<string>((existingConfig?.cron as string) ?? '0 8 * * *')
  const [enabled, setEnabled] = useState<boolean>((existingConfig?.enabled as boolean) ?? false)
  const [timezone, setTimezone] = useState<string>((existingConfig?.timezone as string) ?? 'Asia/Shanghai')
  const [saveSuccess, setSaveSuccess] = useState(false)

  const nextRun = useMemo(() => {
    try {
      return getNextCronRun(cron)
    } catch {
      return null
    }
  }, [cron])

  const handleSave = useCallback(async () => {
    await onSave({ schedule_cron: cron, schedule_enabled: enabled, schedule_timezone: timezone })
    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 2000)
  }, [onSave, cron, enabled, timezone])

  return (
    <div className="p-4">
      <div className="mx-auto max-w-lg space-y-5 rounded-lg border p-5" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>
        <div className="flex items-center gap-2">
          <Clock size={14} style={{ color: 'var(--accent)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
            {t('extractionTaskDetail.schedule.title', '调度配置')}
          </span>
        </div>

        {/* 启用开关 */}
        <div className="flex items-center justify-between rounded-md border px-3 py-2" style={{ borderColor: 'var(--border)' }}>
          <span className="text-xs font-medium" style={{ color: 'var(--text-1)' }}>
            {t('extractionTaskDetail.schedule.enableToggle', '启用定时调度')}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled((v) => !v)}
            className="relative inline-flex h-5 w-9 cursor-pointer rounded-full transition-colors"
            style={{ background: enabled ? 'var(--accent)' : 'var(--bg-surface-2)', border: '1px solid var(--border)' }}
          >
            <span
              className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform"
              style={{ left: enabled ? '18px' : '2px' }}
            />
          </button>
        </div>

        {/* 快捷预设 */}
        <div>
          <div className="mb-1.5 text-xs font-medium" style={{ color: 'var(--text-3)' }}>
            {t('extractionTaskDetail.schedule.commonPresets', '常用预设')}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {buildCronPresets().map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setCron(p.value)}
                className="rounded border px-2 py-1 text-xs transition-colors"
                style={{
                  borderColor: cron === p.value ? 'var(--accent)' : 'var(--border)',
                  background: cron === p.value ? 'var(--accent-soft)' : 'transparent',
                  color: cron === p.value ? 'var(--accent)' : 'var(--text-2)',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Cron 输入 */}
        <div>
          <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
            {t('extractionTaskDetail.schedule.cronLabel', 'Cron 表达式')}{' '}
            <span className="text-[10px] font-normal" style={{ color: 'var(--text-3)' }}>
              {t('extractionTaskDetail.schedule.cronHint', '（分 时 日 月 周，5 段）')}
            </span>
          </label>
          <input
            type="text"
            value={cron}
            onChange={(e) => setCron(e.target.value)}
            placeholder="0 8 * * *"
            className="w-full rounded border px-3 py-2 text-sm font-mono outline-none focus:ring-1"
            style={{
              background: 'var(--bg-surface-2)',
              borderColor: 'var(--border)',
              color: 'var(--text-1)',
            }}
          />
          <div className="mt-1.5 text-xs" style={{ color: nextRun ? 'var(--text-3)' : 'var(--danger)' }}>
            {nextRun
              ? t('extractionTaskDetail.schedule.nextRun', '下次触发：{time}', {
                  time: nextRun.toLocaleString('zh-CN', { timeZone: timezone }),
                })
              : t('extractionTaskDetail.schedule.cronInvalid', '无效的 cron 表达式')}
          </div>
        </div>

        {/* 时区选择 */}
        <div>
          <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
            {t('extractionTaskDetail.schedule.timezone', '时区')}
          </label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full rounded border px-3 py-2 text-xs outline-none focus:ring-1"
            style={{
              background: 'var(--bg-surface-2)',
              borderColor: 'var(--border)',
              color: 'var(--text-1)',
            }}
          >
            {COMMON_TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </div>

        {/* 保存 */}
        <div className="flex items-center justify-end gap-2 pt-1">
          {saveSuccess && (
            <span className="text-xs" style={{ color: 'var(--success)' }}>
              {t('extractionTaskDetail.schedule.saved', '已保存 ✓')}
            </span>
          )}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving || !nextRun}
            className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-xs font-medium text-white transition-opacity disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            <Save size={12} />
            {isSaving
              ? t('extractionTaskDetail.schedule.saving', '保存中…')
              : t('extractionTaskDetail.schedule.save', '保存调度')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 内部辅助 ──────────────────────────────────────────────────────────────────

function CtxLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>{children}</div>
}

function Pair({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt style={{ color: 'var(--text-3)' }}>{label}</dt>
      <dd className="truncate" style={{ color: 'var(--text-1)' }}>{value}</dd>
    </div>
  )
}

function NeighborBtn({ label, onClick, disabled }: { label: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
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
