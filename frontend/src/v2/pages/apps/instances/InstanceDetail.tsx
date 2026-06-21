// frontend/src/v2/pages/apps/instances/InstanceDetail.tsx
//
// 应用实例详情页（L3）。
// 接口：GET /api/v1/app-instances/:id (include_stats=true)
//       POST /api/v1/app-instances/:id/enable|disable|execute
// B-back-2: health 经 HealthChip 渲染（字段缺省按 unknown 处理）

import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Play, Square, Trash2 } from 'lucide-react'
import { t } from '@v2/i18n'
import { fmtDateTime } from '@v2/lib/format'
import { useToast } from '@v2/components/ui'
import {
  useInstance,
  useEnableInstance,
  useDisableInstance,
  useExecuteInstance,
  useDeleteInstance,
  useExecutions,
} from '@v2/hooks/instances'
import { HealthChip } from '@v2/components/HealthChip'
import { appInstanceAppLabel } from '@v2/lib/appLabels'
import { StructuredDetails } from '@v2/components/common/StructuredDetails'
import { TechnicalValue } from '@v2/components/common/TechnicalValue'
import {
  InstanceStatusChip,
  ExecStatusChip,
  scheduleLabel,
  InstanceDetailContent,
} from '../_shared/instance-content'
import { fmtDuration } from '../_shared/execution-content'

type Tab = 'overview' | 'config' | 'runs'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: t('instancedetail.tab.overview', '总览') },
  { id: 'config', label: t('instancedetail.tab.config', '配置') },
  { id: 'runs', label: t('instancedetail.tab.runs', '执行记录') },
]

function mutationErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err || '')
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <dt className="text-xs" style={{ color: 'var(--text-3)' }}>
        {label}
      </dt>
      <dd className="truncate text-right text-xs" style={{ color: 'var(--text-1)' }}>
        {value}
      </dd>
    </div>
  )
}

function recordFieldCount(value: Record<string, unknown> | null | undefined): number {
  return value ? Object.keys(value).length : 0
}

function scheduleConfigSummary(scheduleType: string, config: Record<string, unknown> | null): string {
  const enabled = typeof config?.enabled === 'boolean'
    ? config.enabled
      ? t('common.enabled', '启用')
      : t('common.disabled', '已停')
    : t('instance.schedule.noSwitch', '未单独配置启停')
  const cron = typeof config?.cron === 'string' && config.cron.trim() ? ` · ${config.cron}` : ''
  return `${scheduleLabel(scheduleType)} · ${enabled}${cron}`
}

