// frontend/src/v2/pages/data/_shared/extraction-run-detail-content.tsx
/* eslint-disable react-refresh/only-export-components -- 该文件与主组件/Provider 同时导出 helper/Context/hook，是项目历史共享约定；Fast Refresh 会丢热更粒度但不影响生产功能。 */
//
// ExtractionRun Peek (L2) 与 ExtractionRunDetail (L3) 共用的详情内容。
// 字段对齐：RunDetailSchema (task_schemas.py)
// drop-frontend: task_name(直接关联) — 后端 RunDetailSchema 无此字段，只有 task_id
//   请通过跳转链接访问所属任务。
// NOTE: result_file_path 不直接展示（安全考量），下载按钮通过 getRunDownloadUrl() 触发。

import { useState, type ReactNode } from 'react'
import type { ExtractionRun } from '@v2/api/extraction'
import { getRunDownloadUrl } from '@v2/api/extraction'
import { fmtDateTime, fmtRelative, fmtNum } from '@v2/lib/format'
import {
  useExtractionRunLogs,
  useRerunExtractionRun,
} from '@v2/hooks/extraction'
import { RefreshCcw, ScrollText } from 'lucide-react'
import { t } from '@v2/i18n'

// ── 徽章渲染助手 ──────────────────────────────────────────────────────────────

export function runStatusChip(status: string): ReactNode {
  const map: Record<string, { label: string; tone: string }> = {
    success: { label: t('extractionRunDetail.status.success', '成功'),  tone: 'success' },
    failed:  { label: t('extractionRunDetail.status.failed', '失败'),   tone: 'danger' },
    running: { label: t('extractionRunDetail.status.running', '运行中'), tone: 'accent' },
    pending: { label: t('extractionRunDetail.status.pending', '排队'),  tone: 'neutral' },
  }
  const { label = status, tone = 'neutral' } = map[status] ?? {}
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium"
      style={{
        background: `var(--${tone}-soft, var(--bg-surface-2))`,
        color: `var(--${tone}, var(--text-2))`,
      }}
    >
      {label}
    </span>
  )
}

export function runTabLabel(run: ExtractionRun): ReactNode {
  const dotColor =
    run.status === 'success'
      ? 'var(--success)'
      : run.status === 'failed'
        ? 'var(--danger)'
        : run.status === 'running'
          ? 'var(--accent)'
          : 'var(--text-3)'
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: dotColor }}
      />
      <span className="truncate">
        Run #{run.id} · Task #{run.task_id}
      </span>
    </span>
  )
}

// ── 格式化工具 ────────────────────────────────────────────────────────────────

