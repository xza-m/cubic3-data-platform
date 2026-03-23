/**
 * FieldSelector - 字段选择器组件 - Migrated to shadcn/ui
 * 
 * 功能：
 * 1. 按类别分组显示字段（分区键/维度/度量）
 * 2. 支持搜索过滤
 * 3. 全选/取消全选
 * 4. 实时统计已选字段数
 */

import { useMemo, useState } from 'react'
import { Search, Key, Database, BarChart3, ChevronDown } from 'lucide-react'
import type { FieldMeta } from '../../types/filter'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { cn } from '@/lib/utils'

interface FieldSelectorProps {
  fields: FieldMeta[]
  value?: string[]  // selected field names
  onChange?: (selected: string[]) => void
  showStatistics?: boolean
}

export default function FieldSelector({ 
  fields, 
  value = [], 
  onChange, 
  showStatistics = true 
}: FieldSelectorProps) {
  
  const [searchText, setSearchText] = useState('')
  const [activeKeys, setActiveKeys] = useState<string[]>(['partition', 'dimension', 'measure'])
  
  // 按类别分组字段
  const fieldsByCategory = useMemo(() => {
    const filtered = searchText 
      ? fields.filter(f => 
          f.display_name.toLowerCase().includes(searchText.toLowerCase()) ||
          f.physical_name.toLowerCase().includes(searchText.toLowerCase())
        )
      : fields
    
    return {
      partition: filtered.filter(f => f.field_category === 'PARTITION_KEY'),
      dimension: filtered.filter(f => f.field_category === 'DIMENSION'),
      measure: filtered.filter(f => f.field_category === 'MEASURE')
    }
  }, [fields, searchText])
  
  // 统计信息
  const statistics = useMemo(() => {
    const partitionCount = fieldsByCategory.partition.filter(f => value.includes(f.physical_name)).length
    const dimensionCount = fieldsByCategory.dimension.filter(f => value.includes(f.physical_name)).length
    const measureCount = fieldsByCategory.measure.filter(f => value.includes(f.physical_name)).length
    
    return {
      total: value.length,
      totalFields: fields.length,
      partition: { selected: partitionCount, total: fieldsByCategory.partition.length },
      dimension: { selected: dimensionCount, total: fieldsByCategory.dimension.length },
      measure: { selected: measureCount, total: fieldsByCategory.measure.length }
    }
  }, [fieldsByCategory, value, fields.length])
  
  // 处理字段选择变更
  const handleFieldToggle = (fieldName: string) => {
    const newValue = value.includes(fieldName)
      ? value.filter(f => f !== fieldName)
      : [...value, fieldName]
    
    onChange?.(newValue)
  }
  
  // 处理分类全选/取消全选
  const handleCategoryToggle = (category: 'partition' | 'dimension' | 'measure', checked: boolean) => {
    const categoryFields = fieldsByCategory[category].map(f => f.physical_name)
    
    if (checked) {
      // 全选该分类
      const newValue = [...new Set([...value, ...categoryFields])]
      onChange?.(newValue)
    } else {
      // 取消该分类的所有选择
      const newValue = value.filter(f => !categoryFields.includes(f))
      onChange?.(newValue)
    }
  }
  
  // 渲染字段项
  const renderField = (field: FieldMeta) => {
    const isSelected = value.includes(field.physical_name)
    
    return (
      <div
        key={field.physical_name}
        className={cn(
          "group relative px-4 py-3 rounded-xl border transition-all duration-200 cursor-pointer mb-2",
          isSelected 
            ? "bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-300 shadow-sm" 
            : "bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300 hover:shadow-sm"
        )}
        onClick={() => handleFieldToggle(field.physical_name)}
      >
        <div className="flex items-center gap-3">
          <Checkbox 
            checked={isSelected}
            className="pointer-events-none"
          />
          <div className="flex-1 min-w-0">
            <div className={cn("text-sm font-medium truncate", isSelected ? "text-gray-900" : "text-gray-700")}>
              {field.display_name}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-gray-500 font-mono">{field.physical_name}</span>
              <span className="text-gray-300">•</span>
              <span className="text-xs text-gray-500">{field.field_type}</span>
              {field.is_sensitive && (
                <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-md font-medium">
                  敏感
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }
  
  // 渲染分类面板
  const renderCategory = (
    category: 'partition' | 'dimension' | 'measure',
    icon: React.ReactNode,
    title: string,
    gradient: string,
    badgeColor: string
  ) => {
    const categoryFields = fieldsByCategory[category]
    const selectedCount = categoryFields.filter(f => value.includes(f.physical_name)).length
    const allSelected = selectedCount === categoryFields.length && categoryFields.length > 0
    const indeterminate = selectedCount > 0 && selectedCount < categoryFields.length
    
    return (
      <AccordionItem value={category} key={category} className="mb-3 border-none">
        <AccordionTrigger className="hover:no-underline bg-white/50 rounded-lg px-4 py-3">
          <div className="flex items-center justify-between w-full pr-4">
            <div className="flex items-center gap-3">
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shadow-md", gradient)}>
                {icon}
              </div>
              <span className="font-semibold text-gray-800">{title}</span>
              <span className={cn("px-2.5 py-0.5 rounded-lg text-xs font-medium", badgeColor)}>
                {categoryFields.length}
              </span>
            </div>
            {categoryFields.length > 0 && (
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(checked) => {
                    handleCategoryToggle(category, checked as boolean)
                  }}
                />
                <span className="text-sm text-gray-600">
                  {allSelected ? '取消全选' : '全选'}
                </span>
              </div>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent className="pt-2">
          {categoryFields.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p>{searchText ? '未找到匹配的字段' : '该分类暂无字段'}</p>
            </div>
          ) : (
            <div className="space-y-0">
              {categoryFields.map(renderField)}
            </div>
          )}
        </AccordionContent>
      </AccordionItem>
    )
  }
  
  return (
    <div className="flex flex-col gap-4 h-full">
      {/* 搜索框 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 z-10" />
        <Input
          placeholder="搜索字段名称..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="pl-10 rounded-xl bg-white border-gray-200"
        />
      </div>
      
      {/* 统计信息 */}
      {showStatistics && (
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-3 border border-blue-100">
            <div className="text-xs text-blue-600 mb-1">已选字段</div>
            <div className="text-2xl font-bold text-blue-700">{statistics.total}</div>
          </div>
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-3 border border-emerald-100">
            <div className="text-xs text-emerald-600 mb-1">分区键</div>
            <div className="text-2xl font-bold text-emerald-700">
              {statistics.partition.selected}
              <span className="text-sm text-emerald-500 ml-1">/ {statistics.partition.total}</span>
            </div>
          </div>
          <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-3 border border-purple-100">
            <div className="text-xs text-purple-600 mb-1">维度</div>
            <div className="text-2xl font-bold text-purple-700">
              {statistics.dimension.selected}
              <span className="text-sm text-purple-500 ml-1">/ {statistics.dimension.total}</span>
            </div>
          </div>
          <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl p-3 border border-orange-100">
            <div className="text-xs text-orange-600 mb-1">度量</div>
            <div className="text-2xl font-bold text-orange-700">
              {statistics.measure.selected}
              <span className="text-sm text-orange-500 ml-1">/ {statistics.measure.total}</span>
            </div>
          </div>
        </div>
      )}
      
      {/* 字段列表 - 折叠面板 */}
      <div className="flex-1 overflow-auto bg-white rounded-xl border border-gray-200 p-2">
        <Accordion 
          type="multiple" 
          value={activeKeys}
          onValueChange={setActiveKeys}
          className="bg-transparent"
        >
          {renderCategory(
            'partition',
            <Key className="w-4 h-4 text-white" />,
            '分区键',
            'bg-gradient-to-br from-emerald-500 to-teal-500',
            'bg-emerald-100 text-emerald-700'
          )}
          {renderCategory(
            'dimension',
            <Database className="w-4 h-4 text-white" />,
            '维度字段',
            'bg-gradient-to-br from-purple-500 to-pink-500',
            'bg-purple-100 text-purple-700'
          )}
          {renderCategory(
            'measure',
            <BarChart3 className="w-4 h-4 text-white" />,
            '度量字段',
            'bg-gradient-to-br from-orange-500 to-amber-500',
            'bg-orange-100 text-orange-700'
          )}
        </Accordion>
      </div>
    </div>
  )
}
