// frontend/src/v2/pages/queries/visual/buildSql.test.ts

import { describe, expect, it } from 'vitest'
import type { Dataset, DatasetField } from '@v2/api/datasets'
import { buildSql, filterExpr, literalFor, maskExprFor, quoteIdent, quoteLiteral, quoteTable, selectExpr } from './buildSql'
import type { FilterRule } from './types'
import { emptyDraft } from './types'

// ── 固定测试夹具 ────────────────────────────────────────────────────────────

function mkField(partial: Partial<DatasetField>): DatasetField {
  return {
    physical_name: 'col',
    data_type: 'string',
    display_name: null,
    business_type: 'dimension',
    sensitivity_level: 'public',
    is_sensitive: false,
    mask_rule: null,
    comment: null,
    field_order: 0,
    ...partial,
  }
}

function mkDataset(partial: Partial<Dataset> = {}): Dataset {
  return {
    id: 1,
    dataset_code: 'ds_orders',
    dataset_name: '订单宽表',
    dataset_type: 'physical',
    source_id: 10,
    source_type: 'postgresql',
    physical_table: 'public.orders',
    sql_query: null,
    file_metadata: null,
    description: null,
    owner: null,
    sync_status: 'synced',
    last_sync_at: null,
    sync_error: null,
    field_count: 3,
    created_at: '2026-04-20T00:00:00Z',
    updated_at: '2026-04-20T00:00:00Z',
    fields: [
      mkField({ physical_name: 'order_id', data_type: 'bigint', business_type: 'dimension' }),
      mkField({ physical_name: 'user_id', data_type: 'bigint', business_type: 'dimension' }),
      mkField({
        physical_name: 'mobile',
        data_type: 'string',
        business_type: 'dimension',
        is_sensitive: true,
        sensitivity_level: 'pii',
        mask_rule: 'mask_phone',
      }),
      mkField({ physical_name: 'order_amount', data_type: 'decimal', business_type: 'metric' }),
      mkField({ physical_name: 'ds', data_type: 'string', business_type: 'partition' }),
    ],
    ...partial,
  }
}

// ── 低层辅助 ─────────────────────────────────────────────────────────────────

describe('quoteLiteral', () => {
  it('包单引号并转义单引号', () => {
    expect(quoteLiteral('abc')).toBe("'abc'")
    expect(quoteLiteral("O'Brien")).toBe("'O''Brien'")
  })
  it('保留空格', () => {
    expect(quoteLiteral(' a b ')).toBe("' a b '")
  })
})

describe('quoteIdent', () => {
  it('标准标识符直接返回', () => {
    expect(quoteIdent('order_id')).toBe('order_id')
    expect(quoteIdent('Col1')).toBe('Col1')
  })
  it('含特殊字符用双引号包起来', () => {
    expect(quoteIdent('order id')).toBe('"order id"')
    expect(quoteIdent('a-b')).toBe('"a-b"')
  })
  it('内含双引号要 escape', () => {
    expect(quoteIdent('a"b')).toBe('"a""b"')
  })
})

describe('quoteTable', () => {
  it('仅表名', () => {
    expect(quoteTable('orders')).toBe('orders')
  })
  it('schema.table 各自引用', () => {
    expect(quoteTable('public.orders')).toBe('public.orders')
    expect(quoteTable('my schema.orders')).toBe('"my schema".orders')
  })
  it('project.schema.table 不丢失末段表名', () => {
    expect(quoteTable('dw.public.orders')).toBe('dw.public.orders')
    expect(quoteTable('dw.my schema.orders')).toBe('dw."my schema".orders')
  })
})

describe('literalFor', () => {
  it('数值类型不加引号（Number.isFinite 通过时）', () => {
    expect(literalFor(mkField({ data_type: 'bigint' }), '42')).toBe('42')
    expect(literalFor(mkField({ data_type: 'decimal' }), '3.14')).toBe('3.14')
  })
  it('数值类型收到非数字时 fallback 到引号', () => {
    expect(literalFor(mkField({ data_type: 'bigint' }), 'abc')).toBe("'abc'")
  })
  it('字符串类型加引号', () => {
    expect(literalFor(mkField({ data_type: 'string' }), 'hello')).toBe("'hello'")
  })
  it('空值返回 NULL 字面量', () => {
    expect(literalFor(mkField({ data_type: 'string' }), '')).toBe('NULL')
    expect(literalFor(mkField({ data_type: 'bigint' }), '  ')).toBe('NULL')
  })
  it('boolean 类型规范化大写', () => {
    expect(literalFor(mkField({ data_type: 'boolean' }), 'true')).toBe('TRUE')
    expect(literalFor(mkField({ data_type: 'boolean' }), '1')).toBe('1')
    expect(literalFor(mkField({ data_type: 'boolean' }), 'yes')).toBe("'yes'")
  })
})

