// frontend/src/v2/pages/apps/executions/Executions.tsx
//
// 执行记录列表页（L0）。
// 接口：GET /api/v1/app-executions

import { useCallback, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { t } from '@v2/i18n'
import { fmtRelative } from '@v2/lib/format'
import { ListPagination } from '@v2/components/ListPagination'
import { RefreshButton, Toolbar, ToolbarSearch, ToolbarSelect } from '@v2/components/CommonControls'
import { RetryState } from '@v2/components/LoadState'
import { useToast } from '@v2/components/ui'
import { useExecutions } from '@v2/hooks/instances'
import { ExecStatusChip } from '../_shared/instance-content'
import { fmtDuration, ExecutionPeekContent } from '../_shared/execution-content'
import type { AppExecution } from '@v2/api/instances'

type StatusFilter = '' | AppExecution['status']
const EXECUTIONS_PAGE_SIZE = 20

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: '', label: t('exec.status.all', '全部状态') },
  { value: 'success', label: t('exec.status.success', '成功') },
  { value: 'failed', label: t('exec.status.failed', '失败') },
  { value: 'running', label: t('exec.status.running', '运行中') },
  { value: 'pending', label: t('exec.status.pending', '等待中') },
]

// ============================================================================
// Peek 面板
// ============================================================================

