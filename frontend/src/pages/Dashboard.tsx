/**
 * Dashboard - 首页工作台
 * 基于 uiv2.pen 设计稿 (q0cE6) 生成
 */
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Database,
  Inbox,
  Search,
  Boxes,
  MessageSquare,
  FilePlus,
  Bot,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { getDashboardOverview, type DashboardOverviewRecentQuery } from '../api/dashboard'

/* ---------- types ---------- */

interface StatCard {
  label: string
  value: string | null
  trend: string | null
  trendFallback?: string | null
  icon: LucideIcon
  iconColor: string
  iconBg: string
}

interface QuickAction {
  label: string
  icon: LucideIcon
  iconColor: string
  iconBg: string
  path: string
}

interface QueryItem {
  name: string
  tag: string
  time: string
  status: '成功' | '运行中' | '失败'
}

interface HealthItem {
  label: string
  value: number | null
  color: string
  textColor: string
}

const quickActions: QuickAction[] = [
  { label: '打开查询工作台', icon: FilePlus, iconColor: 'text-[#2563EB]', iconBg: 'bg-[#EFF6FF]', path: '/queries' },
  { label: '打开语义工作台', icon: Boxes, iconColor: 'text-[#6366F1]', iconBg: 'bg-[#EEF2FF]', path: '/semantic/workbench' },
  { label: '导入数据源', icon: Database, iconColor: 'text-[#10B981]', iconBg: 'bg-[#ECFDF5]', path: '/data-center/datasources' },
  { label: '智能问数', icon: Bot, iconColor: 'text-[#6366F1]', iconBg: 'bg-[#EEF2FF]', path: '/data-chat' },
]

const statusStyles: Record<string, { text: string; bg: string }> = {
  '成功': { text: 'text-[#10B981]', bg: 'bg-[#ECFDF5]' },
  '运行中': { text: 'text-[#F59E0B]', bg: 'bg-[#FFF7ED]' },
  '失败': { text: 'text-[#EF4444]', bg: 'bg-[#FEF2F2]' },
}

const getRelativeTimeLabel = (value?: string) => {
  if (!value) return '刚刚'

  const target = new Date(value)
  if (Number.isNaN(target.getTime())) return '刚刚'

  const diff = Date.now() - target.getTime()
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`

  const days = Math.floor(diff / day)
  if (days === 1) return '昨天'
  if (days < 7) return `${days} 天前`

  const year = target.getFullYear()
  const currentYear = new Date().getFullYear()
  const month = target.getMonth() + 1
  const date = target.getDate()

  if (year === currentYear) {
    return `${month}月${date}日`
  }

  return `${year}年${month}月${date}日`
}

const getQueryStatusLabel = (status: DashboardOverviewRecentQuery['status']): QueryItem['status'] => {
  switch (status) {
    case 'success':
      return '成功'
    case 'failed':
    case 'timeout':
      return '失败'
    default:
      return '运行中'
  }
}

const getQueryTitle = (history: DashboardOverviewRecentQuery) => {
  const firstLine = history.name.split('\n')[0]?.trim() || '未命名查询'
  return firstLine.length > 32 ? `${firstLine.slice(0, 32)}...` : firstLine
}

const formatTrend = (value: number | null, suffix: string) => {
  if (value === null) return null
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${value} ${suffix}`
}

const formatWeekTrend = (value: number | null) => {
  if (value === null) return '近 7 日暂无数据'
  return `近 7 日 ${value}`
}

const formatStatValue = (value: number | null) => (value === null ? '--' : String(value))

const emptyOverview = {
  stats: {
    datasource_total: null,
    dataset_total: null,
    semantic_model_total: null,
    today_query_count: null,
    ai_chat_count: null,
  },
  recent_queries: [] as DashboardOverviewRecentQuery[],
  health: {
    datasource_connectivity: null,
    semantic_coverage: null,
    query_success_rate: null,
  },
  trends: {
    datasource_month_delta: null,
    dataset_week_delta: null,
    query_count_week: null,
  },
}

/* ---------- component ---------- */

