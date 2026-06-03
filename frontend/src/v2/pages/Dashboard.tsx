// frontend/src/v2/pages/Dashboard.tsx
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  Brain,
  CheckCircle2,
  CircleDot,
  Code2,
  Database,
  Gauge,
  Plus,
  Search,
  ShieldCheck,
  Table2,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import { Card, CardBody, CardHead, Chip, Skeleton, SkeletonRows } from '@v2/components/ui'
import { RefreshButton } from '@v2/components/CommonControls'
import { RetryState } from '@v2/components/LoadState'
import { useAppShell } from '@v2/layout/AppShell'
import { useDashboardOverview } from '@v2/hooks/dashboard'
import type { RecentQuery } from '@v2/api/dashboard'
import { t } from '@v2/i18n'

const formatNumber = (n: number | null | undefined): string => {
  if (n == null) return '—'
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return String(n)
}

const formatPercent = (v: number | null | undefined): string => {
  if (v == null) return '—'
  return `${Math.round(normalizePercent(v))}%`
}

const normalizePercent = (v: number): number => {
  if (v > 0 && v <= 1) return v * 100
  return v
}

const learningModules = [
  {
    title: '自助查询入门',
    subtitle: '从数据目录选择表，编写 SQL，运行并保存查询',
    href: '/tutorials/self-service-query.html',
    icon: Search,
    level: '入门',
    tone: 'var(--accent)',
  },
  {
    title: '语义建模工作流',
    subtitle: '用业务问题生成 Cube 与本体草稿，校验后发布给 Agent',
    href: '/tutorials/semantic-modeling.html',
    icon: Brain,
    level: '进阶',
    tone: 'var(--violet)',
  },
  {
    title: '开发应用与推送',
    subtitle: '配置应用实例、渠道、订阅和执行监控闭环',
    href: '/tutorials/app-development.html',
    icon: Code2,
    level: '入门',
    tone: 'var(--success)',
  },
  {
    title: '权限治理闭环',
    subtitle: '给成员配置平台角色和数据访问权限，校验审计链路',
    href: '/tutorials/access-governance.html',
    icon: ShieldCheck,
    level: '管理员',
    tone: 'var(--danger)',
  },
]

interface AttentionItem {
  label: string
  description: string
  value: string
  status: string
  tone: 'accent' | 'success' | 'warning' | 'danger' | 'neutral'
  href: string
  icon: LucideIcon
}

const healthTone = (value: number | null | undefined): AttentionItem['tone'] => {
  if (value == null) return 'warning'
  const normalized = normalizePercent(value)
  if (normalized >= 95) return 'success'
  if (normalized >= 80) return 'warning'
  return 'danger'
}

const healthStatus = (value: number | null | undefined): string => {
  if (value == null) return '待补充样本'
  const normalized = normalizePercent(value)
  if (normalized >= 95) return '稳定'
  if (normalized >= 80) return '需关注'
  return '需处理'
}

const toneIcon: Record<AttentionItem['tone'], LucideIcon> = {
  accent: CircleDot,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertTriangle,
  neutral: CircleDot,
}

