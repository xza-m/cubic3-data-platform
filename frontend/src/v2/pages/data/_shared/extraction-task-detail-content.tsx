// frontend/src/v2/pages/data/_shared/extraction-task-detail-content.tsx
//
// ExtractionTask Peek (L2) 与 ExtractionTaskDetail (L3) 共用的详情内容。
// 字段对齐：TaskListItemSchema / TaskDetailSchema (task_schemas.py)
// drop-frontend: source(string) / target(string) / owner / rows_synced / schedule(string cron)
//   / next_run_at / failure_reason(task级) — 后端无设计 see plan §3.4

import type { ReactNode } from 'react'
import type { ExtractionTask, ExtractionTaskDetail } from '@v2/api/extraction'
import { fmtDateTime, fmtRelative } from '@v2/lib/format'
// import { t } from '@v2/i18n'  // TODO: pending X-Crosscut delivery

// ── 徽章渲染助手 ──────────────────────────────────────────────────────────────

export function taskStatusChip(status: string | null | undefined): ReactNode {
  if (!status) return <span style={{ color: 'var(--text-3)' }}>—</span>
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

export function taskTypeChip(type: string): ReactNode {
  const map: Record<string, { label: string; tone: string }> = {
    manual:    { label: '手动',  tone: 'neutral' },
    scheduled: { label: '调度',  tone: 'accent' },
    api:       { label: 'API',   tone: 'violet' },
  }
  const { label = type, tone = 'neutral' } = map[type] ?? {}
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

export function taskTabLabel(task: ExtractionTask): ReactNode {
  const dotColor =
    task.last_run_status === 'success'
      ? 'var(--success)'
      : task.last_run_status === 'failed'
        ? 'var(--danger)'
        : task.last_run_status === 'running'
          ? 'var(--accent)'
          : 'var(--text-3)'
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: dotColor }}
      />
      <span className="truncate">{task.task_name}</span>
    </span>
  )
}

// ── 操作按钮 ──────────────────────────────────────────────────────────────────

export interface TaskActions {
  onExecute?: () => void
  onToggleActive?: () => void
}

export function TaskActionButtons({ task, actions }: { task: ExtractionTask; actions?: TaskActions }) {
  if (!actions) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.onExecute ? (
        <button
          type="button"
          onClick={actions.onExecute}
          disabled={task.last_run_status === 'running'}
          className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium"
          style={{
            background: 'var(--accent)',
            color: 'var(--on-accent)',
            opacity: task.last_run_status === 'running' ? 0.5 : 1,
          }}
        >
          立即执行
        </button>
      ) : null}
      {actions.onToggleActive ? (
        <button
          type="button"
          onClick={actions.onToggleActive}
          className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium"
          style={{
            borderColor: 'var(--border)',
            color: 'var(--text-2)',
          }}
        >
          {task.is_active ? '停用' : '启用'}
        </button>
      ) : null}
    </div>
  )
}

// ── 主内容组件 ────────────────────────────────────────────────────────────────

export function ExtractionTaskDetailContent({
  task,
  actions,
}: {
  task: ExtractionTask | ExtractionTaskDetail
  actions?: TaskActions
}) {
  const detail = task as ExtractionTaskDetail
  const hasDetail = 'select_fields' in task

  return (
    <div className="px-4 py-3.5">
      {actions ? (
        <Section title="操作">
          <TaskActionButtons task={task} actions={actions} />
        </Section>
      ) : null}

      <Section title="基础信息">
        <dl
          className="divide-y rounded-md border text-xs"
          style={{ borderColor: 'var(--border)' }}
        >
          <Row label="任务名称"   value={task.task_name} />
          <Row label="任务编码"   value={<code>{task.task_code}</code>} />
          <Row label="数据集 ID"  value={task.dataset_id} />
          <Row label="类型"       value={taskTypeChip(task.task_type)} />
          <Row label="启用"       value={task.is_active ? '是' : '否'} />
          <Row label="最近状态"   value={taskStatusChip(task.last_run_status)} />
          <Row label="最近运行"   value={fmtDateTime(task.last_run_at)} />
          <Row label="创建时间"   value={fmtDateTime(task.created_at)} />
          {hasDetail ? (
            <>
              <Row label="更新时间"  value={fmtDateTime(detail.updated_at)} />
              <Row label="创建人"    value={detail.created_by} />
              <Row label="行数限制"  value={detail.row_limit} />
            </>
          ) : null}
        </dl>
      </Section>

      {hasDetail && detail.select_fields.length > 0 ? (
        <Section title={`选择字段 (${detail.select_fields.length})`}>
          <div className="flex flex-wrap gap-1">
            {detail.select_fields.map((f) => (
              <code
                key={f}
                className="rounded border px-1 py-0.5 text-[11px]"
                style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
              >
                {f}
              </code>
            ))}
          </div>
        </Section>
      ) : null}

      {hasDetail && detail.schedule_config ? (
        <Section title="调度配置">
          <pre
            className="max-h-40 overflow-auto rounded-md border p-2 text-[11px] leading-4"
            style={{
              background: 'var(--bg-surface-2)',
              borderColor: 'var(--border)',
              color: 'var(--text-2)',
            }}
          >
            {JSON.stringify(detail.schedule_config, null, 2)}
          </pre>
        </Section>
      ) : null}

      {hasDetail && detail.filter_conditions && Object.keys(detail.filter_conditions).length > 0 ? (
        <Section title="过滤条件">
          <pre
            className="max-h-40 overflow-auto rounded-md border p-2 text-[11px] leading-4"
            style={{
              background: 'var(--bg-surface-2)',
              borderColor: 'var(--border)',
              color: 'var(--text-2)',
            }}
          >
            {JSON.stringify(detail.filter_conditions, null, 2)}
          </pre>
        </Section>
      ) : null}
    </div>
  )
}

// ── 内部组件 ──────────────────────────────────────────────────────────────────

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

// suppress unused import warning
void fmtRelative
