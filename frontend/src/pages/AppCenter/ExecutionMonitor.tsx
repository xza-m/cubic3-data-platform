/**
 * 执行监控页面
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TrendingUp, Clock, CheckCircle, XCircle, Activity } from 'lucide-react'
import { FormSelect, FormRangePicker, PageCard, Statistic } from '@/components/business'
import ExecutionTable from '../../components/AppCenter/ExecutionTable'
import ExecutionDrawer from '../../components/AppCenter/ExecutionDrawer'
import {
  getExecutions,
  getExecutionStats,
  getApps,
  type AppExecution,
} from '../../api/appCenter'
import { EXECUTION_STATUSES } from '@/config/enums'

export default function ExecutionMonitor() {
  const [selectedExecution, setSelectedExecution] = useState<AppExecution | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  
  // 筛选状态
  const [filters, setFilters] = useState({
    appCode: undefined as string | undefined,
    status: undefined as string | undefined,
    startDate: undefined as string | undefined,
    endDate: undefined as string | undefined,
    page: 1,
    pageSize: 20,
  })

  // 获取应用列表（用于筛选）
  const { data: apps } = useQuery({
    queryKey: ['apps'],
    queryFn: () => getApps({ enabled_only: false }),
  })

  // 获取执行记录列表
  const { data: executionsData, isLoading: executionsLoading } = useQuery({
    queryKey: ['app-executions', filters],
    queryFn: () =>
      getExecutions({
        status: filters.status,
        start_date: filters.startDate,
        end_date: filters.endDate,
        page: filters.page,
        page_size: filters.pageSize,
      }),
    refetchInterval: 5000, // 每5秒刷新一次
  })

  // 获取统计信息
  const { data: stats } = useQuery({
    queryKey: ['execution-stats'],
    queryFn: () => getExecutionStats({ days: 7 }),
    refetchInterval: 10000, // 每10秒刷新一次
  })

  const handleViewDetail = (execution: AppExecution) => {
    setSelectedExecution(execution)
    setDrawerOpen(true)
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">应用执行监控</h1>
        <p className="mt-1 text-sm text-gray-500">实时监控应用实例的执行状态和日志</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <PageCard className="bg-white/70 backdrop-blur-xl border-white/20">
          <Statistic
            title="总执行次数"
            value={stats?.total_executions || 0}
            icon={<TrendingUp className="w-5 h-5 text-blue-500" />}
            valueClassName="text-blue-600"
          />
        </PageCard>
        <PageCard className="bg-white/70 backdrop-blur-xl border-white/20">
          <Statistic
            title="成功次数"
            value={stats?.success_count || 0}
            icon={<CheckCircle className="w-5 h-5 text-green-500" />}
            valueClassName="text-green-600"
          />
        </PageCard>
        <PageCard className="bg-white/70 backdrop-blur-xl border-white/20">
          <Statistic
            title="失败次数"
            value={stats?.failed_count || 0}
            icon={<XCircle className="w-5 h-5 text-red-500" />}
            valueClassName="text-red-600"
          />
        </PageCard>
        <PageCard className="bg-white/70 backdrop-blur-xl border-white/20">
          <Statistic
            title="平均耗时"
            value={stats?.avg_duration_ms ? (stats.avg_duration_ms / 1000).toFixed(2) : '0'}
            suffix="s"
            icon={<Clock className="w-5 h-5 text-orange-500" />}
            valueClassName="text-orange-600"
          />
        </PageCard>
      </div>

      {/* 筛选器 */}
      <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
          <FormSelect
            placeholder="筛选应用类型"
            value={filters.appCode}
            onChange={(value) => setFilters({ ...filters, appCode: value || undefined, page: 1 })}
            options={apps?.map((app) => ({ label: app.name, value: app.code })) || []}
            className="w-full"
          />

          <FormSelect
            placeholder="筛选执行状态"
            value={filters.status}
            onChange={(value) => setFilters({ ...filters, status: value || undefined, page: 1 })}
            options={EXECUTION_STATUSES.map(s => ({ label: s.label, value: s.value }))}
            className="w-full"
          />

          <FormRangePicker
            placeholder="选择日期范围"
            onChange={(range) => {
              if (range?.from && range?.to) {
                setFilters({
                  ...filters,
                  startDate: range.from.toISOString(),
                  endDate: range.to.toISOString(),
                  page: 1,
                })
              } else {
                setFilters({
                  ...filters,
                  startDate: undefined,
                  endDate: undefined,
                  page: 1,
                })
              }
            }}
            className="w-full"
          />

          <div className="flex items-center justify-center gap-2 h-10 px-4 bg-green-50 border border-green-200 rounded-lg">
            <Activity className="w-4 h-4 text-green-500 animate-pulse" />
            <span className="text-sm font-medium text-green-700">实时刷新中</span>
          </div>
        </div>
      </div>

      {/* 执行记录表格 */}
      <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">执行记录</h2>
        <ExecutionTable
          executions={executionsData?.items || []}
          loading={executionsLoading}
          total={executionsData?.total}
          page={filters.page}
          pageSize={filters.pageSize}
          onPageChange={(page, pageSize) => setFilters({ ...filters, page, pageSize })}
          onViewDetail={handleViewDetail}
        />
      </div>

      {/* 执行详情抽屉 */}
      <ExecutionDrawer
        open={drawerOpen}
        execution={selectedExecution}
        onClose={() => {
          setDrawerOpen(false)
          setSelectedExecution(null)
        }}
      />
    </div>
  )
}
