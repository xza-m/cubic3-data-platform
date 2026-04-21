// frontend/src/v2/pages/apps/executions/ExecutionDetail.tsx
//
// 执行记录详情页（L3）。
// 接口：GET /api/v1/app-executions/:id

import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { t } from '@v2/i18n'
import { fmtDateTime, fmtRelative } from '@v2/lib/format'
import { useExecution } from '@v2/hooks/instances'
import { ExecStatusChip } from '../_shared/instance-content'
import { ExecutionDetailContent, fmtDuration } from '../_shared/execution-content'

export default function ExecutionDetail() {
  const { id: idStr } = useParams<{ id: string }>()
  const id = idStr ? Number(idStr) : undefined
  const navigate = useNavigate()

  const { data: execution, isLoading, isError } = useExecution(id)

  if (isLoading) {
    return (
      <div
        className="flex flex-1 items-center justify-center text-xs"
        style={{ color: 'var(--text-3)' }}
      >
        {t('state.loading', '加载中…')}
      </div>
    )
  }

  if (isError || !execution) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <p className="text-xs" style={{ color: 'var(--danger)' }}>
          {t('state.not_found', '执行记录不存在或加载失败')}
        </p>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => navigate('/apps/executions')}
        >
          <ArrowLeft size={12} />
          {t('action.back', '返回')}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <header
        className="border-b px-4 py-3"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded font-mono text-sm font-semibold text-white"
            style={{
              background:
                execution.status === 'success'
                  ? 'var(--success)'
                  : execution.status === 'failed'
                    ? 'var(--danger)'
                    : execution.status === 'running'
                      ? 'var(--accent)'
                      : 'var(--text-3)',
            }}
          >
            EX
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
              <code>#{execution.id}</code>
              {execution.instance && <span className="truncate">{execution.instance.name}</span>}
              <ExecStatusChip status={execution.status} />
            </div>
            <div className="mt-0.5 text-xs" style={{ color: 'var(--text-3)' }}>
              {execution.app && <code>{execution.app.code}</code>}
              {execution.app && ' · '}
              {execution.trigger_display_name}
              {execution.started_at && ` · ${fmtRelative(execution.started_at)}`}
              {execution.duration_ms != null && ` · ${fmtDuration(execution.duration_ms)}`}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => navigate('/apps/executions')}
            >
              <ArrowLeft size={12} />
              {t('action.back', '返回列表')}
            </button>
            {execution.instance_id && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => navigate(`/apps/instances/${execution.instance_id}`)}
              >
                <ExternalLink size={12} />
                {t('exec.action.view_instance', '查看实例')}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto">
          <ExecutionDetailContent
            execution={execution}
            actions={{
              onViewInstance: execution.instance_id
                ? () => navigate(`/apps/instances/${execution.instance_id}`)
                : undefined,
              onViewApp:
                execution.instance?.app_code
                  ? () => navigate(`/apps/${execution.instance!.app_code}`)
                  : undefined,
            }}
          />
        </div>

        {/* Context panel — 时间轴摘要 */}
        <div
          className="flex w-64 shrink-0 flex-col border-l"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
        >
          <div
            className="border-b px-4 py-3 text-xs font-semibold uppercase tracking-wide"
            style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}
          >
            {t('exec.context.summary', '摘要')}
          </div>
          <div className="space-y-4 overflow-auto px-4 py-4">
            {/* Status */}
            <div>
              <div className="mb-1 text-xs uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                {t('exec.field.status', '状态')}
              </div>
              <ExecStatusChip status={execution.status} />
            </div>

            {/* Timing */}
            <div>
              <div className="mb-1 text-xs uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                {t('exec.section.timing', '时间')}
              </div>
              <dl className="space-y-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <dt style={{ color: 'var(--text-3)' }}>{t('exec.field.started_at', '开始')}</dt>
                  <dd className="text-right" style={{ color: 'var(--text-1)' }}>
                    {execution.started_at ? fmtDateTime(execution.started_at) : '-'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt style={{ color: 'var(--text-3)' }}>{t('exec.field.ended_at', '结束')}</dt>
                  <dd className="text-right" style={{ color: 'var(--text-1)' }}>
                    {execution.ended_at ? fmtDateTime(execution.ended_at) : '-'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt style={{ color: 'var(--text-3)' }}>{t('exec.field.duration', '耗时')}</dt>
                  <dd className="text-right" style={{ color: 'var(--text-1)' }}>
                    {fmtDuration(execution.duration_ms)}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Instance link */}
            {execution.instance && (
              <div>
                <div className="mb-1 text-xs uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                  {t('exec.context.instance', '关联实例')}
                </div>
                <button
                  type="button"
                  className="w-full rounded border px-2 py-1 text-left text-xs transition-colors hover:bg-[color:var(--bg-hover)]"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
                  onClick={() => navigate(`/apps/instances/${execution.instance_id}`)}
                >
                  {execution.instance.name}
                  <code className="ml-1 text-xs" style={{ color: 'var(--text-3)' }}>
                    ({execution.instance.app_code})
                  </code>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
