/**
 * SQL WHERE 子句生成器
 * 
 * 功能：
 * 1. 递归生成 SQL WHERE 子句
 * 2. 自动转义字符串值
 * 3. 处理特殊操作符（BETWEEN, IN, IS NULL）
 * 4. 支持 AND/OR 嵌套分组
 */

import type { FilterGroup, FilterCondition, FieldMeta } from '../types/filter'

/**
 * 生成 WHERE 子句
 * 
 * @param filterGroup 过滤条件组
 * @param fields 字段元数据（可选，用于类型检查）
 * @returns SQL WHERE 子句（不含 WHERE 关键字）
 */
export function generateWhereClause(filterGroup: FilterGroup, fields?: FieldMeta[]): string {
  if (!filterGroup) {
    return ''
  }
  
  const clauses: string[] = []
  
  // 1. 处理当前组的所有条件
  filterGroup.filters?.forEach(condition => {
    const clause = generateConditionClause(condition, fields)
    if (clause) {
      clauses.push(clause)
    }
  })
  
  // 2. 递归处理子分组
  filterGroup.groups?.forEach(subGroup => {
    const subClause = generateWhereClause(subGroup, fields)
    if (subClause) {
      // 子分组用括号包裹
      clauses.push(`(${subClause})`)
    }
  })
  
  // 3. 用逻辑运算符连接
  if (clauses.length === 0) {
    return ''
  }
  
  const logic = filterGroup.logic || 'AND'
  return clauses.join(` ${logic} `)
}

/**
 * 生成单个条件的 SQL 子句
 */
function generateConditionClause(condition: FilterCondition, fields?: FieldMeta[]): string {
  if (!condition.field || !condition.operator) {
    return ''
  }
  
  const field = condition.field
  const operator = condition.operator
  const value = condition.value
  
  // 获取字段类型（用于判断是否需要引号）
  const fieldMeta = fields?.find(f => f.physical_name === field)
  const fieldType = fieldMeta?.field_type || 'STRING'
  const isNumericField = isNumericType(fieldType)
  
  switch (operator) {
    case 'IS NULL':
      return `${field} IS NULL`
    
    case 'IS NOT NULL':
      return `${field} IS NOT NULL`
    
    case 'BETWEEN':
      // value 应该是 [start, end]
      if (!Array.isArray(value) || value.length !== 2) {
        return ''
      }
      const [start, end] = value
      return `${field} BETWEEN ${formatValue(start, isNumericField)} AND ${formatValue(end, isNumericField)}`
    
    case 'IN':
    case 'NOT IN':
      // value 应该是 string[] 或 number[]
      if (!Array.isArray(value) || value.length === 0) {
        return ''
      }
      const formattedValues = value.map(v => formatValue(v, isNumericField)).join(', ')
      return `${field} ${operator} (${formattedValues})`
    
    case 'LIKE':
      // LIKE 需要加通配符
      if (Array.isArray(value)) {
        return ''
      }
      const likeValue = String(value).includes('%') ? value : `%${value}%`
      return `${field} LIKE ${formatValue(likeValue, false)}`
    
    default:
      // =, !=, >, <, >=, <=
      if (value === null || value === undefined || value === '' || Array.isArray(value)) {
        return ''
      }
      return `${field} ${operator} ${formatValue(value, isNumericField)}`
  }
}

/**
 * 格式化值（添加引号和转义）
 */
function formatValue(value: string | number | boolean | null | undefined, isNumeric: boolean): string {
  if (value === null || value === undefined) {
    return 'NULL'
  }
  
  // 数值类型不需要引号
  if (isNumeric) {
    return String(value)
  }
  
  // 字符串类型需要引号和转义
  const stringValue = String(value)
  // 转义单引号
  const escaped = stringValue.replace(/'/g, "''")
  return `'${escaped}'`
}

/**
 * 判断字段类型是否为数值类型
 */
function isNumericType(fieldType: string): boolean {
  const normalizedType = fieldType.toUpperCase()
  return (
    normalizedType.includes('INT') ||
    normalizedType.includes('DECIMAL') ||
    normalizedType.includes('FLOAT') ||
    normalizedType.includes('DOUBLE') ||
    normalizedType.includes('NUMBER')
  )
}

/**
 * 验证过滤条件组
 * 
 * @param filterGroup 过滤条件组
 * @param fields 字段元数据
 * @returns 验证结果 { valid: boolean, errors: string[] }
 */
export function validateFilterGroup(filterGroup: FilterGroup, fields?: FieldMeta[]): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (!filterGroup) {
    return { valid: true, errors: [] }
  }
  
  // 检查分区字段
  const hasPartitionFilter = checkPartitionFilter(filterGroup, fields)
  if (!hasPartitionFilter) {
    errors.push('必须包含分区字段的过滤条件')
  }
  
  // 检查所有条件是否完整
  const incompleteConditions = findIncompleteConditions(filterGroup)
  if (incompleteConditions.length > 0) {
    errors.push(`存在 ${incompleteConditions.length} 个未完成的条件`)
  }
  
  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * 检查是否包含分区字段过滤
 */
function checkPartitionFilter(filterGroup: FilterGroup, fields?: FieldMeta[]): boolean {
  if (!fields || fields.length === 0) {
    return true // 无法验证时假定通过
  }
  
  const partitionFields = fields.filter(f => f.field_category === 'PARTITION_KEY')
  if (partitionFields.length === 0) {
    return true // 没有分区字段时不需要验证
  }
  
  // 递归检查所有条件
  const hasPartition = (group: FilterGroup): boolean => {
    // 检查当前组的条件
    const hasInFilters = group.filters?.some(f => 
      partitionFields.some(pf => pf.physical_name === f.field)
    )
    
    if (hasInFilters) {
      return true
    }
    
    // 递归检查子分组
    return group.groups?.some(g => hasPartition(g)) || false
  }
  
  return hasPartition(filterGroup)
}

/**
 * 查找未完成的条件
 */
function findIncompleteConditions(filterGroup: FilterGroup): FilterCondition[] {
  const incomplete: FilterCondition[] = []
  
  const checkGroup = (group: FilterGroup) => {
    // 检查当前组的条件
    group.filters?.forEach(condition => {
      if (!condition.field || !condition.operator) {
        incomplete.push(condition)
        return
      }
      
      // 需要值的操作符检查值是否存在
      if (condition.operator !== 'IS NULL' && condition.operator !== 'IS NOT NULL') {
        if (condition.value === null || condition.value === undefined || condition.value === '') {
          // BETWEEN 和 IN 需要特殊检查
          if (condition.operator === 'BETWEEN') {
            if (!Array.isArray(condition.value) || condition.value.length !== 2) {
              incomplete.push(condition)
            }
          } else if (condition.operator === 'IN' || condition.operator === 'NOT IN') {
            if (!Array.isArray(condition.value) || condition.value.length === 0) {
              incomplete.push(condition)
            }
          } else {
            incomplete.push(condition)
          }
        }
      }
    })
    
    // 递归检查子分组
    group.groups?.forEach(subGroup => checkGroup(subGroup))
  }
  
  checkGroup(filterGroup)
  return incomplete
}

/**
 * 预览 SQL（带格式化）
 * 
 * @param filterGroup 过滤条件组
 * @param fields 字段元数据
 * @returns 格式化的 SQL WHERE 子句
 */
export function previewSQL(filterGroup: FilterGroup, fields?: FieldMeta[]): string {
  const whereClause = generateWhereClause(filterGroup, fields)
  
  if (!whereClause) {
    return '-- 暂无过滤条件'
  }
  
  return `WHERE ${whereClause}`
}
