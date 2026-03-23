/**
 * 执行记录列表表格
 */
import { Eye } from 'lucide-react'
import { format } from 'date-fns'
import { DataTable, type DataTableColumn, Badge, FormButton } from '@/components/business'
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
        <div>
          <div className="font-medium text-gray-900">{record.instance_name || `实例 #${record.instance_id}`}</div>
          {record.app_name && <div className="text-xs text-gray-500 mt-1">{record.app_name}</div>}
        </div>
      ),
    },
    {
      key: 'trigger_type',
      title: '触发类型',
      width: 100,
      render: (_, record) => {
        const typeMap = {
          scheduled: { text: '定时', variant: 'default' as const },
          manual: { text: '手动', variant: 'secondary' as const },
          event: { text: '事件', variant: 'default' as const },
        }
        const config = typeMap[record.trigger_type as keyof typeof typeMap] || { text: record.trigger_type, variant: 'outline' as const }
        return <Badge variant={config.variant}>{config.text}</Badge>
      },
    },
    {
      key: 'status',
      title: '执行状态',
      width: 100,
      render: (_, record) => {
        const statusMap = {
          pending: { text: '等待中', variant: 'outline' as const },
          running: { text: '运行中', variant: 'default' as const },
          success: { text: '成功', variant: 'secondary' as const },
          failed: { text: '失败', variant: 'destructive' as const },
        }
        const config = statusMap[record.status as keyof typeof statusMap] || { text: record.status, variant: 'outline' as const }
        return <Badge variant={config.variant}>{config.text}</Badge>
      },
    },
    {
      key: 'started_at',
      title: '开始时间',
      width: 180,
      render: (_, record) =>
        record.started_at ? (
          <span className="text-sm text-gray-600">{format(new Date(record.started_at), 'yyyy-MM-dd HH:mm:ss')}</span>
        ) : (
          <span className="text-xs text-gray-400">-</span>
        ),
    },
    {
      key: 'ended_at',
      title: '结束时间',
      width: 180,
      render: (_, record) =>
        record.ended_at ? (
          <span className="text-sm text-gray-600">{format(new Date(record.ended_at), 'yyyy-MM-dd HH:mm:ss')}</span>
        ) : (
          <span className="text-xs text-gray-400">-</span>
        ),
    },
    {
      key: 'duration_ms',
      title: '耗时',
      width: 100,
      render: (_, record) => {
        if (!record.duration_ms) return <span className="text-xs text-gray-400">-</span>
        const seconds = (record.duration_ms / 1000).toFixed(2)
        return <span className="text-sm text-gray-600">{seconds}s</span>
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
            }
          : undefined
      }
      onRow={(record) => ({
        onClick: () => onViewDetail?.(record),
      })}
    />
  )
}
