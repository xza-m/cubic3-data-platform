/**
 * FilterGroup - 过滤条件分组组件（支持递归嵌套） - Migrated to shadcn/ui
 */

import { Plus, Trash2 } from 'lucide-react'
import FilterCondition from './FilterCondition'
import type { FilterGroup as FilterGroupType, FilterCondition as FilterConditionType, FieldMeta } from '../../types/filter'
import { FormButton } from '@/components/business'
import { cn } from '@/lib/utils'

interface FilterGroupProps {
  group: FilterGroupType
  fields: FieldMeta[]
  depth: number
  maxDepth: number
  onChange: (updated: FilterGroupType) => void
  onRemove?: () => void
  showParentLogic?: boolean
}

export default function FilterGroup({ 
  group, 
  fields, 
  depth, 
  maxDepth, 
  onChange, 
  onRemove,
  showParentLogic 
}: FilterGroupProps) {
  
  // 分组颜色（根据深度）
  const getGroupColor = (d: number) => {
    const colors = ['#1890ff', '#722ed1', '#eb2f96']
    return colors[d % colors.length]
  }
  
  const borderColor = getGroupColor(depth)
  
  // 添加条件
  const handleAddCondition = () => {
    onChange({
      ...group,
      filters: [
        ...(group.filters || []),
        { field: '', operator: '', value: null }
      ]
    })
  }
  
  // 更新条件
  const handleUpdateCondition = (index: number, updated: Partial<FilterConditionType>) => {
    const newFilters = [...(group.filters || [])]
    newFilters[index] = { ...newFilters[index], ...updated }
    onChange({ ...group, filters: newFilters })
  }
  
  // 删除条件
  const handleRemoveCondition = (index: number) => {
    onChange({
      ...group,
      filters: (group.filters || []).filter((_, i) => i !== index)
    })
  }
  
  // 添加子分组
  const handleAddGroup = () => {
    onChange({
      ...group,
      groups: [
        ...(group.groups || []),
        { logic: 'AND', filters: [{ field: '', operator: '', value: null }], groups: [], parentLogic: group.logic }
      ]
    })
  }
  
  // 更新子分组
  const handleUpdateGroup = (index: number, updated: FilterGroupType) => {
    const newGroups = [...(group.groups || [])]
    newGroups[index] = updated
    onChange({ ...group, groups: newGroups })
  }
  
  // 删除子分组
  const handleRemoveGroup = (index: number) => {
    onChange({
      ...group,
      groups: (group.groups || []).filter((_, i) => i !== index)
    })
  }
  
  // 切换逻辑
  const handleToggleLogic = (logic: 'AND' | 'OR') => {
    onChange({ ...group, logic })
  }
  
  // 切换与父组的连接逻辑
  const handleToggleParentLogic = (parentLogic: 'AND' | 'OR') => {
    onChange({ ...group, parentLogic })
  }
  
  return (
    <div
      className={cn(
        "border rounded-lg p-4",
        depth === 0 ? "bg-white" : "bg-gray-50",
        depth > 0 && "mb-3"
      )}
      style={{ borderLeftWidth: '4px', borderLeftColor: borderColor }}
    >
      {/* 与父组的连接逻辑（仅子分组显示） */}
      {showParentLogic && depth > 0 && (
        <div className="mb-3 pb-3 border-b border-dashed border-gray-300 flex items-center gap-2">
          <span className="text-gray-500 text-xs">与上级的关系:</span>
          <div className="flex">
            <FormButton
              variant={group.parentLogic === 'AND' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleToggleParentLogic('AND')}
              className="rounded-r-none"
            >
              AND
            </FormButton>
            <FormButton
              variant={group.parentLogic === 'OR' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleToggleParentLogic('OR')}
              className="rounded-l-none border-l-0"
            >
              OR
            </FormButton>
          </div>
        </div>
      )}
      
      {/* 头部：逻辑选择器和操作按钮 */}
      <div className="mb-3 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-xs">
            {depth === 0 ? '条件逻辑:' : '分组内逻辑:'}
          </span>
          <div className="flex">
            <FormButton
              variant={group.logic === 'AND' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleToggleLogic('AND')}
              className="rounded-r-none"
            >
              AND
            </FormButton>
            <FormButton
              variant={group.logic === 'OR' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleToggleLogic('OR')}
              className="rounded-l-none border-l-0"
            >
              OR
            </FormButton>
          </div>
        </div>
        
        <div className="flex gap-2">
          <FormButton
            size="sm"
            variant="outline"
            onClick={handleAddCondition}
          >
            <Plus className="w-4 h-4 mr-1" />
            添加条件
          </FormButton>
          
          {depth < maxDepth && (
            <FormButton
              size="sm"
              variant="outline"
              onClick={handleAddGroup}
            >
              <Plus className="w-4 h-4 mr-1" />
              添加分组
            </FormButton>
          )}
          
          {depth > 0 && onRemove && (
            <FormButton
              size="sm"
              variant="outline"
              onClick={onRemove}
              className="text-red-600 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              删除分组
            </FormButton>
          )}
        </div>
      </div>
      
      {/* 条件列表 */}
      <div className="flex flex-col gap-2 mb-3">
        {(group.filters || []).map((condition, index) => (
          <FilterCondition
            key={index}
            condition={condition}
            fields={fields}
            onChange={(updated) => handleUpdateCondition(index, updated)}
            onRemove={() => handleRemoveCondition(index)}
          />
        ))}
      </div>
      
      {/* 子分组列表 */}
      {(group.groups || []).length > 0 && (
        <div className="flex flex-col gap-3 mt-3">
          {group.groups.map((subGroup, index) => (
            <FilterGroup
              key={index}
              group={subGroup}
              fields={fields}
              depth={depth + 1}
              maxDepth={maxDepth}
              onChange={(updated) => handleUpdateGroup(index, updated)}
              onRemove={() => handleRemoveGroup(index)}
              showParentLogic={true}
            />
          ))}
        </div>
      )}
      
      {/* 空状态提示 */}
      {(group.filters || []).length === 0 && (group.groups || []).length === 0 && (
        <div className="text-center p-6 text-gray-500 border border-dashed border-gray-300 rounded-lg">
          点击"添加条件"或"添加分组"开始配置
        </div>
      )}
    </div>
  )
}
