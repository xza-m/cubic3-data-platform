/**
 * 数据集注册页面 - Migrated to shadcn/ui
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Table2,
  Database,
  ChevronRight,
  ChevronLeft,
  Check,
  Server,
  Settings,
  Loader2
} from 'lucide-react'
import { getDataSources, getDataSourceDatabases, getDataSourceTables } from '../api/datasources'
import { createDataset, previewDataset } from '../api/datasets'
import FieldConfigurator from '../components/FieldConfigurator/FieldConfigurator'
import { FormButton, FormSelect, useToast } from '@/components/business'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import type { FieldConfigItem, DataSource } from '@/types'
import { cn } from '@/lib/utils'

const toStringValue = (value: unknown, fallback = '') => (
  typeof value === 'string' ? value : value == null ? fallback : String(value)
)

const toNumberValue = (value: unknown, fallback = 0) => (
  typeof value === 'number' ? value : Number(value ?? fallback) || fallback
)

const toStringArray = (value: unknown) => (
  Array.isArray(value) ? value.map((item) => String(item)) : []
)

export default function DatasetRegister() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [currentStep, setCurrentStep] = useState(0)
  const [selectedSource, setSelectedSource] = useState<number>()
  const [selectedDatabase, setSelectedDatabase] = useState<string>()
  const [selectedTable, setSelectedTable] = useState<string>()
  const [fieldConfigs, setFieldConfigs] = useState<FieldConfigItem[]>([])
  const [formData, setFormData] = useState({
    dataset_name: '',
    description: '',
    owner: 'admin'
  })

  const { data: datasourcesData } = useQuery({
    queryKey: ['datasources'],
    queryFn: () => getDataSources({ page: 1, page_size: 100 })
  })

  const selectedDataSource = datasourcesData?.data?.items?.find(
    (ds: DataSource) => ds.id === selectedSource
  )

  const { data: databasesData, isLoading: loadingDatabases } = useQuery({
    queryKey: ['databases', selectedSource],
    queryFn: () => getDataSourceDatabases(selectedSource!),
    enabled: !!selectedSource
  })

  const { data: tablesData, isLoading: loadingTables } = useQuery({
    queryKey: ['tables', selectedSource, selectedDatabase],
    queryFn: () => getDataSourceTables(selectedSource!, selectedDatabase!),
    enabled: !!selectedSource && !!selectedDatabase
  })

  const { data: previewData, isLoading: loadingPreview } = useQuery({
    queryKey: ['tablePreview', selectedSource, selectedDatabase, selectedTable],
    queryFn: () =>
      previewDataset({
        datasource_id: selectedSource!,
        database: selectedDatabase!,
        table: selectedTable!,
      }),
    enabled: !!selectedSource && !!selectedDatabase && !!selectedTable
  })

  const createMutation = useMutation({
    mutationFn: createDataset,
    onSuccess: async () => {
      toast({ title: '数据集注册成功' })
      await queryClient.invalidateQueries({ queryKey: ['datasets'] })
      await queryClient.invalidateQueries({ queryKey: ['datasets', 'statistics'] })
      setTimeout(() => navigate('/data-center/datasets'), 100)
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } }; message?: string }
      toast({
        title: '注册失败，请重试',
        description: err.response?.data?.message || err.message,
        variant: 'destructive'
      })
    }
  })

  const steps = [
    { title: '选择数据表', icon: Database, color: 'blue' },
    { title: '填写信息', icon: Table2, color: 'emerald' },
    { title: '配置字段', icon: Settings, color: 'indigo' },
    { title: '完成注册', icon: Check, color: 'purple' }
  ]

  const handleNext = () => {
    if (currentStep === 0) {
      if (!selectedSource || !selectedDatabase || !selectedTable) {
        toast({ title: '请先选择数据源、数据库和表', variant: 'warning' })
        return
      }
      setCurrentStep(1)
    } else if (currentStep === 1) {
      if (!formData.dataset_name) {
        toast({ title: '请输入数据集名称', variant: 'warning' })
        return
      }
      setCurrentStep(2)
    } else if (currentStep === 2) {
      if (fieldConfigs.length === 0) {
        toast({ title: '请先配置字段信息', variant: 'warning' })
        return
      }
      setCurrentStep(3)
    }
  }

  const handleSubmit = () => {
    const data = {
      dataset_name: formData.dataset_name,
      description: formData.description,
      owner: formData.owner,
      source_id: selectedSource,
      physical_table: `${selectedDatabase}.${selectedTable}`,
      fields: fieldConfigs
    }
    
    if (!data.dataset_name) {
      toast({ title: '请填写数据集名称', variant: 'destructive' })
      setCurrentStep(1)
      return
    }
    
    createMutation.mutate(data)
  }

  const handleFieldConfigChange = useCallback((configs: FieldConfigItem[]) => {
    setFieldConfigs(configs)
  }, [])

  // 使用后端返回的字段识别结果（包含 business_type, sensitivity_level, mask_rule）
  // 用 useMemo 避免每次渲染都创建新数组导致无限循环
  const fieldConfiguratorFields = useMemo(() => {
    return (previewData as { data?: { fields?: Array<Record<string, unknown>> } })?.data?.fields?.map((field: Record<string, unknown>) => ({
      name: toStringValue(field.field_name ?? field.name),
      type: toStringValue(field.data_type ?? field.type),
      display_name: toStringValue(field.display_name ?? field.field_name ?? field.name),
      comment: toStringValue(field.comment),
      business_type: toStringValue(field.business_type, 'dimension'),
      sensitivity_level: toStringValue(field.sensitivity_level, 'public'),
      mask_rule: field.mask_rule == null ? undefined : toStringValue(field.mask_rule),
      confidence_score: toNumberValue(field.confidence_score),
      matched_rules: toStringArray(field.matched_rules),
      is_partition: Boolean(field.is_partition),
      auto_recognized: toNumberValue(field.confidence_score) > 0.5
    })) || []
  }, [previewData])

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center gap-4">
        <FormButton
          variant="outline"
          size="icon"
          onClick={() => navigate('/data-center/datasets')}
          className="w-10 h-10 rounded-xl"
        >
          <ChevronLeft className="w-5 h-5" />
        </FormButton>
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/25">
          <Table2 className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">注册数据集</h1>
          <p className="text-gray-500 text-sm">配置数据集元数据和字段信息</p>
        </div>
      </div>

      {/* 步骤指示器 */}
      <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between max-w-3xl mx-auto">
          {steps.map((step, index) => {
            const Icon = step.icon
            const isActive = index === currentStep
            const isCompleted = index < currentStep
            
            return (
              <div key={index} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div className={cn(
                    "w-14 h-14 rounded-2xl flex items-center justify-center border-2 transition-all",
                    isActive && "bg-emerald-500 border-emerald-500 shadow-lg shadow-emerald-500/30",
                    isCompleted && "bg-emerald-500 border-emerald-500",
                    !isActive && !isCompleted && "bg-gray-100 border-gray-200"
                  )}>
                    <Icon className={cn("w-6 h-6", (isActive || isCompleted) ? "text-white" : "text-gray-400")} />
                  </div>
                  <span className={cn("text-sm mt-3 font-medium", isActive ? "text-gray-900" : "text-gray-400")}>
                    {step.title}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div className={cn("w-28 h-0.5 mx-4 transition-all", isCompleted ? "bg-emerald-400" : "bg-gray-200")} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 步骤内容 */}
      <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm">
        {/* Step 0: 选择数据表 */}
        {currentStep === 0 && (
          <div className="space-y-6 max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-lg font-bold text-gray-900 mb-2">选择数据源和表</h2>
              <p className="text-gray-500">请依次选择数据源、数据库和数据表</p>
            </div>

            <div>
              <Label>数据源</Label>
              <FormSelect
                value={selectedSource?.toString()}
                onValueChange={(val) => {
                  setSelectedSource(Number(val))
                  setSelectedDatabase(undefined)
                  setSelectedTable(undefined)
                }}
                placeholder="请选择数据源"
                options={datasourcesData?.data?.items?.map((ds: DataSource) => ({
                  value: ds.id.toString(),
                  label: `${ds.name} (${ds.source_type})`
                })) || []}
                className="mt-1 h-11"
              />
            </div>

            <div>
              <Label>数据库</Label>
              <FormSelect
                value={selectedDatabase}
                onValueChange={(val) => {
                  setSelectedDatabase(val)
                  setSelectedTable(undefined)
                }}
                placeholder="请选择数据库"
                disabled={!selectedSource || loadingDatabases}
                options={databasesData?.data?.map((db: string) => ({
                  value: db,
                  label: db
                })) || []}
                className="mt-1 h-11"
              />
            </div>

            <div>
              <Label>数据表</Label>
              <FormSelect
                value={selectedTable}
                onValueChange={setSelectedTable}
                placeholder="请选择数据表"
                disabled={!selectedDatabase || loadingTables}
                options={tablesData?.data?.map((table: { table_name: string; comment?: string }) => ({
                  value: table.table_name,
                  label: table.table_name
                })) || []}
                searchable
                className="mt-1 h-11"
              />
            </div>

            {loadingPreview && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400 mr-2" />
                <span className="text-gray-500">正在加载表元数据...</span>
              </div>
            )}

            {previewData && (
              <div className="mt-6 p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                <div className="flex items-center gap-2 text-emerald-700">
                  <Check className="w-5 h-5" />
                  <span className="font-medium">元数据加载成功，共 {previewData.data.fields?.length || 0} 个字段</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 1: 填写信息 */}
        {currentStep === 1 && (
          <div className="space-y-6 max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-lg font-bold text-gray-900 mb-2">填写数据集信息</h2>
              <p className="text-gray-500">请输入数据集的基本信息</p>
            </div>

            <div>
              <Label>数据集名称 *</Label>
              <Input
                value={formData.dataset_name}
                onChange={(e) => setFormData({ ...formData, dataset_name: e.target.value })}
                placeholder="例如: 用户订单数据集"
                className="mt-1 h-11"
              />
            </div>

            <div>
              <Label>描述</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                placeholder="描述此数据集的用途和业务含义"
                className="mt-1"
              />
            </div>

            <div>
              <Label>负责人 *</Label>
              <Input
                value={formData.owner}
                onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                placeholder="负责人"
                className="mt-1 h-11"
              />
            </div>
          </div>
        )}

        {/* Step 2: 配置字段 */}
        {currentStep === 2 && (
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-lg font-bold text-gray-900 mb-2">配置字段信息</h2>
              <p className="text-gray-500">为每个字段配置显示名称、业务类型和敏感级别</p>
            </div>

            {previewData && (
              <FieldConfigurator
                fields={fieldConfiguratorFields}
                sourceType={selectedDataSource?.source_type || 'postgresql'}
                onConfigChange={handleFieldConfigChange}
              />
            )}
          </div>
        )}

        {/* Step 3: 完成注册 */}
        {currentStep === 3 && (
          <div className="max-w-2xl mx-auto text-center">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center mx-auto mb-6 shadow-xl shadow-emerald-500/25">
              <Check className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">确认注册数据集</h2>
            <p className="text-gray-500 mb-8">请确认以下信息无误后提交</p>

            <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl p-6 space-y-4">
              <div className="flex justify-between items-center py-2">
                <span className="text-gray-500 font-medium">数据源</span>
                <span className="text-gray-900 font-semibold">{selectedDataSource?.name}</span>
              </div>
              <div className="h-px bg-gray-200"></div>
              
              <div className="flex justify-between items-center py-2">
                <span className="text-gray-500 font-medium">数据集名称</span>
                <span className="text-gray-900 font-semibold">
                  {formData.dataset_name || <span className="text-red-500 italic">（未填写）</span>}
                </span>
              </div>
              <div className="h-px bg-gray-200"></div>
              
              <div className="flex justify-between items-center py-2">
                <span className="text-gray-500 font-medium">物理表</span>
                <span className="text-gray-900 font-mono text-sm bg-white px-3 py-1 rounded-lg border border-gray-200">
                  {selectedDatabase}.{selectedTable}
                </span>
              </div>
              
              {formData.owner && (
                <>
                  <div className="h-px bg-gray-200"></div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-gray-500 font-medium">责任人</span>
                    <span className="text-gray-900">{formData.owner}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* 底部按钮 */}
        <div className="border-t border-gray-100 px-8 py-5 flex items-center justify-between bg-gray-50 rounded-b-2xl mt-8">
          <FormButton
            variant="outline"
            onClick={() => {
              if (currentStep === 0) {
                navigate('/data-center/datasets')
              } else {
                setCurrentStep(currentStep - 1)
              }
            }}
          >
            <ChevronLeft className="w-5 h-5 mr-2" />
            {currentStep === 0 ? '返回' : '上一步'}
          </FormButton>

          {currentStep < 3 ? (
            <FormButton onClick={handleNext}>
              下一步
              <ChevronRight className="w-5 h-5 ml-2" />
            </FormButton>
          ) : (
            <FormButton
              onClick={handleSubmit}
              disabled={createMutation.isPending}
              loading={createMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Check className="w-5 h-5 mr-2" />
              确认注册
            </FormButton>
          )}
        </div>
      </div>
    </div>
  )
}
