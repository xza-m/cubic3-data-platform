/**
 * FilterCondition - 单个过滤条件组件 - Migrated to shadcn/ui
 */

import { useMemo, useState } from 'react'
import { X, Plus } from 'lucide-react'
import type { FilterCondition as FilterConditionType, FieldMeta } from '../../types/filter'
import { getOperatorOptions, operatorNeedsValue, operatorNeedsRange, operatorNeedsMultiValue } from '../../types/filter'
import { FormSelect, FormButton, type FormSelectOption } from '@/components/business'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

const normalizeInputValue = (value: string | number | (string | number)[] | null | undefined) => {
  if (Array.isArray(value) || value === null || value === undefined) {
    return ''
  }
  return value
}

interface FilterConditionProps {
  condition: FilterConditionType
  fields: FieldMeta[]
  onChange: (updated: Partial<FilterConditionType>) => void
  onRemove: () => void
}

export default function FilterCondition({ condition, fields, onChange, onRemove }: FilterConditionProps) {
  // 当前选中的字段元数据
  const selectedField = useMemo(() => 
    fields.find(f => f.physical_name === condition.field),
    [fields, condition.field]
  )
  
  // 根据字段类型获取操作符选项
  const operatorOptions = useMemo(() => {
    if (!selectedField) return []
    return getOperatorOptions(selectedField.field_type)
  }, [selectedField])
  
  // 当字段改变时，重置操作符和值
  const handleFieldChange = (field: string) => {
    onChange({ field, operator: '', value: null })
  }
  
  // 当操作符改变时，根据需要重置值
  const handleOperatorChange = (operator: string) => {
    let newValue = null
    
    if (operatorNeedsRange(operator)) {
      newValue = ['', '']
    } else if (operatorNeedsMultiValue(operator)) {
      newValue = []
    }
    
    onChange({ operator, value: newValue })
  }
  
  // 渲染值输入组件
  const renderValueInput = () => {
    const { operator, value } = condition
    
    if (!operatorNeedsValue(operator)) {
      return null
    }
    
    const fieldType = selectedField?.field_type || 'STRING'
    const isNumeric = fieldType.toUpperCase().includes('INT') || 
                      fieldType.toUpperCase().includes('DECIMAL') ||
                      fieldType.toUpperCase().includes('FLOAT')
    const isDate = fieldType.toUpperCase().includes('DATE') || 
                   fieldType.toUpperCase().includes('TIME')
    
    // BETWEEN: 范围输入
    if (operatorNeedsRange(operator)) {
      const [start, end] = Array.isArray(value) ? value : ['', '']
      
      if (isDate) {
        return (
          <div className="flex items-center gap-2 flex-1">
            <Input
              type="date"
              value={start || ''}
              onChange={(e) => onChange({ value: [e.target.value, end] })}
              placeholder="起始日期"
              className="flex-1"
            />
            <span className="text-gray-400">~</span>
            <Input
              type="date"
              value={end || ''}
              onChange={(e) => onChange({ value: [start, e.target.value] })}
              placeholder="结束日期"
              className="flex-1"
            />
          </div>
        )
      }
      
      return (
        <div className="flex items-center gap-2 flex-1">
          <Input
            type={isNumeric ? 'number' : 'text'}
            value={start || ''}
            onChange={(e) => onChange({ value: [isNumeric ? Number(e.target.value) : e.target.value, end] })}
            placeholder="起始值"
            className="flex-1"
          />
          <span className="text-gray-400">~</span>
          <Input
            type={isNumeric ? 'number' : 'text'}
            value={end || ''}
            onChange={(e) => onChange({ value: [start, isNumeric ? Number(e.target.value) : e.target.value] })}
            placeholder="结束值"
            className="flex-1"
          />
        </div>
      )
    }
    
    // IN/NOT IN: 多值输入（标签模式）
    if (operatorNeedsMultiValue(operator)) {
      return <MultiValueInput 
        values={Array.isArray(value) ? value : []}
        isNumeric={isNumeric}
        onChange={(newValues) => onChange({ value: newValues })}
      />
    }
    
    // 普通单值输入
    if (isDate) {
        return (
          <Input
            type="date"
            value={normalizeInputValue(value)}
            onChange={(e) => onChange({ value: e.target.value })}
            placeholder="选择日期"
            className="flex-1"
        />
      )
    }
    
    if (isNumeric) {
      return (
        <Input
          type="number"
          value={normalizeInputValue(value)}
          onChange={(e) => onChange({ value: Number(e.target.value) })}
          placeholder="输入数值"
          className="flex-1"
        />
      )
    }
    
    return (
      <Input
        value={normalizeInputValue(value)}
        onChange={(e) => onChange({ value: e.target.value })}
        placeholder="输入值"
        className="flex-1"
      />
    )
  }
  
  return (
    <div className="flex gap-2 p-3 bg-gray-50 rounded-lg items-start">
      {/* 字段选择 */}
      <FormSelect
        value={condition.field || ''}
        onChange={handleFieldChange}
        placeholder="选择字段"
        searchable
        options={fields.map(field => ({
          value: field.physical_name,
          label: field.display_name,
          desc: `${field.field_type}${field.field_category === 'PARTITION_KEY' ? ' 分区' : ''}`
        }))}
        className="w-[180px]"
        renderOption={(option: FormSelectOption) => (
          <div className="py-1">
            <div className="font-medium">{option.label}</div>
            <div className="text-xs text-gray-500">{option.desc}</div>
          </div>
        )}
      />
      
      {/* 操作符选择 */}
      <FormSelect
        value={condition.operator || ''}
        onChange={handleOperatorChange}
        placeholder="操作符"
        disabled={!condition.field}
        options={operatorOptions.map(op => ({
          value: op.value,
          label: op.label
        }))}
        className="w-[120px]"
      />
      
      {/* 值输入 */}
      {renderValueInput()}
      
      {/* 删除按钮 */}
      <FormButton
        variant="ghost"
        size="icon"
        onClick={onRemove}
        className="flex-shrink-0 text-red-500 hover:text-red-700 hover:bg-red-50"
      >
        <X className="w-4 h-4" />
      </FormButton>
    </div>
  )
}

// 多值输入组件
function MultiValueInput({ 
  values, 
  isNumeric, 
  onChange 
}: { 
  values: (string | number)[]
  isNumeric: boolean
  onChange: (values: (string | number)[]) => void
}) {
  const [inputValue, setInputValue] = useState('')
  
  const handleAddValue = () => {
    if (inputValue.trim()) {
      const newValue = isNumeric ? Number(inputValue) : inputValue.trim()
      onChange([...values, newValue])
      setInputValue('')
    }
  }
  
  const handleRemoveValue = (index: number) => {
    onChange(values.filter((_, i) => i !== index))
  }
  
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddValue()
    }
  }
  
  return (
    <div className="flex gap-2 items-start flex-1">
      <div className="flex flex-wrap gap-1 min-h-[40px] border border-gray-200 rounded-md p-2 flex-1">
        {values.map((v, i) => (
          <Badge key={i} variant="secondary" className="pr-1">
            {String(v)}
            <button
              onClick={() => handleRemoveValue(i)}
              className="ml-1 hover:text-red-600"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-1">
        <Input
          type={isNumeric ? 'number' : 'text'}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="输入值后回车"
          className="w-[150px]"
        />
        <FormButton 
          size="icon"
          onClick={handleAddValue}
          className="flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
        </FormButton>
      </div>
    </div>
  )
}
