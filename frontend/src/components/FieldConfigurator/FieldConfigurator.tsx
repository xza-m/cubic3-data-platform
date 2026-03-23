/**
 * FieldConfigurator - Migrated to shadcn/ui
 */
import { useState, useEffect, useRef } from 'react'
import { CheckCircle, AlertTriangle, Info } from 'lucide-react'
import { analyzeFields } from '@/utils/fieldRecognition'
import { DataTable, FormSelect, Badge, type FormSelectOption } from '@/components/business'
import type { BadgeProps } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ColumnDef } from '@tanstack/react-table'

interface FieldConfig {
  physical_name: string
  data_type: string
  display_name: string
  business_type: string
  sensitivity_level: string
  mask_rule?: string
  field_order: number
  // 识别结果
  auto_recognized: boolean
  confidence: number
  reasons: string[]
}

interface FieldConfiguratorProps {
  fields: Array<{
    name: string
    type: string
    comment?: string
    display_name?: string
    business_type?: string  // 后端识别结果
    sensitivity_level?: string  // 后端识别结果
    mask_rule?: string  // 后端识别结果
    confidence_score?: number  // 后端识别置信度
    matched_rules?: string[]  // 后端匹配的规则
    auto_recognized?: boolean  // 是否自动识别
  }>
  sourceType?: string
  onConfigChange: (configs: FieldConfig[]) => void
}

