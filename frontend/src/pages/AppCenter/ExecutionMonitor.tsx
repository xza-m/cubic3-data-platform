/**
 * 执行监控页面 - 匹配 uiv2.pen 设计稿 (TkCp1)
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import ExecutionTable from '../../components/AppCenter/ExecutionTable'
import ExecutionDrawer from '../../components/AppCenter/ExecutionDrawer'
import {
  getExecutions,
  getExecutionStats,
  getApps,
  type AppExecution,
} from '../../api/appCenter'
import { EXECUTION_STATUSES } from '@/config/enums'
import { FormRangeDatePicker } from '@/components/business'

export default function ExecutionMonitor() {
  const [selectedExecution, setSelectedExecution] = useState<AppExecution | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange | undefined>()

  const [filters, setFilters] = useState({
    appCode: undefined as string | undefined,
    status: undefined as string | undefined,
    startDate: undefined as string | undefined,
    endDate: undefined as string | undefined,
    page: 1,
    pageSize: 10,
  })

  const { data: apps } = useQuery({
    queryKey: ['apps'],
    queryFn: () => getApps({ enabled_only: false }),
  })

  const { data: executionsData, isLoading: executionsLoading } = useQuery({
    queryKey: ['app-executions', filters],
    queryFn: () =>
      getExecutions({
        app_code: filters.appCode,
        status: filters.status,
        start_date: filters.startDate,
        end_date: filters.endDate,
        page: filters.page,
        page_size: filters.pageSize,
      }),
    refetchInterval: 5000,
  })

  const { data: stats } = useQuery({
    queryKey: ['execution-stats'],
    queryFn: () => getExecutionStats({ days: 7 }),
    refetchInterval: 10000,
  })

  const handleViewDetail = (execution: AppExecution) => {
    setSelectedExecution(execution)
    setDrawerOpen(true)
  }

  const statCards = [
    { value: stats?.total_executions || 0, label: '总执行次数', color: 'text-slate-900' },
    { value: stats?.success_count || 0, label: '成功次数', color: 'text-emerald-500' },
    { value: stats?.failed_count || 0, label: '失败次数', color: 'text-red-500' },
    { value: stats?.avg_duration_ms ? `${(stats.avg_duration_ms / 1000).toFixed(2)}s` : '0s', label: '平均耗时', color: 'text-slate-900' },
  ]

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-y-auto px-10 pb-24 pt-8">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold text-slate-900">应用执行监控</h1>
          <p className="text-sm text-slate-500">查看实例执行状态、耗时和运行日志</p>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="flex gap-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="relative flex flex-1 flex-col gap-2 overflow-hidden rounded-xl bg-white p-5 shadow-[0_4px_20px_rgba(15,23,42,0.03)]"
          >
            <div className="absolute left-0 top-0 h-full w-1 rounded-l-xl bg-gradient-to-b from-blue-600 to-indigo-500" />
            <span className={`text-[28px] font-semibold ${card.color}`}>{card.value}</span>
            <span className="text-[13px] text-slate-500">{card.label}</span>
          </div>
        ))}
      </div>

      {/* 筛选器 */}
      <div className="flex items-center gap-3">
        <FilterPill
          label="筛选应用类型"
          value={filters.appCode}
          options={apps?.map((app) => ({ label: app.name, value: app.code })) || []}
          onChange={(v) => setFilters({ ...filters, appCode: v || undefined, page: 1 })}
        />
        <FilterPill
          label="筛选执行状态"
          value={filters.status}
          options={EXECUTION_STATUSES.map(s => ({ label: s.label, value: s.value }))}
          onChange={(v) => setFilters({ ...filters, status: v || undefined, page: 1 })}
        />
        <div className="w-[280px]">
          <FormRangeDatePicker
            value={dateRange}
            onChange={(range) => {
              setDateRange(range)
              setFilters({
                ...filters,
                startDate: range?.from ? range.from.toISOString().slice(0, 10) : undefined,
                endDate: range?.to ? range.to.toISOString().slice(0, 10) : undefined,
                page: 1,
              })
            }}
            placeholder="选择日期范围"
            className="justify-between rounded-lg border-0 bg-slate-100 text-[13px] text-slate-500 shadow-none"
          />
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-2.5">
          <Activity className="h-3.5 w-3.5 text-blue-600" />
          <span className="text-[13px] font-medium text-blue-600">实时刷新中</span>
        </div>
      </div>

      {/* 执行记录表格 */}
      <div className="min-h-0 flex-1">
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

function FilterPill({ label, value, options, onChange }: {
  label: string
  value?: string
  options: { label: string; value: string }[]
  onChange: (v: string) => void
}) {
  return (
    <select
      className="flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-2.5 text-[13px] text-slate-500 outline-none"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{label}</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  )
}