export default function Dashboard() {
  const navigate = useNavigate()
  const {
    data: overview = emptyOverview,
    isError,
  } = useQuery({
    queryKey: ['dashboard', 'overview'],
    queryFn: getDashboardOverview,
    retry: false,
  })

  const recentQueries: QueryItem[] = (overview.recent_queries || []).slice(0, 5).map((history) => ({
    name: getQueryTitle(history),
    tag: history.datasource_name || '查询中心',
    time: getRelativeTimeLabel(history.executed_at || undefined),
    status: getQueryStatusLabel(history.status),
  }))

  const healthItems: HealthItem[] = [
    {
      label: '数据源连通性',
      value: overview.health.datasource_connectivity,
      color: 'bg-[#10B981]',
      textColor: 'text-[#10B981]',
    },
    {
      label: '模型覆盖率',
      value: overview.health.semantic_coverage,
      color: 'bg-[#2563EB]',
      textColor: 'text-[#2563EB]',
    },
    {
      label: '查询成功率',
      value: overview.health.query_success_rate,
      color: 'bg-[#10B981]',
      textColor: 'text-[#10B981]',
    },
  ]

  const stats: StatCard[] = [
    {
      label: '已接入数据源',
      value: formatStatValue(overview.stats.datasource_total),
      trend: formatTrend(overview.trends.datasource_month_delta, '本月'),
      trendFallback: '暂无趋势',
      icon: Database,
      iconColor: 'text-[#2563EB]',
      iconBg: 'bg-[#EFF6FF]',
    },
    {
      label: '今日查询',
      value: formatStatValue(overview.stats.today_query_count),
      trend: formatWeekTrend(overview.trends.query_count_week),
      icon: Search,
      iconColor: 'text-[#2563EB]',
      iconBg: 'bg-[#EFF6FF]',
    },
    {
      label: '语义模型',
      value: formatStatValue(overview.stats.semantic_model_total),
      trend: formatTrend(overview.trends.dataset_week_delta, '本周'),
      trendFallback: '暂无趋势',
      icon: Boxes,
      iconColor: 'text-[#6366F1]',
      iconBg: 'bg-[#EEF2FF]',
    },
    {
      label: 'AI 对话',
      value: formatStatValue(overview.stats.ai_chat_count),
      trend: null,
      trendFallback: '未接入',
      icon: MessageSquare,
      iconColor: 'text-[#6366F1]',
      iconBg: 'bg-[#EEF2FF]',
    },
  ]

  const visibleHealthItems = healthItems.filter((item) => item.value !== null)

  const today = new Date()
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日 ${weekDays[today.getDay()]}`

  return (
    <div className="flex flex-col gap-6 px-10 py-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-[#0F172A]">欢迎回来，数据工程师</h1>
          <p className="text-sm text-[#64748B]">
            {isError ? '工作台聚合接口异常，当前仅保留单一口径提示。' : '以下是您的工作台概览'}
          </p>
        </div>
        <span className="text-sm text-[#94A3B8]">{dateStr}</span>
      </div>

      {isError ? (
        <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-5 py-4 text-sm text-[#991B1B]">
          <p className="font-medium">工作台概览暂时不可用</p>
          <p className="mt-1 text-[#B91C1C]">请稍后刷新，当前页面不会再改用其他业务接口混算统计口径。</p>
        </div>
      ) : null}

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-5">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <div
              key={stat.label}
              className="rounded-xl bg-white p-6 shadow-[0_4px_20px_#0F172A08] flex flex-col gap-3"
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-[10px] ${stat.iconBg}`}>
                <Icon className={`h-5 w-5 ${stat.iconColor}`} />
              </div>
              <p className="text-sm text-[#64748B]">{stat.label}</p>
              <div className="flex min-h-[54px] items-end justify-between gap-3">
                <span className="text-[32px] font-semibold leading-tight text-[#0F172A]">{stat.value}</span>
                <span className={stat.trend ? 'pb-1 text-xs font-medium text-[#10B981]' : 'pb-1 text-xs text-[#94A3B8]'}>
                  {stat.trend || stat.trendFallback || '暂无趋势'}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Mid Row: Recent Queries + Data Health */}
      <div className="flex gap-5">
        {/* Left: Recent Queries */}
        <div className="flex-1 rounded-xl bg-white shadow-[0_2px_24px_#0F172A08]">
          <div className="flex items-center justify-between border-b border-[#F1F5F9] px-6 py-5">
            <span className="text-base font-semibold text-[#0F172A]">近期查询</span>
            <button
              type="button"
              onClick={() => navigate('/queries')}
              className="text-[13px] font-medium text-[#2563EB] hover:text-[#1D4ED8] cursor-pointer"
            >
              查看全部 &rarr;
            </button>
          </div>
          {recentQueries.length > 0 ? (
            recentQueries.map((q, i) => {
              const style = statusStyles[q.status]
              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 px-6 py-3.5 ${i < recentQueries.length - 1 ? 'border-b border-[#E2E8F0]' : ''}`}
                >
                  <span className="flex-1 truncate text-sm font-medium text-[#0F172A]">{q.name}</span>
                  <span className="shrink-0 rounded-full bg-[#EFF6FF] px-2 py-0.5 text-[11px] font-medium text-[#2563EB]">{q.tag}</span>
                  <span className="shrink-0 text-xs text-[#94A3B8]">{q.time}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${style.text} ${style.bg}`}>{q.status}</span>
                </div>
              )
            })
          ) : (
              <div className="flex min-h-[220px] flex-col items-center justify-center px-6 text-center">
              <Inbox className="h-10 w-10 text-[#CBD5E1]" />
              <p className="mt-3 text-sm font-medium text-[#0F172A]">暂无查询记录</p>
              <p className="mt-2 text-sm text-[#94A3B8]">当前统计周期内没有查询历史。</p>
            </div>
          )}
        </div>

        {/* Right: Data Health */}
        <div className="w-[340px] shrink-0 rounded-xl bg-white shadow-[0_2px_24px_#0F172A08]">
          <div className="border-b border-[#F1F5F9] px-6 py-5">
            <span className="text-base font-semibold text-[#0F172A]">数据健康</span>
          </div>
          {visibleHealthItems.length > 0 ? (
            visibleHealthItems.map((h, i, list) => (
                <div
                  key={h.label}
                  className={`flex flex-col gap-2.5 px-6 py-4 ${i < list.length - 1 ? 'border-b border-[#E2E8F0]' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[#0F172A]">{h.label}</span>
                    <span className={`text-sm font-semibold ${h.textColor}`}>
                      {h.value === null ? '' : `${Number.isInteger(h.value) ? h.value : h.value.toFixed(1)}%`}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[#E2E8F0]">
                    <div
                      className={`h-1.5 rounded-full ${h.color}`}
                      style={{ width: `${Math.max(0, Math.min(100, h.value ?? 0))}%` }}
                    />
                  </div>
                </div>
              ))
          ) : (
            <div className="flex min-h-[220px] flex-col items-center justify-center rounded-b-xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] text-center">
              <Inbox className="h-10 w-10 text-[#CBD5E1]" />
              <p className="mt-3 text-sm font-medium text-[#0F172A]">暂无健康指标</p>
              <p className="mt-2 max-w-[220px] text-sm leading-6 text-[#94A3B8]">
                至少需要后端返回一个非 null 指标后才会展示健康概览。
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-col gap-4">
        <h2 className="text-base font-semibold text-[#0F172A]">快捷操作</h2>
        <div className="grid grid-cols-4 gap-4">
          {quickActions.map((action) => {
            const Icon = action.icon
            return (
              <button
                key={action.label}
                type="button"
                onClick={() => navigate(action.path)}
                className="flex flex-col items-center gap-3 rounded-xl bg-white p-6 shadow-[0_4px_20px_#0F172A08] transition-shadow hover:shadow-[0_4px_20px_#0F172A14] cursor-pointer"
              >
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${action.iconBg}`}>
                  <Icon className={`h-6 w-6 ${action.iconColor}`} />
                </div>
                <span className="text-sm font-medium text-[#0F172A]">{action.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
