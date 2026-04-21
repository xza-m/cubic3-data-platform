/**
 * FilterBuilder - 过滤条件构建器主组件
 */

import { useEffect, useMemo } from 'react'
import FilterGroup from './FilterGroup'
import type { FilterGroup as FilterGroupType, FieldMeta } from '../../types/filter'
import { generateWhereClause, validateFilterGroup } from '../../utils/sqlGenerator'

interface FilterBuilderProps {
  fields: FieldMeta[]
  value?: FilterGroupType
  onChange?: (value: FilterGroupType) => void
  onSQLChange?: (sql: string) => void
  onValidationChange?: (validation: { valid: boolean; errors: string[] }) => void
  maxDepth?: number
}

export default function FilterBuilder({ 
  fields, 
  value,
  onChange, 
  onSQLChange,
  onValidationChange,
  maxDepth = 3 
}: FilterBuilderProps) {
  
  // 初始化默认值
  const filterGroup = useMemo(() => {
    return value || {
      logic: 'AND' as const,
      filters: [{ field: '', operator: '', value: null }],
      groups: []
    }
  }, [value])
  
  // 处理变更
  const handleChange = (updated: FilterGroupType) => {
    onChange?.(updated)
  }
  
  // 生成 SQL 并触发回调
  useEffect(() => {
    if (filterGroup && onSQLChange) {
      const sql = generateWhereClause(filterGroup, fields)
      onSQLChange(sql)
    }
  }, [filterGroup, fields, onSQLChange])
  
  // 验证并触发回调
  useEffect(() => {
    if (filterGroup && onValidationChange) {
      const validation = validateFilterGroup(filterGroup, fields)
      onValidationChange(validation)
    }
  }, [filterGroup, fields, onValidationChange])
  
  return (
    <div style={{ width: '100%' }}>
      <FilterGroup
        group={filterGroup}
        fields={fields}
        depth={0}
        maxDepth={maxDepth}
        onChange={handleChange}
        showParentLogic={false}
      />
    </div>
  )
}