export function fmtDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—'
  if (ms < 1000) return `${ms}ms`
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec}s`
  return `${Math.floor(sec / 60)}m ${sec % 60}s`
}

// ── 主内容组件 ────────────────────────────────────────────────────────────────

export function ExtractionRunDetailContent({
  run,
  onJumpTask,
  onRerunSuccess,
}: {
  run: ExtractionRun
  onJumpTask?: () => void
  /** Round 4 · P17a — rerun 成功后父组件回调（通常跳转到新 run） */
  onRerunSuccess?: (newRunId: number) => void
}) {
  const rerun = useRerunExtractionRun()
  const canRerun = run.status === 'success' || run.status === 'failed' || run.status === 'cancelled'

  async function handleRerun() {
    if (!canRerun || rerun.isPending) return
    try {
      const result = await rerun.mutateAsync(run.id)
      onRerunSuccess?.(result.run_id)
    } catch {
      // 错误已经通过 apiClient 的 axios 拦截器冒泡到 toast；这里静默
    }
  }

  return (
    <div className="px-4 py-3.5">
      <Section title={t('extractionRunDetail.section.actions', '操作')}>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleRerun}
            disabled={!canRerun || rerun.isPending}
            aria-label={t('extractionRunDetail.rerun.ariaLabel', '重新执行此次运行')}
            data-testid="run-rerun"
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            style={{ borderColor: 'var(--border)', color: 'var(--text-1)', background: 'var(--bg-surface-2)' }}
          >
            <RefreshCcw size={12} className={rerun.isPending ? 'animate-spin' : ''} />
            {rerun.isPending
              ? t('extractionRunDetail.rerun.submitting', '提交中…')
              : canRerun
                ? t('extractionRunDetail.rerun.action', '重跑')
                : t('extractionRunDetail.rerun.blocked', '无法重跑')}
          </button>
          {onJumpTask ? (
            <button
              type="button"
              onClick={onJumpTask}
              className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium"
              style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
            >
              {t('extractionRunDetail.action.viewTask', '查看所属任务')}
            </button>
          ) : null}
          {run.result_file_path ? (
            <a
              href={getRunDownloadUrl(run.id)}
              download
              className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium"
              style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
            >
              {t('extractionRunDetail.action.download', '下载结果')}
            </a>
          ) : null}
        </div>
      </Section>

      <RunLogsSection run={run} />

      <Section title={t('extractionRunDetail.section.basic', '基础信息')}>
        <dl
          className="divide-y rounded-md border text-xs"
          style={{ borderColor: 'var(--border)' }}
        >
          <Row label={t('extractionRunDetail.field.runId', '执行 ID')}    value={run.id} />
          <Row label={t('extractionRunDetail.field.task', '所属任务')}     value={`Task #${run.task_id}`} />
          <Row label={t('extractionRunDetail.field.status', '状态')}      value={runStatusChip(run.status)} />
          <Row label={t('extractionRunDetail.field.runType', '触发类型')}  value={run.run_type} />
          <Row label={t('extractionRunDetail.field.triggeredBy', '触发人')} value={run.triggered_by} />
          <Row label={t('extractionRunDetail.field.startTime', '开始时间')} value={fmtDateTime(run.start_time)} />
          <Row
            label={t('extractionRunDetail.field.endTime', '结束时间')}
            value={run.end_time ? fmtDateTime(run.end_time) : t('extractionRunDetail.state.running', '运行中')}
          />
          <Row label={t('extractionRunDetail.field.duration', '耗时')} value={fmtDuration(run.duration_ms)} />
          <Row label={t('extractionRunDetail.field.rowCount', '行数')} value={run.row_count !== null ? fmtNum(run.row_count) : '—'} />
          <Row label={t('extractionRunDetail.field.deliveryMethod', '投递方式')} value={run.delivery_method} />
          {run.result_size_mb !== null ? (
            <Row label={t('extractionRunDetail.field.resultSize', '结果大小')} value={`${run.result_size_mb?.toFixed(2)} MB`} />
          ) : null}
        </dl>
      </Section>

      {run.error_message ? (
        <Section title={t('extractionRunDetail.section.error', '错误信息')}>
          <p
            className="rounded-md border px-2.5 py-1.5 text-xs leading-5"
            style={{ borderColor: 'var(--border)', color: 'var(--danger)' }}
          >
            {run.error_message}
          </p>
        </Section>
      ) : null}

      {run.delivery_info ? (
        <Section title={t('extractionRunDetail.section.delivery', '投递详情')}>
          <pre
            className="max-h-40 overflow-auto rounded-md border p-2 text-[11px] leading-4"
            style={{
              background: 'var(--bg-surface-2)',
              borderColor: 'var(--border)',
              color: 'var(--text-2)',
            }}
          >
            {JSON.stringify(run.delivery_info, null, 2)}
          </pre>
        </Section>
      ) : null}

      <Section title={t('extractionRunDetail.section.timeline', '时间轴')}>
        <ol
          className="relative ml-3 space-y-3 border-l pl-4"
          style={{ borderColor: 'var(--border)' }}
        >
          {run.start_time ? (
            <TimelineItem
              label={t('extractionRunDetail.timeline.started', '开始')}
              time={run.start_time}
              tone="accent"
            />
          ) : null}
          {run.end_time ? (
            <TimelineItem
              label={
                run.status === 'failed'
                  ? t('extractionRunDetail.status.failed', '失败')
                  : t('extractionRunDetail.timeline.finished', '完成')
              }
              time={run.end_time}
              tone={run.status === 'failed' ? 'danger' : 'success'}
            />
          ) : null}
        </ol>
      </Section>
    </div>
  )
}

// ── Round 4 · P17b — 日志面板 ─────────────────────────────────────────────────

