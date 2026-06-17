// frontend/src/v2/pages/queries/QueryExports.tsx
//
// /queries/exports —— 我的数据导出任务列表（add-query-export）。
// 接 GET /api/v1/queries/exports（分页+轮询），pending/running 状态自动 5s refetch。

import { useMemo, useState } from 'react'
import { Download, Loader2, RotateCcw, XCircle } from 'lucide-react'
import { useCancelExport, useExports } from '@v2/hooks/queries'
import {
  buildExportDownloadUrl,
  type QueryExport,
  type QueryExportStatus,
} from '@v2/api/queries'
import { RetryState } from '@v2/components/LoadState'
import { useToast, useConfirm } from '@v2/components/ui'
import { fmtDateTime, fmtNum, fmtRelative } from '@v2/lib/format'
import { t } from '@v2/i18n'

type StatusFilter = 'all' | QueryExportStatus

const STATUS_TABS: Array<{ id: StatusFilter; label: string }> = [
  { id: 'all', label: t('queryExport.filter.all', '全部') },
  { id: 'pending', label: t('queryExport.filter.pending', '排队') },
  { id: 'running', label: t('queryExport.filter.running', '运行中') },
  { id: 'success', label: t('queryExport.filter.success', '成功') },
  { id: 'failed', label: t('queryExport.filter.failed', '失败') },
  { id: 'cancelled', label: t('queryExport.filter.cancelled', '已取消') },
  { id: 'expired', label: t('queryExport.filter.expired', '已过期') },
]

