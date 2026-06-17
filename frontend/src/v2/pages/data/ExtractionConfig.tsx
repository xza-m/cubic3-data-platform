// frontend/src/v2/pages/data/ExtractionConfig.tsx
//
// 同步任务配置页。当前后端只暴露运行健康度与队列状态，因此本页聚焦
// "能否执行任务" 的运维配置视角，不展示未落地的假配置项。

import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Activity, CheckCircle2, Settings2, XCircle } from 'lucide-react'
import { RefreshButton } from '@v2/components/CommonControls'
import { Card, CardBody, CardHead, Skeleton } from '@v2/components/ui'
import { useExtractionHealth } from '@v2/hooks/extraction'
import { useAppShell } from '@v2/layout/AppShell'
import { t } from '@v2/i18n'
import { DataCenterSyncTabs } from './_shared/data-center-nav'

export default function ExtractionConfig() {
  const { setBreadcrumbs, setTopBarActions, setContextPanel } = useAppShell()
  const { data, isLoading, isError, error, refetch, isFetching } = useExtractionHealth()

  useEffect(() => {
    setBreadcrumbs([
      t('extractionConfig.breadcrumb.data', '数据'),
      t('extractionConfig.breadcrumb.center', '数据中心'),
      t('extractionConfig.breadcrumb.config', '同步配置'),
    ])
  }, [setBreadcrumbs])

  useEffect(() => {
    setTopBarActions(
      <RefreshButton
        onClick={() => refetch()}
        loading={isFetching}
        ariaLabel={t('extractionConfig.action.refresh', '刷新同步配置')}
      />,
    )
    return () => setTopBarActions(null)
  }, [setTopBarActions, refetch, isFetching])

  useEffect(() => {
    setContextPanel({
      title: (
        <div className="flex items-center gap-1.5">
          <Settings2 size={12} style={{ color: 'var(--text-3)' }} />
          {t('extractionConfig.context.title', '同步配置')}
        </div>
      ),
      subtitle: t('extractionConfig.context.subtitle', '执行依赖与快捷入口'),
      body: (
        <div className="space-y-4 px-4 py-4">
          <section>
            <CtxLabel>{t('extractionConfig.context.health', '运行状态')}</CtxLabel>
            <div className="mt-2 space-y-1.5 text-xs">
              <Pair label={t('extractionConfig.context.database', '数据库')} value={data?.components.database ?? '—'} />
              <Pair label="Redis" value={data?.components.redis ?? '—'} />
              <Pair label={t('extractionConfig.context.queue', '同步队列')} value={data?.components.task_queue ?? '—'} />
            </div>
          </section>
          <section>
            <CtxLabel>{t('extractionConfig.context.shortcuts', '快捷入口')}</CtxLabel>
            <div className="mt-2 space-y-1.5 text-xs">
              <ContextLink to="/data-center/sync/tasks/new">{t('extractionConfig.link.create', '新建同步任务')}</ContextLink>
              <ContextLink to="/data-center/sync/tasks">{t('extractionConfig.link.tasks', '查看同步任务')}</ContextLink>
              <ContextLink to="/data-center/sync/runs">{t('extractionConfig.link.runs', '查看同步记录')}</ContextLink>
            </div>
          </section>
        </div>
      ),
    })
    return () => setContextPanel(null)
  }, [data, setContextPanel])

  return (
    <>
      <DataCenterSyncTabs />
      <div className="flex-1 overflow-y-auto scroll-thin px-5 py-5">
      <div className="mx-auto max-w-5xl space-y-4">
        <Card>
          <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-3">
                <Settings2 size={14} />
                {t('extractionConfig.eyebrow', '同步设置')}
              </div>
              <h1 className="mt-1 text-[20px] font-semibold text-1">
                {t('extractionConfig.title', '同步配置')}
              </h1>
              <p className="mt-1 text-[12px] leading-5 text-2">
                {t('extractionConfig.desc', '检查同步任务执行依赖、队列状态与常用配置入口。')}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link to="/data-center/sync/tasks/new" className="btn btn-primary">
                {t('extractionConfig.action.createTask', '新建任务')}
              </Link>
              <Link to="/data-center/sync/runs" className="btn btn-ghost">
                {t('extractionConfig.action.viewRuns', '同步记录')}
              </Link>
            </div>
          </CardBody>
        </Card>

        {isError ? (
          <Card>
            <CardBody>
              <div className="text-sm text-[color:var(--danger)]">
                {error instanceof Error
                  ? error.message
                  : t('extractionConfig.error.loadFailed', '加载同步配置失败')}
              </div>
            </CardBody>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <HealthCard label={t('extractionConfig.health.database', '数据库')} value={data?.components.database} loading={isLoading} />
            <HealthCard label="Redis" value={data?.components.redis} loading={isLoading} />
            <HealthCard
              label={t('extractionConfig.health.queue', '队列健康')}
              value={data?.components.task_queue}
              loading={isLoading}
              detail={queueHealthDetail(data?.components.queue_info)}
            />
          </div>
        )}

        <Card>
          <CardHead title={t('extractionConfig.queue.title', '队列健康')} />
          <CardBody>
            {isLoading ? (
              <Skeleton width="100%" height={96} />
            ) : (
              <QueueInfoSummary info={data?.components.queue_info} />
            )}
          </CardBody>
        </Card>
      </div>
      </div>
    </>
  )
}

