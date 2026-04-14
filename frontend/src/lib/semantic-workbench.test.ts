import { describe, expect, it } from 'vitest'
import { buildSemanticSelection } from './semantic-workbench'

describe('semantic-workbench helpers', () => {
  it('buildSemanticSelection 会补齐默认空值并保留显式传入的字段', () => {
    expect(buildSemanticSelection('ide', 'cube')).toEqual({
      mode: 'ide',
      kind: 'cube',
      id: null,
      name: null,
      code: null,
    })

    expect(
      buildSemanticSelection('playground', 'view', {
        id: '12',
        name: '订单宽表',
        code: 'orders_view',
      }),
    ).toEqual({
      mode: 'playground',
      kind: 'view',
      id: '12',
      name: '订单宽表',
      code: 'orders_view',
    })
  })
})
