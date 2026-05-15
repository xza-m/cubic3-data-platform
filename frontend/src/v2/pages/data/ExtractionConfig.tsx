// frontend/src/v2/pages/data/ExtractionConfig.tsx
//
// 提取任务配置页。当前后端只暴露运行健康度与队列状态，因此本页聚焦
// "能否执行任务" 的运维配置视角，不展示未落地的假配置项。

import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Activity, CheckCircle2, Settings2, XCircle } from 'lucide-react'
import { RefreshButton } from '@v2/components/CommonControls'
import { Card, CardBody, CardHead, Skeleton } from '@v2/components/ui'
import { useExtractionHealth } from '@v2/hooks/extraction'
import { useAppShell } from '@v2/layout/AppShell'
import { t } from '@v2/i18n'

export default function ExtractionConfig() {
  const { setBreadcrumbs, setTopBarActions, setContextPanel } = useAppShell()
  const { data, isLoading, isError, error, refetch, isFetching } = useExtractionHealth()

  useEffect(() => {
    setBreadcrumbs([
      t('extractionConfig.breadcrumb.data', '数据'),
      t('extractionConfig.breadcrumb.config', '任务配置'),
    ])
  }, [setBreadcrumbs])

  useEffect(() => {
    setTopBarActions(
      <RefreshButton
        onClick={() => refetch()}
        loading={isFetching}
        ariaLabel={t('extractionConfig.action.refresh', '刷新任务配置')}
      />,
    )
    return () => setTopBarActions(null)
  }, [setTopBarActions, refetch, isFetching])

  useEffect(() => {
    setContextPanel({
      title: (
        <div className="flex items-center gap-1.5">
          <Settings2 size={12} style={{ color: 'var(--text-3)' }} />
          {t('extractionConfig.context.title', '任务配置')}
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
              <Pair label={t('extractionConfig.context.queue', '任务队列')} value={data?.components.task_queue ?? '—'} />
            </div>
          </section>
          <section>
            <CtxLabel>{t('extractionConfig.context.shortcuts', '快捷入口')}</CtxLabel>
            <div className="mt-2 space-y-1.5 text-xs">
              <ContextLink to="/extraction/tasks/new">{t('extractionConfig.link.create', '新建提取任务')}</ContextLink>
              <ContextLink to="/extraction/tasks">{t('extractionConfig.link.tasks', '查看任务列表')}</ContextLink>
              <ContextLink to="/extraction/runs">{t('extractionConfig.link.runs', '查看执行记录')}</ContextLink>
            </div>
          </section>
        </div>
      ),
    })
    return () => setContextPanel(null)
  }, [data, setContextPanel])

  return (
    <div className="flex-1 overflow-y-auto scroll-thin px-5 py-5">
      <div className="mx-auto max-w-5xl space-y-4">
        <Card>
          <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-3">
                <Settings2 size={14} />
                {t('extractionConfig.eyebrow', 'Extraction Settings')}
              </div>
              <h1 className="mt-1 text-[20px] font-semibold text-1">
                {t('extractionConfig.title', '任务配置')}
              </h1>
              <p className="mt-1 text-[12px] leading-5 text-2">
                {t('extractionConfig.desc', '检查提取任务执行依赖、队列状态与常用配置入口。')}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link to="/extraction/tasks/new" className="btn btn-primary">
                {t('extractionConfig.action.createTask', '新建任务')}
              </Link>
              <Link to="/extraction/runs" className="btn btn-ghost">
                {t('extractionConfig.action.viewRuns', '执行记录')}
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
                  : t('extractionConfig.error.loadFailed', '加载任务配置失败')}
              </div>
            </CardBody>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <HealthCard label={t('extractionConfig.health.database', '数据库')} value={data?.components.database} loading={isLoading} />
            <HealthCard label="Redis" value={data?.components.redis} loading={isLoading} />
            <HealthCard label={t('extractionConfig.health.queue', '队列健康')} value={data?.components.task_queue} loading={isLoading} />
          </div>
        )}

        <Card>
          <CardHead title={t('extractionConfig.queue.title', '队列健康')} />
          <CardBody>
            {isLoading ? (
              <Skeleton width="100%" height={96} />
            ) : (
              <pre
                className="max-h-64 overflow-auto rounded-md border p-3 text-[11px] leading-5"
                style={{
                  background: 'var(--bg-surface-2)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-2)',
                }}
              >
                {JSON.stringify(data?.components.queue_info ?? {}, null, 2)}
              </pre>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}

function HealthCard({
  label,
  value,
  loading,
}: {
  label: string
  value: string | undefined
  loading: boolean
}) {
  const ok = value === 'up' || value === 'healthy'
  const Icon = ok ? CheckCircle2 : XCircle
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
              {value ?? 'unknown'}
            </span>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2 text-[12px] text-2">
          <Activity size={13} />
          {ok
            ? t('extractionConfig.health.ready', '可执行任务')
            : t('extractionConfig.health.blocked', '需要检查依赖')}
        </div>
      </CardBody>
    </Card>
  )
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
