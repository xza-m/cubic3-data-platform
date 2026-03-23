/**
 * 应用实例列表表格
 */
import { useState } from 'react'
import { PlayCircle, Edit, Trash2, Clock } from 'lucide-react'
import { AxiosError } from 'axios'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { DataTable, type DataTableColumn, Badge, FormButton, Switch, useToast } from '@/components/business'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { AppInstance } from '../../api/appCenter'
import { enableInstance, disableInstance, deleteInstance, executeInstance } from '../../api/appCenter'

interface InstanceTableProps {
  instances: AppInstance[]
  loading?: boolean
  total?: number
  page?: number
  pageSize?: number
  onPageChange?: (page: number, pageSize: number) => void
  onEdit?: (instance: AppInstance) => void
}

export default function InstanceTable({
  instances,
  loading,
  total,
  page = 1,
  pageSize = 20,
  onPageChange,
  onEdit,
}: InstanceTableProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [instanceToDelete, setInstanceToDelete] = useState<AppInstance | null>(null)

  // 启用/禁用实例
  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => {
      return enabled ? disableInstance(id) : enableInstance(id)
    },
    onSuccess: () => {
      toast({ title: "操作成功", variant: "default" })
      queryClient.invalidateQueries({ queryKey: ['app-instances'] })
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      toast({ 
        title: "操作失败", 
        description: error.response?.data?.message || '操作失败',
        variant: "destructive" 
      })
    },
  })

  // 删除实例
  const deleteMutation = useMutation({
    mutationFn: deleteInstance,
    onSuccess: () => {
      toast({ title: "删除成功" })
      queryClient.invalidateQueries({ queryKey: ['app-instances'] })
      setDeleteDialogOpen(false)
      setInstanceToDelete(null)
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      toast({ 
        title: "删除失败", 
        description: error.response?.data?.message || '删除失败',
        variant: "destructive" 
      })
    },
  })

  // 手动执行
  const executeMutation = useMutation({
    mutationFn: executeInstance,
    onSuccess: (data) => {
      toast({ 
        title: "执行已提交", 
        description: `执行ID: ${data.execution_id}` 
      })
      queryClient.invalidateQueries({ queryKey: ['app-executions'] })
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      toast({ 
        title: "执行失败", 
        description: error.response?.data?.message || '执行失败',
        variant: "destructive" 
      })
    },
  })

  const handleDeleteClick = (instance: AppInstance) => {
    setInstanceToDelete(instance)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = () => {
    if (instanceToDelete) {
      deleteMutation.mutate(instanceToDelete.id)
    }
  }

  const columns: DataTableColumn<AppInstance>[] = [
    {
      key: 'name',
      title: '实例名称',
      width: 200,
      render: (_, record) => (
        <div>
          <div className="font-medium text-gray-900">{record.name}</div>
          {record.description && (
            <div className="text-xs text-gray-500 mt-1">{record.description}</div>
          )}
        </div>
      ),
    },
    {
      key: 'app_name',
      title: '应用类型',
      dataIndex: 'app_name',
      width: 150,
    },
    {
      key: 'schedule_type',
      title: '调度类型',
      width: 120,
      render: (_, record) => {
        const typeMap = {
          cron: { text: '定时', variant: 'default' as const },
          event: { text: '事件', variant: 'secondary' as const },
          manual: { text: '手动', variant: 'outline' as const },
        }
        const config = typeMap[record.schedule_type as keyof typeof typeMap] || { text: record.schedule_type, variant: 'outline' as const }
        return <Badge variant={config.variant}>{config.text}</Badge>
      },
    },
    {
      key: 'next_execution_at',
      title: '下次执行',
      width: 180,
      render: (_, record) =>
        record.next_execution_at ? (
          <div className="flex items-center gap-1 text-gray-600">
            <Clock className="w-3 h-3" />
            <span className="text-xs">{format(new Date(record.next_execution_at), 'yyyy-MM-dd HH:mm')}</span>
          </div>
        ) : (
          <span className="text-xs text-gray-400">-</span>
        ),
    },
    {
      key: 'success_rate',
      title: '成功率',
      width: 100,
      render: (_, record) =>
        record.success_rate !== undefined ? (
          <span className={record.success_rate >= 80 ? 'text-green-600' : record.success_rate >= 50 ? 'text-yellow-600' : 'text-red-600'}>
            {record.success_rate.toFixed(1)}%
          </span>
        ) : (
          <span className="text-xs text-gray-400">-</span>
        ),
    },
    {
      key: 'enabled',
      title: '状态',
      width: 80,
      render: (_, record) => (
        <Switch
          checked={record.enabled}
          disabled={toggleMutation.isPending}
          onCheckedChange={() => toggleMutation.mutate({ id: record.id, enabled: record.enabled })}
        />
      ),
    },
    {
      key: 'actions',
      title: '操作',
      width: 200,
      render: (_, record) => (
        <div className="flex items-center gap-2">
          <FormButton
            variant="ghost"
            size="sm"
            icon={<PlayCircle className="w-4 h-4" />}
            onClick={() => executeMutation.mutate(record.id)}
            loading={executeMutation.isPending}
            disabled={!record.enabled}
          >
            执行
          </FormButton>
          <FormButton
            variant="ghost"
            size="sm"
            icon={<Edit className="w-4 h-4" />}
            onClick={() => onEdit?.(record)}
          >
            编辑
          </FormButton>
          <FormButton
            variant="ghost"
            size="sm"
            icon={<Trash2 className="w-4 h-4" />}
            onClick={() => handleDeleteClick(record)}
            loading={deleteMutation.isPending}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            删除
          </FormButton>
        </div>
      ),
    },
  ]

  return (
    <>
      <DataTable
        columns={columns}
        data={instances}
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
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              删除后无法恢复，确定要删除实例 "{instanceToDelete?.name}" 吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>确定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
