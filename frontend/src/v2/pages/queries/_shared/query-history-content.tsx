// frontend/src/v2/pages/queries/_shared/query-history-content.tsx
//
// 查询历史详情内容组件 —— Peek panel 与 L3 Detail 共用。

import type { ReactNode } from 'react'
import { fmtDateTime, fmtNum, fmtRelative } from '@v2/lib/format'
import type { QueryHistoryItem } from '@v2/api/queries'

// ──────────────────────────────────────────────────────────────────────────
// Tab label
// ──────────────────────────────────────────────────────────────────────────

export function queryHistoryTabLabel(row: QueryHistoryItem): ReactNode {
  return (
    <span className="flex items-center gap-1.5">
      <code className="text-neutral-400">#{row.id}</code>
      <span className="truncate">{(row.sql_query ?? '').slice(0, 24)}…</span>
    </span>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Status chip helper
// ──────────────────────────────────────────────────────────────────────────

const STATUS_CLASSES: Record<string, string> = {
  success: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  running: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
}

export function statusChip(status: string): ReactNode {
  const cls = STATUS_CLASSES[status] ?? 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Actions interface
// ──────────────────────────────────────────────────────────────────────────

export interface QueryHistoryActions {
  onReplay?: () => void
  onDownload?: () => void
}

// ──────────────────────────────────────────────────────────────────────────
// Detail content body
// ──────────────────────────────────────────────────────────────────────────

export function QueryHistoryDetailContent({
  row,
  actions,
}: {
  row: QueryHistoryItem
  actions?: QueryHistoryActions
}) {
  return (
    <div className="space-y-4 px-4 py-4 text-xs">
      {(actions?.onReplay || actions?.onDownload) && (
        <div className="flex items-center gap-2">
          {actions.onReplay && (
            <button
              type="button"
              onClick={actions.onReplay}
              className="rounded-md bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
            >
              在工作台重跑
            </button>
          )}
          {actions.onDownload && (
            <button
              type="button"
              onClick={actions.onDownload}
              className="rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[color:var(--bg-hover)]"
              style={{ borderColor: 'var(--border)' }}
            >
              下载结果
            </button>
          )}
        </div>
      )}

      <Section title="基础信息">
        <Row label="编号" value={<code>#{row.id}</code>} />
        <Row label="状态" value={statusChip(row.status)} />
        <Row label="数据源" value={row.source_name ? <code>{row.source_name}</code> : '—'} />
        <Row label="执行人" value={row.executed_by} />
        <Row label="执行时间" value={fmtDateTime(row.executed_at)} />
        <Row
          label="耗时"
          value={
            row.execution_time_ms != null
              ? `${(row.execution_time_ms / 1000).toFixed(2)}s`
              : '—'
          }
        />
        <Row label="行数" value={row.row_count != null ? fmtNum(row.row_count) : '—'} />
      </Section>

      {row.error_message && (
        <Section title="错误信息">
          <pre
            className="overflow-auto rounded border p-2 text-xs leading-4 text-red-600 dark:text-red-400"
            style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)' }}
          >
            {row.error_message}
          </pre>
        </Section>
      )}

      <Section title="SQL">
        <pre
          className="overflow-auto rounded border p-2 text-xs leading-4"
          style={{
            background: 'var(--bg-surface-2)',
            borderColor: 'var(--border)',
            color: 'var(--text-2)',
          }}
        >
          {row.sql_query}
        </pre>
      </Section>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Context panel body for L3 detail
// ──────────────────────────────────────────────────────────────────────────

export function QueryHistoryContextBody({
  row,
  neighbors,
  onNavigate,
}: {
  row: QueryHistoryItem
  neighbors: { prev: QueryHistoryItem | null; next: QueryHistoryItem | null }
  onNavigate: (id: number) => void
}) {
  return (
    <div className="space-y-4 px-4 py-4">
      <section>
        <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
          状态
        </div>
        <div className="mt-2 flex items-center gap-1.5">{statusChip(row.status)}</div>
      </section>
      <section>
        <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
          执行
        </div>
        <dl className="mt-2 space-y-1 text-xs">
          <Pair
            label="耗时"
            value={
              row.execution_time_ms != null
                ? `${(row.execution_time_ms / 1000).toFixed(2)}s`
                : '—'
            }
          />
          <Pair label="行数" value={row.row_count != null ? fmtNum(row.row_count) : '—'} />
          <Pair label="执行人" value={row.executed_by} />
          <Pair label="时间" value={fmtRelative(row.executed_at)} />
        </dl>
      </section>
      <section>
        <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
          邻接导航
        </div>
        <div className="mt-2 space-y-1.5 text-xs">
          <NeighborButton
            label={neighbors.prev ? `← #${neighbors.prev.id}` : '没有上一项'}
            disabled={!neighbors.prev}
            onClick={neighbors.prev ? () => onNavigate(neighbors.prev!.id) : undefined}
          />
          <NeighborButton
            label={neighbors.next ? `#${neighbors.next.id} →` : '没有下一项'}
            disabled={!neighbors.next}
            onClick={neighbors.next ? () => onNavigate(neighbors.next!.id) : undefined}
          />
        </div>
      </section>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Internal primitives
// ──────────────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
        {title}
      </div>
      <div className="mt-2 space-y-1">{children}</div>
    </section>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <dt style={{ color: 'var(--text-3)' }}>{label}</dt>
      <dd className="truncate" style={{ color: 'var(--text-1)' }}>
        {value}
      </dd>
    </div>
  )
}

function Pair({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt style={{ color: 'var(--text-3)' }}>{label}</dt>
      <dd className="truncate" style={{ color: 'var(--text-1)' }}>
        {value}
      </dd>
    </div>
  )
}

function NeighborButton({
  label,
  onClick,
  disabled,
}: {
  label: string
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-md border px-2 py-1 text-left text-xs transition-colors hover:bg-[color:var(--bg-hover)] hover:text-[color:var(--text-1)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
      style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
    >
      <span className="truncate">{label}</span>
    </button>
  )
}