export default function InstanceDetail() {
  const { id: idStr } = useParams<{ id: string }>()
  const id = idStr ? Number(idStr) : undefined
  const navigate = useNavigate()
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('overview')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { data: instance, isLoading, isError } = useInstance(id)
  const { data: execPage } = useExecutions({
    instance_id: id,
    page: 1,
    page_size: 20,
  })
  const execs = execPage?.items ?? []

  const enableMut = useEnableInstance()
  const disableMut = useDisableInstance()
  const executeMut = useExecuteInstance()
  const deleteMut = useDeleteInstance()

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

  if (isError || !instance) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <p className="text-xs" style={{ color: 'var(--danger)' }}>
          {t('state.not_found', '实例不存在或加载失败')}
        </p>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => navigate('/apps/instances')}
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
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded font-semibold text-white"
            style={{ background: instance.enabled ? 'var(--success)' : 'var(--text-3)' }}
          >
            {instance.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                {instance.name}
              </span>
              <InstanceStatusChip enabled={instance.enabled} />
              <HealthChip health={instance.health} />
            </div>
            <div className="mt-0.5 text-xs" style={{ color: 'var(--text-3)' }}>
              {appInstanceAppLabel(instance)}
              {' · '}
              {t('instance.field.owner', '所有者')}: {instance.owner}
              {' · '}
              {scheduleLabel(instance.schedule_type)}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => navigate('/apps/instances')}
            >
              <ArrowLeft size={12} />
              {t('action.back', '返回')}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={executeMut.isPending || !instance.enabled}
              title={!instance.enabled ? t('instance.disabled_hint', '请先启用实例') : undefined}
              onClick={() =>
                executeMut.mutate(instance.id, {
                  onSuccess: (r) => {
                    navigate(`/apps/executions/${r.execution_id}`)
                  },
                })
              }
            >
              <Play size={12} />
              {t('action.execute', '立即执行')}
            </button>
            {instance.enabled ? (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                disabled={disableMut.isPending}
                onClick={() =>
                  disableMut.mutate(instance.id, {
                    onSuccess: () => {
                      toast.show({
                        tone: 'success',
                        title: t('instances.toast.disabled', '{name} 已停止', { name: instance.name }),
                      })
                    },
                    onError: (err) => {
                      toast.show({
                        tone: 'danger',
                        title: t('instances.toast.disableFailed', '停止失败'),
                        description: mutationErrorMessage(err),
                      })
                    },
                  })
                }
              >
                <Square size={12} />
                {t('action.disable', '停止')}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={enableMut.isPending}
                onClick={() =>
                  enableMut.mutate(instance.id, {
                    onSuccess: () => {
                      toast.show({
                        tone: 'success',
                        title: t('instances.toast.enabled', '{name} 已启用', { name: instance.name }),
                      })
                    },
                    onError: (err) => {
                      toast.show({
                        tone: 'danger',
                        title: t('instances.toast.enableFailed', '启用失败'),
                        description: mutationErrorMessage(err),
                      })
                    },
                  })
                }
              >
                <Play size={12} />
                {t('action.enable', '启用')}
              </button>
            )}
            {confirmDelete ? (
              <div className="flex items-center gap-1">
                <span className="text-xs" style={{ color: 'var(--danger)' }}>
                  {t('instance.confirm_delete', '确认删除？')}
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  disabled={deleteMut.isPending}
                  onClick={() =>
                    deleteMut.mutate(instance.id, {
                      onSuccess: () => navigate('/apps/instances'),
                    })
                  }
                >
                  {t('action.confirm', '确认')}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setConfirmDelete(false)}
                >
                  {t('action.cancel', '取消')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="mt-3 flex items-center gap-1">
          {TABS.map((t_) => (
            <button
              key={t_.id}
              type="button"
              className="rounded px-2.5 py-1 text-xs transition-colors"
              style={{
                background: tab === t_.id ? 'var(--accent-soft)' : 'transparent',
                color: tab === t_.id ? 'var(--accent)' : 'var(--text-2)',
              }}
              onClick={() => setTab(t_.id)}
            >
              {t_.label}
            </button>
          ))}
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {tab === 'overview' && (
          <div className="grid gap-3 md:grid-cols-2">
            <div
              className="rounded-md border p-4"
              style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
            >
              <InstanceDetailContent instance={instance} />
            </div>

            {instance.stats && (
              <div
                className="rounded-md border p-4"
                style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
              >
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                  {t('instance.section.stats', '执行统计')}
                </div>
                <dl>
                  <Row
                    label={t('instance.field.total', '总执行')}
                    value={instance.stats.total_executions}
                  />
                  <Row
                    label={t('instance.field.success', '成功')}
                    value={instance.stats.success_count}
                  />
                  <Row
                    label={t('instance.field.failed', '失败')}
                    value={instance.stats.failed_count}
                  />
                  <Row
                    label={t('instance.field.success_rate', '成功率')}
                    value={`${instance.stats.success_rate}%`}
                  />
                  <Row
                    label={t('instance.field.avg_duration', '平均耗时')}
                    value={fmtDuration(instance.stats.avg_duration_ms)}
                  />
                </dl>
              </div>
            )}
          </div>
        )}

        {tab === 'config' && (
          <div
            className="rounded-md border p-4"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
          >
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
              {t('instance.section.config', '配置参数')}
            </div>
            <StructuredDetails
              title={t('instance.config.detailTitle', '查看配置详情')}
              value={instance.config}
              summary={t('instance.config.summary', '配置项 {count} 个', { count: recordFieldCount(instance.config) })}
            />

            {instance.schedule_config && (
              <>
                <div className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                  {t('instance.section.schedule_config', '调度配置')}
                </div>
                <StructuredDetails
                  title={t('instance.scheduleConfig.detailTitle', '查看调度详情')}
                  value={instance.schedule_config}
                  summary={scheduleConfigSummary(instance.schedule_type, instance.schedule_config)}
                />
              </>
            )}
          </div>
        )}

        {tab === 'runs' && (
          <div
            className="rounded-md border"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
          >
            <div
              className="flex items-center justify-between border-b px-4 py-2"
              style={{ borderColor: 'var(--border)' }}
            >
              <span className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>
                {t('instance.section.runs', '执行记录')}
              </span>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => navigate(`/apps/executions?instance_id=${instance.id}`)}
              >
                {t('action.view_all', '查看全部')}
              </button>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'var(--bg-surface-2)', color: 'var(--text-3)' }}>
                  <th className="px-4 py-2 text-left font-normal">{t('exec.field.record', '执行记录')}</th>
                  <th className="px-4 py-2 text-left font-normal">{t('exec.field.status', '状态')}</th>
                  <th className="px-4 py-2 text-left font-normal">{t('exec.field.trigger', '触发')}</th>
                  <th className="px-4 py-2 text-left font-normal">{t('exec.field.started_at', '开始')}</th>
                  <th className="px-4 py-2 text-right font-normal">{t('exec.field.duration', '耗时')}</th>
                </tr>
              </thead>
              <tbody>
                {execs.map((e) => (
                  <tr
                    key={e.id}
                    className="cursor-pointer border-t transition-colors hover:bg-[color:var(--bg-hover)]"
                    style={{ borderColor: 'var(--border)' }}
                    onClick={() => navigate(`/apps/executions/${e.id}`)}
                  >
                    <td className="px-4 py-2">
                      <TechnicalValue value={e.id} label={t('exec.field.recordShort', '记录')} />
                    </td>
                    <td className="px-4 py-2">
                      <ExecStatusChip status={e.status} />
                    </td>
                    <td className="px-4 py-2" style={{ color: 'var(--text-3)' }}>
                      {e.trigger_display_name}
                    </td>
                    <td className="px-4 py-2" style={{ color: 'var(--text-3)' }}>
                      {fmtDateTime(e.started_at)}
                    </td>
                    <td className="px-4 py-2 text-right">{fmtDuration(e.duration_ms)}</td>
                  </tr>
                ))}
                {execs.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-8 text-center text-xs"
                      style={{ color: 'var(--text-3)' }}
                    >
                      {t('state.no_runs', '暂无执行记录')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
