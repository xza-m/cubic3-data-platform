import { describe, expect, it } from 'vitest'
import {
  buildNodeKey,
  classifyColumnType,
  getQualifiedName,
  parseNodeKey,
  type TreeNode,
} from './types'

describe('SchemaBrowser types helpers', () => {
  it('buildNodeKey 和 parseNodeKey 能正确拼装与解析路径', () => {
    const rootKey = buildNodeKey('datasource', '1', null)
    const dbKey = buildNodeKey('database', 'analytics', rootKey)
    const tableKey = buildNodeKey('table', 'orders', dbKey)

    expect(rootKey).toBe('datasource:1')
    expect(dbKey).toBe('datasource:1/database:analytics')
    expect(tableKey).toBe('datasource:1/database:analytics/table:orders')
    expect(parseNodeKey(tableKey)).toEqual([
      { type: 'datasource', name: '1' },
      { type: 'database', name: 'analytics' },
      { type: 'table', name: 'orders' },
    ])
  })

  it('getQualifiedName 能根据父节点生成 schema 限定名', () => {
    const schemaNode: TreeNode = {
      key: 'datasource:1/database:analytics/schema:public',
      type: 'schema',
      name: 'public',
      parentKey: 'datasource:1/database:analytics',
      children: [],
      loaded: true,
      loading: false,
      expanded: true,
    }
    const tableNode: TreeNode = {
      key: `${schemaNode.key}/table:orders`,
      type: 'table',
      name: 'orders',
      parentKey: schemaNode.key,
      children: [],
      loaded: false,
      loading: false,
      expanded: false,
    }
    const columnNode: TreeNode = {
      key: `${tableNode.key}/column:order_id`,
      type: 'column',
      name: 'order_id',
      parentKey: tableNode.key,
      children: [],
      loaded: true,
      loading: false,
      expanded: false,
    }

    const nodes = new Map([
      [schemaNode.key, schemaNode],
      [tableNode.key, tableNode],
      [columnNode.key, columnNode],
    ])

    expect(getQualifiedName(tableNode, nodes)).toBe('public.orders')
    expect(getQualifiedName(columnNode, nodes)).toBe('order_id')
  })

  it('classifyColumnType 会覆盖常见文本、数值、时间与布尔类型', () => {
    expect(classifyColumnType('varchar(255)')).toBe('text')
    expect(classifyColumnType('bigint')).toBe('numeric')
    expect(classifyColumnType('timestamp')).toBe('temporal')
    expect(classifyColumnType('boolean')).toBe('boolean')
    expect(classifyColumnType('jsonb')).toBe('other')
  })
})