describe('selectExpr / maskExprFor', () => {
  it('非敏感字段返回物理名', () => {
    expect(selectExpr(mkField({ physical_name: 'order_id' }))).toBe('order_id')
  })
  it('敏感但没 mask_rule → 返回物理名（脱敏交给后端）', () => {
    expect(
      selectExpr(mkField({ physical_name: 'mobile', is_sensitive: true, mask_rule: null })),
    ).toBe('mobile')
  })
  it('mask_all 返回常量脱敏', () => {
    expect(maskExprFor('mask_all', 'mobile', 'mobile')).toBe("'***' AS mobile")
  })
  it('mask_phone 保留前 3 后 4', () => {
    expect(maskExprFor('mask_phone', 'mobile', 'mobile')).toContain('SUBSTR(mobile, 1, 3)')
  })
  it('未知 mask_rule 保留原字段并标记注释', () => {
    expect(maskExprFor('mask_unknown', 'x', 'x')).toContain('mask_rule=mask_unknown unhandled')
  })
})

// ── filterExpr 分支覆盖 ──────────────────────────────────────────────────────

describe('filterExpr', () => {
  const ds = mkDataset()
  const getField = (name: string) => ds.fields!.find((f) => f.physical_name === name)

  function rule(partial: Partial<FilterRule>): FilterRule {
    return { id: 'x', field: 'order_id', op: 'EQ', value: '', ...partial }
  }

  it('EQ 数字', () => {
    expect(filterExpr(rule({ field: 'order_id', op: 'EQ', value: '42' }), getField('order_id'))).toBe(
      'order_id = 42',
    )
  })
  it('NE 字符串', () => {
    expect(filterExpr(rule({ field: 'ds', op: 'NE', value: '2026-04-01' }), getField('ds'))).toBe(
      "ds <> '2026-04-01'",
    )
  })
  it('GT/LTE', () => {
    expect(filterExpr(rule({ field: 'order_amount', op: 'GT', value: '100' }), getField('order_amount'))).toBe(
      'order_amount > 100',
    )
    expect(filterExpr(rule({ field: 'order_amount', op: 'LTE', value: '50' }), getField('order_amount'))).toBe(
      'order_amount <= 50',
    )
  })
  it('IN 多值', () => {
    expect(
      filterExpr(rule({ field: 'user_id', op: 'IN', value: ['1', '2', '3'] }), getField('user_id')),
    ).toBe('user_id IN (1, 2, 3)')
  })
  it('IN 空列表 → null', () => {
    expect(filterExpr(rule({ field: 'user_id', op: 'IN', value: [] }), getField('user_id'))).toBeNull()
    expect(filterExpr(rule({ field: 'user_id', op: 'IN', value: ['  '] }), getField('user_id'))).toBeNull()
  })
  it('BETWEEN 两端', () => {
    expect(
      filterExpr(
        rule({ field: 'order_amount', op: 'BETWEEN', value: ['10', '20'] }),
        getField('order_amount'),
      ),
    ).toBe('order_amount BETWEEN 10 AND 20')
  })
  it('BETWEEN 缺一端 → null', () => {
    expect(
      filterExpr(
        rule({ field: 'order_amount', op: 'BETWEEN', value: ['10', ''] }),
        getField('order_amount'),
      ),
    ).toBeNull()
  })
  it('LIKE 自动补 %', () => {
    expect(filterExpr(rule({ field: 'ds', op: 'LIKE', value: '2026' }), getField('ds'))).toBe(
      "ds LIKE '%2026%'",
    )
  })
  it('LIKE 已有通配符不再补', () => {
    expect(filterExpr(rule({ field: 'ds', op: 'LIKE', value: '2026-%' }), getField('ds'))).toBe(
      "ds LIKE '2026-%'",
    )
  })
  it('IS_NULL / IS_NOT_NULL 不依赖 value', () => {
    expect(filterExpr(rule({ field: 'ds', op: 'IS_NULL' }), getField('ds'))).toBe('ds IS NULL')
    expect(filterExpr(rule({ field: 'ds', op: 'IS_NOT_NULL' }), getField('ds'))).toBe(
      'ds IS NOT NULL',
    )
  })
  it('EQ 空值 → null (跳过)', () => {
    expect(filterExpr(rule({ field: 'ds', op: 'EQ', value: '' }), getField('ds'))).toBeNull()
    expect(filterExpr(rule({ field: 'ds', op: 'EQ', value: '  ' }), getField('ds'))).toBeNull()
  })
  it('field 未选 → null', () => {
    expect(filterExpr(rule({ field: '', op: 'EQ', value: '1' }), getField('order_id'))).toBeNull()
  })
  it('field 不在 dataset → null', () => {
    expect(filterExpr(rule({ field: 'ghost', op: 'EQ', value: '1' }), undefined)).toBeNull()
  })
})

// ── 主入口 buildSql 端到端断言 ───────────────────────────────────────────────

