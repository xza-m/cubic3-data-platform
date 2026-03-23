import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Activity,
  ArrowRight,
  Clock3,
  Database,
  FileText,
  Table2,
} from 'lucide-react'
import { getDataSourceStatistics } from '../api/datasources'
import { getDatasetStatistics } from '../api/datasets'
import { getTasks } from '../api/extraction'

function formatRelativeLabel(index: number) {
  if (index === 0) return '刚刚'
  if (index === 1) return '1 小时内'
  return `${index} 小时前`
}

export default function Dashboard() {
  const navigate = useNavigate()

  const { data: datasourceStats } = useQuery({
    queryKey: ['datasources', 'statistics'],
    queryFn: getDataSourceStatistics,
  })

  const { data: datasetStats } = useQuery({
    queryKey: ['datasets', 'statistics'],
    queryFn: getDatasetStatistics,
  })

  const { data: recentTasks } = useQuery({
    queryKey: ['extraction', 'recent'],
    queryFn: () => getTasks({ page: 1, page_size: 5 }),
  })

  const summaryItems = [
    {
      label: '数据源',
      value: datasourceStats?.data?.total || 0,
      hint: `活跃连接 ${datasourceStats?.data?.active || 0}`,
      icon: Database,
      toneClassName: 'bg-[rgba(237,245,255,0.92)] text-sky-700',
    },
    {
      label: '数据集',
      value: datasetStats?.data?.total || 0,
      hint: '已注册对象',
      icon: Table2,
      toneClassName: 'bg-[rgba(237,250,242,0.92)] text-emerald-700',
    },
    {
      label: '提取任务',
      value: recentTasks?.data?.total || 0,
      hint: '最近执行记录',
      icon: FileText,
      toneClassName: 'bg-[rgba(244,240,255,0.92)] text-violet-700',
    },
    {
      label: '系统状态',
      value: '正常',
      hint: '队列与接口可用',
      icon: Activity,
      toneClassName: 'bg-[rgba(255,247,237,0.92)] text-amber-700',
    },
  ]

  const quickActions = [
    {
      title: '连接数据源',
      description: '新增数据库或数仓连接，并确认接入状态。',
      path: '/data-center/datasources',
    },
    {
      title: '注册数据集',
      description: '从已连接来源选择表对象，继续下游建模。',
      path: '/data-center/datasets',
    },
    {
      title: '查看提取任务',
      description: '检查最近执行结果，处理失败和待继续任务。',
      path: '/extraction',
    },
  ]

  const recentActivities = recentTasks?.data?.items || []

  return (
    <div className="space-y-6">
      <section className="rounded-[1.75rem] border border-slate-200/90 bg-[rgba(255,255,255,0.9)] px-6 py-6 shadow-[0_16px_40px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              <span className="h-2 w-2 rounded-full bg-sky-500" />
              Control Center
            </div>
            <div className="space-y-2">
              <h1 className="text-[2rem] font-semibold tracking-[-0.04em] text-slate-900">控制台</h1>
              <p className="max-w-3xl text-sm leading-6 text-slate-600">
                查看平台连接、数据集和提取执行状态。当前页只保留运行概况、下一步动作和最近活动，不再叠加营销化模块。
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
              系统运行正常
            </div>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-600">
              最近任务 {recentActivities.length} 条
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
        <section className="rounded-[1.75rem] border border-slate-200/90 bg-[rgba(255,255,255,0.92)] shadow-[0_14px_34px_rgba(15,23,42,0.035)]">
          <div className="border-b border-slate-200/90 px-6 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Platform Summary</div>
            <div className="mt-2 text-lg font-semibold text-slate-900">平台概览</div>
          </div>
          <div className="grid gap-px bg-slate-200/80 sm:grid-cols-2 xl:grid-cols-4">
            {summaryItems.map((item) => {
              const Icon = item.icon
              return (
                <div key={item.label} className="space-y-4 bg-white px-5 py-5">
                  <div className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${item.toneClassName}`}>
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{item.label}</div>
                    <div className="text-[2rem] font-semibold tracking-[-0.05em] text-slate-900">{item.value}</div>
                    <div className="text-sm text-slate-500">{item.hint}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-slate-200/90 bg-[rgba(248,250,252,0.94)] p-5 shadow-[0_14px_34px_rgba(15,23,42,0.03)]">
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Next</div>
            <div className="text-lg font-semibold text-slate-900">下一步动作</div>
            <p className="text-sm leading-6 text-slate-600">按频率和影响排序，先完成接入，再进入数据治理和执行检查。</p>
          </div>
          <div className="mt-5 space-y-3">
            {quickActions.map((action) => (
              <button
                key={action.title}
                type="button"
                onClick={() => navigate(action.path)}
                className="w-full rounded-[1.25rem] border border-slate-200 bg-white px-4 py-4 text-left transition-colors hover:border-slate-300 hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="font-semibold text-slate-900">{action.title}</div>
                    <div className="text-sm leading-6 text-slate-500">{action.description}</div>
                  </div>
                  <ArrowRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-[1.75rem] border border-slate-200/90 bg-[rgba(255,255,255,0.92)] shadow-[0_14px_34px_rgba(15,23,42,0.035)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/90 px-6 py-4">
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Recent Activity</div>
            <div className="text-lg font-semibold text-slate-900">最近活动</div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/extraction')}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-white hover:text-slate-900"
          >
            查看全部任务
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
        {recentActivities.length === 0 ? (
          <div className="px-6 py-12">
            <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400">
                <Clock3 className="h-6 w-6" />
              </div>
              <div className="mt-4 text-lg font-semibold text-slate-900">暂无活动记录</div>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                还没有最近执行结果。你可以先创建数据提取任务，或检查已有数据源和数据集是否已经准备好。
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentActivities.map((task, index: number) => {
              const isEnabled = task.is_enabled ?? task.is_active
              return (
                <div key={task.id} className="flex flex-wrap items-start gap-4 px-6 py-5">
                  <div className={`mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-2xl ${
                    isEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {isEnabled ? <Activity className="h-4.5 w-4.5" /> : <Clock3 className="h-4.5 w-4.5" />}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="font-semibold text-slate-900">{task.task_name}</div>
                    <div className="text-sm text-slate-500">
                      数据集 ID: {task.dataset_id} · 类型: {task.task_type || 'manual'}
                    </div>
                  </div>
                  <div className="text-sm font-medium text-slate-400">{formatRelativeLabel(index)}</div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
