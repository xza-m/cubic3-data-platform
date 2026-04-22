// frontend/src/v2/pages/Dashboard.tsx
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  ArrowUpRight,
  Brain,
  CheckCircle2,
  Database,
  Plus,
  RefreshCcw,
  Search,
  Sparkles,
  Table2,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import { Button, Card, CardBody, CardHead, Chip, Skeleton, SkeletonRows } from '@v2/components/ui'
import { useAppShell } from '@v2/layout/AppShell'
import { apiClient } from '@v2/api/client'
import { t } from '@v2/i18n'

// TODO(round-2): move to @v2/api/dashboard.ts and @v2/hooks/dashboard.ts
interface DashboardStats {
  datasource_total: number | null
  dataset_total: number | null
  semantic_model_total: number | null
  today_query_count: number | null
}

interface DashboardTrends {
  datasource_month_delta: number | null
  dataset_week_delta: number | null
  query_count_week: number | null
}

interface DashboardHealth {
  datasource_connectivity: number | null
  semantic_coverage: number | null
  query_success_rate: number | null
}

interface RecentQuery {
  id: string | number
  name: string
  datasource_name: string | null
  status: 'success' | 'failed' | 'timeout' | 'queued' | 'running' | string
  executed_at: string | null
}

interface DashboardOverviewResponse {
  stats: DashboardStats
  trends: DashboardTrends
  health: DashboardHealth
  recent_queries: RecentQuery[]
}

async function getDashboardOverview(): Promise<DashboardOverviewResponse> {
  const res = await apiClient.get<DashboardOverviewResponse>('/dashboard/overview')
  return res.data
}

const formatNumber = (n: number | null | undefined): string => {
  if (n == null) return '—'
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return String(n)
}

const formatPercent = (v: number | null | undefined): string => {
  if (v == null) return '—'
  return `${Math.round(v * 100)}%`
}

const statusChip = (status: RecentQuery['status']) => {
  switch (status) {
    case 'success':
      return <Chip tone="success">{t('status.success', '成功')}</Chip>
    case 'failed':
      return <Chip tone="danger">{t('status.failed', '失败')}</Chip>
    case 'timeout':
      return <Chip tone="warning">{t('status.timeout', '超时')}</Chip>
    case 'queued':
      return <Chip tone="neutral">{t('status.queued', '排队')}</Chip>
    case 'running':
      return <Chip tone="accent">{t('status.running', '执行中')}</Chip>
    default:
      return <Chip tone="neutral">{status}</Chip>
  }
}

const formatTime = (raw: string | null | undefined): string => {
  if (!raw) return '—'
  try {
    const d = new Date(raw)
    if (Number.isNaN(d.getTime())) return raw
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d)
  } catch {
    return raw
  }
}