describe('buildSql', () => {
  it('未选数据集 → 提示型 SQL', () => {
    const r = buildSql({ dataset: null, draft: emptyDraft() })
    expect(r.sql).toContain('请选择数据集')
    expect(r.issues).toContain('未选择数据集')
    expect(r.selectedCount).toBe(0)
  })

  it('数据集无物理表 → 提示型 SQL', () => {
    const r = buildSql({
      dataset: mkDataset({ physical_table: null }),
      draft: emptyDraft(),
    })
    expect(r.sql).toContain('未绑定物理表')
    expect(r.issues).toContain('数据集缺少 physical_table')
  })

  it('file 型数据集 → 仍能生成但带告警', () => {
    const r = buildSql({
      dataset: mkDataset({ dataset_type: 'file' }),
      draft: { ...emptyDraft(), datasetId: 1 },
    })
    expect(r.issues.some((i) => i.includes('文件型数据集'))).toBe(true)
  })

  it('未勾字段 → SELECT *', () => {
    const ds = mkDataset()
    const r = buildSql({ dataset: ds, draft: { ...emptyDraft(), datasetId: 1 } })
    expect(r.sql).toMatch(/^SELECT \*\n/)
    expect(r.sql).toContain('FROM public.orders')
    expect(r.sql.trim().endsWith('LIMIT 1000;')).toBe(true)
    expect(r.selectedCount).toBe(0)
    expect(r.issues).toContain('未勾选任何字段；当前以 SELECT * 生成')
  })

  it('勾选字段 + 筛选 → 生成完整 SQL', () => {
    const ds = mkDataset()
    const r = buildSql({
      dataset: ds,
      draft: {
        datasetId: 1,
        selectedFields: ['order_id', 'user_id', 'order_amount'],
        filters: [
          { id: 'f1', field: 'order_amount', op: 'GTE', value: '100' },
          { id: 'f2', field: 'ds', op: 'EQ', value: '2026-04-01' },
        ],
        limit: 500,
      },
    })
    expect(r.sql).toContain('SELECT order_id, user_id, order_amount')
    expect(r.sql).toContain('FROM public.orders')
    expect(r.sql).toContain('WHERE order_amount >= 100')
    expect(r.sql).toContain("AND ds = '2026-04-01'")
    expect(r.sql).toContain('LIMIT 500;')
    expect(r.selectedCount).toBe(3)
    expect(r.appliedFilters).toBe(2)
    expect(r.issues).toEqual([])
  })

  it('条件组支持组内 AND + 组间 OR', () => {
    const ds = mkDataset()
    const r = buildSql({
      dataset: ds,
      draft: {
        ...emptyDraft(),
        datasetId: 1,
        selectedFields: ['order_id'],
        filterGroupLogic: 'OR',
        filterGroups: [
          {
            id: 'g1',
            logic: 'AND',
            rules: [
              { id: 'f1', field: 'order_id', op: 'EQ', value: '1' },
              { id: 'f2', field: 'order_amount', op: 'EQ', value: '2' },
            ],
          },
          {
            id: 'g2',
            logic: 'AND',
            rules: [
              { id: 'f3', field: 'ds', op: 'EQ', value: '2026-05-05' },
              { id: 'f4', field: 'user_id', op: 'EQ', value: '4' },
            ],
          },
        ],
      },
    })
    expect(r.sql).toContain('WHERE (order_id = 1')
    expect(r.sql).toContain('AND order_amount = 2)')
    expect(r.sql).toContain('OR (ds = \'2026-05-05\'')
    expect(r.sql).toContain('AND user_id = 4)')
    expect(r.appliedFilters).toBe(4)
  })

  it('敏感字段 mobile + mask_phone 自动脱敏', () => {
    const ds = mkDataset()
    const r = buildSql({
      dataset: ds,
      draft: { ...emptyDraft(), datasetId: 1, selectedFields: ['order_id', 'mobile'] },
    })
    expect(r.sql).toContain('order_id,')
    expect(r.sql).toContain("CONCAT(SUBSTR(mobile, 1, 3), '****', SUBSTR(mobile, LENGTH(mobile) - 3)) AS mobile")
  })

  it('不完整的筛选条件被跳过并收进 issues', () => {
    const ds = mkDataset()
    const r = buildSql({
      dataset: ds,
      draft: {
        datasetId: 1,
        selectedFields: ['order_id'],
        filters: [{ id: 'f1', field: 'ds', op: 'EQ', value: '' }],
        limit: 100,
      },
    })
    expect(r.appliedFilters).toBe(0)
    expect(r.sql).not.toContain('WHERE')
    expect(r.issues.some((i) => i.includes('ds'))).toBe(true)
  })

  it('limit 非法时回退 1000', () => {
    const ds = mkDataset()
    const r = buildSql({
      dataset: ds,
      draft: { datasetId: 1, selectedFields: ['order_id'], filters: [], limit: Number.NaN },
    })
    expect(r.sql.trim().endsWith('LIMIT 1000;')).toBe(true)
  })

  it('limit 小数被向下取整', () => {
    const ds = mkDataset()
    const r = buildSql({
      dataset: ds,
      draft: { datasetId: 1, selectedFields: ['order_id'], filters: [], limit: 250.7 },
    })
    expect(r.sql).toContain('LIMIT 250;')
  })
})
