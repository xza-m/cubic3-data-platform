import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSchemaTree } from './useSchemaTree'

const schemaTreeMocks = vi.hoisted(() => ({
  getDataSourceDatabases: vi.fn(),
  getDataSourceTables: vi.fn(),
  getSchemas: vi.fn(),
  getTableSchema: vi.fn(),
}))

vi.mock('@/api/datasources', () => ({
  getDataSourceDatabases: schemaTreeMocks.getDataSourceDatabases,
  getDataSourceTables: schemaTreeMocks.getDataSourceTables,
}))

vi.mock('@/api/schema', () => ({
  getSchemas: schemaTreeMocks.getSchemas,
  getTableSchema: schemaTreeMocks.getTableSchema,
}))

describe('useSchemaTree', () => {
  async function flushAsyncState(duration = 0) {
    await act(async () => {
      if (duration > 0) {
        await vi.advanceTimersByTimeAsync(duration)
      }
      await Promise.resolve()
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('能按层级展开数据库、schema 和表，并在表节点展开时加载列信息', async () => {
    schemaTreeMocks.getDataSourceDatabases.mockResolvedValue({ data: ['analytics'] })
    schemaTreeMocks.getSchemas.mockResolvedValue({ data: ['public', 'staging'] })
    schemaTreeMocks.getDataSourceTables.mockResolvedValue({
      data: [
        { table_name: 'public.orders', comment: '订单表' },
        { table_name: 'staging.orders_stage', comment: '暂存表' },
      ],
    })
    schemaTreeMocks.getTableSchema.mockResolvedValue({
      data: {
        table_name: 'orders',
        comment: '订单事实表',
        columns: [
          {
            name: 'order_id',
            type: 'bigint',
            comment: '订单主键',
            is_primary_key: true,
            is_nullable: false,
          },
        ],
        partitions: [],
      },
    })

    const { result } = renderHook(() =>
      useSchemaTree({ datasourceId: 7, sourceType: 'postgresql' }),
    )

    await act(async () => {
      await result.current.loadDatabases()
    })
    expect(result.current.rootKeys).toEqual(['datasource:7/database:analytics'])

    const dbKey = 'datasource:7/database:analytics'
    const schemaKey = `${dbKey}/schema:public`
    const tableKey = `${schemaKey}/table:orders`

    await act(async () => {
      await result.current.toggleExpand(dbKey)
    })
    await flushAsyncState()

    expect(schemaTreeMocks.getSchemas).toHaveBeenCalledWith(7, 'analytics')
    expect(result.current.nodes.get(dbKey)?.expanded).toBe(true)

    await act(async () => {
      await result.current.toggleExpand(schemaKey)
    })
    await flushAsyncState()

    expect(result.current.nodes.get(schemaKey)?.expanded).toBe(true)
    expect(result.current.nodes.get(schemaKey)?.children).toContain(tableKey)

    await act(async () => {
      await result.current.toggleExpand(tableKey)
    })
    await flushAsyncState()

    expect(schemaTreeMocks.getTableSchema).toHaveBeenCalledWith(7, 'analytics', 'orders', 'public')
    expect(result.current.nodes.get(`${tableKey}/column:order_id`)?.metadata).toMatchObject({
      dataType: 'bigint',
      typeCategory: 'numeric',
      isPrimaryKey: true,
    })
  })

  it('schema 列表为空时会回退到直接加载表，并支持搜索与刷新', async () => {
    schemaTreeMocks.getDataSourceDatabases.mockResolvedValue({ data: ['warehouse'] })
    schemaTreeMocks.getSchemas.mockResolvedValue({ data: [] })
    schemaTreeMocks.getDataSourceTables
      .mockResolvedValueOnce({
        data: [{ table_name: 'fact_orders', comment: '订单汇总' }],
      })
      .mockResolvedValueOnce({
        data: [{ table_name: 'fact_orders', comment: '订单汇总(刷新后)' }],
      })

    const { result } = renderHook(() =>
      useSchemaTree({ datasourceId: 8, sourceType: 'postgresql' }),
    )

    await act(async () => {
      await result.current.loadDatabases()
    })
    expect(result.current.rootKeys).toEqual(['datasource:8/database:warehouse'])

    const dbKey = 'datasource:8/database:warehouse'
    const tableKey = `${dbKey}/table:fact_orders`

    await act(async () => {
      await result.current.toggleExpand(dbKey)
    })
    await flushAsyncState()

    expect(schemaTreeMocks.getDataSourceTables).toHaveBeenCalledWith(8, 'warehouse')
    expect(result.current.nodes.get(tableKey)?.metadata?.comment).toBe('订单汇总')

    act(() => {
      result.current.setSearchTerm('汇总')
    })
    expect(result.current.isNodeVisible(tableKey)).toBe(true)

    await act(async () => {
      result.current.refreshNode(dbKey)
    })
    await flushAsyncState(100)

    expect(schemaTreeMocks.getDataSourceTables).toHaveBeenCalledTimes(2)
    expect(result.current.nodes.get(tableKey)?.metadata?.comment).toBe('订单汇总(刷新后)')
  })

  it('非 postgresql 数据源会直接展开数据库并加载表，同时过滤器至少保留一个类型', async () => {
    schemaTreeMocks.getDataSourceDatabases.mockResolvedValue({ data: ['dw'] })
    schemaTreeMocks.getDataSourceTables.mockResolvedValue({
      data: [{ table_name: 'ads_students', comment: '学生主题表' }],
    })

    const { result } = renderHook(() =>
      useSchemaTree({ datasourceId: 9, sourceType: 'mysql' }),
    )

    await act(async () => {
      await result.current.loadDatabases()
    })
    expect(result.current.rootKeys).toEqual(['datasource:9/database:dw'])

    const dbKey = 'datasource:9/database:dw'
    const tableKey = `${dbKey}/table:ads_students`

    await act(async () => {
      await result.current.toggleExpand(dbKey)
    })
    await flushAsyncState()

    expect(result.current.nodes.get(dbKey)?.expanded).toBe(true)
    expect(result.current.nodes.get(tableKey)?.metadata?.comment).toBe('学生主题表')

    act(() => {
      result.current.toggleTypeFilter('table')
    })
    expect(Array.from(result.current.typeFilters)).toEqual(['view'])
  })

  it('加载失败时会把节点从 loading 态恢复', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    schemaTreeMocks.getDataSourceDatabases.mockRejectedValue(new Error('network'))

    const { result } = renderHook(() =>
      useSchemaTree({ datasourceId: 10, sourceType: 'postgresql' }),
    )

    await act(async () => {
      await result.current.loadDatabases()
    })
    await flushAsyncState()

    const rootNode = result.current.nodes.get('datasource:10')
    expect(rootNode?.loading).toBe(false)
    expect(result.current.rootKeys).toEqual([])
    errorSpy.mockRestore()
  })
})
