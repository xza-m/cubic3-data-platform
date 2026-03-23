/**
 * Step 3: 预览与保存 - Migrated to shadcn/ui
 */

import { useState } from 'react'
import { RefreshCw, CheckCircle, FileText, Save, Code, Loader2, ChevronDown } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { previewData } from '../../api/extraction'
import type { FilterGroup } from '../../types/filter'
import type { PreviewDataResult, CreateTaskRequest } from '@/types'
import { FormButton, DataTable, useToast } from '@/components/business'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { ColumnDef } from '@tanstack/react-table'
import { cn } from '@/lib/utils'

interface StepPreviewProps {
  datasetId: number
  selectedFields: string[]
  filterConditions: FilterGroup
  onSave: (taskData: CreateTaskRequest) => void
  isSaving: boolean
}

export default function StepPreview({ 
  datasetId, 
  selectedFields, 
  filterConditions, 
  onSave, 
  isSaving 
}: StepPreviewProps) {
  
  const { toast } = useToast()
  const [previewResult, setPreviewResult] = useState<PreviewDataResult | null>(null)
  const [taskName, setTaskName] = useState('')
  const [description, setDescription] = useState('')
  const [rowLimit, setRowLimit] = useState(500000)
  
  // 数据预览Mutation
  const previewMutation = useMutation({
    mutationFn: () => previewData({
      dataset_id: datasetId,
      select_fields: selectedFields.length > 0 ? selectedFields : [],
      filter_conditions: filterConditions,
      limit: 10
    }),
    onSuccess: (response) => {
      setPreviewResult(response.data)
      toast({ title: '预览成功' })
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } }; message?: string }
      toast({ 
        title: '预览失败', 
        description: err.response?.data?.message || err.message,
        variant: 'destructive' 
      })
    }
  })
  
  // 处理保存
  const handleSave = () => {
    if (!taskName) {
      toast({ title: '请输入任务名称', variant: 'destructive' })
      return
    }
    if (!rowLimit || rowLimit < 1 || rowLimit > 1000000) {
      toast({ title: '行数限制在1-1000000之间', variant: 'destructive' })
      return
    }
    
    onSave({
      task_name: taskName,
      description,
      dataset_id: datasetId,
      select_fields: selectedFields.length > 0 ? selectedFields : [],
      filter_conditions: filterConditions,
      row_limit: rowLimit,
      task_type: 'manual'
    })
  }
  
  // 构建表格列
  const columns: ColumnDef<Record<string, unknown>>[] = previewResult?.columns?.map((col: string) => ({
    accessorKey: col,
    header: col,
    cell: ({ row }) => (
      <span className="text-sm text-gray-700">{String(row.getValue(col))}</span>
    )
  })) || []
  
  // 构建表格数据
  const dataSource = previewResult?.data || []
  
  return (
    <div className="grid grid-cols-3 gap-6" style={{ height: 'calc(100vh - 350px)' }}>
      {/* 左侧：数据预览 */}
      <div className="col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center shadow-lg">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">数据预览</h3>
          </div>
          
          <FormButton
            variant="outline"
            onClick={() => previewMutation.mutate()}
            disabled={previewMutation.isPending}
            className="bg-white"
          >
            <RefreshCw className={cn("w-4 h-4 mr-2", previewMutation.isPending && "animate-spin")} />
            刷新预览
          </FormButton>
        </div>
        
        <div className="flex-1 bg-gray-50 rounded-xl border border-gray-100 overflow-hidden">
          {previewMutation.isPending ? (
            <div className="flex flex-col items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
              <div className="mt-4 text-gray-500">加载预览数据中...</div>
            </div>
          ) : previewResult ? (
            <div className="h-full overflow-auto p-4">
              {/* SQL 预览 - 可折叠 */}
              {previewResult.sql && (
                <Accordion type="single" collapsible className="mb-4 bg-white rounded-lg border border-gray-200">
                  <AccordionItem value="sql" className="border-none">
                    <AccordionTrigger className="px-4 py-3 hover:no-underline">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Code className="w-4 h-4" />
                        <span>🔍 SQL 预览</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-3 border border-blue-100/50 mb-3">
                        <div className="text-xs text-blue-700">
                          💡 以下是平台封装后实际执行的 SQL（包含字段选择、过滤条件和脱敏规则）
                        </div>
                      </div>
                      <pre 
                        className="bg-gray-900 text-green-400 rounded-lg p-4 overflow-auto text-xs font-mono"
                        style={{ maxHeight: '300px' }}
                      >
                        <code>{previewResult.sql}</code>
                      </pre>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}
              
              {/* 数据表格 */}
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <DataTable
                  columns={columns}
                  data={dataSource}
                  showPagination={false}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <FileText className="w-16 h-16 mb-4 opacity-30" />
              <p className="text-lg">点击"刷新预览"查看数据</p>
            </div>
          )}
        </div>
      </div>
      
      {/* 右侧：任务配置 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
            <Save className="w-5 h-5 text-white" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">任务配置</h3>
        </div>
        
        <div className="flex-1 space-y-4">
          <div>
            <Label htmlFor="task_name">任务名称 *</Label>
            <Input
              id="task_name"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              placeholder="例如：每日订单数据提取"
              className="mt-1 rounded-xl"
            />
          </div>
          
          <div>
            <Label htmlFor="description">任务说明</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="描述任务的用途和注意事项（可选）"
              className="mt-1 rounded-xl"
            />
          </div>
          
          <div>
            <Label htmlFor="row_limit">行数限制 *</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                id="row_limit"
                type="number"
                value={rowLimit}
                onChange={(e) => setRowLimit(Number(e.target.value))}
                placeholder="最大提取行数"
                min={1}
                max={1000000}
                className="rounded-xl"
              />
              <span className="text-sm text-gray-500">行</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">行数限制在1-1000000之间</p>
          </div>
          
          {/* 配置摘要 */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle className="w-4 h-4 text-blue-600" />
              <div className="text-sm font-semibold text-gray-800">配置摘要</div>
            </div>
            <div className="space-y-2 text-sm text-gray-700">
              <div className="flex justify-between">
                <span>已选字段</span>
                <span className="font-medium text-blue-600">
                  {selectedFields.length === 0 ? '所有字段' : `${selectedFields.length} 个`}
                </span>
              </div>
              <div className="flex justify-between">
                <span>过滤条件</span>
                <span className="font-medium text-purple-600">
                  {filterConditions.filters?.length || 0} 条
                </span>
              </div>
              <div className="flex justify-between">
                <span>过滤分组</span>
                <span className="font-medium text-pink-600">
                  {filterConditions.groups?.length || 0} 组
                </span>
              </div>
            </div>
          </div>
          
          {/* 保存按钮 - Gradient */}
          <FormButton
            onClick={handleSave}
            disabled={isSaving}
            loading={isSaving}
            className="w-full rounded-xl bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500 hover:from-purple-600 hover:via-indigo-600 hover:to-blue-600 shadow-lg shadow-purple-500/25"
          >
            <Save className="w-5 h-5 mr-2" />
            保存任务
          </FormButton>
        </div>
      </div>
    </div>
  )
}
