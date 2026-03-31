/**
 * 数据集注册页面 - 物理表注册流程
 */
import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Database,
  Settings,
  Table2,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { getDataSourceDatabases, getDataSourceTables, getDataSources } from '../api/datasources'
import { createDataset, previewDataset } from '../api/datasets'
import FieldConfigurator from '../components/FieldConfigurator/FieldConfigurator'
import {
  DataTable,
  FormButton,
  FormInput,
  FormSelect,
  FormTextarea,
  PreviewPanel,
  RegisterFlowShell,
  useToast,
} from '@/components/business'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { DataSource, FieldConfigItem } from '@/types'

const toStringValue = (value: unknown, fallback = '') => (
  typeof value === 'string' ? value : value == null ? fallback : String(value)
)

const toNumberValue = (value: unknown, fallback = 0) => (
  typeof value === 'number' ? value : Number(value ?? fallback) || fallback
)

const toStringArray = (value: unknown) => (
  Array.isArray(value) ? value.map((item) => String(item)) : []
)

const getErrorMessage = (error: unknown, fallback: string) => {
  const err = error as { response?: { data?: { message?: string } }; message?: string }
  return err.response?.data?.message || err.message || fallback
}

export function submitDatasetRegistration({
  datasetName,
  toast,
  setCurrentStep,
  onValid,
}: {
  datasetName: string
  toast: (payload: { title: string; variant: 'destructive' }) => void
  setCurrentStep: (step: number) => void
  onValid: () => void
}) {
  if (!datasetName) {
    handleInvalidDatasetRegisterSubmit({ toast, setCurrentStep })
    return
  }

  onValid()
}

