/**
 * Dashboard - 优化版本
 * 统一配色 + 增强交互反馈
 */
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Database,
  Table2,
  FileText,
  Activity,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Sparkles,
  Zap
} from 'lucide-react'
import { getDataSourceStatistics } from '../api/datasources'
import { getDatasetStatistics } from '../api/datasets'
import { getTasks } from '../api/extraction'

export default function Dashboard() {
  const navigate = useNavigate()

  const { data: datasourceStats } = useQuery({
    queryKey: ['datasources', 'statistics'],
    queryFn: getDataSourceStatistics
  })

  const { data: datasetStats } = useQuery({
    queryKey: ['datasets', 'statistics'],
    queryFn: getDatasetStatistics
  })

  const { data: recentTasks } = useQuery({
    queryKey: ['extraction', 'recent'],
    queryFn: () => getTasks({ page: 1, page_size: 5 })
  })

  // 统一使用主色系和辅助色
  const stats = [
    {
      label: '数据源',
      value: datasourceStats?.data?.total || 0,
      icon: Database,
      gradient: 'from-indigo-500 to-indigo-600',
      bgColor: 'bg-indigo-50',
      iconBg: 'bg-gradient-to-br from-indigo-500 to-indigo-600',
      change: '+12%'
    },
    {
      label: '数据集',
      value: datasetStats?.data?.total || 0,
      icon: Table2,
      gradient: 'from-emerald-500 to-emerald-600',
      bgColor: 'bg-emerald-50',
      iconBg: 'bg-gradient-to-br from-emerald-500 to-emerald-600',
      change: '+8%'
    },
    {
      label: '提取任务',
      value: recentTasks?.data?.total || 0,
      icon: FileText,
      gradient: 'from-indigo-600 to-purple-600',
      bgColor: 'bg-indigo-50',
      iconBg: 'bg-gradient-to-br from-indigo-600 to-purple-600',
      change: '+24%'
    },
    {
      label: '活跃连接',
      value: datasourceStats?.data?.active || 0,
      icon: Activity,
      gradient: 'from-amber-500 to-amber-600',
      bgColor: 'bg-amber-50',
      iconBg: 'bg-gradient-to-br from-amber-500 to-amber-600',
      change: '100%'
    }
  ]

  const quickActions = [
    {
      title: '创建数据源',
      description: '连接新的数据库或数据仓库',
      icon: Database,
      gradient: 'from-indigo-500 to-indigo-600',
      path: '/data-center/datasources'
    },
    {
      title: '注册数据集',
      description: '从已连接的数据源注册表',
      icon: Table2,
      gradient: 'from-emerald-500 to-emerald-600',
      path: '/data-center/datasets'
    },
    {
      title: '数据提取',
      description: '创建数据提取和导出任务',
      icon: FileText,
      gradient: 'from-indigo-600 to-purple-600',
      path: '/extraction'
    }
  ]

  const recentActivities = recentTasks?.data?.items || []

  return (
    <div className="space-y-8">
      {/* 优化后的欢迎区域 - 降低视觉干扰 */}
      <div className="relative overflow-hidden hero-gradient rounded-3xl p-8 text-white shadow-lg">
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-medium text-white/90">实时数据分析</span>
          </div>
          <h1 className="text-3xl font-bold mb-3">
            欢迎回来！
          </h1>
          <p className="text-white/85 max-w-2xl text-base leading-relaxed">
            CUBIC3 运行正常。您可以连接 Source、沉淀 Semantic，并编排 Application。
          </p>
        </div>

        {/* 优化装饰元素 - 更加柔和 */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-white/8 rounded-full blur-3xl -translate-y-1/3 translate-x-1/4"></div>
        <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-white/8 rounded-full blur-3xl translate-y-1/3"></div>
      </div>

      {/* 统计卡片 - 增强交互反馈 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => {
          const Icon = stat.icon
          return (
            <div
              key={index}
              className="group bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-xl hover:border-gray-200 transition-all duration-300 cursor-pointer hover:scale-[1.03]"
            >
              <div className="flex items-start justify-between mb-5">
                <div className={`w-14 h-14 rounded-xl ${stat.iconBg} flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
                  <Icon className="w-7 h-7 text-white" />
                </div>
                <div className="flex items-center gap-1.5 text-emerald-600 text-sm font-semibold bg-emerald-50 px-2.5 py-1 rounded-full">
                  <TrendingUp className="w-3.5 h-3.5" />
                  {stat.change}
                </div>
              </div>

              <div className="stat-value mb-1.5">
                {stat.value}
              </div>
              <div className="stat-label">
                {stat.label}
              </div>
            </div>
          )
        })}
      </div>

      {/* 快速操作 - 增强悬浮效果 */}
      <div>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
            <Zap className="w-5 h-5 text-indigo-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">快速开始</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {quickActions.map((action, index) => {
            const Icon = action.icon
            return (
              <button
                key={index}
                onClick={() => navigate(action.path)}
                className="group bg-white rounded-2xl p-7 border border-gray-100 shadow-sm hover:shadow-xl hover:border-gray-200 text-left transition-all duration-300 hover:scale-[1.02]"
              >
                <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${action.gradient} flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 group-hover:-translate-y-1 transition-all duration-300`}>
                  <Icon className="w-8 h-8 text-white" />
                </div>

                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  {action.title}
                </h3>
                <p className="text-gray-500 text-sm mb-5 leading-relaxed">
                  {action.description}
                </p>

                <div className="flex items-center gap-2 text-indigo-600 font-semibold text-sm group-hover:gap-3 transition-all">
                  <span>立即开始</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* 最近活动 */}
      <div>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
            <Clock className="w-5 h-5 text-purple-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">最近活动</h2>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {recentActivities.length === 0 ? (
            <div className="text-center py-20 px-6">
              <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-6">
                <FileText className="w-10 h-10 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">暂无活动记录</h3>
              <p className="text-gray-500 mb-6 max-w-sm mx-auto">
                开始创建数据提取任务，所有活动将会显示在这里
              </p>
              <button
                onClick={() => navigate('/extraction')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 active:scale-[0.98] transition-all duration-200 cursor-pointer shadow-md"
              >
                创建第一个任务
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {recentActivities.map((task, index: number) => {
                const isEnabled = task.is_enabled ?? task.is_active
                return (
                <div
                  key={task.id}
                  className="flex items-center gap-5 p-6 hover:bg-gray-50 transition-colors cursor-pointer group"
                >
                  <div className={`
                    w-12 h-12 rounded-xl flex items-center justify-center transition-all
                    ${isEnabled
                      ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/25'
                      : 'bg-gray-200'}
                  `}>
                    {isEnabled ? (
                      <CheckCircle className="w-6 h-6 text-white" />
                    ) : (
                      <AlertCircle className="w-6 h-6 text-gray-400" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 truncate text-base">{task.task_name}</div>
                    <div className="text-sm text-gray-500 mt-0.5">
                      数据集 ID: {task.dataset_id} · 类型: {task.task_type || 'manual'}
                    </div>
                  </div>

                  <div className="text-sm text-gray-400 group-hover:text-gray-600 transition-colors">
                    {index === 0 ? '刚刚' : `${index}h前`}
                  </div>
                </div>
              )})}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
