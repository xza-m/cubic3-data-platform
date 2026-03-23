/**
 * DatasetDetail - Migrated to shadcn/ui
 */
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Table2, Database, Calendar, User, CheckCircle, Clock, AlertCircle, FileText, Hash, Type, Tag, Edit2, Save, X, RefreshCw, Loader2, Inbox } from 'lucide-react'
import { getDataset, updateDataset, type UpdateDatasetRequest } from '@/api/datasets'
import { FormButton, DataTable, Badge, useToast, Skeleton } from '@/components/business'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { DataTableColumn } from '@/components/business/DataTable'
import type { BadgeProps } from '@/components/ui/badge'

interface DatasetField {
  id: number
  physical_name: string
  data_type: string
  display_name?: string
  business_type: string
  sensitivity_level: string
  comment?: string
  field_order: number
}

const toDisplayText = (value: unknown) => {
  if (value === null || value === undefined || value === '') {
    return '-'
  }
  return String(value)
}

export default function DatasetDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({ dataset_name: '', description: '', owner: '' })

  const { data: datasetRes, isLoading } = useQuery({
    queryKey: ['dataset', id],
    queryFn: () => getDataset(Number(id), true),
    enabled: !!id
  })

  const dataset = datasetRes?.data || null
  const fields = (dataset?.fields || []) as DatasetField[]

  const updateMutation = useMutation({
    mutationFn: (data: UpdateDatasetRequest) => updateDataset(Number(id), data),
    onSuccess: async (response) => {
      toast({ title: '保存成功', description: '数据集信息已更新' })
      
      // 手动更新缓存数据，确保页面立即显示最新内容
      if (response?.data) {
        queryClient.setQueryData(['dataset', id], response)
      }
      
      // 同时刷新列表
      queryClient.invalidateQueries({ queryKey: ['datasets'] })
      
      // 等待数据更新后再退出编辑模式
      await queryClient.refetchQueries({ queryKey: ['dataset', id] })
      setIsEditing(false)
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } }; message?: string }
      const errorMessage = err.response?.data?.message || err.message || '未知错误'
      toast({ 
        title: '保存失败', 
        description: errorMessage,
        variant: 'destructive' 
      })
    }
  })

  const handleSave = () => {
    if (!formData.dataset_name) {
      toast({ title: '请输入数据集名称', variant: 'destructive' })
      return
    }
    updateMutation.mutate(formData)
  }

  const handleEdit = () => {
    setFormData({
      dataset_name: dataset?.dataset_name || '',
      description: dataset?.description || '',
      owner: dataset?.owner || ''
    })
    setIsEditing(true)
  }

  const handleCancel = () => {
    setIsEditing(false)
    setFormData({ dataset_name: '', description: '', owner: '' })
  }

  const getSyncStatusConfig = (status: string) => {
    const config: Record<string, { color: string; label: string; icon: typeof CheckCircle; bg: string }> = {
      synced: { color: 'text-emerald-700', label: '已同步', icon: CheckCircle, bg: 'bg-emerald-50' },
      syncing: { color: 'text-blue-700', label: '同步中', icon: RefreshCw, bg: 'bg-blue-50' },
      failed: { color: 'text-red-700', label: '失败', icon: AlertCircle, bg: 'bg-red-50' }
    }
    return config[status] || { color: 'text-gray-600', label: status, icon: Clock, bg: 'bg-gray-100' }
  }

  // 业务类型中英文映射
  const BUSINESS_TYPE_LABELS: Record<string, string> = {
    partition: '分区键',
    dimension: '维度',
    metric: '度量',
    measure: '度量',  // 兼容旧数据
    partition_key: '分区键',  // 兼容旧数据
    date: '日期',
    id: 'ID'
  }

  // 敏感级别中英文映射
  const SENSITIVITY_LEVEL_LABELS: Record<string, string> = {
    public: '公开',
    internal: '内部',
    pii: '个人信息',
    confidential: '机密',
    secret: '秘密'
  }

  const getBusinessTypeBadge = (type: string) => {
    const variants: Record<string, BadgeProps['variant']> = {
      dimension: 'default',
      metric: 'success',
      measure: 'success',
      partition: 'secondary',
      partition_key: 'secondary',
      date: 'secondary',
      id: 'outline'
    }
    const label = BUSINESS_TYPE_LABELS[type] || type
    return <Badge variant={variants[type] || 'default'}>{label}</Badge>
  }

  const getSensitivityBadge = (level: string) => {
    const variants: Record<string, BadgeProps['variant']> = {
      public: 'success',
      internal: 'default',
      pii: 'outline',
      confidential: 'outline',
      secret: 'destructive'
    }
    const label = SENSITIVITY_LEVEL_LABELS[level] || level
    return <Badge variant={variants[level] || 'default'}>{label}</Badge>
  }

  const columns: DataTableColumn<DatasetField>[] = [
    {
      key: 'field_order',
      title: '排序',
      dataIndex: 'field_order',
    },
    {
      key: 'physical_name',
      title: '物理字段名',
      dataIndex: 'physical_name',
      render: (value) => (
        <div className="flex items-center gap-2">
          <Hash className="w-4 h-4 text-gray-400" />
          <span className="font-mono text-sm">{toDisplayText(value)}</span>
        </div>
      ),
    },
    {
      key: 'display_name',
      title: '显示名称',
      dataIndex: 'display_name',
      render: (value) => toDisplayText(value) === '-' ? <span className="text-gray-400">-</span> : toDisplayText(value),
    },
    {
      key: 'data_type',
      title: '数据类型',
      dataIndex: 'data_type',
      render: (value) => (
        <div className="flex items-center gap-2">
          <Type className="w-4 h-4 text-gray-400" />
          <span className="font-mono text-xs text-gray-600">{toDisplayText(value)}</span>
        </div>
      ),
    },
    {
      key: 'business_type',
      title: '业务类型',
      dataIndex: 'business_type',
      render: (value) => getBusinessTypeBadge(String(value ?? '')),
    },
    {
      key: 'sensitivity_level',
      title: '敏感级别',
      dataIndex: 'sensitivity_level',
      render: (value) => getSensitivityBadge(String(value ?? '')),
    },
    {
      key: 'comment',
      title: '备注',
      dataIndex: 'comment',
      render: (value) => toDisplayText(value) === '-' ? <span className="text-gray-400">-</span> : toDisplayText(value),
    },
  ]

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!dataset) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <Inbox className="w-16 h-16 text-gray-300 mb-4" />
        <p className="text-gray-500">数据集不存在</p>
      </div>
    )
  }

  const statusConfig = getSyncStatusConfig(dataset.sync_status)
  const StatusIcon = statusConfig.icon

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <FormButton
            variant="outline"
            size="icon"
            onClick={() => navigate('/data-center/datasets')}
            className="w-10 h-10 rounded-xl"
          >
            <ArrowLeft className="w-5 h-5" />
          </FormButton>
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/25">
            <Table2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{dataset.dataset_name}</h1>
            <p className="text-gray-500 text-sm">{dataset.dataset_code}</p>
          </div>
        </div>
        <div className={cn("px-4 py-2 rounded-xl flex items-center gap-2", statusConfig.bg, statusConfig.color)}>
          <StatusIcon className="w-4 h-4" />
          <span className="font-medium">{statusConfig.label}</span>
        </div>
      </div>

      {/* 基本信息 */}
      <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-500" />
            基本信息
          </h2>
          <div className="flex items-center gap-2">
            {!isEditing ? (
              <FormButton onClick={handleEdit} className="bg-indigo-600 hover:bg-indigo-700">
                <Edit2 className="w-4 h-4 mr-2" />
                编辑
              </FormButton>
            ) : (
              <>
                <FormButton variant="outline" onClick={handleCancel}>
                  <X className="w-4 h-4 mr-2" />
                  取消
                </FormButton>
                <FormButton
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                  loading={updateMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <Save className="w-4 h-4 mr-2" />
                  保存
                </FormButton>
              </>
            )}
          </div>
        </div>
        {!isEditing ? (
          <div className="grid grid-cols-2 gap-6">
            <div className="col-span-1 border-b border-gray-100 pb-4">
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                <Tag className="w-4 h-4" />
                数据集编码
              </div>
              <div className="font-mono text-gray-900">{dataset.dataset_code}</div>
            </div>
            <div className="col-span-1 border-b border-gray-100 pb-4">
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                <Table2 className="w-4 h-4" />
                数据集名称
              </div>
              <div className="text-gray-900">{dataset.dataset_name}</div>
            </div>
            <div className="col-span-1 border-b border-gray-100 pb-4">
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                <Database className="w-4 h-4" />
                物理表
              </div>
              <div className="font-mono text-sm text-gray-900">{dataset.physical_table}</div>
            </div>
            <div className="col-span-1 border-b border-gray-100 pb-4">
              <div className="text-sm text-gray-500 mb-2">数据源类型</div>
              <div className="text-gray-900">{dataset.source_type || '-'}</div>
            </div>
            <div className="col-span-1 border-b border-gray-100 pb-4">
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                <User className="w-4 h-4" />
                负责人
              </div>
              <div className="text-gray-900">{dataset.owner || '-'}</div>
            </div>
            <div className="col-span-1 border-b border-gray-100 pb-4">
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                <Calendar className="w-4 h-4" />
                创建时间
              </div>
              <div className="text-gray-900">{new Date(dataset.created_at).toLocaleString('zh-CN')}</div>
            </div>
            <div className="col-span-2 border-b border-gray-100 pb-4">
              <div className="text-sm text-gray-500 mb-2">最后同步时间</div>
              <div className="text-gray-900">{dataset.last_sync_at ? new Date(dataset.last_sync_at).toLocaleString('zh-CN') : '未同步'}</div>
            </div>
            <div className="col-span-2 pb-4">
              <div className="text-sm text-gray-500 mb-2">描述</div>
              <div className="text-gray-900">{dataset.description || <span className="text-gray-400">无描述</span>}</div>
            </div>
            {dataset.sync_error && (
              <div className="col-span-2">
                <div className="text-sm text-gray-500 mb-2">同步错误</div>
                <div className="text-red-600">{dataset.sync_error}</div>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-6">
            <div className="col-span-1">
              <Label>数据集编码</Label>
              <Input value={dataset.dataset_code} disabled className="mt-1 font-mono" />
            </div>
            <div className="col-span-1">
              <Label>数据集名称 *</Label>
              <Input
                value={formData.dataset_name}
                onChange={(e) => setFormData({ ...formData, dataset_name: e.target.value })}
                placeholder="请输入数据集名称"
                className="mt-1"
              />
            </div>
            <div className="col-span-2">
              <Label>物理表</Label>
              <Input value={dataset.physical_table} disabled className="mt-1 font-mono" />
            </div>
            <div className="col-span-1">
              <Label>负责人</Label>
              <Input
                value={formData.owner}
                onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                placeholder="请输入负责人"
                className="mt-1"
              />
            </div>
            <div className="col-span-1">
              <Label>数据源类型</Label>
              <Input value={dataset.source_type || '-'} disabled className="mt-1" />
            </div>
            <div className="col-span-2">
              <Label>描述</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                placeholder="请输入描述"
                className="mt-1"
              />
            </div>
          </div>
        )}
      </div>

      {/* 字段信息 */}
      <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Hash className="w-5 h-5 text-emerald-500" />
            字段信息
            <span className="text-sm font-normal text-gray-500 ml-2">({fields.length} 个字段)</span>
          </h2>
        </div>
        {fields.length > 0 ? (
          <DataTable
            columns={columns}
            data={fields}
            pageSize={20}
            showPagination={true}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-64">
            <Inbox className="w-16 h-16 text-gray-300 mb-4" />
            <p className="text-gray-500">暂无字段信息</p>
          </div>
        )}
      </div>
    </div>
  )
}