const attentionToneStyle: Record<AttentionItem['tone'], { background: string; color: string }> = {
  accent: { background: 'var(--accent-soft)', color: 'var(--accent)' },
  success: { background: 'var(--success-soft)', color: 'var(--success)' },
  warning: { background: 'var(--warning-soft)', color: 'var(--warning)' },
  danger: { background: 'var(--danger-soft)', color: 'var(--danger)' },
  neutral: { background: 'var(--bg-hover)', color: 'var(--text-2)' },
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
  const { data, isLoading, isError, error, refetch, isFetching } = useDashboardOverview()

  useEffect(() => {
    setBreadcrumbs([t('nav.dashboard', '总览')])
    setTopBarActions(
      <RefreshButton
        onClick={() => refetch()}
        loading={isFetching}
        ariaLabel={t('dashboard.action.refresh', '刷新总览')}
      />,
    )
    return () => setTopBarActions(null)
  }, [setBreadcrumbs, setTopBarActions, refetch, isFetching])

  const stats = data?.stats
  const trends = data?.trends
  const health = data?.health
  const recent = data?.recent_queries ?? []
  const datasetSourceLabel =
    data?.sources?.dataset_total === 'datasets'
      ? t('kpi.datasets.source.platform_dataset', '回退到平台 Dataset')
      : t('kpi.datasets.source.data_assets', '资产事实层 · data_asset_tables')
  const querySourceLabel = t('kpi.queries.source.interactive', '交互式查询 · query_histories')
  const attentionItems: AttentionItem[] = [
    {
      label: t('dashboard.attention.datasource', '数据源健康'),
      description: t('dashboard.attention.datasource.desc', '连接状态会影响查询、建模和资产同步。'),
      value: formatPercent(health?.datasource_connectivity),
      status: healthStatus(health?.datasource_connectivity),
      tone: healthTone(health?.datasource_connectivity),
      href: '/data-center/datasources',
      icon: Database,
    },
    {
      label: t('dashboard.attention.semantic', '语义覆盖'),
      description: t('dashboard.attention.semantic.desc', '覆盖率越高，Agent 与业务指标越容易走正式语义链路。'),
      value: formatPercent(health?.semantic_coverage),
      status: healthStatus(health?.semantic_coverage),
      tone: healthTone(health?.semantic_coverage),
      href: '/semantic/ontology',
      icon: Brain,
    },
    {
      label: t('dashboard.attention.query', '查询活动'),
      description: t('dashboard.attention.query.desc', '关注最近执行记录，快速发现查询失败或无人使用的情况。'),
      value: `${formatNumber(stats?.today_query_count)} / ${formatNumber(trends?.query_count_week)}`,
      status: recent.length > 0 ? t('dashboard.attention.query.active', '有执行记录') : t('dashboard.attention.query.empty', '暂无记录'),
      tone: recent.length > 0 ? 'success' : 'warning',
      href: '/queries/history',
      icon: Activity,
    },
    {
      label: t('dashboard.attention.governance', '访问治理'),
      description: t('dashboard.attention.governance.desc', '检查平台角色、数据访问规则和审计链路是否覆盖核心主体。'),
      value: formatNumber(stats?.semantic_model_total),
      status: t('dashboard.attention.governance.status', '查看策略'),
      tone: 'accent',
      href: '/config/access',
      icon: ShieldCheck,
    },
  ]

  return (
    <div className="flex-1 overflow-y-auto scroll-thin px-5 py-5">
      <div className="mx-auto max-w-7xl space-y-4">
        <Card>
          <CardBody className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Gauge size={16} className="text-[color:var(--accent)]" />
                <span className="text-[11px] uppercase tracking-wider text-3">
                  Cubic³ Platform
                </span>
              </div>
              <h1 className="mt-1 text-[22px] font-semibold text-1">
                {t('dashboard.heading', '语义优先的数据工作台')}
              </h1>
              <p className="mt-1 text-[12px] leading-5 text-2">
                {t('dashboard.desc', '统一管理数据源、数据集、语义模型与对话式分析，实时掌握平台健康度与近期活动。')}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link to="/queries" className="btn btn-sm btn-primary">
                <Search size={12} /> {t('dashboard.cta.query', '打开查询工作台')}
              </Link>
              <Link to="/semantic/ontology" className="btn btn-sm btn-ghost">
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
            label={t('kpi.data_assets', '数据资产')}
            value={stats?.dataset_total}
            trend={trends?.dataset_week_delta}
            trendLabel={`${t('kpi.trend.week', '较上周')} · ${datasetSourceLabel}`}
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
            label={t('kpi.queries.today', '平台查询')}
            value={stats?.today_query_count}
            trend={trends?.query_count_week}
            trendLabel={`${t('kpi.queries.week', '近 7 日累计')} · ${querySourceLabel}`}
            loading={isLoading}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHead
              title={
                <h2 className="flex items-center gap-2 text-[13px] font-semibold text-1">
                  <AlertTriangle size={14} /> {t('dashboard.attention.title', '运行关注')}
                </h2>
              }
              subtitle={t('dashboard.attention.subtitle', '按健康度、活动和治理入口推导当前最值得处理的事项。')}
            />
            <CardBody className="!p-0">
              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {attentionItems.map((item) => (
                  <AttentionRow key={item.href} item={item} />
                ))}
              </div>
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
                  label={t('health.query', '近 7 日查询成功率')}
                  value={health?.query_success_rate}
                  loading={isLoading}
                  emptyText={t('health.query.empty', '暂无近 7 日执行记录')}
                />
              </div>
              <div className="mt-5 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
                <div className="text-[11px] uppercase tracking-wider text-3">
                  {t('dashboard.quicklinks', '快捷入口')}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <QuickLink to="/data-center/datasources/new" icon={Database} label={t('quick.datasource', '新建数据源')} />
                  <QuickLink to="/data-center/datasets/register" icon={Plus} label={t('quick.dataset', '登记数据集')} />
                  <QuickLink to="/queries" icon={Search} label={t('quick.query', '编写查询')} />
                  <QuickLink to="/semantic/ontology" icon={Brain} label={t('quick.semantic', '维护本体')} />
                </div>
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHead
              title={t('dashboard.recent.queries', '最近查询')}
              extra={<span className="text-[11px] text-3">{t('dashboard.recent.source', '平台交互式查询 · query_histories')}</span>}
            />
            <CardBody className="!p-0">
              {isLoading ? (
                <SkeletonRows rows={5} columns={4} />
              ) : isError ? (
                <RetryState
                  className="px-4 py-8"
                  message={error instanceof Error ? error.message : t('error.load', '加载失败')}
                  onRetry={() => refetch()}
                  retryAriaLabel={t('dashboard.action.retry', '重试加载总览')}
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
            <CardHead
              title={<h2 className="flex items-center gap-2 text-[13px] font-semibold text-1"><BookOpen size={14} /> 开始学习</h2>}
              subtitle="教程下沉为辅助入口，主工作台优先呈现运行状态。"
            />
            <CardBody className="!p-0">
              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {learningModules.map((item) => (
                  <LearningRow key={item.href} item={item} compact />
                ))}
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
  const trendIcon = trend != null && trend < 0 ? TrendingDown : TrendingUp
  const TrendIcon = trendIcon
  const trendTone =
    trend == null ? undefined : trend < 0 ? 'var(--danger)' : trend > 0 ? 'var(--success)' : 'var(--text-3)'
  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between text-3">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
            <Icon size={12} />
            {label}
          </div>
          {trend != null ? (
            <div className="flex items-center gap-1 text-[11px]" style={{ color: trendTone }}>
              <TrendIcon size={11} />
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

interface LearningRowProps {
  item: {
    title: string
    subtitle: string
    href: string
    icon: LucideIcon
    level: string
    tone: string
  }
  compact?: boolean
}

function LearningRow({ item, compact = false }: LearningRowProps) {
  const Icon = item.icon
  return (
    <a
      href={item.href}
      className={`group flex items-center gap-3 border-b px-4 transition-colors last:border-b-0 hover:bg-[color:var(--bg-hover)] ${compact ? 'py-3' : 'py-4'}`}
      style={{ borderColor: 'var(--border)' }}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white"
        style={{ background: item.tone }}
        aria-hidden
      >
        <Icon size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[13px] font-semibold text-1">{item.title}</span>
          <Chip tone="neutral" className="shrink-0">{item.level}</Chip>
        </span>
        <span className="mt-1 block truncate text-[12px] text-3">{item.subtitle}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2 text-[11px] text-3">
        教程
        <ArrowUpRight size={12} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </span>
    </a>
  )
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const Icon = item.icon
  const StatusIcon = toneIcon[item.tone]
  const toneStyle = attentionToneStyle[item.tone]
  return (
    <Link
      to={item.href}
      className="group flex items-center gap-3 border-b px-4 py-3 transition-colors last:border-b-0 hover:bg-[color:var(--bg-hover)]"
      style={{ borderColor: 'var(--border)' }}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
        style={toneStyle}
        aria-hidden
      >
        <Icon size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[13px] font-semibold text-1">{item.label}</span>
          <Chip tone={item.tone} className="shrink-0">
            <StatusIcon size={10} /> {item.status}
          </Chip>
        </span>
        <span className="mt-1 block truncate text-[12px] text-3">{item.description}</span>
      </span>
      <span className="flex min-w-[72px] shrink-0 items-center justify-end gap-2 text-right">
        <span className="font-mono text-[13px] font-semibold text-1">{item.value}</span>
        <ArrowUpRight size={12} className="text-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </span>
    </Link>
  )
}

interface HealthBarProps {
  label: string
  value: number | null | undefined
  loading?: boolean
  emptyText?: string
}

function HealthBar({ label, value, loading, emptyText }: HealthBarProps) {
  const hasValue = value != null
  const pct = hasValue ? Math.max(0, Math.min(100, normalizePercent(value))) : 0
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
      {!loading && !hasValue && emptyText ? (
        <div className="mt-1 text-[11px] text-3">{emptyText}</div>
      ) : null}
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
