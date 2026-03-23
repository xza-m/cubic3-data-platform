/**
 * 文件数据集注册页面 - Migrated to shadcn/ui
 */
import { useState, useEffect, useRef, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  FileText,
  Upload as UploadIcon,
  Check,
  ChevronRight,
  ChevronLeft,
  Settings,
  Loader2
} from 'lucide-react'
import { uploadCSVFile } from '../api/files'
import type { FileUploadResponse } from '../api/files'
import { createDataset } from '../api/datasets'
import type { FieldConfigItem } from '@/types'
import FieldConfigurator from '../components/FieldConfigurator/FieldConfigurator'
import { FormButton, DataTable, useToast } from '@/components/business'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ColumnDef } from '@tanstack/react-table'
import { cn } from '@/lib/utils'

export default function FileDatasetRegister() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [currentStep, setCurrentStep] = useState(0)
  const [fileMetadata, setFileMetadata] = useState<FileUploadResponse | null>(null)
  const [uploading, setUploading] = useState(false)
  const [fieldConfigs, setFieldConfigs] = useState<FieldConfigItem[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Form state
  const [datasetName, setDatasetName] = useState('')
  const [description, setDescription] = useState('')
  const [owner, setOwner] = useState('admin')

  const createMutation = useMutation({
    mutationFn: createDataset,
    onSuccess: async () => {
      toast({ title: '文件数据集创建成功' })
      await queryClient.invalidateQueries({ queryKey: ['datasets'] })
      await queryClient.invalidateQueries({ queryKey: ['datasets', 'statistics'] })
      setTimeout(() => navigate('/data-center/datasets'), 100)
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } }; message?: string }
      toast({ 
        title: '创建失败', 
        description: err.response?.data?.message || '请重试',
        variant: 'destructive' 
      })
    }
  })

  const steps = [
    { title: '上传文件', icon: UploadIcon, color: 'blue' },
    { title: '填写信息', icon: Settings, color: 'emerald' },
    { title: '配置字段', icon: Settings, color: 'indigo' },
    { title: '完成注册', icon: Check, color: 'purple' }
  ]

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const result = await uploadCSVFile(file)
      setFileMetadata(result)
      toast({ title: `文件上传成功，共 ${result.row_count} 行数据` })
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } }; message?: string }
      toast({ 
        title: '上传失败', 
        description: err.response?.data?.message || err.message,
        variant: 'destructive' 
      })
    } finally {
      setUploading(false)
    }
  }

  const handleNext = () => {
    if (currentStep === 0) {
      if (!fileMetadata) {
        toast({ title: '请先上传CSV文件', variant: 'warning' })
        return
      }
      setCurrentStep(1)
    } else if (currentStep === 1) {
      if (!datasetName) {
        toast({ title: '请输入数据集名称', variant: 'destructive' })
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
    if (!datasetName) {
      toast({ title: '请输入数据集名称', variant: 'destructive' })
      setCurrentStep(1)
      return
    }

    const data = {
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
        uploaded_at: fileMetadata.uploaded_at
      },
      fields: fieldConfigs
    }
    
    createMutation.mutate(data)
  }

  // 准备字段配置器的数据（使用后端识别结果）
  const fieldConfiguratorFields = useMemo(() => {
    if (!fileMetadata) return []
    
    // 统一字段名为 fields（与物理表一致）
    const identifiedFields = fileMetadata.fields
    
    if (!identifiedFields) {
      // 兼容：如果后端未返回识别结果，使用旧逻辑
      return fileMetadata.columns.map((col: { name: string; type: string; sample_values: (string | number | boolean | null)[] }) => ({
        name: col.name,
        type: col.type.toUpperCase(),
        display_name: col.name
      }))
    }
    
    // 使用后端 FieldIdentifier 识别结果
    return identifiedFields.map((field: NonNullable<FileUploadResponse['fields']>[number]) => ({
      name: field.field_name,
      type: field.data_type,
      display_name: field.display_name,
      comment: field.comment,
      business_type: field.business_type,
      sensitivity_level: field.sensitivity_level,
      mask_rule: field.mask_rule,
      confidence_score: field.confidence_score,
      matched_rules: field.matched_rules,
      auto_recognized: field.confidence_score > 0.5
    }))
  }, [fileMetadata])
  
  const handleFieldConfigChange = (configs: FieldConfigItem[]) => {
    // 转换为后端需要的格式
    const fields = configs.map(config => ({
      physical_name: config.physical_name,
      data_type: config.data_type,
      display_name: config.display_name,
      mask_rule: config.mask_rule,
      comment: config.comment,
      field_order: config.field_order
    }))
    setFieldConfigs(fields)
  }

  // 构建预览表格列
  const previewColumns: ColumnDef<Record<string, unknown>>[] = fileMetadata?.columns?.map((col: { name: string; type: string }) => ({
    accessorKey: col.name,
    header: col.name,
  })) || []

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
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/25">
          <FileText className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">文件数据集注册</h1>
          <p className="text-gray-500 text-sm">从 CSV 文件创建数据集</p>
        </div>
      </div>

      {/* 步骤指示器 */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => {
            const Icon = step.icon
            const isActive = index === currentStep
            const isCompleted = index < currentStep
            
            return (
              <div key={index} className="flex items-center flex-1">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center font-semibold text-sm transition-all",
                    isActive && "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg",
                    isCompleted && "bg-emerald-100 text-emerald-600",
                    !isActive && !isCompleted && "bg-gray-100 text-gray-400"
                  )}>
                    {isCompleted ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                  </div>
                  <div className={cn("text-sm font-medium", isActive ? "text-gray-900" : "text-gray-500")}>
                    {step.title}
                  </div>
                </div>
                {index < steps.length - 1 && (
                  <div className={cn("h-0.5 flex-1 mx-4", isCompleted ? "bg-emerald-200" : "bg-gray-200")} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 步骤内容 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        {currentStep === 0 && (
          <div className="p-16 text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
            />
            <div
              onClick={() => !uploading && !fileMetadata && fileInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-2xl p-8 transition-all cursor-pointer",
                !uploading && !fileMetadata && "hover:border-blue-400 hover:bg-blue-50/50"
              )}
            >
              {uploading ? (
                <>
                  <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-blue-500" />
                  <p className="text-gray-600">上传中...</p>
                </>
              ) : fileMetadata ? (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center mx-auto mb-4 shadow-lg">
                    <Check className="w-8 h-8 text-white" />
                  </div>
                  <p className="text-lg font-semibold text-gray-900 mb-2">{fileMetadata.file_name}</p>
                  <p className="text-gray-500 text-sm mb-4">
                    {fileMetadata.row_count} 行 • {(fileMetadata.file_size / 1024 / 1024).toFixed(2)} MB
                  </p>
                  <div className="max-w-2xl mx-auto mb-4">
                    <h3 className="text-md font-semibold text-gray-700 mb-3 text-left">数据预览</h3>
                    <DataTable
                      columns={previewColumns}
                      data={fileMetadata.preview || []}
                      showPagination={false}
                    />
                  </div>
                  <FormButton
                    variant="link"
                    onClick={(e) => {
                      e.stopPropagation()
                      setFileMetadata(null)
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    }}
                    className="text-indigo-600 hover:text-indigo-700"
                  >
                    重新上传
                  </FormButton>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center mx-auto mb-4 shadow-lg">
                    <UploadIcon className="w-8 h-8 text-white" />
                  </div>
                  <p className="text-lg font-semibold text-gray-900 mb-2">上传 CSV 文件</p>
                  <p className="text-gray-500 text-sm">
                    点击或拖拽文件到此区域上传<br />
                    支持 CSV 格式，最大 50MB
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {currentStep === 1 && (
          <div className="p-8">
            <h2 className="text-lg font-bold text-gray-900 mb-6">填写数据集信息</h2>
            <div className="space-y-4">
              <div>
                <Label htmlFor="dataset_name">数据集名称 *</Label>
                <Input
                  id="dataset_name"
                  value={datasetName}
                  onChange={(e) => setDatasetName(e.target.value)}
                  placeholder="例如: 2025年销售明细"
                  className="mt-1 rounded-xl"
                />
              </div>

              <div>
                <Label htmlFor="description">描述</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="描述此文件数据集的用途"
                  className="mt-1 rounded-xl"
                />
              </div>

              <div>
                <Label htmlFor="owner">负责人 *</Label>
                <Input
                  id="owner"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  placeholder="负责人"
                  className="mt-1 rounded-xl"
                />
              </div>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="p-8">
            <h2 className="text-lg font-bold text-gray-900 mb-6">配置字段信息</h2>
            {fileMetadata && (
              <FieldConfigurator
                fields={fieldConfiguratorFields}
                sourceType="file"
                onConfigChange={handleFieldConfigChange}
              />
            )}
          </div>
        )}

        {currentStep === 3 && (
          <div className="p-16 text-center">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center mx-auto mb-6 shadow-xl shadow-emerald-500/25">
              <Check className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">确认创建文件数据集</h2>
            <div className="max-w-md mx-auto space-y-3 text-left bg-gray-50 rounded-xl p-6">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">数据集名称：</span>
                <span className="font-medium text-gray-900">{datasetName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">文件名：</span>
                <span className="font-medium text-gray-900">{fileMetadata?.file_name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">文件大小：</span>
                <span className="font-medium text-gray-900">
                  {(fileMetadata?.file_size / 1024 / 1024).toFixed(2)} MB
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">数据行数：</span>
                <span className="font-medium text-gray-900">{fileMetadata?.row_count} 行</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">字段数量：</span>
                <span className="font-medium text-gray-900">{fieldConfigs.length} 个</span>
              </div>
            </div>
          </div>
        )}

        {/* 底部按钮 */}
        <div className="border-t border-gray-100 px-8 py-5 flex items-center justify-between bg-gray-50 rounded-b-2xl">
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
              className="bg-emerald-500 hover:bg-emerald-600"
            >
              <Check className="w-5 h-5 mr-2" />
              确认创建
            </FormButton>
          )}
        </div>
      </div>
    </div>
  )
}
