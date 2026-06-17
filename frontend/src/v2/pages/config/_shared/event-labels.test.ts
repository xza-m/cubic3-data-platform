import { describe, expect, it } from 'vitest'
import { eventTypeLabel, SUBSCRIPTION_EVENT_OPTIONS } from './event-labels'

describe('eventTypeLabel', () => {
  it('把平台事件枚举转成中文业务标签', () => {
    expect(eventTypeLabel('app.execution.completed')).toBe('应用执行完成')
    expect(eventTypeLabel('app.execution.failed')).toBe('应用执行失败')
    expect(eventTypeLabel('app.execution.started')).toBe('应用开始执行')
    expect(eventTypeLabel('extraction.completed')).toBe('数据提取完成')
    expect(eventTypeLabel('app.instance.disabled')).toBe('应用实例停用')
  })

  it('订阅事件选项覆盖后端支持事件', () => {
    expect(SUBSCRIPTION_EVENT_OPTIONS.map((item) => item.value)).toEqual([
      'app.execution.completed',
      'app.execution.failed',
      'app.execution.started',
      'extraction.completed',
      'extraction.failed',
      'app.instance.created',
      'app.instance.enabled',
      'app.instance.disabled',
      'app.instance.deleted',
    ])
  })

  it('未知枚举保留原值，避免误导', () => {
    expect(eventTypeLabel('custom.event')).toBe('custom.event')
  })
})
