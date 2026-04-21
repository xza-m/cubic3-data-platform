// frontend/src/v2/observability/__tests__/bootstrap.test.ts
import { afterEach, describe, expect, it } from 'vitest'
import { installObservability } from '../bootstrap'
import { Observability } from '../client'
import { BufferSink, ConsoleSink, HttpSink } from '../sink'
import { ev } from '../events'

afterEach(() => {
  delete (window as { __cubic3_obs__?: unknown }).__cubic3_obs__
})

describe('installObservability', () => {
  it('installs default Console + Buffer sinks and exposes window.__cubic3_obs__', () => {
    const client = new Observability()
    const installed = installObservability({ client, console: false })
    try {
      expect(installed.buffer).toBeInstanceOf(BufferSink)
      expect(window.__cubic3_obs__).toBeDefined()
      expect(window.__cubic3_obs__?.events).toBe(installed.buffer?.events)

      client.track(ev.cubeCreated('orders'))
      expect(installed.buffer?.events).toHaveLength(1)
      expect(window.__cubic3_obs__?.events[0].name).toBe('semantic.cube_created')
    } finally {
      installed.uninstall()
    }
  })

  it('uninstall removes window listeners and global handle', () => {
    const client = new Observability()
    const installed = installObservability({ client, console: false })
    expect(window.__cubic3_obs__).toBeDefined()
    installed.uninstall()
    expect(window.__cubic3_obs__).toBeUndefined()

    const buf = new BufferSink()
    client.setSinks([buf])

    window.dispatchEvent(new ErrorEvent('error', { message: 'after uninstall' }))
    expect(buf.errors).toHaveLength(0)
  })

  it("forwards window 'error' events to the client", () => {
    const client = new Observability()
    const installed = installObservability({ client, console: false })
    try {
      window.dispatchEvent(
        new ErrorEvent('error', {
          message: 'window crash',
          filename: 'app.js',
        }),
      )
      const errs = installed.buffer?.errors ?? []
      expect(errs.length).toBeGreaterThan(0)
      const last = errs[errs.length - 1]
      expect(last.ctx?.kind).toBe('window')
      expect(last.message).toContain('window crash')
    } finally {
      installed.uninstall()
    }
  })

  it("forwards 'unhandledrejection' to the client", () => {
    const client = new Observability()
    const installed = installObservability({ client, console: false })
    try {
      const reason = new Error('rejected promise')
      const evt = new Event('unhandledrejection') as PromiseRejectionEvent
      Object.defineProperty(evt, 'reason', { value: reason, configurable: true })
      Object.defineProperty(evt, 'promise', { value: Promise.reject(reason).catch(() => {}), configurable: true })
      window.dispatchEvent(evt)

      const errs = installed.buffer?.errors ?? []
      expect(errs.length).toBeGreaterThan(0)
      expect(errs[errs.length - 1].ctx?.kind).toBe('unhandled')
      expect(errs[errs.length - 1].message).toBe('rejected promise')
    } finally {
      installed.uninstall()
    }
  })

  it('respects opts.sinks override (no Console/Buffer added)', () => {
    const client = new Observability()
    const buf = new BufferSink()
    const installed = installObservability({ client, sinks: [buf] })
    try {
      expect(client.getSinks()).toEqual([buf])
      // window handle should still be wired because opts.sinks contained a BufferSink
      expect(window.__cubic3_obs__).toBeDefined()
    } finally {
      installed.uninstall()
    }
  })

  it('adds HttpSink when endpoint is provided', () => {
    const client = new Observability()
    const installed = installObservability({
      client,
      console: false,
      buffer: false,
      endpoint: 'https://obs.example/ingest',
    })
    try {
      const sinks = client.getSinks()
      expect(sinks.some((s) => s instanceof HttpSink)).toBe(true)
      expect(window.__cubic3_obs__).toBeUndefined()
    } finally {
      installed.uninstall()
    }
  })

  it('skips HttpSink when endpoint is empty', () => {
    const client = new Observability()
    const installed = installObservability({
      client,
      console: true,
      buffer: true,
      endpoint: '',
    })
    try {
      const sinks = client.getSinks()
      expect(sinks.some((s) => s instanceof HttpSink)).toBe(false)
      expect(sinks.some((s) => s instanceof ConsoleSink)).toBe(true)
      expect(sinks.some((s) => s instanceof BufferSink)).toBe(true)
    } finally {
      installed.uninstall()
    }
  })

  it('honors explicit sampleRate', () => {
    const client = new Observability()
    const installed = installObservability({
      client,
      console: false,
      sampleRate: 0,
    })
    try {
      client.track(ev.cubeCreated('x'))
      expect(installed.buffer?.events).toHaveLength(0)
    } finally {
      installed.uninstall()
    }
  })

  it('safe to invoke without window when win=undefined', () => {
    const client = new Observability()
    const installed = installObservability({
      client,
      console: false,
      win: undefined as unknown as Window,
      sinks: [new BufferSink()],
    })
    expect(client.getSinks()).toHaveLength(1)
    installed.uninstall()
  })

  it('second install cleans up the prior one', () => {
    const client1 = new Observability()
    installObservability({ client: client1, console: false })
    const handle1 = window.__cubic3_obs__
    expect(handle1).toBeDefined()

    const client2 = new Observability()
    const second = installObservability({ client: client2, console: false })
    try {
      expect(window.__cubic3_obs__).not.toBe(handle1)
      expect(window.__cubic3_obs__).toBeDefined()
    } finally {
      second.uninstall()
    }
  })

  it('window error event without an Error reason is normalized', () => {
    const client = new Observability()
    const installed = installObservability({ client, console: false })
    try {
      window.dispatchEvent(new ErrorEvent('error', { message: 'msg-only' }))
      const errs = installed.buffer?.errors ?? []
      expect(errs[errs.length - 1].message).toContain('msg-only')
    } finally {
      installed.uninstall()
    }
  })

  it('handle.clear() empties buffer via window', () => {
    const client = new Observability()
    const installed = installObservability({ client, console: false })
    try {
      client.track(ev.cubeCreated('x'))
      expect(window.__cubic3_obs__?.events.length).toBe(1)
      window.__cubic3_obs__?.clear()
      expect(installed.buffer?.events).toHaveLength(0)
    } finally {
      installed.uninstall()
    }
  })
})
