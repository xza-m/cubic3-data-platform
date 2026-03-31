/**
 * 执行记录列表表格
 */
import { Eye } from 'lucide-react'
import { format } from 'date-fns'
import { DataTable, type DataTableColumn, FormButton } from '@/components/business'
import type { AppExecution } from '../../api/appCenter'

interface ExecutionTableProps {
  executions: AppExecution[]
  loading?: boolean
  total?: number
  page?: number
  pageSize?: number
  onPageChange?: (page: number, pageSize: number) => void
  onViewDetail?: (execution: AppExecution) => void
}

export default function ExecutionTable({
  executions,
  loading,
  total,
  page = 1,
  pageSize = 20,
  onPageChange,
  onViewDetail,
}: ExecutionTableProps) {
  const columns: DataTableColumn<AppExecution>[] = [
    {
      key: 'instance_name',
      title: '实例名称',
      width: 180,
      render: (_, record) => (
        <div className="text-[0.9375rem] font-semibold leading-6 text-gray-900">
          {record.instance_name || `实例 #${record.instance_id}`}
        </div>
      ),
    },
    {
      key: 'trigger_type',
      title: '触发类型',
      width: 100,
      render: (_, record) => {
        const typeMap = {
          scheduled: '定时',
          manual: '手动',
          event: '事件',
        }
        return <span className="text-[0.875rem] leading-5 text-gray-600">{typeMap[record.trigger_type as keyof typeof typeMap] || record.trigger_type}</span>
      },
    },
    {
      key: 'status',
      title: '执行状态',
      width: 100,
      render: (_, record) => {
        const statusMap = {
          pending: { text: '等待中', className: 'text-slate-500' },
          running: { text: '运行中', className: 'text-blue-600' },
          success: { text: '成功', className: 'text-emerald-600' },
          failed: { text: '失败', className: 'text-red-500' },
        }
        const config = statusMap[record.status as keyof typeof statusMap] || { text: record.status, className: 'text-slate-500' }
        return <span className={`text-[0.875rem] font-medium ${config.className}`}>{config.text}</span>
      },
    },
    {
      key: 'started_at',
      title: '开始时间',
      width: 180,
      render: (_, record) =>
        record.started_at ? (
          <span className="text-[0.875rem] leading-5 text-gray-600 [font-variant-numeric:tabular-nums]">
            {format(new Date(record.started_at), 'yyyy-MM-dd HH:mm:ss')}
          </span>
        ) : (
          <span className="text-[0.8125rem] leading-5 text-gray-400">-</span>
        ),
    },
    {
      key: 'duration_ms',
      title: '耗时',
      width: 100,
      render: (_, record) => {
        if (!record.duration_ms) return <span className="text-[0.8125rem] leading-5 text-gray-400">-</span>
        const seconds = (record.duration_ms / 1000).toFixed(2)
        return <span className="text-[0.875rem] leading-5 text-gray-600 [font-variant-numeric:tabular-nums]">{seconds}s</span>
      },
    },
    {
      key: 'actions',
      title: '操作',
      width: 100,
      render: (_, record) => (
        <FormButton
          variant="ghost"
          size="sm"
          icon={<Eye className="w-4 h-4" />}
          onClick={() => onViewDetail?.(record)}
        >
          查看
        </FormButton>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      data={executions}
      loading={loading}
      pagination={
        total
          ? {
              current: page,
              pageSize,
              total,
              onChange: onPageChange,
              pageSizeOptions: [10, 20, 50],
            }
          : undefined
      }
      onRow={(record) => ({
        onClick: () => onViewDetail?.(record),
      })}
    />
  )
}