function RunLogsSection({ run }: { run: ExtractionRun }) {
  const [includeSql, setIncludeSql] = useState(false)
  const [includeStack, setIncludeStack] = useState(run.status === 'failed')
  const [levelFilter, setLevelFilter] = useState<'' | 'INFO' | 'WARNING' | 'ERROR'>('')

  const { data, isLoading, isError, refetch, isFetching } = useExtractionRunLogs(run.id, {
    include_sql: includeSql,
    include_stack: includeStack,
    levels: levelFilter || undefined,
    page: 1,
    page_size: 200,
  })

  return (
    <Section
      title={
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <ScrollText size={11} />
            {t('extractionRunDetail.logs.title', '日志（{n}）', {
              n: data?.total ?? '…',
            })}
          </span>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label={t('extractionRunDetail.logs.refreshAria', '刷新日志')}
            className="rounded px-1 text-[10px]"
            style={{ color: 'var(--text-3)' }}
          >
            {isFetching
              ? t('extractionRunDetail.logs.refreshing', '刷新中…')
              : t('extractionRunDetail.logs.refresh', '刷新')}
          </button>
        </div>
      }
    >
      <div className="mb-2 flex flex-wrap items-center gap-3 text-[11px]" style={{ color: 'var(--text-2)' }}>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={includeSql}
            onChange={(e) => setIncludeSql(e.target.checked)}
            aria-label={t('extractionRunDetail.logs.includeSqlAria', '包含 SQL')}
          />
          SQL
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={includeStack}
            onChange={(e) => setIncludeStack(e.target.checked)}
            aria-label={t('extractionRunDetail.logs.includeStackAria', '包含堆栈')}
          />
          {t('extractionRunDetail.logs.stack', '堆栈')}
        </label>
        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value as typeof levelFilter)}
          className="rounded border px-1 py-0.5"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)', color: 'var(--text-1)' }}
          aria-label={t('extractionRunDetail.logs.levelFilterAria', '日志等级过滤')}
        >
          <option value="">{t('extractionRunDetail.logs.levelAll', '全部等级')}</option>
          <option value="INFO">INFO</option>
          <option value="WARNING">WARNING</option>
          <option value="ERROR">ERROR</option>
        </select>
      </div>

      {isLoading ? (
        <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
          {t('extractionRunDetail.logs.loading', '加载日志…')}
        </p>
      ) : isError ? (
        <p className="text-[11px]" style={{ color: 'var(--danger)' }}>
          {t('extractionRunDetail.logs.loadFailed', '日志读取失败')}
        </p>
      ) : (data?.items.length ?? 0) === 0 ? (
        <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
          {t('extractionRunDetail.logs.empty', '暂无日志')}
        </p>
      ) : (
        <ol
          data-testid="run-logs"
          className="max-h-56 overflow-auto rounded-md border font-mono text-[11px] leading-4"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)' }}
        >
          {data!.items.map((log, i) => (
            <li
              key={`${log.ts}-${i}`}
              className="flex items-start gap-2 border-b px-2 py-1 last:border-b-0"
              style={{ borderColor: 'var(--border)' }}
            >
              <span className="shrink-0 tabular-nums" style={{ color: 'var(--text-3)' }}>
                {log.ts ? log.ts.slice(11, 19) : '—'}
              </span>
              <span
                className="shrink-0 w-14 font-semibold"
                style={{ color: logLevelColor(log.level) }}
              >
                {log.level}
              </span>
              <span className="whitespace-pre-wrap break-all" style={{ color: 'var(--text-1)' }}>
                {log.message}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Section>
  )
}

function logLevelColor(level: string): string {
  switch (level.toUpperCase()) {
    case 'ERROR':
      return 'var(--danger)'
    case 'WARNING':
      return 'var(--warning, var(--accent))'
    case 'INFO':
      return 'var(--accent)'
    default:
      return 'var(--text-3)'
  }
}

// ── 内部组件 ──────────────────────────────────────────────────────────────────

function TimelineItem({
  label,
  time,
  tone,
}: {
  label: ReactNode
  time: string
  tone: string
}) {
  return (
    <li className="relative">
      <span
        className="absolute -left-[19px] top-1 h-2.5 w-2.5 rounded-full"
        style={{ background: `var(--${tone})` }}
      />
      <div className="text-xs" style={{ color: 'var(--text-1)' }}>
        {label}
      </div>
      <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>
        {fmtDateTime(time)} · {fmtRelative(time)}
      </div>
    </li>
  )
}

function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-4 last:mb-0">
      <div
        className="mb-1.5 text-[10px] font-medium uppercase tracking-wide"
        style={{ color: 'var(--text-3)' }}
      >
        {title}
      </div>
      {children}
    </section>
  )
}

function Row({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-2.5 py-1.5">
      <dt style={{ color: 'var(--text-3)' }}>{label}</dt>
      <dd className="truncate" style={{ color: 'var(--text-1)' }}>
        {value ?? '—'}
      </dd>
    </div>
  )
}
