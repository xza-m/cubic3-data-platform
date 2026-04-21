import { describe, expect, it } from 'vitest'
import {
  OPERATOR_OPTIONS,
  getOperatorOptions,
  operatorNeedsMultiValue,
  operatorNeedsRange,
  operatorNeedsValue,
} from './filter'

describe('filter helpers', () => {
  it('按字段类型返回对应的操作符集合', () => {
    expect(getOperatorOptions('bigint')).toEqual(OPERATOR_OPTIONS.NUMBER)
    expect(getOperatorOptions('timestamp')).toEqual(OPERATOR_OPTIONS.DATE)
    expect(getOperatorOptions('varchar')).toEqual(OPERATOR_OPTIONS.STRING)
  })

  it('判断操作符需要值、范围或多值输入', () => {
    expect(operatorNeedsValue('=')).toBe(true)
    expect(operatorNeedsValue('IS NULL')).toBe(false)
    expect(operatorNeedsRange('BETWEEN')).toBe(true)
    expect(operatorNeedsRange('IN')).toBe(false)
    expect(operatorNeedsMultiValue('IN')).toBe(true)
    expect(operatorNeedsMultiValue('NOT IN')).toBe(true)
    expect(operatorNeedsMultiValue('LIKE')).toBe(false)
  })
})
