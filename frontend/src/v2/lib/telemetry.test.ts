// frontend/src/v2/lib/telemetry.test.ts
//
// telemetry 兼容垫片单元测试（W5.E 之后）。
// 这两个旧 API 现在是 obs 的薄包装；测试通过 BufferSink 断言行为。
import { afterEach, describe, expect, it } from 'vitest'
import { reportError, track } from './telemetry'
import { BufferSink, installObservability } from '@v2/observability'

let buffer: BufferSink
let uninstall: () => void

afterEach(() => {
  uninstall?.()
})

function setup() {
  buffer = new BufferSink()
  const installed = installObservability({ sinks: [buffer] })
  uninstall = installed.uninstall
}

describe('reportError', () => {
  it('forwards to obs.error with kind=react', () => {
    setup()
    reportError(new Error('boom'))
    expect(buffer.errors).toHaveLength(1)
    expect(buffer.errors[0].message).toBe('boom')
    expect(buffer.errors[0].ctx?.kind).toBe('react')
  })

  it('passes context when provided', () => {
    setup()
    reportError(new Error('x'), { route: '/foo', context: 'bar' })
    expect(buffer.errors[0].ctx).toMatchObject({
      kind: 'react',
      route: '/foo',
      context: 'bar',
    })
  })

  it('omits ctx fields when no context provided (kind still set)', () => {
    setup()
    reportError(new Error('x'))
    expect(buffer.errors[0].ctx?.kind).toBe('react')
  })
})

describe('track', () => {
  it('forwards to obs.track as info-level event', () => {
    setup()
    track('datasource.create', { entity_id: 1, result: 'success' })
    expect(buffer.events).toHaveLength(1)
    const e = buffer.events[0]
    expect(e.name).toBe('datasource.create')
    expect(e.level).toBe('info')
    expect(e.fields).toEqual({ entity_id: 1, result: 'success' })
  })

  it('handles missing props', () => {
    setup()
    track('demo.event')
    expect(buffer.events[0].fields).toBeUndefined()
  })
})