function HealthCard({
  label,
  value,
  loading,
  detail,
}: {
  label: string
  value: string | undefined
  loading: boolean
  detail?: string | null
}) {
  const ok = value === 'up' || value === 'healthy'
  const Icon = ok ? CheckCircle2 : XCircle
  const statusLabel = healthStatusLabel(value)
  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] uppercase tracking-wider text-3">{label}</div>
          {loading ? (
            <Skeleton width={48} height={20} />
          ) : (
            <span
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium"
              style={{
                background: ok ? 'var(--success-soft)' : 'var(--danger-soft)',
                color: ok ? 'var(--success)' : 'var(--danger)',
              }}
            >
              <Icon size={12} />
              {statusLabel}
            </span>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2 text-[12px] text-2">
          <Activity size={13} />
          {detail ??
            (ok
              ? t('extractionConfig.health.ready', '可执行同步任务')
              : t('extractionConfig.health.blocked', '需要检查依赖'))}
        </div>
      </CardBody>
    </Card>
  )
}

function healthStatusLabel(value: string | undefined): string {
  if (value === 'up' || value === 'healthy') return t('extractionConfig.health.status.ok', '正常')
  if (value === 'down' || value === 'unhealthy') return t('extractionConfig.health.status.down', '异常')
  return t('extractionConfig.health.status.unknown', '未知')
}

function queueHealthDetail(info: Record<string, unknown> | null | undefined): string | null {
  const failed = numberValue(info?.failed_count)
  if (failed > 0) {
    return t('extractionConfig.health.queueWithFailures', '可执行同步任务，历史失败 {n} 次', { n: failed })
  }
  return null
}

function QueueInfoSummary({ info }: { info: Record<string, unknown> | null | undefined }) {
  const queueName = String(info?.name ?? 'default')
  const waiting = numberValue(info?.count)
  const finished = numberValue(info?.finished_count)
  const failed = numberValue(info?.failed_count)
  return (
    <div className="rounded-md border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)' }}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <QueueMetric label={t('extractionConfig.queue.name', '队列')} value={queueName} />
        <QueueMetric label={t('extractionConfig.queue.waiting', '当前待处理')} value={waiting} />
        <QueueMetric label={t('extractionConfig.queue.finished', '历史完成')} value={finished} />
        <QueueMetric label={t('extractionConfig.queue.failed', '历史失败')} value={failed} tone={failed > 0 ? 'warning' : undefined} />
      </div>
      <p className="mt-3 text-[11px] leading-5 text-3">
        {t('extractionConfig.queue.hint', '历史失败次数用于排障追踪，不等同于当前队列不可用；当前是否可执行以上方组件状态为准。')}
      </p>
    </div>
  )
}

function QueueMetric({
  label,
  value,
  tone,
}: {
  label: string
  value: ReactNode
  tone?: 'warning'
}) {
  return (
    <div className="min-w-0 rounded border px-3 py-2" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>
      <div className="text-[11px] text-3">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold" style={{ color: tone === 'warning' ? 'var(--warning)' : 'var(--text-1)' }}>
        {value}
      </div>
    </div>
  )
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function CtxLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
      {children}
    </div>
  )
}

function Pair({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="truncate text-3">{label}</span>
      <span className="truncate text-right text-1">{value}</span>
    </div>
  )
}

function ContextLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="flex rounded-md px-2 py-1 text-left text-2 hover:bg-[color:var(--bg-hover)]">
      {children}
    </Link>
  )
}
