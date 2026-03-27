/**
 * 文件数据集注册页面
 */
import { useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Settings,
  Upload as UploadIcon,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { uploadTabularFile } from '../api/files'
import type { FileUploadResponse } from '../api/files'
import { createDataset } from '../api/datasets'
import FieldConfigurator from '../components/FieldConfigurator/FieldConfigurator'
import {
  DataTable,
  FormButton,
  FormInput,
  FormTextarea,
  PreviewPanel,
  RegisterFlowShell,
  useToast,
} from '@/components/business'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { FieldConfigItem } from '@/types'

const getErrorMessage = (error: unknown, fallback: string) => {
  const err = error as { response?: { data?: { message?: string } }; message?: string }
  return err.response?.data?.message || err.message || fallback
}

export function handleInvalidFileDatasetSubmit({
  toast,
  setCurrentStep,
}: {
  toast: (payload: { title: string; variant: 'destructive' }) => void
  setCurrentStep: (step: number) => void
}) {
  toast({ title: '请输入数据集名称', variant: 'destructive' })
  setCurrentStep(1)
}

export function submitFileDatasetRegistration({
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
    handleInvalidFileDatasetSubmit({ toast, setCurrentStep })
    return
  }

  onValid()
}

type FileFieldConfiguratorChange = {
  physical_name: string
  data_type: string
  display_name?: string
  business_type?: string
  sensitivity_level?: string
  mask_rule?: string
  field_order?: number
  auto_recognized?: boolean
  confidence?: number
  reasons?: string[]
}

export default function FileDatasetRegister() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [fileMetadata, setFileMetadata] = useState<FileUploadResponse | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [fieldConfigs, setFieldConfigs] = useState<FieldConfigItem[]>([])
  const [datasetName, setDatasetName] = useState('')
  const [description, setDescription] = useState('')
  const [owner, setOwner] = useState('admin')

  const steps = [
    { title: '上传文件', icon: UploadIcon },
    { title: '填写信息', icon: Settings },
    { title: '配置字段', icon: Settings },
    { title: '完成注册', icon: Check },
  ]

  const createMutation = useMutation({
    mutationFn: createDataset,
    onSuccess: async () => {
      toast({ title: '文件数据集创建成功' })
      await queryClient.invalidateQueries({ queryKey: ['datasets'] })
      await queryClient.invalidateQueries({ queryKey: ['datasets', 'statistics'] })
      setTimeout(() => navigate('/data-center/datasets'), 100)
    },
    onError: (error: unknown) => {
      toast({
        title: '创建失败',
        description: getErrorMessage(error, '请重试'),
        variant: 'destructive',
      })
    },
  })

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setUploading(true)
    setUploadError(null)

    try {
      const result = await uploadTabularFile(file)
      setFileMetadata(result)
      setFieldConfigs([])
      toast({ title: `文件上传成功，共 ${result.row_count} 行数据` })
    } catch (error: unknown) {
      setUploadError(getErrorMessage(error, '文件上传失败'))
      toast({
        title: '上传失败',
        description: getErrorMessage(error, '文件上传失败'),
        variant: 'destructive',
      })
    } finally {
      setUploading(false)
    }
  }

  const handleNext = () => {
    if (currentStep === 0) {
      if (!fileMetadata) {
        toast({ title: '请先上传 CSV / Excel 文件', variant: 'warning' })
        return
      }
      if (uploadError) {
        toast({ title: '请先修复上传失败问题', variant: 'warning' })
        return
      }
      setCurrentStep(1)
      return
    }

    if (currentStep === 1) {
      if (!datasetName) {
        toast({ title: '请输入数据集名称', variant: 'destructive' })
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
    submitFileDatasetRegistration({
      datasetName,
      toast,
      setCurrentStep,
      onValid: () => {
        if (!fileMetadata) {
          toast({ title: '请先上传 CSV / Excel 文件', variant: 'warning' })
          return
        }

        createMutation.mutate({
          dataset_type: 'file' as const,
          dataset_name: datasetName,
          description,
          owner,
          file_metadata: {
            file_id: fileMetadata.file_id,
            file_path: fileMetadata.file_path,
            file_name: fileMetadata.file_name,
            file_size: fileMetadata.file_size,
            row_count: fileMetadata.row_count,
            uploaded_at: fileMetadata.uploaded_at,
          },
          fields: fieldConfigs,
        })
      },
    })
  }

  const fieldConfiguratorFields = useMemo(() => {
    if (fieldConfigs.length > 0) {
      return fieldConfigs.map((field) => ({
        name: field.physical_name,
        physical_name: field.physical_name,
        type: field.data_type,
        data_type: field.data_type,
        display_name: field.display_name,
        business_type: field.business_type,
        sensitivity_level: field.sensitivity_level,
        comment: field.comment,
        mask_rule: field.mask_rule,
        confidence_score: field.confidence_score,
        matched_rules: field.matched_rules,
        auto_recognized: field.auto_recognized,
        field_order: field.field_order,
      }))
    }

    if (!fileMetadata) return []

    if (!fileMetadata.fields) {
      return fileMetadata.columns.map((column: { name: string; type: string }) => ({
        name: column.name,
        type: column.type.toUpperCase(),
        display_name: column.name,
      }))
    }

    return fileMetadata.fields.map((field: NonNullable<FileUploadResponse['fields']>[number]) => ({
      name: field.physical_name || field.field_name || '',
      type: field.data_type,
      display_name: field.display_name || field.physical_name || field.field_name || '',
      comment: field.comment,
      business_type: field.business_type,
      sensitivity_level: field.sensitivity_level,
      mask_rule: field.mask_rule,
      confidence_score: field.confidence_score,
      matched_rules: field.matched_rules,
      auto_recognized: field.confidence_score > 0.5,
    }))
  }, [fieldConfigs, fileMetadata])

  const handleFieldConfigChange = (configs: FileFieldConfiguratorChange[]) => {
    const sourceFieldMap = new Map(
      fieldConfiguratorFields.map((field) => [
        field.physical_name || field.name || '',
        field,
      ]),
    )

    setFieldConfigs(configs.map((config) => {
      const sourceField = sourceFieldMap.get(config.physical_name)

      return {
        physical_name: config.physical_name,
        data_type: config.data_type,
        display_name: config.display_name,
        business_type: config.business_type,
        sensitivity_level: config.sensitivity_level,
        mask_rule: config.mask_rule,
        comment: sourceField?.comment,
        confidence_score: config.confidence,
        matched_rules: config.reasons,
        auto_recognized: config.auto_recognized,
        field_order: config.field_order,
      }
    }))
  }

  const previewColumns: ColumnDef<Record<string, unknown>>[] = fileMetadata?.columns?.map((column: { name: string }) => ({
    accessorKey: column.name,
    header: column.name,
  })) || []
  const previewRows = (fileMetadata?.sample_rows || fileMetadata?.preview || []) as Record<string, unknown>[]
  const previewLimit = fileMetadata?.preview_limit || previewRows.length || 0

  const previewPanel = (() => {
    if (uploading) {
      return (
        <PreviewPanel
          title="文件样本预览"
          description="上传成功后展示真实文件名、真实样本数据与字段识别结果。"
          state="loading"
          loadingText="正在上传并解析文件"
        />
      )
    }

    if (!fileMetadata) {
      if (uploadError) {
        return (
          <PreviewPanel
            title="文件样本预览"
            description="上传成功后展示真实文件名、真实样本数据与字段识别结果。"
            state="error"
            errorTitle="文件上传失败"
            errorDescription={uploadError}
          />
        )
      }

      return (
        <PreviewPanel
          title="文件样本预览"
          description="上传成功后展示真实文件名、真实样本数据与字段识别结果。"
          state="empty"
          emptyTitle="等待上传文件"
          emptyDescription="请上传真实 CSV / Excel 文件，上传后这里会展示真实样本数据。"
        />
      )
    }

    if (previewColumns.length === 0 || previewRows.length === 0) {
      return (
        <PreviewPanel
          title="文件样本预览"
          description="上传成功后展示真实文件名、真实样本数据与字段识别结果。"
          state="empty"
          emptyTitle="暂无样本数据"
          emptyDescription="文件已上传，但当前没有可展示的样本行，请检查源文件内容。"
        />
      )
    }

    return (
      <PreviewPanel
        title={`样本预览（前 ${previewLimit} 行）`}
        description="上传成功后展示真实样本数据。"
        state="ready"
      >
        <div className="space-y-4">
          {uploadError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              最新上传失败：{uploadError}
            </div>
          ) : null}
          {fieldConfigs.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              已保留 {fieldConfigs.length} 个字段配置，修复上传问题后可继续复用。
            </div>
          ) : null}
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
            <div className="text-sm font-medium text-emerald-800">真实文件预览</div>
            <div className="mt-1 text-sm text-emerald-700">基于上传文件解析的真实样本数据。</div>
          </div>
          <DataTable columns={previewColumns} data={previewRows} showPagination={false} />
          <div className="text-xs text-slate-500">重新上传将创建新的数据集对象，不会覆盖已有文件数据集。</div>
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
          确认创建
        </FormButton>
      )}
    </div>
  )

  return (
    <RegisterFlowShell
      title="文件数据集注册"
      description="使用真实文件上传、真实样本预览与字段配置流程完成文件数据集注册。"
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
                    {isCompleted ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
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
              <h2 className="text-xl font-semibold text-slate-950">上传文件</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">仅支持真实 CSV / Excel 文件，上传成功后右侧展示真实文件样本。</p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xls,.xlsx"
              onChange={handleFileSelect}
              className="hidden"
            />

            <div
              onClick={() => !uploading && fileInputRef.current?.click()}
              className={cn(
                'cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all',
                !uploading && 'hover:border-[hsl(var(--workbench-accent-soft))] hover:bg-[hsl(var(--workbench-surface-2))]',
              )}
            >
              {fileMetadata ? (
                <>
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50 text-emerald-600">
                    <Check className="h-8 w-8" />
                  </div>
                  <p className="font-workbench-display text-[1.25rem] font-semibold leading-[1.15] tracking-[-0.02em] text-slate-900">
                    {fileMetadata.file_name}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    {fileMetadata.row_count} 行 • {(fileMetadata.file_size / 1024 / 1024).toFixed(2)} MB
                  </p>
                  <FormButton
                    variant="link"
                    onClick={(event) => {
                      event.stopPropagation()
                      if (fileInputRef.current) {
                        fileInputRef.current.value = ''
                        fileInputRef.current.click()
                      }
                    }}
                    className="mt-4 text-indigo-600 hover:text-indigo-700"
                  >
                    重新上传并重新创建
                  </FormButton>
                </>
              ) : (
                <>
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-[hsl(var(--workbench-accent-soft))] bg-[hsl(var(--workbench-accent-soft))] text-[hsl(var(--workbench-accent-strong))]">
                    <UploadIcon className="h-8 w-8" />
                  </div>
                  <p className="font-workbench-display text-[1.25rem] font-semibold leading-[1.15] tracking-[-0.02em] text-slate-900">
                    上传 CSV / Excel 文件
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    点击或拖拽文件到此区域上传
                    <br />
                    支持 CSV / Excel 格式，最大 50MB
                  </p>
                </>
              )}
            </div>
          </div>
        ) : null}

        {currentStep === 1 ? (
          <div className="space-y-6 px-6 py-6">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">填写数据集信息</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">文件上下文会保留，请补充数据集名称、描述与责任人。</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              当前文件：{fileMetadata?.file_name || '未上传'}
            </div>

            <div>
              <Label htmlFor="dataset_name">数据集名称 *</Label>
              <FormInput
                id="dataset_name"
                value={datasetName}
                onChange={setDatasetName}
                placeholder="例如: 2025年销售明细"
                className="mt-1 rounded-xl"
              />
            </div>

            <div>
              <Label htmlFor="description">描述</Label>
              <FormTextarea
                id="description"
                value={description}
                onChange={setDescription}
                rows={3}
                placeholder="描述此文件数据集的用途"
                className="mt-1 rounded-xl"
              />
            </div>

            <div>
              <Label htmlFor="owner">负责人 *</Label>
              <FormInput
                id="owner"
                value={owner}
                onChange={setOwner}
                placeholder="负责人"
                className="mt-1 rounded-xl"
              />
            </div>
          </div>
        ) : null}

        {currentStep === 2 ? (
          <div className="space-y-6 px-6 py-6">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">配置字段信息</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">字段配置必须显式完成，不能跳过为默认成功。</p>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              请先完成字段配置，确认需要注册的字段后才能继续。
            </div>

            {fieldConfiguratorFields.length > 0 ? (
              <FieldConfigurator
                fields={fieldConfiguratorFields}
                sourceType="file"
                onConfigChange={handleFieldConfigChange}
              />
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                当前没有可配置字段，请重新上传文件或检查上传结果。
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
                <h2 className="text-xl font-semibold text-slate-950">确认创建文件数据集</h2>
                <p className="mt-1 text-sm text-slate-500">确认后会基于当前上传文件和字段配置创建文件数据集。</p>
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <div className="flex justify-between text-sm leading-6">
                <span className="text-slate-500">数据集名称：</span>
                <span className="font-medium text-slate-900">{datasetName}</span>
              </div>
              <div className="flex justify-between text-sm leading-6">
                <span className="text-slate-500">文件名：</span>
                <span className="font-medium text-slate-900">{fileMetadata?.file_name}</span>
              </div>
              <div className="flex justify-between text-sm leading-6">
                <span className="text-slate-500">文件大小：</span>
                <span className="font-medium text-slate-900">
                  {((fileMetadata?.file_size || 0) / 1024 / 1024).toFixed(2)} MB
                </span>
              </div>
              <div className="flex justify-between text-sm leading-6">
                <span className="text-slate-500">数据行数：</span>
                <span className="font-medium text-slate-900">{fileMetadata?.row_count} 行</span>
              </div>
              <div className="flex justify-between text-sm leading-6">
                <span className="text-slate-500">字段数量：</span>
                <span className="font-medium text-slate-900">{fieldConfigs.length} 个</span>
              </div>
            </div>
          </div>
        ) : null}

        {footerActions}
      </div>
    </RegisterFlowShell>
  )
}
