/**
 * ExtractionTaskConfig - 数据提取任务配置页面（三步向导） - Migrated to shadcn/ui
 */

import { useState, useMemo } from 'react'
import { ArrowLeft, ArrowRight, FileText, Check } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createTask } from '../../api/extraction'
import StepDatasetFields from './StepDatasetFields'
import StepFilterConfig from './StepFilterConfig'
import StepPreview from './StepPreview'
import type { FilterGroup, FieldMeta } from '../../types/filter'
import type { CreateTaskRequest } from '@/types'
import { FormButton, useToast } from '@/components/business'
import { cn } from '@/lib/utils'

export default function ExtractionTaskConfig() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [searchParams] = useSearchParams()
  
  // 从URL参数获取预选的数据集ID
  const preselectedDatasetId = searchParams.get('dataset') ? Number(searchParams.get('dataset')) : null
  const taskType = searchParams.get('taskType') === 'scheduled' ? 'scheduled' : 'manual'
  const taskTypeLabel = taskType === 'scheduled' ? '定时查询' : '数据提取任务'
  const successTitle = taskType === 'scheduled' ? '定时查询创建成功' : '任务创建成功'
  
  // 状态管理
  const [currentStep, setCurrentStep] = useState(0)
  const [datasetId, setDatasetId] = useState<number | null>(preselectedDatasetId)
  const [selectedFields, setSelectedFields] = useState<string[]>([])
  const [filterConditions, setFilterConditions] = useState<FilterGroup>({
    logic: 'AND' as const,
    filters: [{ field: '', operator: '', value: null }],
    groups: []
  })
  
  // 获取字段元数据（用于步骤2）
  const [fields, setFields] = useState<FieldMeta[]>([])
  
  // 创建任务Mutation
  const createMutation = useMutation({
    mutationFn: createTask,
    onSuccess: async () => {
      toast({ title: successTitle })
      
      // 刷新任务列表
      await queryClient.invalidateQueries({ queryKey: ['extraction-tasks'] })
      await queryClient.invalidateQueries({ queryKey: ['scheduled-query-tasks'] })
      
      // 等待刷新后导航
      setTimeout(() => navigate(taskType === 'scheduled' ? '/queries/scheduled' : '/extraction-tasks'), 100)
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } }; message?: string }
      toast({ 
        title: '创建任务失败', 
        description: err.response?.data?.message || err.message,
        variant: 'destructive' 
      })
    }
  })
  
  // 步骤定义
  const steps = [
    {
      title: '选择数据集和字段',
      description: '选择要提取的数据集和字段'
    },
    {
      title: '配置过滤条件',
      description: '设置数据过滤规则'
    },
    {
      title: '预览与保存',
      description: '预览数据并保存任务'
    }
  ]
  
  // 当前步骤是否可以进入下一步
  const canGoNext = useMemo(() => {
    switch (currentStep) {
      case 0:
        return datasetId !== null
      case 1:
        return true
      case 2:
        return true
      default:
        return false
    }
  }, [currentStep, datasetId])
  
  // 处理下一步
  const handleNext = () => {
    if (canGoNext) {
      setCurrentStep(currentStep + 1)
    }
  }
  
  // 处理上一步
  const handlePrev = () => {
    setCurrentStep(currentStep - 1)
  }
  
  // 处理保存
  const handleSave = (taskData: CreateTaskRequest) => {
    createMutation.mutate({ ...taskData, task_type: taskType })
  }
  
  // 渲染当前步骤的内容
  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <StepDatasetFields
            datasetId={datasetId}
            selectedFields={selectedFields}
            onDatasetChange={(id) => {
              setDatasetId(id)
              setSelectedFields([])
              setFields([])
            }}
            onFieldsChange={setSelectedFields}
            onFieldsMetaChange={setFields}
          />
        )
      
      case 1:
        return (
          <StepFilterConfig
            fields={fields}
            filterConditions={filterConditions}
            onFilterChange={setFilterConditions}
          />
        )
      
      case 2:
        return (
          <StepPreview
            datasetId={datasetId!}
            selectedFields={selectedFields}
            filterConditions={filterConditions}
            onSave={handleSave}
            isSaving={createMutation.isPending}
          />
        )
      
      default:
        return null
    }
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* 返回按钮 */}
          <FormButton
          variant="outline"
          onClick={() => navigate(taskType === 'scheduled' ? '/queries/scheduled' : '/extraction-tasks')}
          className="mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          返回{taskType === 'scheduled' ? '定时查询' : '任务列表'}
        </FormButton>
        
        {/* 页面标题 */}
        <div className="mb-6 flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/25">
            <FileText className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">创建{taskTypeLabel}</h1>
            <p className="text-gray-500 mt-1">
              {taskType === 'scheduled'
                ? '配置周期执行的查询任务，保存后可在定时查询工作区继续启停和重跑。'
                : '配置数据提取任务的数据集、字段和过滤条件'}
            </p>
          </div>
        </div>
        
        {/* 步骤指示器 - Custom Stepper */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div key={index} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all",
                    index < currentStep ? "bg-purple-500 text-white" :
                    index === currentStep ? "bg-purple-500 text-white ring-4 ring-purple-100" :
                    "bg-gray-200 text-gray-500"
                  )}>
                    {index < currentStep ? <Check className="w-5 h-5" /> : index + 1}
                  </div>
                  <div className="mt-2 text-center">
                    <div className={cn(
                      "font-medium text-sm",
                      index <= currentStep ? "text-gray-900" : "text-gray-500"
                    )}>
                      {step.title}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {step.description}
                    </div>
                  </div>
                </div>
                {index < steps.length - 1 && (
                  <div className={cn(
                    "h-0.5 flex-1 mx-4 transition-all",
                    index < currentStep ? "bg-purple-500" : "bg-gray-200"
                  )} />
                )}
              </div>
            ))}
          </div>
        </div>
        
        {/* 步骤内容 */}
        <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 mb-6" style={{ minHeight: '500px' }}>
          {renderStepContent()}
        </div>
        
        {/* 步骤导航按钮 */}
        <div className="flex justify-between">
          <FormButton
            variant="outline"
            onClick={handlePrev}
            disabled={currentStep === 0}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            上一步
          </FormButton>
          
          {currentStep < steps.length - 1 && (
            <FormButton
              onClick={handleNext}
              disabled={!canGoNext}
              className="bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700"
            >
              下一步
              <ArrowRight className="w-4 h-4 ml-2" />
            </FormButton>
          )}
        </div>
      </div>
    </div>
  )
}
