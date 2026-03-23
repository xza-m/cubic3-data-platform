/**
 * Filter Builder 类型定义
 */

export interface FilterCondition {
  field: string
  operator: string  // '=', '!=', '>', '<', '>=', '<=', 'IN', 'NOT IN', 'BETWEEN', 'LIKE', 'IS NULL', 'IS NOT NULL'
  value: string | number | [string | number, string | number] | (string | number)[]
}

export interface FilterGroup {
  logic: 'AND' | 'OR'
  filters: FilterCondition[]
  groups: FilterGroup[]  // 递归嵌套
  parentLogic?: 'AND' | 'OR'  // 与父组的连接逻辑
}

export interface FieldMeta {
  physical_name: string
  display_name: string
  field_type: string  // 'STRING', 'INTEGER', 'BIGINT', 'DECIMAL', 'DATE', 'DATETIME', 'TIMESTAMP'
  field_category: 'DIMENSION' | 'MEASURE' | 'PARTITION_KEY'
  is_sensitive?: boolean
  is_searchable?: boolean
}

export const OPERATOR_OPTIONS = {
  STRING: [
    { value: '=', label: '等于' },
    { value: '!=', label: '不等于' },
    { value: 'IN', label: '包含于' },
    { value: 'NOT IN', label: '不包含于' },
    { value: 'LIKE', label: '模糊匹配' },
    { value: 'IS NULL', label: '为空' },
    { value: 'IS NOT NULL', label: '不为空' },
  ],
  NUMBER: [
    { value: '=', label: '等于' },
    { value: '!=', label: '不等于' },
    { value: '>', label: '大于' },
    { value: '<', label: '小于' },
    { value: '>=', label: '大于等于' },
    { value: '<=', label: '小于等于' },
    { value: 'BETWEEN', label: '范围' },
    { value: 'IN', label: '包含于' },
    { value: 'IS NULL', label: '为空' },
    { value: 'IS NOT NULL', label: '不为空' },
  ],
  DATE: [
    { value: '=', label: '等于' },
    { value: '!=', label: '不等于' },
    { value: '>', label: '晚于' },
    { value: '<', label: '早于' },
    { value: '>=', label: '晚于等于' },
    { value: '<=', label: '早于等于' },
    { value: 'BETWEEN', label: '日期范围' },
    { value: 'IS NULL', label: '为空' },
    { value: 'IS NOT NULL', label: '不为空' },
  ],
}

/**
 * 获取字段类型对应的操作符选项
 */
export function getOperatorOptions(fieldType: string) {
  const normalizedType = fieldType.toUpperCase()
  
  if (normalizedType.includes('INT') || normalizedType.includes('DECIMAL') || normalizedType.includes('FLOAT') || normalizedType.includes('DOUBLE')) {
    return OPERATOR_OPTIONS.NUMBER
  }
  
  if (normalizedType.includes('DATE') || normalizedType.includes('TIME')) {
    return OPERATOR_OPTIONS.DATE
  }
  
  return OPERATOR_OPTIONS.STRING
}

/**
 * 判断操作符是否需要值输入
 */
export function operatorNeedsValue(operator: string): boolean {
  return operator !== 'IS NULL' && operator !== 'IS NOT NULL'
}

/**
 * 判断操作符是否需要范围输入（两个值）
 */
export function operatorNeedsRange(operator: string): boolean {
  return operator === 'BETWEEN'
}

/**
 * 判断操作符是否需要多值输入
 */
export function operatorNeedsMultiValue(operator: string): boolean {
  return operator === 'IN' || operator === 'NOT IN'
}
