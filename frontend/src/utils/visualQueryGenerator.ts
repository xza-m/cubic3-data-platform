/**
 * 可视化查询生成器
 * 将可视化配置转换为 SQL 查询
 */
import { generateWhereClause } from './sqlGenerator'
import type { FilterGroup, FieldMeta } from '../types/filter'

export interface VisualQueryConfig {
  sourceId?: number
  table: string
  fields: string[]
  filters: FilterGroup
  groupBy: string[]
  aggregations: Aggregation[]
  orderBy: OrderBy[]
  limit: number
}

export interface Aggregation {
  func: 'COUNT' | 'SUM' | 'AVG' | 'MAX' | 'MIN'
  field: string
  alias: string
}

export interface OrderBy {
  field: string
  direction: 'ASC' | 'DESC'
}

/**
 * 根据可视化配置生成 SQL 查询
 */
export function generateSQLFromConfig(config: VisualQueryConfig, fieldMetas: FieldMeta[]): string {
  const parts: string[] = []
  
  // SELECT 子句
  if (config.aggregations.length > 0) {
    // 包含聚合：GROUP BY 查询
    const selectFields = [
      ...config.groupBy,
      ...config.aggregations.map(a => `${a.func}(${a.field}) AS ${a.alias}`)
    ]
    parts.push(`SELECT ${selectFields.join(', ')}`)
  } else {
    // 普通查询
    parts.push(`SELECT ${config.fields.length > 0 ? config.fields.join(', ') : '*'}`)
  }
  
  // FROM 子句
  parts.push(`FROM ${config.table}`)
  
  // WHERE 子句
  const whereClause = generateWhereClause(config.filters, fieldMetas)
  if (whereClause) {
    parts.push(`WHERE ${whereClause}`)
  }
  
  // GROUP BY 子句
  if (config.groupBy.length > 0) {
    parts.push(`GROUP BY ${config.groupBy.join(', ')}`)
  }
  
  // ORDER BY 子句
  if (config.orderBy.length > 0) {
    const orderFields = config.orderBy.map(o => `${o.field} ${o.direction}`)
    parts.push(`ORDER BY ${orderFields.join(', ')}`)
  }
  
  // LIMIT 子句
  if (config.limit) {
    parts.push(`LIMIT ${config.limit}`)
  }
  
  return parts.join('\n')
}

/**
 * 验证配置是否完整
 */
export function validateVisualQueryConfig(config: VisualQueryConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (!config.table) {
    errors.push('请选择数据表')
  }
  
  if (config.fields.length === 0 && config.aggregations.length === 0) {
    errors.push('请至少选择一个字段或聚合函数')
  }
  
  if (config.aggregations.length > 0 && config.groupBy.length === 0) {
    errors.push('使用聚合函数时必须设置分组字段')
  }
  
  return {
    valid: errors.length === 0,
    errors
  }
}
