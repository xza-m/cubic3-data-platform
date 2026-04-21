/**
 * DatasetDetail - Migrated to shadcn/ui
 */
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Table2, Database, Calendar, User, CheckCircle, Clock, AlertCircle, Hash, Type, Tag, Edit2, Save, X, RefreshCw, Loader2, Inbox } from 'lucide-react'
import { getDataset, updateDataset, type UpdateDatasetRequest } from '@/api/datasets'
import {
  FormButton,
  FormInput,
  FormTextarea,
  Badge,
  useToast,
} from '@/components/business'
import { Label } from '@/components/ui/label'
import {
  getDatasetSourceLabel,
  getDatasetSourceObjectLabel,
  getDatasetTypeLabel,
} from '@/lib/datasetPresentation'
import { cn } from '@/lib/utils'
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
  const datasetTypeLabel = getDatasetTypeLabel(dataset.dataset_type)
  const datasetSourceLabel = getDatasetSourceLabel(dataset.source_type)
  const datasetSourceObjectLabel = getDatasetSourceObjectLabel(dataset)

  return (
    <div className="flex h-screen bg-gray-50">
      {/* 内容区域 */}
      <div className="flex-1 overflow-auto">
        <div className="p-8 lg:p-10 space-y-6">
          {/* 面包屑 */}
          <div className="flex items-center gap-1 text-sm">
            <span className="text-gray-500">数据集管理</span>
            <span className="text-gray-400">/</span>
            <span className="text-gray-900 font-medium">{dataset.dataset_name}</span>
          </div>

          {/* 标题行 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{dataset.dataset_name}</h1>
              <div className={cn('rounded-md px-2.5 py-1 flex items-center gap-1.5', statusConfig.bg)}>
                <StatusIcon className={cn('w-3.5 h-3.5', statusConfig.color)} />
                <span className={cn('text-sm font-medium', statusConfig.color)}>{statusConfig.label}</span>
              </div>
            </div>
            {isEditing ? (
              <div className="flex items-center gap-2">
                <FormButton variant="outline" onClick={handleCancel} size="sm">
                  <X className="w-4 h-4 mr-1.5" />
                  取消
                </FormButton>
                <FormButton
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                  loading={updateMutation.isPending}
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <Save className="w-4 h-4 mr-1.5" />
                  保存
                </FormButton>
              </div>
            ) : (
              <FormButton onClick={handleEdit} size="sm" variant="outline">
                <Edit2 className="w-3.5 h-3.5 mr-1.5" />
                编辑
              </FormButton>
            )}
          </div>

          {/* 基本信息 */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-[15px] font-semibold text-gray-900">基本信息</h2>
            </div>
            {!isEditing ? (
              <div className="divide-y divide-gray-100">
                <div className="px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Tag className="w-4 h-4" />
                    数据集编码
                  </div>
                  <div className="font-mono text-sm text-gray-900">{dataset.dataset_code}</div>
                </div>
                <div className="px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Table2 className="w-4 h-4" />
                    数据集名称
                  </div>
                  <div className="text-sm text-gray-900">{dataset.dataset_name}</div>
                </div>
                <div className="px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Database className="w-4 h-4" />
                    类型
                  </div>
                  <div className="text-sm text-gray-900">{datasetTypeLabel}</div>
                </div>
                <div className="px-5 py-3 flex items-center justify-between">
                  <div className="text-sm text-gray-500">来源</div>
                  <div className="text-sm text-gray-900">{datasetSourceLabel}</div>
                </div>
                <div className="px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Table2 className="w-4 h-4" />
                    物理表 / 来源对象
                  </div>
                  <div className="font-mono text-sm text-gray-900">{datasetSourceObjectLabel}</div>
                </div>
                <div className="px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <User className="w-4 h-4" />
                    负责人
                  </div>
                  <div className="text-sm text-gray-900">{dataset.owner || '-'}</div>
                </div>
                <div className="px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Calendar className="w-4 h-4" />
                    创建时间
                  </div>
                  <div className="text-sm text-gray-900">{new Date(dataset.created_at).toLocaleString('zh-CN')}</div>
                </div>
                <div className="px-5 py-3 flex items-center justify-between">
                  <div className="text-sm text-gray-500">最后同步时间</div>
                  <div className="text-sm text-gray-900">{dataset.last_sync_at ? new Date(dataset.last_sync_at).toLocaleString('zh-CN') : '未同步'}</div>
                </div>
                <div className="px-5 py-3">
                  <div className="text-sm text-gray-500 mb-2">描述</div>
                  <div className="text-sm text-gray-900">{dataset.description || <span className="text-gray-400">无描述</span>}</div>
                </div>
                {dataset.sync_error && (
                  <div className="px-5 py-3">
                    <div className="text-sm text-gray-500 mb-2">同步错误</div>
                    <div className="text-red-600 max-h-32 overflow-y-auto text-sm leading-relaxed break-words">{dataset.sync_error}</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-5 space-y-4">
                <div>
                  <Label className="text-sm text-gray-700">数据集编码</Label>
                  <FormInput value={dataset.dataset_code} disabled className="mt-1.5 font-mono text-sm" />
                </div>
                <div>
                  <Label className="text-sm text-gray-700">数据集名称 *</Label>
                  <FormInput
                    value={formData.dataset_name}
                    onChange={(e) => setFormData({ ...formData, dataset_name: e.target.value })}
                    placeholder="请输入数据集名称"
                    className="mt-1.5 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-sm text-gray-700">物理表 / 来源对象</Label>
                  <FormInput value={datasetSourceObjectLabel} disabled className="mt-1.5 font-mono text-sm" />
                </div>
                <div>
                  <Label className="text-sm text-gray-700">负责人</Label>
                  <FormInput
                    value={formData.owner}
                    onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                    placeholder="请输入负责人"
                    className="mt-1.5 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-sm text-gray-700">来源</Label>
                  <FormInput value={datasetSourceLabel} disabled className="mt-1.5 text-sm" />
                </div>
                <div>
                  <Label className="text-sm text-gray-700">描述</Label>
                  <FormTextarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    placeholder="请输入描述"
                    className="mt-1.5 text-sm"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 字段信息 */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-[15px] font-semibold text-gray-900">
                字段信息
                <span className="ml-2 text-sm font-normal text-gray-500">({fields.length} 个字段)</span>
              </h2>
            </div>
            {fields.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 border-b border-gray-100">排序</th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 border-b border-gray-100">物理字段名</th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 border-b border-gray-100">显示名称</th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 border-b border-gray-100">数据类型</th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 border-b border-gray-100">业务类型</th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 border-b border-gray-100">敏感级别</th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 border-b border-gray-100">备注</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {fields.map((field) => (
                      <tr key={field.id} className="hover:bg-gray-50">
                        <td className="px-5 py-3 text-sm text-gray-900">{field.field_order}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <Hash className="w-4 h-4 text-gray-400" />
                            <span className="font-mono text-sm text-gray-900">{field.physical_name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-900">{toDisplayText(field.display_name)}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <Type className="w-4 h-4 text-gray-400" />
                            <span className="font-mono text-xs text-gray-600">{field.data_type}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3">{getBusinessTypeBadge(field.business_type)}</td>
                        <td className="px-5 py-3">{getSensitivityBadge(field.sensitivity_level)}</td>
                        <td className="px-5 py-3 text-sm text-gray-900">{toDisplayText(field.comment)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64">
                <Inbox className="w-16 h-16 text-gray-300 mb-4" />
                <p className="text-sm text-gray-500">暂无字段信息</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
