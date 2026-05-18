import { describe, expect, it, vi } from 'vitest'
import {
  normalizeQueryWorkbenchPrefill,
  openQueryWorkbenchWithPrefill,
  V2_QUERY_WORKBENCH_PREFILL_KEY,
} from './workbench-prefill'

describe('query workbench prefill', () => {
  it('保留来源主体身份用于工作台展示', () => {
    const normalized = normalizeQueryWorkbenchPrefill({
      sql: 'SELECT 1',
      source_id: 7,
      origin: 'query_history',
      history_id: 42,
      principal_id: 'feishu:tenant:on_current',
      principal_display_name: '轩志昂',
    })

    expect(normalized).toMatchObject({
      sql: 'SELECT 1',
      source_id: 7,
      origin: 'query_history',
      history_id: 42,
      principal_id: 'feishu:tenant:on_current',
      principal_display_name: '轩志昂',
    })
  })

  it('跳转工作台时同时写 route state 与 sessionStorage', () => {
    const navigate = vi.fn()

    openQueryWorkbenchWithPrefill(
      {
        sql: 'SELECT * FROM orders',
        source_id: 3,
        origin: 'saved_query',
        query_id: 9,
        query_name: '订单明细',
        principal_id: 'feishu:tenant:on_owner',
        principal_display_name: '运营同学',
      },
      navigate,
    )

    const stored = JSON.parse(sessionStorage.getItem(V2_QUERY_WORKBENCH_PREFILL_KEY) || '{}')
    expect(stored.principal_id).toBe('feishu:tenant:on_owner')
    expect(stored.principal_display_name).toBe('运营同学')
    expect(navigate).toHaveBeenCalledWith('/queries', {
      state: {
        queryWorkbenchPrefill: expect.objectContaining({
          principal_id: 'feishu:tenant:on_owner',
          principal_display_name: '运营同学',
        }),
      },
    })
  })
})
