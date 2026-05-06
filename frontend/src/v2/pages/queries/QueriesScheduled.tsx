// frontend/src/v2/pages/queries/QueriesScheduled.tsx
//
// 调度查询列表页（B-back-8）。
// 接 GET /api/v1/queries/scheduled 等接口；详见 ../../api/queries.ts。
// L0 列表 + 行点击 Peek 面板（基本信息 + 最近 runs）。
// 双击行或行尾"详情"跳到 L3 详情页。

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  PlayCircle,
  PauseCircle,
  Plus,
  Play,
  Trash2,
} from 'lucide-react'
import {
  useScheduledQueries,
  useScheduledQueryRuns,
  useEnableScheduledQuery,
  useDisableScheduledQuery,
  useTriggerScheduledQuery,
  useDeleteScheduledQuery,
} from '@v2/hooks/queries'
import { fmtDateTime, fmtNum, fmtRelative } from '@v2/lib/format'
import { useToast } from '@v2/components/ui'
import type { ScheduledQuery } from '@v2/api/queries'
import { t } from '@v2/i18n'

export default function QueriesScheduled() {
  const navigate = useNavigate()
  const toast = useToast()

  const [page, setPage] = useState(1)
  const [peekRow, setPeekRow] = useState<ScheduledQuery | null>(null)

  const { data, isLoading, isError, refetch } = useScheduledQueries({
    page,
    page_size: 20,
  })

  const enableMut = useEnableScheduledQuery()
  const disableMut = useDisableScheduledQuery()
  const triggerMut = useTriggerScheduledQuery()
  const deleteMut = useDeleteScheduledQuery()

  const rows = data?.items ?? []
  const total = data?.total ?? 0
  const pageSize = data?.page_size ?? 20

  async function handleToggle(row: ScheduledQuery) {
    try {
      if (row.enabled) {
        await disableMut.mutateAsync(row.id)
        toast.show({
          tone: 'success',
          title: t('queries.scheduled.toast.disabled', '{name} 已禁用', { name: row.name }),
        })
      } else {
        await enableMut.mutateAsync(row.id)
        toast.show({
          tone: 'success',
          title: t('queries.scheduled.toast.enabled', '{name} 已启用', { name: row.name }),
        })
      }
      if (peekRow?.id === row.id) {
        setPeekRow({ ...row, enabled: !row.enabled })
      }
    } catch (e) {
      toast.show({
        tone: 'danger',
        title: t('queries.scheduled.toast.toggleFailed', '操作失败'),
        description: String(e),
      })
    }
  }

  async function handleTrigger(row: ScheduledQuery) {
    try {
      await triggerMut.mutateAsync(row.id)
      toast.show({
        tone: 'success',
        title: t('queries.scheduled.toast.triggered', '已触发 {name}', { name: row.name }),
        description: t(
          'queries.scheduled.toast.triggeredDesc',
          '执行结果将出现在 runs 历史中',
        ),
      })
    } catch (e) {
      toast.show({
        tone: 'danger',
        title: t('queries.scheduled.toast.triggerFailed', '触发失败'),
        description: String(e),
      })
    }
  }

  async function handleDelete(row: ScheduledQuery) {
    if (
      !window.confirm(
        t(
          'queries.scheduled.confirm.delete',
          '删除调度「{name}」？此操作将解除关联 APScheduler job。',
          { name: row.name },
        ),
      )
    )
      return
    try {
      await deleteMut.mutateAsync(row.id)
      toast.show({
        tone: 'success',
        title: t('queries.scheduled.toast.deleted', '{name} 已删除', { name: row.name }),
      })
      if (peekRow?.id === row.id) setPeekRow(null)
    } catch (e) {
      toast.show({
        tone: 'danger',
        title: t('queries.scheduled.toast.deleteFailed', '删除失败'),
        description: String(e),
      })
    }
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex flex-1 flex-col overflow-hidden">
        <div
          className="flex items-center gap-3 border-b px-4 py-3"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
        >
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
              {t('queries.scheduled.page.title', '调度查询')}
            </div>
            <div className="text-xs" style={{ color: 'var(--text-3)' }}>
              GET /api/v1/queries/scheduled · APScheduler in-process
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/queries/scheduled/new')}
            className="ml-auto flex items-center gap-1.5 rounded-md bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white"
          >
            <Plus size={12} /> {t('queries.scheduled.action.new', '新建调度')}
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <SkeletonRows />
          ) : isError ? (
            <div className="flex h-full flex-col items-center justify-center gap-2">
              <span className="text-xs text-red-500">
                {t('queries.scheduled.state.loadFailed', '加载失败')}
              </span>
              <button
                type="button"
                onClick={() => void refetch()}
                className="text-xs underline"
                style={{ color: 'var(--accent)' }}
              >
                {t('queries.scheduled.action.retry', '重试')}
              </button>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center">
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                {t('queries.scheduled.state.empty', '暂无调度查询')}
              </p>
            </div>
          ) : (
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0" style={{ background: 'var(--bg-surface)', color: 'var(--text-2)' }}>
                <tr>
                  <Th>{t('queries.scheduled.col.name', '名称')}</Th>
                  <Th>Cron</Th>
                  <Th>{t('queries.scheduled.col.nextRun', '下次触发')}</Th>
                  <Th>{t('queries.scheduled.col.lastStatus', '上次状态')}</Th>
                  <Th>{t('queries.scheduled.col.enabled', '启用')}</Th>
                  <Th>{t('queries.scheduled.col.updated', '更新')}</Th>
                  <Th>{t('queries.scheduled.col.actions', '操作')}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer transition-colors hover:bg-[color:var(--bg-hover)]"
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: peekRow?.id === row.id ? 'var(--accent-soft)' : undefined,
                      opacity: row.enabled ? 1 : 0.65,
                    }}
                    onClick={() => setPeekRow(row)}
                    onDoubleClick={() => navigate(`/queries/scheduled/${row.id}`)}
                  >
                    <Td>
                      <div className="min-w-0">
                        <div className="font-medium" style={{ color: 'var(--text-1)' }}>
                          {row.name}
                        </div>
                        {row.description && (
                          <div className="truncate text-xs" style={{ color: 'var(--text-3)' }}>
                            {row.description}
                          </div>
                        )}
                      </div>
                    </Td>
                    <Td>
                      <code style={{ color: 'var(--text-2)' }}>{row.cron}</code>
                      <span className="ml-1 text-xs" style={{ color: 'var(--text-4)' }}>
                        ({row.timezone})
                      </span>
                    </Td>
                    <Td>
                      <span style={{ color: 'var(--text-2)' }}>
                        {row.next_run_at ? fmtDateTime(row.next_run_at) : '—'}
                      </span>
                    </Td>
                    <Td>
                      <StatusChip status={row.last_status} />
                      {row.last_run_at ? (
                        <span className="ml-1 text-xs" style={{ color: 'var(--text-3)' }}>
                          {fmtRelative(row.last_run_at)}
                        </span>
                      ) : null}
                    </Td>
                    <Td onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => void handleToggle(row)}
                        disabled={enableMut.isPending || disableMut.isPending}
                        className="flex items-center gap-1 rounded p-0.5 transition-colors hover:bg-[color:var(--bg-hover)]"
                      >
                        {row.enabled ? (
                          <PauseCircle size={14} style={{ color: 'var(--success)' }} />
                        ) : (
                          <PlayCircle size={14} style={{ color: 'var(--text-4)' }} />
                        )}
                      </button>
                    </Td>
                    <Td>
                      <span style={{ color: 'var(--text-3)' }}>{fmtRelative(row.updated_at)}</span>
                    </Td>
                    <Td onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void handleTrigger(row)}
                          disabled={triggerMut.isPending || !row.enabled}
                          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors hover:bg-[color:var(--bg-hover)] disabled:opacity-40"
                          style={{ color: 'var(--accent)' }}
                          title={
                            row.enabled
                              ? t('queries.scheduled.tooltip.triggerNow', '立即手动触发一次')
                              : t('queries.scheduled.tooltip.triggerDisabled', '禁用状态下无法触发')
                          }
                        >
                          <Play size={11} /> {t('queries.scheduled.action.trigger', '触发')}
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(`/queries/scheduled/${row.id}`)}
                          className="rounded px-1.5 py-0.5 text-xs transition-colors hover:bg-[color:var(--bg-hover)]"
                          style={{ color: 'var(--text-2)' }}
                        >
                          {t('queries.scheduled.action.detail', '详情')}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(row)}
                          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {total > pageSize && (
          <div
            className="flex items-center justify-between border-t px-4 py-2 text-xs"
            style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}
          >
            <span>
              {t('queries.scheduled.pager.total', '共 {n} 条', { n: fmtNum(total) })}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded border px-2 py-1 disabled:opacity-40"
                style={{ borderColor: 'var(--border)' }}
              >
                {t('queries.scheduled.pager.prev', '上一页')}
              </button>
              <span>
                {page} / {Math.ceil(total / pageSize)}
              </span>
              <button
                type="button"
                disabled={page >= Math.ceil(total / pageSize)}
                onClick={() => setPage((p) => p + 1)}
                className="rounded border px-2 py-1 disabled:opacity-40"
                style={{ borderColor: 'var(--border)' }}
              >
                {t('queries.scheduled.pager.next', '下一页')}
              </button>
            </div>
          </div>
        )}
      </div>

      {peekRow && (
        <PeekPanel
          row={peekRow}
          onClose={() => setPeekRow(null)}
          onOpen={() => navigate(`/queries/scheduled/${peekRow.id}`)}
        />
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Peek panel (L2)
// ──────────────────────────────────────────────────────────────────────────

function PeekPanel({
  row,
  onClose,
  onOpen,
}: {
  row: ScheduledQuery
  onClose: () => void
  onOpen: () => void
}) {
  const { data, isLoading } = useScheduledQueryRuns(row.id, { page: 1, page_size: 5 })
  const recentRuns = data?.items ?? []

  return (
    <aside
      className="w-80 flex-shrink-0 overflow-auto border-l"
      style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
    >
      <div
        className="flex items-start justify-between border-b px-4 py-3"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
            {row.name}
          </div>
          <div className="text-xs" style={{ color: 'var(--text-3)' }}>
            #{row.id}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onOpen}
            className="rounded px-2 py-1 text-xs transition-colors hover:bg-[color:var(--bg-hover)]"
            style={{ color: 'var(--accent)' }}
          >
            {t('queries.scheduled.action.detail', '详情')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-xs transition-colors hover:bg-[color:var(--bg-hover)]"
            style={{ color: 'var(--text-3)' }}
          >
            ✕
          </button>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4 text-xs">
        <section>
          <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
            {t('queries.scheduled.peek.schedule', '调度')}
          </div>
          <dl className="mt-2 space-y-1">
            <CtxPair label="Cron" value={<code>{row.cron}</code>} />
            <CtxPair label={t('queries.scheduled.peek.tz', '时区')} value={row.timezone} />
            <CtxPair
              label={t('queries.scheduled.peek.enabledLabel', '启用')}
              value={
                row.enabled ? (
                  <span style={{ color: 'var(--success)' }}>
                    {t('queries.scheduled.peek.enabled', '已启用')}
                  </span>
                ) : (
                  t('queries.scheduled.peek.disabled', '已禁用')
                )
              }
            />
            <CtxPair
              label={t('queries.scheduled.peek.nextRun', '下次触发')}
              value={fmtDateTime(row.next_run_at)}
            />
            <CtxPair
              label={t('queries.scheduled.peek.lastRun', '上次执行')}
              value={fmtRelative(row.last_run_at)}
            />
            <CtxPair
              label={t('queries.scheduled.peek.lastStatus', '上次状态')}
              value={<StatusChip status={row.last_status} />}
            />
          </dl>
        </section>

        <section>
          <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
            {t('queries.scheduled.peek.recentRuns', '最近 5 次执行')}
          </div>
          {isLoading ? (
            <div className="mt-2 text-xs" style={{ color: 'var(--text-4)' }}>
              {t('queries.scheduled.state.loading', '加载中…')}
            </div>
          ) : recentRuns.length === 0 ? (
            <div className="mt-2 text-xs" style={{ color: 'var(--text-4)' }}>
              {t('queries.scheduled.peek.noRuns', '尚无执行记录')}
            </div>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {recentRuns.map((r) => (
                <li key={r.id} className="flex items-center gap-2 text-xs">
                  <StatusChip status={r.status} />
                  <span style={{ color: 'var(--text-3)' }}>{fmtRelative(r.started_at)}</span>
                  {r.rows_returned != null && (
                    <span className="ml-auto text-xs" style={{ color: 'var(--text-2)' }}>
                      {t('queries.scheduled.peek.rows', '{n} 行', { n: fmtNum(r.rows_returned) })}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
            {t('queries.scheduled.peek.sqlPreview', 'SQL 预览')}
          </div>
          <pre
            className="mt-2 max-h-32 overflow-auto rounded border p-2 text-xs"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--bg-surface-2)',
              color: 'var(--text-2)',
            }}
          >
            {row.sql.length > 240 ? `${row.sql.slice(0, 240)}…` : row.sql}
          </pre>
        </section>
      </div>
    </aside>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Internal primitives
// ──────────────────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: string | null | undefined }) {
  if (!status) {
    return (
      <span className="text-xs" style={{ color: 'var(--text-4)' }}>
        —
      </span>
    )
  }
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    success: { bg: 'var(--success-soft)', fg: 'var(--success)', label: t('queries.scheduled.status.success', '成功') },
    failed: { bg: 'var(--danger-soft)', fg: 'var(--danger)', label: t('queries.scheduled.status.failed', '失败') },
    running: { bg: 'var(--accent-soft)', fg: 'var(--accent)', label: t('queries.scheduled.status.running', '运行中') },
    timeout: { bg: 'var(--warning-soft)', fg: 'var(--warning)', label: t('queries.scheduled.status.timeout', '超时') },
  }
  const tone = map[status] ?? {
    bg: 'var(--bg-hover)',
    fg: 'var(--text-2)',
    label: status,
  }
  return (
    <span
      className="rounded-full px-1.5 py-0.5 text-xs"
      style={{ background: tone.bg, color: tone.fg }}
    >
      {tone.label}
    </span>
  )
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th
      className="border-b px-3 py-2 text-left font-medium"
      style={{ borderColor: 'var(--border)' }}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  onClick,
}: {
  children?: React.ReactNode
  onClick?: (e: React.MouseEvent) => void
}) {
  return (
    <td className="px-3 py-2" style={{ color: 'var(--text-1)' }} onClick={onClick}>
      {children}
    </td>
  )
}

function CtxPair({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt style={{ color: 'var(--text-3)' }}>{label}</dt>
      <dd className="truncate" style={{ color: 'var(--text-1)' }}>
        {value}
      </dd>
    </div>
  )
}

function SkeletonRows() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex gap-3">
          <div className="h-4 w-32 animate-pulse rounded" style={{ background: 'var(--bg-hover)' }} />
          <div className="h-4 flex-1 animate-pulse rounded" style={{ background: 'var(--bg-hover)' }} />
          <div className="h-4 w-16 animate-pulse rounded" style={{ background: 'var(--bg-hover)' }} />
        </div>
      ))}
    </div>
  )
}