export function handleInvalidDatasetRegisterSubmit({
  toast,
  setCurrentStep,
}: {
  toast: (payload: { title: string; variant: 'destructive' }) => void
  setCurrentStep: (step: number) => void
}) {
  toast({ title: '请填写数据集名称', variant: 'destructive' })
  setCurrentStep(1)
}

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
    owner: 'admin',
  })

  const steps = [
    { title: '选择数据表', icon: Database },
    { title: '填写信息', icon: Table2 },
    { title: '配置字段', icon: Settings },
    { title: '完成注册', icon: Check },
  ]

  const { data: datasourcesData } = useQuery({
    queryKey: ['datasources'],
    queryFn: () => getDataSources({ page: 1, page_size: 100 }),
  })

  const selectedDataSource = datasourcesData?.data?.items?.find(
    (ds: DataSource) => ds.id === selectedSource,
  )

  const { data: databasesData, isLoading: loadingDatabases } = useQuery({
    queryKey: ['databases', selectedSource],
    queryFn: () => getDataSourceDatabases(selectedSource!),
    enabled: !!selectedSource,
  })

  const { data: tablesData, isLoading: loadingTables } = useQuery({
    queryKey: ['tables', selectedSource, selectedDatabase],
    queryFn: () => getDataSourceTables(selectedSource!, selectedDatabase!),
    enabled: !!selectedSource && !!selectedDatabase,
  })

  const {
    data: previewData,
    isLoading: loadingPreview,
    error: previewError,
    isError: hasPreviewError,
    refetch: refetchPreview,
  } = useQuery({
    queryKey: ['tablePreview', selectedSource, selectedDatabase, selectedTable],
    queryFn: () =>
      previewDataset({
        datasource_id: selectedSource!,
        database: selectedDatabase!,
        table: selectedTable!,
      }),
    enabled: !!selectedSource && !!selectedDatabase && !!selectedTable,
    retry: false,
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
      toast({
        title: '注册失败，请重试',
        description: getErrorMessage(error, '请稍后重试'),
        variant: 'destructive',
      })
    },
  })

  const handleNext = () => {
    if (currentStep === 0) {
      if (!selectedSource || !selectedDatabase || !selectedTable) {
        toast({ title: '请先选择数据源、数据库和表', variant: 'warning' })
        return
      }
      if (hasPreviewError || !previewData) {
        toast({ title: '请先修复元数据加载失败问题', variant: 'warning' })
        return
      }
      setCurrentStep(1)
      return
    }

    if (currentStep === 1) {
      if (!formData.dataset_name) {
        toast({ title: '请输入数据集名称', variant: 'warning' })
        return
      }
      setCurrentStep(2)
      return
    }

    if (fieldConfigs.length === 0) {
      toast({ title: '请先配置字段信息', variant: 'warning' })
      return
    }
    setCurrentStep(3)
  }

  const handleSubmit = () => {
    submitDatasetRegistration({
      datasetName: formData.dataset_name,
      toast,
      setCurrentStep,
      onValid: () => {
        createMutation.mutate({
          dataset_name: formData.dataset_name,
          description: formData.description,
          owner: formData.owner,
          source_id: selectedSource,
          physical_table: `${selectedDatabase}.${selectedTable}`,
          fields: fieldConfigs,
        })
      },
    })
  }

  const handleFieldConfigChange = useCallback((configs: FieldConfigItem[]) => {
    setFieldConfigs(configs)
  }, [])

  const previewPayload = previewData?.data
  const fieldConfiguratorFields = useMemo(() => {
    return (previewPayload?.fields || []).map((field: Record<string, unknown>) => ({
      name: toStringValue(field.physical_name ?? field.field_name ?? field.name),
      type: toStringValue(field.data_type ?? field.type),
      display_name: toStringValue(field.display_name ?? field.physical_name ?? field.field_name ?? field.name),
      comment: toStringValue(field.comment),
      business_type: toStringValue(field.business_type, 'dimension'),
      sensitivity_level: toStringValue(field.sensitivity_level, 'public'),
      mask_rule: field.mask_rule == null ? undefined : toStringValue(field.mask_rule),
      confidence_score: toNumberValue(field.confidence_score),
      matched_rules: toStringArray(field.matched_rules),
      is_partition: Boolean(field.is_partition),
      auto_recognized: toNumberValue(field.confidence_score) > 0.5,
    }))
  }, [previewPayload])

  const previewLimit = previewPayload?.preview_limit || 20
  const sampleColumns = (previewPayload?.sample_columns || []).map((column) => String(column))
  const sampleRows = (previewPayload?.sample_rows || []) as Record<string, unknown>[]
  const previewColumns: ColumnDef<Record<string, unknown>>[] = sampleColumns.map((column) => ({
    accessorKey: column,
    header: column,
  }))

  const previewPanel = (() => {
    if (loadingPreview) {
      return (
        <PreviewPanel
          title="样本预览"
          description="基于真实物理表的元数据与样本行。"
          state="loading"
          loadingText="正在加载表元数据"
        />
      )
    }

    if (hasPreviewError) {
      return (
        <PreviewPanel
          title="样本预览"
          description="基于真实物理表的元数据与样本行。"
          state="error"
          errorTitle="元数据加载失败"
          errorDescription={getErrorMessage(previewError, '请检查数据源连接后重试')}
          actions={(
            <FormButton
              variant="outline"
              onClick={() => {
                void refetchPreview()
              }}
            >
              重试加载
            </FormButton>
          )}
        />
      )
    }

    if (!selectedSource || !selectedDatabase || !selectedTable) {
      return (
        <PreviewPanel
          title="样本预览"
          description="基于真实物理表的元数据与样本行。"
          state="empty"
          emptyTitle="等待选择物理表"
          emptyDescription="选择数据源、数据库和数据表后，这里会展示真实字段识别结果和样本数据。"
        />
      )
    }

    if (!previewPayload || sampleColumns.length === 0 || sampleRows.length === 0) {
      return (
        <PreviewPanel
          title="样本预览"
          description="基于真实物理表的元数据与样本行。"
          state="empty"
          emptyTitle="暂无样本数据"
          emptyDescription="当前物理表没有返回可展示的样本行，请确认表数据或稍后重试。"
        />
      )
    }

    return (
      <PreviewPanel
        title={`样本预览（前 ${previewLimit} 行）`}
        description={`${selectedDatabase}.${selectedTable}`}
        state="ready"
      >
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs text-slate-500">自动识别字段</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{previewPayload.statistics?.total_fields || 0}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs text-slate-500">度量字段</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{previewPayload.statistics?.measure_fields || 0}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs text-slate-500">分区字段</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{previewPayload.statistics?.partition_fields || 0}</div>
            </div>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            元数据加载成功，共 {previewPayload.fields?.length || 0} 个字段
          </div>
          <div className="text-sm text-slate-600">
            字段识别摘要：分区 {previewPayload.statistics?.partition_fields || 0} 个，敏感字段 {previewPayload.statistics?.sensitive_fields || 0} 个。
          </div>
          <DataTable columns={previewColumns} data={sampleRows} showPagination={false} />
        </div>
      </PreviewPanel>
    )
  })()

  const footerActions = (
    <div className="flex items-center justify-between border-t border-slate-200 px-6 py-5">
      <FormButton
        variant="outline"
        onClick={() => {
          if (currentStep === 0) {
            navigate('/data-center/datasets')
            return
          }
          setCurrentStep(currentStep - 1)
        }}
      >
        <ChevronLeft className="mr-2 h-5 w-5" />
        {currentStep === 0 ? '返回' : '上一步'}
      </FormButton>

      {currentStep < 3 ? (
        <FormButton onClick={handleNext}>
          下一步
          <ChevronRight className="ml-2 h-5 w-5" />
        </FormButton>
      ) : (
        <FormButton
          onClick={handleSubmit}
          disabled={createMutation.isPending}
          loading={createMutation.isPending}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          <Check className="mr-2 h-5 w-5" />
          确认注册
        </FormButton>
      )}
    </div>
  )

  return (
    <RegisterFlowShell
      title="注册数据集"
      description="沿用真实数据源探查、真实样本预览与字段配置流程完成物理表注册。"
      sidebar={previewPanel}
    >
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="grid gap-3 md:grid-cols-4">
            {steps.map((step, index) => {
              const Icon = step.icon
              const isActive = index === currentStep
              const isCompleted = index < currentStep

              return (
                <div
                  key={step.title}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border px-4 py-3',
                    isActive && 'border-[hsl(var(--workbench-accent-soft))] bg-[hsl(var(--workbench-accent-soft))]',
                    isCompleted && 'border-emerald-200 bg-emerald-50',
                    !isActive && !isCompleted && 'border-slate-200 bg-slate-50',
                  )}
                >
                  <div
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-xl border',
                      isActive && 'border-[hsl(var(--workbench-accent-soft))] bg-white text-[hsl(var(--workbench-accent-strong))]',
                      isCompleted && 'border-emerald-200 bg-white text-emerald-600',
                      !isActive && !isCompleted && 'border-slate-200 bg-white text-slate-400',
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">步骤 {index + 1}</div>
                    <div className={cn('text-sm font-medium', isActive ? 'text-slate-950' : 'text-slate-600')}>
                      {step.title}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {currentStep === 0 ? (
          <div className="space-y-6 px-6 py-6">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">选择数据源和表</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">请依次选择数据源、数据库和数据表，右侧会展示真实元数据与样本。</p>
            </div>

            <div>
              <Label>数据源</Label>
              <FormSelect
                value={selectedSource?.toString()}
                onValueChange={(value) => {
                  setSelectedSource(Number(value))
                  setSelectedDatabase(undefined)
                  setSelectedTable(undefined)
                  setFieldConfigs([])
                }}
                placeholder="请选择数据源"
                options={datasourcesData?.data?.items?.map((ds: DataSource) => ({
                  value: ds.id.toString(),
                  label: `${ds.name} (${ds.source_type})`,
                })) || []}
                className="mt-1 h-11"
              />
            </div>

            <div>
              <Label>数据库</Label>
              <FormSelect
                value={selectedDatabase}
                onValueChange={(value) => {
                  setSelectedDatabase(value)
                  setSelectedTable(undefined)
                  setFieldConfigs([])
                }}
                placeholder="请选择数据库"
                disabled={!selectedSource || loadingDatabases}
                options={databasesData?.data?.map((database: string) => ({
                  value: database,
                  label: database,
                })) || []}
                className="mt-1 h-11"
              />
            </div>

            <div>
              <Label>数据表</Label>
              <FormSelect
                value={selectedTable}
                onValueChange={(value) => {
                  setSelectedTable(value)
                  setFieldConfigs([])
                }}
                placeholder="请选择数据表"
                disabled={!selectedDatabase || loadingTables}
                options={tablesData?.data?.map((table: { table_name: string; comment?: string }) => ({
                  value: table.table_name,
                  label: table.comment ? `${table.table_name} (${table.comment})` : table.table_name,
                })) || []}
                searchable
                className="mt-1 h-11"
              />
            </div>
          </div>
        ) : null}

        {currentStep === 1 ? (
          <div className="space-y-6 px-6 py-6">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">填写数据集信息</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">保留当前所选物理表上下文，只补充数据集名称、描述与责任人。</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              当前选择：{selectedDataSource?.name || '未选择'} / {selectedDatabase || '未选择'} / {selectedTable || '未选择'}
            </div>

            <div>
              <Label>数据集名称 *</Label>
              <FormInput
                value={formData.dataset_name}
                onChange={(value) => setFormData({ ...formData, dataset_name: value })}
                placeholder="例如: 用户订单数据集"
                className="mt-1 h-11"
              />
            </div>

            <div>
              <Label>描述</Label>
              <FormTextarea
                value={formData.description}
                onChange={(value) => setFormData({ ...formData, description: value })}
                rows={3}
                placeholder="描述此数据集的用途和业务含义"
                className="mt-1"
              />
            </div>

            <div>
              <Label>负责人 *</Label>
              <FormInput
                value={formData.owner}
                onChange={(value) => setFormData({ ...formData, owner: value })}
                placeholder="负责人"
                className="mt-1 h-11"
              />
            </div>
          </div>
        ) : null}

        {currentStep === 2 ? (
          <div className="space-y-6 px-6 py-6">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">配置字段信息</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">字段配置不会自动视为成功，请完成配置后再进入确认步骤。</p>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              请先完成字段配置，确认需要注册的字段后才能继续。
            </div>

            {fieldConfiguratorFields.length > 0 ? (
              <FieldConfigurator
                fields={fieldConfiguratorFields}
                sourceType={selectedDataSource?.source_type || 'postgresql'}
                onConfigChange={handleFieldConfigChange}
              />
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                当前没有可配置字段，请先修复元数据加载问题或重新选择数据表。
              </div>
            )}
          </div>
        ) : null}

        {currentStep === 3 ? (
          <div className="space-y-6 px-6 py-8">
            <div className="flex items-center gap-3 text-emerald-700">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50">
                <Check className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-slate-950">确认注册数据集</h2>
                <p className="mt-1 text-sm text-slate-500">确认后会基于当前物理表与字段配置创建数据集。</p>
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-slate-500">数据源</span>
                <span className="text-sm font-semibold text-slate-900">{selectedDataSource?.name}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-slate-500">数据集名称</span>
                <span className="text-sm font-semibold text-slate-900">
                  {formData.dataset_name || <span className="italic text-red-500">（未填写）</span>}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-slate-500">物理表</span>
                <span className="rounded-lg border border-slate-200 bg-white px-3 py-1 font-mono text-sm text-slate-900">
                  {selectedDatabase}.{selectedTable}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-slate-500">责任人</span>
                <span className="text-sm text-slate-900">{formData.owner}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-slate-500">字段配置</span>
                <span className="text-sm text-slate-900">{fieldConfigs.length} 个字段</span>
              </div>
            </div>
          </div>
        ) : null}

        {footerActions}
      </div>
    </RegisterFlowShell>
  )
}
