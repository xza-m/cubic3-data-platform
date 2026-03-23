/**
 * SaveAsDatasetDialog - 从查询中心保存为虚拟数据集
 *
 * 流程: 获取字段元数据 → 填写名称/描述 → 配置字段 → 提交注册
 */
import { useState, useMemo, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Check, ChevronRight, ChevronLeft, Settings, Database } from 'lucide-react'
import { PageModal } from './PageModal'
import { FormButton } from './FormButton'
import { useToast } from '@/hooks/use-toast'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import FieldConfigurator from '@/components/FieldConfigurator/FieldConfigurator'
import { executeSQLSmart, type ExecuteSQLResponse } from '@/api/sqllab'
import { createDataset, type CreateDatasetRequest } from '@/api/datasets'
import type { FieldConfigItem } from '@/types'

interface SaveAsDatasetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 当前 SQL */
  sql: string
  /** 当前选中的数据源 ID */
  sourceId: number
  /** 数据源类型 */
  sourceType?: string
}

type Step = 'loading' | 'info' | 'fields' | 'confirm'

export default function SaveAsDatasetDialog({
  open,
  onOpenChange,
  sql,
  sourceId,
  sourceType,
}: SaveAsDatasetDialogProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const [step, setStep] = useState<Step>('loading')
  const [fieldMetadata, setFieldMetadata] = useState<ExecuteSQLResponse | null>(null)
  const [fieldConfigs, setFieldConfigs] = useState<FieldConfigItem[]>([])
  const [formData, setFormData] = useState({
    dataset_name: '',
    description: '',
    owner: 'admin',
  })
  const [loadError, setLoadError] = useState<string | null>(null)

  // 打开时获取字段元数据
  useEffect(() => {
    if (!open) return
    // 重置状态
    setStep('loading')
    setFieldMetadata(null)
    setFieldConfigs([])
    setFormData({ dataset_name: '', description: '', owner: 'admin' })
    setLoadError(null)

    let cancelled = false
    const fetchMetadata = async () => {
      try {
        const result = await executeSQLSmart(
          { source_id: sourceId, sql_query: sql, limit: 100 },
          false // 同步模式: 字段分析不需要异步，且 SQL 已验证可执行
        )
        if (!cancelled) {
          setFieldMetadata(result)
          setStep('info')
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const error = err as { response?: { data?: { message?: string } }; message?: string }
          setLoadError(error.response?.data?.message || error.message || '获取字段信息失败')
          setStep('info') // 仍允许继续，字段配置步骤会为空
        }
      }
    }
    fetchMetadata()
    return () => { cancelled = true }
  }, [open, sql, sourceId])

  // 将查询结果转换为 FieldConfigurator 的输入格式
  const fieldConfiguratorFields = useMemo(() => {
    if (!fieldMetadata) return []

    const identifiedFields = fieldMetadata.fields
    if (identifiedFields && identifiedFields.length > 0) {
      return identifiedFields.map((field) => ({
        name: field.field_name,
        type: field.data_type,
        display_name: field.display_name,
        comment: field.comment,
        business_type: field.business_type,
        sensitivity_level: field.sensitivity_level,
        mask_rule: field.mask_rule,
        confidence_score: field.confidence_score,
        matched_rules: field.matched_rules,
        is_partition: field.is_partition,
        auto_recognized: field.confidence_score > 0.5,
      }))
    }

    // 兜底: 从 columns 构建
    if (fieldMetadata.columns) {
      return fieldMetadata.columns.map((col) => ({
        name: col,
        type: 'STRING',
        display_name: col,
      }))
    }

    return []
  }, [fieldMetadata])

  const handleFieldConfigChange = useCallback((configs: FieldConfigItem[]) => {
    setFieldConfigs(configs)
  }, [])

  const createMutation = useMutation({
    mutationFn: (data: CreateDatasetRequest) => createDataset(data),
    onSuccess: async () => {
      toast({ title: '虚拟数据集创建成功' })
      onOpenChange(false)
      await queryClient.invalidateQueries({ queryKey: ['datasets'] })
      await queryClient.invalidateQueries({ queryKey: ['datasets', 'statistics'] })
      setTimeout(() => navigate('/data-center/datasets'), 100)
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } }; message?: string }
      toast({
        title: '创建失败',
        description: err.response?.data?.message || err.message,
        variant: 'destructive',
      })
    },
  })

  const handleSubmit = () => {
    createMutation.mutate({
      dataset_type: 'virtual',
      dataset_name: formData.dataset_name,
      description: formData.description,
      owner: formData.owner,
      source_id: sourceId,
      sql_query: sql,
      fields: fieldConfigs,
    })
  }

  const canGoToFields = formData.dataset_name.trim().length > 0
  const canGoToConfirm = fieldConfigs.length > 0

  const stepIndex = step === 'loading' ? -1 : step === 'info' ? 0 : step === 'fields' ? 1 : 2
  const steps = [
    { label: '基本信息', icon: Database },
    { label: '字段配置', icon: Settings },
    { label: '确认注册', icon: Check },
  ]

  return (
    <PageModal
      open={open}
      onOpenChange={onOpenChange}
      title="保存为虚拟数据集"
      description="将当前 SQL 查询注册为可复用的虚拟数据集"
      className="max-w-3xl"
      bodyClassName="p-0"
    >
      {/* 步骤指示器 */}
      <div className="px-6 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-center justify-center gap-2">
          {steps.map((s, i) => {
            const Icon = s.icon
            const isActive = i === stepIndex
            const isCompleted = i < stepIndex
            return (
              <div key={i} className="flex items-center">
                <div className="flex items-center gap-1.5">
                  <div className={cn(
                    'w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-all',
                    isActive && 'bg-indigo-500 text-white shadow-sm',
                    isCompleted && 'bg-emerald-100 text-emerald-600',
                    !isActive && !isCompleted && 'bg-gray-100 text-gray-400'
                  )}>
                    {isCompleted ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                  </div>
                  <span className={cn('text-xs font-medium', isActive ? 'text-gray-900' : 'text-gray-400')}>
                    {s.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div className={cn('w-12 h-px mx-2', isCompleted ? 'bg-emerald-300' : 'bg-gray-200')} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 步骤内容 */}
      <div className="px-6 py-5 min-h-[320px]">
        {step === 'loading' && (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            <p className="text-sm text-gray-500">正在分析 SQL 字段信息...</p>
          </div>
        )}

        {step === 'info' && (
          <div className="space-y-4 max-w-md mx-auto">
            {loadError && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                字段元数据获取失败: {loadError}。你仍然可以继续注册，但字段配置需要手动补全。
              </div>
            )}
            <div>
              <Label>数据集名称 *</Label>
              <Input
                value={formData.dataset_name}
                onChange={(e) => setFormData({ ...formData, dataset_name: e.target.value })}
                placeholder="例如: 高价值订单分析"
                className="mt-1 h-10"
                autoFocus
              />
            </div>
            <div>
              <Label>描述</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                placeholder="描述此虚拟数据集的用途和业务含义"
                className="mt-1"
              />
            </div>
            <div>
              <Label>负责人</Label>
              <Input
                value={formData.owner}
                onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                placeholder="负责人"
                className="mt-1 h-10"
              />
            </div>
          </div>
        )}

        {step === 'fields' && (
          <div>
            {fieldConfiguratorFields.length > 0 ? (
              <FieldConfigurator
                fields={fieldConfiguratorFields}
                sourceType={sourceType || 'postgresql'}
                onConfigChange={handleFieldConfigChange}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                <Settings className="w-10 h-10 mb-2" />
                <p className="text-sm">无可配置的字段信息</p>
              </div>
            )}
          </div>
        )}

        {step === 'confirm' && (
          <div className="max-w-md mx-auto text-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-emerald-500/20">
              <Check className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-4">确认创建虚拟数据集</h3>
            <div className="bg-gray-50 rounded-xl p-5 space-y-3 text-sm text-left">
              <div className="flex justify-between">
                <span className="text-gray-500">数据集名称</span>
                <span className="font-medium text-gray-900">{formData.dataset_name}</span>
              </div>
              <div className="h-px bg-gray-200" />
              <div className="flex justify-between">
                <span className="text-gray-500">字段数量</span>
                <span className="font-medium text-gray-900">{fieldConfigs.length} 个</span>
              </div>
              <div className="h-px bg-gray-200" />
              <div className="flex justify-between">
                <span className="text-gray-500">负责人</span>
                <span className="font-medium text-gray-900">{formData.owner}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 底部操作栏 */}
      {step !== 'loading' && (
        <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50 rounded-b-lg">
          <FormButton
            variant="outline"
            size="sm"
            onClick={() => {
              if (step === 'info') onOpenChange(false)
              else if (step === 'fields') setStep('info')
              else if (step === 'confirm') setStep('fields')
            }}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            {step === 'info' ? '取消' : '上一步'}
          </FormButton>

          {step === 'info' && (
            <FormButton
              size="sm"
              disabled={!canGoToFields}
              onClick={() => setStep('fields')}
            >
              下一步
              <ChevronRight className="w-4 h-4 ml-1" />
            </FormButton>
          )}

          {step === 'fields' && (
            <FormButton
              size="sm"
              disabled={!canGoToConfirm}
              onClick={() => setStep('confirm')}
            >
              下一步
              <ChevronRight className="w-4 h-4 ml-1" />
            </FormButton>
          )}

          {step === 'confirm' && (
            <FormButton
              size="sm"
              onClick={handleSubmit}
              disabled={createMutation.isPending}
              loading={createMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Check className="w-4 h-4 mr-1" />
              确认创建
            </FormButton>
          )}
        </div>
      )}
    </PageModal>
  )
}