export default function Dashboard() {
  const { setBreadcrumbs, setTopBarActions } = useAppShell()
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<DashboardOverviewResponse>({
    queryKey: ['dashboard', 'overview'],
    queryFn: getDashboardOverview,
  })

  useEffect(() => {
    setBreadcrumbs([t('nav.dashboard', '总览')])
    setTopBarActions(
      <Button size="sm" variant="ghost" onClick={() => refetch()}>
        <RefreshCcw size={12} className={isFetching ? 'animate-spin' : ''} />{' '}
        {t('action.refresh', '刷新')}
      </Button>,
    )
    return () => setTopBarActions(null)
  }, [setBreadcrumbs, setTopBarActions, refetch, isFetching])

  const stats = data?.stats
  const trends = data?.trends
  const health = data?.health
  const recent = data?.recent_queries ?? []

  return (
    <div className="flex-1 overflow-y-auto scroll-thin px-5 py-5">
      <div className="mx-auto max-w-7xl space-y-4">
        <Card>
          <CardBody className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-[color:var(--accent)]" />
                <span className="text-[11px] uppercase tracking-wider text-3">
                  Cubic³ Platform
                </span>
              </div>
              <h1 className="mt-1 text-[22px] font-semibold text-1">
                {t('dashboard.heading', '语义优先的数据工作台')}
              </h1>
              <p className="mt-1 text-[12px] leading-5 text-2">
                {t('dashboard.desc', '统一管理数据源、数据集、语义模型与对话式分析。下方实时聚合自后端')}{' '}
                <code className="px-1 text-[11px] text-2">/api/v1/dashboard/overview</code>。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link to="/queries/console" className="btn btn-primary">
                <Search size={12} /> {t('dashboard.cta.query', '打开查询工作台')}
              </Link>
              <Link to="/semantic/ontology" className="btn btn-ghost">
                <ArrowUpRight size={12} /> {t('dashboard.cta.semantic', '本体工作台')}
              </Link>
            </div>
          </CardBody>
        </Card>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            icon={Database}
            label={t('kpi.datasources', '数据源')}
            value={stats?.datasource_total}
            trend={trends?.datasource_month_delta}
            trendLabel={t('kpi.trend.month', '较上月')}
            loading={isLoading}
          />
          <KpiCard
            icon={Table2}
            label={t('kpi.datasets', '数据集')}
            value={stats?.dataset_total}
            trend={trends?.dataset_week_delta}
            trendLabel={t('kpi.trend.week', '较上周')}
            loading={isLoading}
          />
          <KpiCard
            icon={Brain}
            label={t('kpi.semantic', '语义模型')}
            value={stats?.semantic_model_total}
            trendLabel={t('kpi.semantic.hint', '本体 + Cube')}
            loading={isLoading}
          />
          <KpiCard
            icon={Activity}
            label={t('kpi.queries.today', '今日查询')}
            value={stats?.today_query_count}
            trend={trends?.query_count_week}
            trendLabel={t('kpi.queries.week', '本周累计')}
            loading={isLoading}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHead
              title={t('dashboard.recent.queries', '最近查询')}
              extra={<span className="text-[11px] text-3">{t('dashboard.recent.source', '来自 query_history')}</span>}
            />
            <CardBody className="!p-0">
              {isLoading ? (
                <SkeletonRows rows={5} columns={4} />
              ) : isError ? (
                <ErrorState
                  message={error instanceof Error ? error.message : t('error.load', '加载失败')}
                  onRetry={() => refetch()}
                />
              ) : recent.length === 0 ? (
                <div className="px-4 py-10 text-center text-[12px] text-3">
                  {t('dashboard.recent.empty', '暂无最近查询')}
                </div>
              ) : (
                <table className="wb-table">
                  <thead>
                    <tr>
                      <th>{t('col.query', '查询')}</th>
                      <th>{t('col.datasource', '数据源')}</th>
                      <th>{t('col.status', '状态')}</th>
                      <th>{t('col.executed_at', '执行时间')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.slice(0, 8).map((row, idx) => (
                      <tr key={`${row.id}-${idx}`}>
                        <td className="text-1">{row.name}</td>
                        <td className="text-2">{row.datasource_name ?? '—'}</td>
                        <td>{statusChip(row.status)}</td>
                        <td className="text-3">{formatTime(row.executed_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHead title={t('dashboard.health', '平台健康度')} />
            <CardBody>
              <div className="space-y-3">
                <HealthBar
                  label={t('health.datasource', '数据源连通率')}
                  value={health?.datasource_connectivity}
                  loading={isLoading}
                />
                <HealthBar
                  label={t('health.semantic', '语义覆盖率')}
                  value={health?.semantic_coverage}
                  loading={isLoading}
                />
                <HealthBar
                  label={t('health.query', '查询成功率')}
                  value={health?.query_success_rate}
                  loading={isLoading}
                />
              </div>
              <div className="mt-5 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
                <div className="text-[11px] uppercase tracking-wider text-3">
                  {t('dashboard.quicklinks', '快捷入口')}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <QuickLink to="/datasources/new" icon={Database} label={t('quick.datasource', '新建数据源')} />
                  <QuickLink to="/datasets/new" icon={Plus} label={t('quick.dataset', '登记数据集')} />
                  <QuickLink to="/queries/console" icon={Search} label={t('quick.query', '编写查询')} />
                  <QuickLink to="/semantic/ontology" icon={Brain} label={t('quick.semantic', '维护本体')} />
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}

interface KpiCardProps {
  icon: LucideIcon
  label: string
  value: number | null | undefined
  trend?: number | null
  trendLabel?: string
  loading?: boolean
}

function KpiCard({ icon: Icon, label, value, trend, trendLabel, loading }: KpiCardProps) {
  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between text-3">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
            <Icon size={12} />
            {label}
          </div>
          {trend != null ? (
            <div className="flex items-center gap-1 text-[11px] text-[color:var(--success)]">
              <TrendingUp size={11} />
              {trend > 0 ? `+${trend}` : trend}
            </div>
          ) : null}
        </div>
        <div className="mt-2 text-[24px] font-semibold leading-none text-1">
          {loading ? <Skeleton width={60} height={24} /> : formatNumber(value)}
        </div>
        {trendLabel ? <div className="mt-1 text-[11px] text-3">{trendLabel}</div> : null}
      </CardBody>
    </Card>
  )
}

interface HealthBarProps {
  label: string
  value: number | null | undefined
  loading?: boolean
}

function HealthBar({ label, value, loading }: HealthBarProps) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value * 100))
  const tone =
    pct >= 95 ? 'var(--success)' : pct >= 80 ? 'var(--warning)' : 'var(--danger)'
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-2">{label}</span>
        <span className="text-1 font-medium">{loading ? '—' : formatPercent(value)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded" style={{ background: 'var(--bg-hover)' }}>
        <div
          className="h-full rounded transition-all"
          style={{ width: `${pct}%`, background: tone }}
          aria-hidden
        />
      </div>
    </div>
  )
}

interface QuickLinkProps {
  to: string
  icon: LucideIcon
  label: string
}

function QuickLink({ to, icon: Icon, label }: QuickLinkProps) {
  return (
    <Link to={to} className="nav-item !h-10 !rounded-md border" style={{ borderColor: 'var(--border)' }}>
      <Icon size={14} />
      <span className="flex-1 truncate">{label}</span>
      <ArrowUpRight size={12} className="text-3" />
    </Link>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="px-4 py-8 text-center">
      <CheckCircle2 size={20} className="mx-auto text-[color:var(--danger)]" />
      <div className="mt-2 text-[12px] text-1">{message}</div>
      <Button className="mt-3" size="sm" onClick={onRetry}>
        {t('action.retry', '重试')}
      </Button>
    </div>
  )
}
