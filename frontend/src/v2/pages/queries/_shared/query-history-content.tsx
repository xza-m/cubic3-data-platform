// frontend/src/v2/pages/queries/_shared/query-history-content.tsx
/* eslint-disable react-refresh/only-export-components -- 该文件与主组件/Provider 同时导出 helper/Context/hook，是项目历史共享约定；Fast Refresh 会丢热更粒度但不影响生产功能。 */
//
// 查询历史详情内容组件 —— Peek panel 与 L3 Detail 共用。

import type { ReactNode } from 'react'
import { Download, RotateCcw } from 'lucide-react'
import { fmtDateTime, fmtNum, fmtRelative } from '@v2/lib/format'
import type { QueryHistoryItem } from '@v2/api/queries'
import { ActionIconButton } from '@v2/components/ActionIconButton'
import { IdentityName } from '@v2/components/IdentityName'
import { t } from '@v2/i18n'

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
        <div className="flex items-center gap-1.5">
          {actions.onReplay && (
            <ActionIconButton
              label={t('queryHistory.action.replay', '在工作台重跑')}
              icon={RotateCcw}
              variant="primary"
              onClick={actions.onReplay}
            />
          )}
          {actions.onDownload && (
            <ActionIconButton
              label={t('queryHistory.action.download', '下载结果')}
              icon={Download}
              onClick={actions.onDownload}
            />
          )}
        </div>
      )}

      <Section title={t('queryHistory.section.basic', '基础信息')}>
        <Row label={t('queryHistory.field.id', '编号')}       value={<code>#{row.id}</code>} />
        <Row label={t('queryHistory.field.status', '状态')}   value={statusChip(row.status)} />
        <Row label={t('queryHistory.field.source', '数据源')} value={row.source_name ? <code>{row.source_name}</code> : '—'} />
        <Row
          label={t('queryHistory.field.executor', '执行人')}
          value={<IdentityName value={row.executed_by} displayName={row.executed_by_display_name} />}
        />
        <Row label={t('queryHistory.field.executedAt', '执行时间')} value={fmtDateTime(row.executed_at)} />
        <Row
          label={t('queryHistory.field.duration', '耗时')}
          value={
            row.execution_time_ms != null
              ? `${(row.execution_time_ms / 1000).toFixed(2)}s`
              : '—'
          }
        />
        <Row label={t('queryHistory.field.rowCount', '行数')} value={row.row_count != null ? fmtNum(row.row_count) : '—'} />
      </Section>

      {row.error_message && (
        <Section title={t('queryHistory.section.error', '错误信息')}>
          <pre
            className="overflow-auto rounded border p-2 text-xs leading-4 text-red-600 dark:text-red-400"
            style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)' }}
          >
            {row.error_message}
          </pre>
        </Section>
      )}

      <Section title={t('queryHistory.section.sql', 'SQL')}>
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
          {t('queryHistory.ctx.status', '状态')}
        </div>
        <div className="mt-2 flex items-center gap-1.5">{statusChip(row.status)}</div>
      </section>
      <section>
        <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
          {t('queryHistory.ctx.execution', '执行')}
        </div>
        <dl className="mt-2 space-y-1 text-xs">
          <Pair
            label={t('queryHistory.field.duration', '耗时')}
            value={
              row.execution_time_ms != null
                ? `${(row.execution_time_ms / 1000).toFixed(2)}s`
                : '—'
            }
          />
          <Pair label={t('queryHistory.field.rowCount', '行数')} value={row.row_count != null ? fmtNum(row.row_count) : '—'} />
          <Pair
            label={t('queryHistory.field.executor', '执行人')}
            value={<IdentityName value={row.executed_by} displayName={row.executed_by_display_name} />}
          />
          <Pair label={t('queryHistory.field.time', '时间')} value={fmtRelative(row.executed_at)} />
        </dl>
      </section>
      <section>
        <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
          {t('queryHistory.ctx.neighbors', '邻接导航')}
        </div>
        <div className="mt-2 space-y-1.5 text-xs">
          <NeighborButton
            label={neighbors.prev ? `← #${neighbors.prev.id}` : t('queryHistory.neighbor.noPrev', '没有上一项')}
            disabled={!neighbors.prev}
            onClick={neighbors.prev ? () => onNavigate(neighbors.prev!.id) : undefined}
          />
          <NeighborButton
            label={neighbors.next ? `#${neighbors.next.id} →` : t('queryHistory.neighbor.noNext', '没有下一项')}
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

function Row({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <dt style={{ color: 'var(--text-3)' }}>{label}</dt>
      <dd className="truncate" style={{ color: 'var(--text-1)' }}>
        {value}
      </dd>
    </div>
  )
}

function Pair({ label, value }: { label: ReactNode; value: ReactNode }) {
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
  label: ReactNode
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