function PeekPanel({
  execution,
  onClose,
  onDetail,
}: {
  execution: AppExecution
  onClose: () => void
  onDetail: () => void
}) {
  const navigate = useNavigate()

  return (
    <div
      role="complementary"
      aria-label={t('peek.aria.preview', '行预览')}
      className="flex w-72 shrink-0 flex-col border-l"
      style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
    >
      <div
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <code className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
              #{execution.id}
            </code>
            <ExecStatusChip status={execution.status} />
          </div>
          <div className="mt-0.5 text-xs" style={{ color: 'var(--text-3)' }}>
            {execution.instance?.name ?? t('executions.instanceRef', '实例 #{id}', { id: execution.instance_id })}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-ghost ml-2 shrink-0"
          onClick={onClose}
          aria-label={t('action.close', '关闭')}
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        <ExecutionPeekContent execution={execution} />
      </div>
      <div
        className="flex gap-2 border-t p-3"
        style={{ borderColor: 'var(--border)' }}
      >
        {execution.instance && (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => navigate(`/apps/instances/${execution.instance_id}`)}
          >
            {t('exec.action.view_instance', '查看实例')}
          </button>
        )}
        <button
          type="button"
          className="btn btn-sm btn-primary flex-1"
          onClick={onDetail}
        >
          {t('action.view_detail', '查看详情')}
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// 主页面
// ============================================================================

export default function Executions() {
  const navigate = useNavigate()
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const appCodeFilter = searchParams.get('app_code') ?? undefined
  const instanceIdFilter = searchParams.get('instance_id')
    ? Number(searchParams.get('instance_id'))
    : undefined

  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<StatusFilter>('')
  const [peek, setPeek] = useState<AppExecution | null>(null)
  const [pageNo, setPageNo] = useState(1)

  const { data: page, isLoading, isError, refetch, isFetching } = useExecutions({
    app_code: appCodeFilter,
    instance_id: instanceIdFilter,
    status: status || undefined,
    page: pageNo,
    page_size: EXECUTIONS_PAGE_SIZE,
  })
  const executions = useMemo(() => page?.items ?? [], [page])
  const total = page?.total ?? 0

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    if (!q) return executions
    return executions.filter((e) => {
      const instanceName = e.instance?.name ?? ''
      const appCode = e.instance?.app_code ?? ''
      return (
        String(e.id).includes(q) ||
        instanceName.toLowerCase().includes(q) ||
        appCode.toLowerCase().includes(q)
      )
    })
  }, [executions, keyword])

  const stats = useMemo(() => {
    const total = executions.length
    const ok = executions.filter((e) => e.status === 'success').length
    const failed = executions.filter((e) => e.status === 'failed').length
    const running = executions.filter((e) => e.status === 'running').length
    return { total, ok, failed, running }
  }, [executions])

  const handleRefresh = useCallback(async () => {
    const result = await refetch()
    if (result.isSuccess) {
      toast.show({
        tone: 'success',
        title: t('executions.toast.refreshed', '执行记录已刷新'),
        description: t('executions.toast.refreshedCount', '当前列表 {count} 条', {
          count: result.data?.items.length ?? executions.length,
        }),
      })
    } else {
      toast.show({
        tone: 'danger',
        title: t('executions.toast.refreshFailed', '刷新执行记录失败'),
        description: result.error instanceof Error ? result.error.message : String(result.error ?? ''),
      })
    }
  }, [executions.length, refetch, toast])

  return (
    <div className="flex flex-1 overflow-hidden p-4">
      <div
        className="flex flex-1 flex-col overflow-hidden rounded-md border"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <div>
            <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
              {t('executions.title', '执行记录')}
            </span>
            {(appCodeFilter || instanceIdFilter) && (
              <span className="ml-2 text-xs" style={{ color: 'var(--text-3)' }}>
                {appCodeFilter && `app: ${appCodeFilter}`}
                {instanceIdFilter ? t('executions.instanceRef', '实例 #{id}', { id: instanceIdFilter }) : ''}
              </span>
            )}
          </div>
          <Toolbar>
            <ToolbarSearch
              value={keyword}
              onChange={(value) => {
                setKeyword(value)
                setPageNo(1)
              }}
              placeholder={t('executions.search_placeholder', '按 ID / 实例名搜索…')}
              ariaLabel={t('executions.search.aria', '搜索执行记录')}
              width={220}
            />
            <ToolbarSelect<StatusFilter>
              value={status}
              onChange={(value) => {
                setStatus(value)
                setPageNo(1)
              }}
              options={STATUS_OPTIONS}
              ariaLabel={t('executions.filter.status', '筛选执行状态')}
              width={124}
            />
            <RefreshButton
              onClick={() => void handleRefresh()}
              loading={isFetching}
              ariaLabel={t('executions.action.refresh', '刷新执行记录')}
            />
          </Toolbar>
        </div>

        {/* Stats bar */}
        <div
          className="flex items-center gap-4 border-b px-4 py-1.5 text-xs"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)', color: 'var(--text-3)' }}
        >
          <span>{t('executions.total', '总计')} <strong style={{ color: 'var(--text-1)' }}>{stats.total}</strong></span>
          <span style={{ color: 'var(--success)' }}>{t('exec.status.success', '成功')} {stats.ok}</span>
          <span style={{ color: 'var(--danger)' }}>{t('exec.status.failed', '失败')} {stats.failed}</span>
          <span style={{ color: 'var(--accent)' }}>{t('exec.status.running', '运行中')} {stats.running}</span>
        </div>

        {/* Table + Peek */}
        <div className="flex flex-1 overflow-hidden">
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-auto">
              {isLoading && (
                <div
                  className="flex items-center justify-center py-12 text-xs"
                  style={{ color: 'var(--text-3)' }}
                >
                  {t('state.loading', '加载中…')}
                </div>
              )}

              {isError && !isLoading && (
                <RetryState
                  className="py-12"
                  message={t('state.load_error', '加载失败')}
                  onRetry={handleRefresh}
                  retryAriaLabel={t('executions.action.retry', '重试加载执行记录')}
                />
              )}

              {!isLoading && !isError && (
                <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: 'var(--bg-surface-2)', color: 'var(--text-3)' }}>
                    <th className="px-4 py-2 text-left font-normal">#</th>
                    <th className="px-4 py-2 text-left font-normal">
                      {t('exec.field.instance', '实例')}
                    </th>
                    <th className="px-4 py-2 text-left font-normal">
                      {t('exec.field.status', '状态')}
                    </th>
                    <th className="px-4 py-2 text-left font-normal">
                      {t('exec.field.trigger', '触发')}
                    </th>
                    <th className="px-4 py-2 text-left font-normal">
                      {t('exec.field.started_at', '开始时间')}
                    </th>
                    <th className="px-4 py-2 text-right font-normal">
                      {t('exec.field.duration', '耗时')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((exec) => (
                    <tr
                      key={exec.id}
                      className="cursor-pointer border-t transition-colors hover:bg-[color:var(--bg-hover)]"
                      style={{
                        borderColor: 'var(--border)',
                        background: peek?.id === exec.id ? 'var(--accent-soft)' : undefined,
                      }}
                      onClick={() => setPeek(exec.id === peek?.id ? null : exec)}
                    >
                      <td className="px-4 py-2">
                        <code>#{exec.id}</code>
                      </td>
                      <td className="px-4 py-2" style={{ color: 'var(--text-1)' }}>
                        {exec.instance?.name ?? (
                          <span style={{ color: 'var(--text-3)' }}>#{exec.instance_id}</span>
                        )}
                        {exec.app && (
                          <span className="ml-1" style={{ color: 'var(--text-3)' }}>
                            · <code>{exec.app.code}</code>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <ExecStatusChip status={exec.status} />
                      </td>
                      <td className="px-4 py-2" style={{ color: 'var(--text-3)' }}>
                        {exec.trigger_display_name}
                      </td>
                      <td className="px-4 py-2" style={{ color: 'var(--text-3)' }}>
                        {exec.started_at ? fmtRelative(exec.started_at) : '-'}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {fmtDuration(exec.duration_ms)}
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="py-10 text-center text-xs"
                        style={{ color: 'var(--text-3)' }}
                      >
                        {t('state.empty', '暂无执行记录')}
                      </td>
                    </tr>
                  )}
                </tbody>
                </table>
              )}
            </div>
            {!isLoading && !isError && keyword.trim() === '' && (
              <div className="border-t px-4 pb-3" style={{ borderColor: 'var(--border)' }}>
                <ListPagination
                  page={pageNo}
                  pageSize={EXECUTIONS_PAGE_SIZE}
                  total={total}
                  onPageChange={setPageNo}
                />
              </div>
            )}
          </div>

          {/* Peek panel */}
          {peek && (
            <PeekPanel
              execution={peek}
              onClose={() => setPeek(null)}
              onDetail={() => navigate(`/apps/executions/${peek.id}`)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
