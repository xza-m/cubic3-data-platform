// frontend/src/v2/observability/__tests__/sink.test.ts
import { describe, expect, it, vi } from 'vitest'
import { BufferSink, ConsoleSink, HttpSink } from '../sink'
import type { ObsError, ObsEvent } from '../types'

const sampleEvent: ObsEvent = {
  name: 'datasource.tested',
  level: 'info',
  ts: 1_700_000_000_000,
  fields: { datasource_id: 7, ok: true, latency_ms: 42 },
}

const sampleError: ObsError = {
  name: 'AppError',
  message: 'boom',
  ts: 1_700_000_000_000,
  ctx: { kind: 'api', url: '/api/v1/x', status: 500 },
}

describe('BufferSink', () => {
  it('appends events and errors in order', () => {
    const s = new BufferSink()
    s.trackEvent(sampleEvent)
    s.trackEvent({ ...sampleEvent, name: 'a.b' })
    s.trackError(sampleError)

    expect(s.events).toHaveLength(2)
    expect(s.events[0].name).toBe('datasource.tested')
    expect(s.events[1].name).toBe('a.b')
    expect(s.errors).toHaveLength(1)
    expect(s.errors[0].message).toBe('boom')
  })

  it('drops oldest beyond capacity (events)', () => {
    const s = new BufferSink({ capacity: 3 })
    for (let i = 0; i < 5; i += 1) {
      s.trackEvent({ ...sampleEvent, name: `e.${i}` })
    }
    expect(s.events.map((e) => e.name)).toEqual(['e.2', 'e.3', 'e.4'])
  })

  it('drops oldest beyond capacity (errors)', () => {
    const s = new BufferSink({ capacity: 2 })
    for (let i = 0; i < 4; i += 1) {
      s.trackError({ ...sampleError, message: `m${i}` })
    }
    expect(s.errors.map((e) => e.message)).toEqual(['m2', 'm3'])
  })

  it('clear() empties both buffers', () => {
    const s = new BufferSink()
    s.trackEvent(sampleEvent)
    s.trackError(sampleError)
    s.clear()
    expect(s.events).toHaveLength(0)
    expect(s.errors).toHaveLength(0)
  })

  it('falls back to capacity 1 when given non-positive', () => {
    const s = new BufferSink({ capacity: 0 })
    s.trackEvent(sampleEvent)
    s.trackEvent({ ...sampleEvent, name: 'x' })
    expect(s.events.map((e) => e.name)).toEqual(['x'])
  })
})

describe('ConsoleSink', () => {
  it('routes by level', () => {
    const cons = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
    }
    const sink = new ConsoleSink({ console: cons })
    sink.trackEvent({ ...sampleEvent, level: 'debug' })
    sink.trackEvent({ ...sampleEvent, level: 'info' })
    sink.trackEvent({ ...sampleEvent, level: 'warn' })
    sink.trackEvent({ ...sampleEvent, level: 'error' })

    expect(cons.debug).toHaveBeenCalledTimes(1)
    expect(cons.info).toHaveBeenCalledTimes(1)
    expect(cons.warn).toHaveBeenCalledTimes(1)
    expect(cons.error).toHaveBeenCalledTimes(1)
  })

  it('errors call console.warn with [obs:error] prefix', () => {
    const cons = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
    }
    const sink = new ConsoleSink({ console: cons })
    sink.trackError(sampleError)
    expect(cons.warn).toHaveBeenCalledWith(
      '[obs:error]',
      'AppError',
      'boom',
      sampleError.ctx,
    )
  })

  it('respects enabled=false (no console calls)', () => {
    const cons = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
    }
    const sink = new ConsoleSink({ console: cons, enabled: false })
    sink.trackEvent(sampleEvent)
    sink.trackError(sampleError)
    expect(cons.info).not.toHaveBeenCalled()
    expect(cons.warn).not.toHaveBeenCalled()
  })
})

describe('HttpSink', () => {
  it('no-ops when endpoint is empty', () => {
    const fetchImpl = vi.fn()
    const sink = new HttpSink({ endpoint: '', fetchImpl: fetchImpl as unknown as typeof fetch })
    sink.trackEvent(sampleEvent)
    sink.trackError(sampleError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('POSTs events to endpoint and waits via flush()', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    const sink = new HttpSink({
      endpoint: 'https://obs.example/ingest',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    sink.trackEvent(sampleEvent)
    sink.trackError(sampleError)
    await sink.flush()

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://obs.example/ingest')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' })
    const body = JSON.parse(String(init.body))
    expect(body.type).toBe('event')
    expect(body.payload.name).toBe('datasource.tested')
  })

  it('swallows fetch failures silently', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network'))
    const sink = new HttpSink({
      endpoint: 'https://obs.example/ingest',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(() => sink.trackEvent(sampleEvent)).not.toThrow()
    await sink.flush()
    expect(fetchImpl).toHaveBeenCalled()
  })

  it('flush() with no pending requests resolves', async () => {
    const sink = new HttpSink({
      endpoint: 'https://x',
      fetchImpl: vi.fn() as unknown as typeof fetch,
    })
    await expect(sink.flush()).resolves.toBeUndefined()
  })
})
