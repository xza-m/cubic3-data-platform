import { describe, expect, it } from 'vitest'
import { eventTypeLabel } from './event-labels'

describe('eventTypeLabel', () => {
  it('把平台事件枚举转成中文业务标签', () => {
    expect(eventTypeLabel('app.execution.completed')).toBe('应用执行完成')
    expect(eventTypeLabel('app.execution.failed')).toBe('应用执行失败')
    expect(eventTypeLabel('app.execution.started')).toBe('应用开始执行')
  })

  it('未知枚举保留原值，避免误导', () => {
    expect(eventTypeLabel('custom.event')).toBe('custom.event')
  })
})