export default function FieldConfigurator({ fields, sourceType, onConfigChange }: FieldConfiguratorProps) {
  const [fieldConfigs, setFieldConfigs] = useState<FieldConfig[]>([])
  const prevFieldsRef = useRef<string>('')

  // 初始化：优先使用后端识别结果，否则使用前端自动识别
  useEffect(() => {
    // 通过序列化比较字段内容是否真的变化了
    // 包含 business_type、sensitivity_level 等后端识别结果，确保识别结果变化时也能重新初始化
    const fieldsKey = JSON.stringify(fields.map(f => ({ 
      name: f.name, 
      type: f.type,
      business_type: f.business_type,
      sensitivity_level: f.sensitivity_level,
      mask_rule: f.mask_rule,
      confidence_score: f.confidence_score
    })))
    if (prevFieldsRef.current === fieldsKey) {
      return // 字段内容没变，跳过初始化
    }
    prevFieldsRef.current = fieldsKey
    
    // 检查是否有后端识别结果
    const hasBackendRecognition = fields.some(f => f.business_type || f.sensitivity_level)
    
    let configs: FieldConfig[]
    
    if (hasBackendRecognition) {
      // 使用后端识别结果（已经识别好的）
      configs = fields.map((field, index) => ({
        physical_name: field.name,
        data_type: field.type,
        display_name: field.display_name || field.name,
        business_type: field.business_type || 'dimension',
        sensitivity_level: field.sensitivity_level || 'public',
        mask_rule: field.mask_rule,
        field_order: index,
        auto_recognized: field.auto_recognized || false,
        confidence: field.confidence_score || 0,
        reasons: field.matched_rules || []
      }))
    } else {
      // 使用前端自动识别（兜底方案）
      const analyzed = analyzeFields(
        fields.map(f => ({
          name: f.name,
          type: f.type,
          comment: f.comment,
          sample_values: [],
          sourceType
        }))
      )
      
      configs = analyzed.map((field, index) => ({
        physical_name: field.name,
        data_type: field.type,
        display_name: field.name,
        business_type: field.analysis.business_type,
        sensitivity_level: field.analysis.sensitivity_level,
        mask_rule: field.analysis.mask_rule,
        field_order: index,
        auto_recognized: true,
        confidence: field.analysis.confidence,
        reasons: field.analysis.reasons
      }))
    }

    setFieldConfigs(configs)
    onConfigChange(configs)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, sourceType])

  // 更新字段配置
  const updateField = (index: number, updates: Partial<FieldConfig>) => {
    if (index < 0 || index >= fieldConfigs.length) {
      return
    }
    const newConfigs = [...fieldConfigs]
    newConfigs[index] = {
      ...newConfigs[index],
      ...updates,
      auto_recognized: false  // 手动修改后标记
    }
    setFieldConfigs(newConfigs)
    onConfigChange(newConfigs)
  }

  // 统计信息
  const stats = {
    total: fieldConfigs.length,
    sensitive: fieldConfigs.filter(f => f.sensitivity_level !== 'public').length,
    highConfidence: fieldConfigs.filter(f => f.confidence >= 0.8).length,
    lowConfidence: fieldConfigs.filter(f => f.confidence < 0.6).length,
  }

  const columns: ColumnDef<FieldConfig>[] = [
    {
      accessorKey: 'physical_name',
      header: '字段名',
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs">{row.getValue('physical_name')}</span>
          {row.original.confidence >= 0.8 && (
            <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
          )}
          {row.original.confidence < 0.6 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                </TooltipTrigger>
                <TooltipContent>识别置信度较低，请检查</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      )
    },
    {
      accessorKey: 'data_type',
      header: '数据类型',
      cell: ({ row }) => <span className="font-mono text-xs text-gray-600">{row.getValue('data_type')}</span>
    },
    {
      accessorKey: 'business_type',
      header: '业务类型',
      cell: ({ row }) => {
        const index = fieldConfigs.findIndex(
          config => config.physical_name === row.original.physical_name
        )
        return (
          <FormSelect
            value={row.getValue('business_type')}
            onChange={(newValue: string) => updateField(index, { business_type: newValue })}
            options={[
              { value: 'partition', label: '分区键', badge: 'purple' },
              { value: 'dimension', label: '维度', badge: 'blue' },
              { value: 'metric', label: '度量', badge: 'green' },
            ]}
            className="w-full"
            renderOption={(option: FormSelectOption) => (
              <Badge variant={option.badge as BadgeProps['variant']}>{option.label}</Badge>
            )}
          />
        )
      }
    },
    {
      accessorKey: 'sensitivity_level',
      header: '敏感级别',
      cell: ({ row }) => {
        const index = fieldConfigs.findIndex(
          config => config.physical_name === row.original.physical_name
        )
        return (
          <FormSelect
            value={row.getValue('sensitivity_level')}
            onChange={(newValue: string) => updateField(index, { 
              sensitivity_level: newValue,
              mask_rule: newValue === 'public' ? undefined : row.original.mask_rule
            })}
            options={[
              { value: 'public', label: '公开', badge: 'green' },
              { value: 'internal', label: '内部', badge: 'blue' },
              { value: 'pii', label: '个人信息', badge: 'orange' },
              { value: 'confidential', label: '机密', badge: 'red' },
              { value: 'secret', label: '秘密', badge: 'purple' },
            ]}
            className="w-full"
            renderOption={(option: FormSelectOption) => (
              <Badge variant={option.badge as BadgeProps['variant']}>{option.label}</Badge>
            )}
          />
        )
      }
    },
    {
      accessorKey: 'mask_rule',
      header: '脱敏规则',
      cell: ({ row }) => {
        const index = fieldConfigs.findIndex(
          config => config.physical_name === row.original.physical_name
        )
        return row.original.sensitivity_level !== 'public' ? (
          <FormSelect
            value={row.getValue('mask_rule') || ''}
            onChange={(newValue: string) => updateField(index, { mask_rule: newValue })}
            options={[
              { value: 'mobile', label: '手机号' },
              { value: 'email', label: '邮箱' },
              { value: 'id_card', label: '身份证' },
              { value: 'name', label: '姓名' },
              { value: 'amount', label: '金额' },
              { value: 'full_mask', label: '完全脱敏' },
            ]}
            placeholder="选择规则"
            className="w-full"
          />
        ) : (
          <span className="text-gray-400 text-xs">-</span>
        )
      }
    },
    {
      id: 'comment',
      header: '字段描述',
      cell: ({ row }) => {
        const fieldComment = fields.find(f => f.name === row.original.physical_name)?.comment
        return (
          <span className="text-xs text-gray-500 truncate block">
            {fieldComment || <span className="italic text-gray-400">无</span>}
          </span>
        )
      }
    },
    {
      accessorKey: 'reasons',
      header: '识别依据',
      cell: ({ row }) => {
        const reasons = row.getValue('reasons') as string[]
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 cursor-pointer">
                  <Info className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-xs text-gray-500 truncate">
                    {reasons[0] || '默认配置'}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{reasons.join('；')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
      }
    }
  ]

  return (
    <div className="space-y-4">
      {/* 统计信息 */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
          <div className="text-sm text-blue-600 mb-1">总字段数</div>
          <div className="text-2xl font-bold text-blue-700">{stats.total}</div>
        </div>
        <div className="bg-orange-50 rounded-xl p-4 border border-orange-100">
          <div className="text-sm text-orange-600 mb-1">敏感字段</div>
          <div className="text-2xl font-bold text-orange-700">{stats.sensitive}</div>
        </div>
        <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
          <div className="text-sm text-emerald-600 mb-1">高置信度</div>
          <div className="text-2xl font-bold text-emerald-700">{stats.highConfidence}</div>
        </div>
        <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
          <div className="text-sm text-amber-600 mb-1">待确认</div>
          <div className="text-2xl font-bold text-amber-700">{stats.lowConfidence}</div>
        </div>
      </div>

      {/* 字段配置表格 */}
      <div className="bg-white rounded-xl border border-gray-100">
        <DataTable
          columns={columns}
          data={fieldConfigs}
          showPagination={false}
        />
      </div>

      {/* 提示信息 */}
      <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 mt-0.5" />
          <div className="text-sm text-blue-700">
            <div className="font-medium mb-1">智能识别说明</div>
            <ul className="list-disc list-inside space-y-1 text-blue-600">
              <li>系统已根据字段名、数据类型自动识别业务类型和敏感级别</li>
              <li>带 <CheckCircle className="w-3 h-3 inline" /> 的字段识别置信度高，可直接使用</li>
              <li>带 <AlertTriangle className="w-3 h-3 inline" /> 的字段建议人工确认</li>
              <li>您可以在表格中直接修改任何字段的配置</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
