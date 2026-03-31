import { describe, expect, it } from 'vitest'
import type { FieldMeta, FilterGroup } from '../types/filter'
import { generateSQLFromConfig, validateVisualQueryConfig } from './visualQueryGenerator'

const fields: FieldMeta[] = [
  {
    physical_name: 'ds',
    display_name: '分区日期',
    field_type: 'DATE',
    field_category: 'PARTITION_KEY',
  },
  {
    physical_name: 'user_id',
    display_name: '用户',
    field_type: 'BIGINT',
    field_category: 'DIMENSION',
  },
  {
    physical_name: 'score',
    display_name: '得分',
    field_type: 'DECIMAL',
    field_category: 'MEASURE',
  },
]

const baseFilters: FilterGroup = {
  logic: 'AND',
  filters: [{ field: 'ds', operator: '=', value: '2026-03-26' }],
  groups: [],
}

describe('visualQueryGenerator', () => {
  it('生成普通明细查询 SQL', () => {
    expect(
      generateSQLFromConfig(
        {
          table: 'student_scores',
          fields: ['user_id', 'score'],
          filters: baseFilters,
          groupBy: [],
          aggregations: [],
          orderBy: [{ field: 'score', direction: 'DESC' }],
          limit: 100,
        },
        fields,
      ),
    ).toBe(
      "SELECT user_id, score\nFROM student_scores\nWHERE ds = '2026-03-26'\nORDER BY score DESC\nLIMIT 100",
    )
  })

  it('生成带聚合和分组的查询 SQL，并允许不带 LIMIT', () => {
    expect(
      generateSQLFromConfig(
        {
          table: 'student_scores',
          fields: [],
          filters: baseFilters,
          groupBy: ['user_id'],
          aggregations: [{ func: 'AVG', field: 'score', alias: 'avg_score' }],
          orderBy: [{ field: 'avg_score', direction: 'DESC' }],
          limit: 0,
        },
        fields,
      ),
    ).toBe(
      "SELECT user_id, AVG(score) AS avg_score\nFROM student_scores\nWHERE ds = '2026-03-26'\nGROUP BY user_id\nORDER BY avg_score DESC",
    )
  })

  it('校验缺少表、字段和聚合分组时的错误', () => {
    expect(
      validateVisualQueryConfig({
        table: '',
        fields: [],
        filters: { logic: 'AND', filters: [], groups: [] },
        groupBy: [],
        aggregations: [{ func: 'COUNT', field: '*', alias: 'cnt' }],
        orderBy: [],
        limit: 100,
      }),
    ).toEqual({
      valid: false,
      errors: ['请选择数据表', '使用聚合函数时必须设置分组字段'],
    })

    expect(
      validateVisualQueryConfig({
        table: 'student_scores',
        fields: [],
        filters: { logic: 'AND', filters: [], groups: [] },
        groupBy: [],
        aggregations: [],
        orderBy: [],
        limit: 100,
      }),
    ).toEqual({
      valid: false,
      errors: ['请至少选择一个字段或聚合函数'],
    })
  })
})
