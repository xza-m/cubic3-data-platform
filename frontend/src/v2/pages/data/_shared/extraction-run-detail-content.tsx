// frontend/src/v2/pages/data/_shared/extraction-run-detail-content.tsx
//
// ExtractionRun Peek (L2) 与 ExtractionRunDetail (L3) 共用的详情内容。
// 字段对齐：RunDetailSchema (task_schemas.py)
// drop-frontend: task_name(直接关联) — 后端 RunDetailSchema 无此字段，只有 task_id
//   请通过跳转链接访问所属任务。
// NOTE: result_file_path 不直接展示（安全考量），下载按钮通过 getRunDownloadUrl() 触发。

import type { ReactNode } from 'react'
import type { ExtractionRun } from '@v2/api/extraction'
import { getRunDownloadUrl } from '@v2/api/extraction'
import { fmtDateTime, fmtRelative, fmtNum } from '@v2/lib/format'
// import { t } from '@v2/i18n'  // TODO: pending X-Crosscut delivery

// ── 徽章渲染助手 ──────────────────────────────────────────────────────────────

export function runStatusChip(status: string): ReactNode {
  const map: Record<string, { label: string; tone: string }> = {
    success: { label: '成功',  tone: 'success' },
    failed:  { label: '失败',  tone: 'danger' },
    running: { label: '运行中', tone: 'accent' },
    pending: { label: '排队',  tone: 'neutral' },
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
}: {
  run: ExtractionRun
  onJumpTask?: () => void
}) {
  return (
    <div className="px-4 py-3.5">
      <Section title="操作">
        <div className="flex flex-wrap items-center gap-2">
          {onJumpTask ? (
            <button
              type="button"
              onClick={onJumpTask}
              className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium"
              style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
            >
              查看所属任务
            </button>
          ) : null}
          {run.result_file_path ? (
            <a
              href={getRunDownloadUrl(run.id)}
              download
              className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium"
              style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
            >
              下载结果
            </a>
          ) : null}
        </div>
      </Section>

      <Section title="基础信息">
        <dl
          className="divide-y rounded-md border text-xs"
          style={{ borderColor: 'var(--border)' }}
        >
          <Row label="执行 ID"    value={run.id} />
          <Row label="所属任务"   value={`Task #${run.task_id}`} />
          <Row label="状态"       value={runStatusChip(run.status)} />
          <Row label="触发类型"   value={run.run_type} />
          <Row label="触发人"     value={run.triggered_by} />
          <Row label="开始时间"   value={fmtDateTime(run.start_time)} />
          <Row
            label="结束时间"
            value={run.end_time ? fmtDateTime(run.end_time) : '运行中'}
          />
          <Row label="耗时"       value={fmtDuration(run.duration_ms)} />
          <Row label="行数"       value={run.row_count !== null ? fmtNum(run.row_count) : '—'} />
          <Row label="投递方式"   value={run.delivery_method} />
          {run.result_size_mb !== null ? (
            <Row label="结果大小" value={`${run.result_size_mb?.toFixed(2)} MB`} />
          ) : null}
        </dl>
      </Section>

      {run.error_message ? (
        <Section title="错误信息">
          <p
            className="rounded-md border px-2.5 py-1.5 text-xs leading-5"
            style={{ borderColor: 'var(--border)', color: 'var(--danger)' }}
          >
            {run.error_message}
          </p>
        </Section>
      ) : null}

      {run.delivery_info ? (
        <Section title="投递详情">
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

      <Section title="时间轴">
        <ol
          className="relative ml-3 space-y-3 border-l pl-4"
          style={{ borderColor: 'var(--border)' }}
        >
          {run.start_time ? (
            <TimelineItem
              label="开始"
              time={run.start_time}
              tone="accent"
            />
          ) : null}
          {run.end_time ? (
            <TimelineItem
              label={run.status === 'failed' ? '失败' : '完成'}
              time={run.end_time}
              tone={run.status === 'failed' ? 'danger' : 'success'}
            />
          ) : null}
        </ol>
      </Section>
    </div>
  )
}

// ── 内部组件 ──────────────────────────────────────────────────────────────────

function TimelineItem({
  label,
  time,
  tone,
}: {
  label: string
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

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-2.5 py-1.5">
      <dt style={{ color: 'var(--text-3)' }}>{label}</dt>
      <dd className="truncate" style={{ color: 'var(--text-1)' }}>
        {value ?? '—'}
      </dd>
    </div>
  )
}