export default function QueryExports() {
  const toast = useToast()
  const confirm = useConfirm()
  const [status, setStatus] = useState<StatusFilter>('all')
  const [page, setPage] = useState(1)

  const listQ = useExports({
    page,
    page_size: 20,
    status: status === 'all' ? undefined : status,
  })

  const rows = useMemo<QueryExport[]>(() => listQ.data?.items ?? [], [listQ.data])
  const total = listQ.data?.total ?? 0
  const pageSize = listQ.data?.page_size ?? 20

  const cancelMut = useCancelExport()

  const handleCancel = async (row: QueryExport) => {
    if (
      !(await confirm({
        title: t('queryExport.confirm.cancel', '取消任务 #{id}？', {
          id: String(row.id),
        }),
        tone: 'danger',
      }))
    ) {
      return
    }
    try {
      await cancelMut.mutateAsync(row.id)
      toast.show({
        tone: 'info',
        title: t('queryExport.toast.cancelled', '任务 #{id} 已请求取消', {
          id: String(row.id),
        }),
      })
    } catch (err) {
      toast.show({
        tone: 'danger',
        title: t('queryExport.toast.cancelFailed', '取消失败'),
        description: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return (
    <div
      className="flex flex-1 flex-col overflow-hidden"
      data-testid="v2-query-exports"
    >
      <div
        className="flex items-center gap-3 border-b px-4 py-3"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        <div>
          <div className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
            {t('queryExport.page.title', '我的数据导出')}
          </div>
          <div className="text-xs" style={{ color: 'var(--text-3)' }}>
            {t('queryExport.page.subtitle', '异步执行 SQL 并下载 CSV，保留 7 天')}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setStatus(tab.id)
                setPage(1)
              }}
              className="rounded-md px-2.5 py-1 text-xs"
              style={{
                background:
                  status === tab.id ? 'var(--accent-soft)' : 'transparent',
                color: status === tab.id ? 'var(--accent)' : 'var(--text-2)',
                border:
                  status === tab.id
                    ? '1px solid var(--accent)'
                    : '1px solid transparent',
              }}
              data-testid={`v2-query-exports-tab-${tab.id}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {listQ.isLoading ? (
          <SkeletonRows />
        ) : listQ.isError ? (
          <RetryState
            message={t('queryExport.state.loadFailed', '加载失败')}
            onRetry={() => listQ.refetch()}
            retryAriaLabel={t('queryExport.action.retry', '重试加载导出任务')}
          />
        ) : rows.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              {t('queryExport.state.empty', '暂无导出任务')}
            </p>
            <p className="text-[11px]" style={{ color: 'var(--text-4)' }}>
              {t(
                'queryExport.state.emptyHint',
                '在可视化构建页面 SQL 预览下方点击"导出为文件"即可发起',
              )}
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead
              className="sticky top-0"
              style={{ background: 'var(--bg-surface)', color: 'var(--text-2)' }}
            >
              <tr>
                <Th>{t('queryExport.col.id', '任务')}</Th>
                <Th>{t('queryExport.col.status', '状态')}</Th>
                <Th>{t('queryExport.col.sql', 'SQL')}</Th>
                <Th>{t('queryExport.col.source', '数据源')}</Th>
                <Th>{t('queryExport.col.rows', '行数')}</Th>
                <Th>{t('queryExport.col.size', '大小')}</Th>
                <Th>{t('queryExport.col.created', '创建')}</Th>
                <Th>{t('queryExport.col.expires', '过期')}</Th>
                <Th>{t('queryExport.col.actions', '操作')}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  style={{ borderBottom: '1px solid var(--border)' }}
                  data-testid={`v2-query-exports-row-${row.id}`}
                >
                  <Td>
                    <div className="font-medium" style={{ color: 'var(--text-1)' }}>
                      #{row.id}
                    </div>
                  </Td>
                  <Td>
                    <StatusChip status={row.status} />
                    {row.error_message && row.status === 'failed' ? (
                      <div
                        className="mt-1 max-w-[160px] truncate text-[11px] text-red-500"
                        title={row.error_message}
                      >
                        {row.error_message}
                      </div>
                    ) : null}
                  </Td>
                  <Td>
                    <code
                      className="line-clamp-2 max-w-[320px] overflow-hidden break-all"
                      style={{ color: 'var(--text-2)' }}
                      title={row.sql_query}
                    >
                      {row.sql_query.length > 120
                        ? `${row.sql_query.slice(0, 120)}…`
                        : row.sql_query}
                    </code>
                  </Td>
                  <Td>
                    <span style={{ color: 'var(--text-2)' }}>
                      {row.source_id ?? '—'}
                    </span>
                  </Td>
                  <Td>
                    <span style={{ color: 'var(--text-2)' }}>
                      {row.row_count == null ? '—' : fmtNum(row.row_count)}
                    </span>
                  </Td>
                  <Td>
                    <span style={{ color: 'var(--text-2)' }}>
                      {row.file_size_bytes == null
                        ? '—'
                        : fmtBytes(row.file_size_bytes)}
                    </span>
                  </Td>
                  <Td>
                    <span style={{ color: 'var(--text-3)' }}>
                      {fmtDateTime(row.created_at)}
                    </span>
                  </Td>
                  <Td>
                    <span style={{ color: 'var(--text-3)' }}>
                      {row.expires_at ? fmtRelative(row.expires_at) : '—'}
                    </span>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1">
                      {row.status === 'success' ? (
                        <a
                          href={buildExportDownloadUrl(row) ?? '#'}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs hover:bg-[color:var(--bg-hover)]"
                          style={{ color: 'var(--accent)' }}
                          data-testid={`v2-query-exports-download-${row.id}`}
                        >
                          <Download size={11} />
                          {t('queryExport.action.download', '下载')}
                        </a>
                      ) : null}
                      {(row.status === 'pending' || row.status === 'running') ? (
                        <button
                          type="button"
                          onClick={() => void handleCancel(row)}
                          disabled={cancelMut.isPending}
                          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-red-500 hover:bg-red-50 disabled:opacity-40 dark:hover:bg-red-900/20"
                          data-testid={`v2-query-exports-cancel-${row.id}`}
                        >
                          <XCircle size={11} />
                          {t('queryExport.action.cancel', '取消')}
                        </button>
                      ) : null}
                      {row.status === 'expired' ? (
                        <span
                          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs"
                          style={{ color: 'var(--text-4)' }}
                        >
                          <RotateCcw size={11} />
                          {t('queryExport.state.expiredHint', '已过期')}
                        </span>
                      ) : null}
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
          <span>{t('queryExport.pager.total', '共 {n} 条', { n: fmtNum(total) })}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded border px-2 py-1 disabled:opacity-40"
              style={{ borderColor: 'var(--border)' }}
            >
              {t('queryExport.pager.prev', '上一页')}
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
              {t('queryExport.pager.next', '下一页')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Primitives
// ──────────────────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: QueryExportStatus }) {
  const map: Record<
    QueryExportStatus,
    { bg: string; fg: string; label: string; spinning?: boolean }
  > = {
    pending: {
      bg: 'var(--bg-hover)',
      fg: 'var(--text-2)',
      label: t('queryExport.status.pending', '排队中'),
    },
    running: {
      bg: 'var(--accent-soft)',
      fg: 'var(--accent)',
      label: t('queryExport.status.running', '运行中'),
      spinning: true,
    },
    success: {
      bg: 'var(--success-soft)',
      fg: 'var(--success)',
      label: t('queryExport.status.success', '成功'),
    },
    failed: {
      bg: 'var(--danger-soft)',
      fg: 'var(--danger)',
      label: t('queryExport.status.failed', '失败'),
    },
    cancelling: {
      bg: 'var(--warning-soft)',
      fg: 'var(--warning)',
      label: t('queryExport.status.cancelling', '取消中'),
      spinning: true,
    },
    cancelled: {
      bg: 'var(--bg-hover)',
      fg: 'var(--text-3)',
      label: t('queryExport.status.cancelled', '已取消'),
    },
    expired: {
      bg: 'var(--bg-hover)',
      fg: 'var(--text-4)',
      label: t('queryExport.status.expired', '已过期'),
    },
  }
  const tone = map[status]
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs"
      style={{ background: tone.bg, color: tone.fg }}
    >
      {tone.spinning ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
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

function Td({ children }: { children?: React.ReactNode }) {
  return (
    <td className="px-3 py-2 align-top" style={{ color: 'var(--text-1)' }}>
      {children}
    </td>
  )
}

function SkeletonRows() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex gap-3">
          <div
            className="h-4 w-16 animate-pulse rounded"
            style={{ background: 'var(--bg-hover)' }}
          />
          <div
            className="h-4 flex-1 animate-pulse rounded"
            style={{ background: 'var(--bg-hover)' }}
          />
          <div
            className="h-4 w-20 animate-pulse rounded"
            style={{ background: 'var(--bg-hover)' }}
          />
        </div>
      ))}
    </div>
  )
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}
