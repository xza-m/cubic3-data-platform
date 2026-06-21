import { describe, expect, it } from 'vitest'
import {
  accessExecutionProfileLabel,
  dataTriggerLabel,
  humanizeTechnicalValue,
  technicalIdLabel,
} from './displayLabels'

describe('displayLabels', () => {
  it('把执行方式枚举映射为业务权限名称', () => {
    expect(accessExecutionProfileLabel('mc_m0_reader')).toBe('基础数据读取')
    expect(accessExecutionProfileLabel('mc_m1_reader')).toBe('汇总数据读取')
    expect(accessExecutionProfileLabel('mc_m2_detail_reader')).toBe('明细数据读取')
    expect(accessExecutionProfileLabel('m3_raw_block')).toBe('原始敏感数据限制')
  })

  it('把同步触发类型映射为用户可读名称', () => {
    expect(dataTriggerLabel('manual')).toBe('手动触发')
    expect(dataTriggerLabel('scheduled')).toBe('调度触发')
    expect(dataTriggerLabel('api')).toBe('接口触发')
  })

  it('兜底技术值时仍避免直接展示 snake_case', () => {
    expect(humanizeTechnicalValue('custom_profile')).toBe('Custom Profile')
    expect(technicalIdLabel('同步记录 ', 42)).toBe('同步记录 42')
  })
})

