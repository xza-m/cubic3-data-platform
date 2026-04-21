// frontend/src/v2/observability/__tests__/client.test.ts
import { describe, expect, it, vi } from 'vitest'
import { Observability, toObsError } from '../client'
import { BufferSink } from '../sink'
import { ev } from '../events'
import type { ObsSink } from '../types'

describe('Observability.track', () => {
  it('multiplexes to all sinks', () => {
    const a = new BufferSink()
    const b = new BufferSink()
    const o = new Observability({ sinks: [a, b] })
    o.track(ev.cubeCreated('orders'))
    expect(a.events).toHaveLength(1)
    expect(b.events).toHaveLength(1)
    expect(a.events[0].name).toBe('semantic.cube_created')
    expect(a.events[0].fields).toMatchObject({ cube_name: 'orders' })
  })

  it('skips events when sample rate excludes them', () => {
    const buf = new BufferSink()
    const o = new Observability({ sinks: [buf], sampleRate: 0.5, random: () => 0.9 })
    o.track(ev.queryExecuted(1, 100))
    expect(buf.events).toHaveLength(0)
  })

  it('passes events when sample rate includes them', () => {
    const buf = new BufferSink()
    const o = new Observability({ sinks: [buf], sampleRate: 0.5, random: () => 0.1 })
    o.track(ev.queryExecuted(1, 100))
    expect(buf.events).toHaveLength(1)
  })

  it('clamps sample rate to [0, 1]', () => {
    const o = new Observability()
    o.setSampleRate(2)
    expect((o as unknown as { sampleRate: number }).sampleRate).toBe(1)
    o.setSampleRate(-1)
    expect((o as unknown as { sampleRate: number }).sampleRate).toBe(0)
    o.setSampleRate(NaN)
    expect((o as unknown as { sampleRate: number }).sampleRate).toBe(1)
  })

  it('does not throw when a sink throws', () => {
    const bad: ObsSink = {
      trackEvent() {
        throw new Error('boom')
      },
      trackError() {
        throw new Error('boom')
      },
    }
    const good = new BufferSink()
    const o = new Observability({ sinks: [bad, good] })
    expect(() => o.track(ev.cubeCreated('x'))).not.toThrow()
    expect(() => o.error(new Error('y'))).not.toThrow()
    expect(good.events).toHaveLength(1)
    expect(good.errors).toHaveLength(1)
  })
})

describe('Observability.error / toObsError', () => {
  it('errors are full-rate (sampling does not apply)', () => {
    const buf = new BufferSink()
    const o = new Observability({ sinks: [buf], sampleRate: 0, random: () => 0.99 })
    o.error(new Error('always send'))
    expect(buf.errors).toHaveLength(1)
  })

  it('preserves Error name/message/stack', () => {
    const e = new TypeError('bad type')
    const r = toObsError(e, { kind: 'manual' })
    expect(r.name).toBe('TypeError')
    expect(r.message).toBe('bad type')
    expect(r.stack).toBeDefined()
    expect(r.ctx?.kind).toBe('manual')
  })

  it('handles string errors', () => {
    expect(toObsError('oops').message).toBe('oops')
  })

  it('handles plain object errors', () => {
    const r = toObsError({ name: 'CustomErr', message: 'mm' })
    expect(r.name).toBe('CustomErr')
    expect(r.message).toBe('mm')
  })

  it('falls back to JSON for unknown shapes', () => {
    const r = toObsError({ foo: 1 })
    expect(r.message).toContain('"foo":1')
    expect(r.name).toBe('Error')
  })

  it('falls back to String() for non-serializable', () => {
    const cyc: Record<string, unknown> = {}
    cyc.self = cyc
    const r = toObsError(cyc)
    expect(typeof r.message).toBe('string')
  })

  it('handles null/undefined', () => {
    expect(toObsError(null).name).toBe('Error')
    expect(toObsError(undefined).name).toBe('Error')
  })
})

describe('Observability.flush', () => {
  it('awaits sink.flush() promises', async () => {
    const fakeFlush = vi.fn().mockResolvedValue(undefined)
    const sink: ObsSink = {
      trackEvent() {},
      trackError() {},
      flush: fakeFlush,
    }
    const o = new Observability({ sinks: [sink] })
    await o.flush()
    expect(fakeFlush).toHaveBeenCalledTimes(1)
  })

  it('does not throw when sink.flush throws', async () => {
    const sink: ObsSink = {
      trackEvent() {},
      trackError() {},
      flush() {
        throw new Error('flush boom')
      },
    }
    const o = new Observability({ sinks: [sink] })
    await expect(o.flush()).resolves.toBeUndefined()
  })

  it('setSinks/getSinks roundtrip', () => {
    const o = new Observability()
    const buf = new BufferSink()
    o.setSinks([buf])
    expect(o.getSinks()).toHaveLength(1)
    expect(o.getSinks()[0]).toBe(buf)
  })
})

describe('event factories', () => {
  it('all factories produce well-formed ObsEvent', () => {
    const cases = [
      ev.loginSucceeded('u'),
      ev.datasourceTested(1, true, 12),
      ev.datasetRegistered(2),
      ev.cubeCreated('c'),
      ev.cubeDiagnoseRun('sql', false, 100),
      ev.objectValidated('object', 'Customer'),
      ev.metricDryrun('m', true),
      ev.queryExecuted(3, 400),
      ev.scheduledQueryTriggered(4),
      ev.channelTestSent(5, true),
      ev.appInstanceStarted(6),
      ev.appInstanceStopped(7),
      ev.preferencesUpdated(['theme']),
      ev.navigated('/a', '/b'),
    ]
    for (const e of cases) {
      expect(typeof e.name).toBe('string')
      expect(e.name.length).toBeGreaterThan(0)
      expect(['debug', 'info', 'warn', 'error']).toContain(e.level)
      expect(typeof e.ts).toBe('number')
    }
    expect(cases).toHaveLength(14)
  })
})
