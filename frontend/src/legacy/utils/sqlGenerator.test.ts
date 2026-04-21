import { describe, expect, it } from 'vitest'
import type { FieldMeta, FilterGroup } from '../types/filter'
import { generateWhereClause, previewSQL, validateFilterGroup } from './sqlGenerator'

const fields: FieldMeta[] = [
  {
    physical_name: 'ds',
    display_name: '分区日期',
    field_type: 'DATE',
    field_category: 'PARTITION_KEY',
  },
  {
    physical_name: 'score',
    display_name: '得分',
    field_type: 'DECIMAL',
    field_category: 'MEASURE',
  },
  {
    physical_name: 'student_name',
    display_name: '学生姓名',
    field_type: 'STRING',
    field_category: 'DIMENSION',
  },
  {
    physical_name: 'status',
    display_name: '状态',
    field_type: 'STRING',
    field_category: 'DIMENSION',
  },
]

describe('sqlGenerator', () => {
  it('支持生成嵌套 WHERE 条件并自动处理数字、LIKE、IN、BETWEEN 和空值', () => {
    const group: FilterGroup = {
      logic: 'AND',
      filters: [
        { field: 'ds', operator: '=', value: '2026-03-26' },
        { field: 'score', operator: '>=', value: 88.5 },
        { field: 'student_name', operator: 'LIKE', value: 'Alice' },
        { field: 'status', operator: 'IS NOT NULL', value: '' },
      ],
      groups: [
        {
          logic: 'OR',
          filters: [
            { field: 'status', operator: 'IN', value: ['active', "O'Reilly"] },
            { field: 'ds', operator: 'BETWEEN', value: ['2026-03-01', '2026-03-31'] },
          ],
          groups: [],
        },
      ],
    }

    expect(generateWhereClause(group, fields)).toBe(
      "ds = '2026-03-26' AND score >= 88.5 AND student_name LIKE '%Alice%' AND status IS NOT NULL AND (status IN ('active', 'O''Reilly') OR ds BETWEEN '2026-03-01' AND '2026-03-31')",
    )
  })

  it('在条件不完整或操作符不匹配时跳过无效子句', () => {
    const group: FilterGroup = {
      logic: 'AND',
      filters: [
        { field: '', operator: '=', value: 'bad' },
        { field: 'status', operator: 'IN', value: [] },
        { field: 'ds', operator: 'BETWEEN', value: ['2026-03-01'] as unknown as [string, string] },
        { field: 'student_name', operator: '=', value: '' },
      ],
      groups: [],
    }

    expect(generateWhereClause(group, fields)).toBe('')
    expect(previewSQL(group, fields)).toBe('-- 暂无过滤条件')
  })

  it('校验分区字段和未完成条件，并在无法校验分区时放行', () => {
    const invalidGroup: FilterGroup = {
      logic: 'AND',
      filters: [
        { field: 'score', operator: '>', value: 90 },
        { field: '', operator: '=', value: 'bad' },
        { field: 'student_name', operator: 'BETWEEN', value: ['only-one'] as unknown as [string, string] },
      ],
      groups: [],
    }

    expect(validateFilterGroup(invalidGroup, fields)).toEqual({
      valid: false,
      errors: ['必须包含分区字段的过滤条件', '存在 1 个未完成的条件'],
    })

    const noPartitionField: FieldMeta[] = [
      {
        physical_name: 'score',
        display_name: '得分',
        field_type: 'DECIMAL',
        field_category: 'MEASURE',
      },
    ]

    expect(
      validateFilterGroup(
        {
          logic: 'AND',
          filters: [{ field: 'score', operator: '>', value: 90 }],
          groups: [],
        },
        noPartitionField,
      ),
    ).toEqual({
      valid: true,
      errors: [],
    })
  })

  it('在过滤组缺失时返回空 SQL 并允许预览占位', () => {
    expect(generateWhereClause(undefined as unknown as FilterGroup, fields)).toBe('')
    expect(previewSQL(undefined as unknown as FilterGroup, fields)).toBe('-- 暂无过滤条件')
  })
})
