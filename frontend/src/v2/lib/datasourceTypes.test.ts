import { describe, expect, it } from 'vitest'
import { datasourceTypeLabel, normalizeDatasourceType } from './datasourceTypes'

describe('datasourceTypes', () => {
  it('统一数据源类型展示名', () => {
    expect(datasourceTypeLabel('maxcompute')).toBe('MaxCompute')
    expect(datasourceTypeLabel('postgresql')).toBe('PostgreSQL')
    expect(datasourceTypeLabel('mysql')).toBe('MySQL')
    expect(datasourceTypeLabel('clickhouse')).toBe('ClickHouse')
  })

  it('兼容大小写与空白输入', () => {
    expect(normalizeDatasourceType(' PostgreSQL ')).toBe('postgresql')
    expect(datasourceTypeLabel(' PostgreSQL ')).toBe('PostgreSQL')
  })
})
