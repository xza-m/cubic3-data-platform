// frontend/src/v2/observability/sink.ts
//
// 三种 sink 实现：
//   - ConsoleSink：本地开发可读输出
//   - BufferSink：进程内 ring buffer，供单测 / E2E / window.__cubic3_obs__ 访问
//   - HttpSink：POST 到 VITE_OBS_ENDPOINT，未配置时整体跳过
//
// 设计准则：
//   1) sink 永不向上抛错（observability 层不能拖死业务）
//   2) HttpSink 默认用 fetch keepalive，缺失时 best-effort POST，失败静默丢弃
//   3) BufferSink 容量超限时丢弃最旧

import type { ObsError, ObsEvent, ObsSink } from './types'

// ─── ConsoleSink ────────────────────────────────────────────────────────────

export interface ConsoleSinkOptions {
  /** 默认 true。设为 false 可在静默单测中关掉日志噪音 */
  enabled?: boolean
  /** 自定义 console（便于单测注入 spy） */
  console?: Pick<Console, 'debug' | 'info' | 'warn' | 'error' | 'log'>
}

export class ConsoleSink implements ObsSink {
  private enabled: boolean
  private console: ConsoleSinkOptions['console']

  constructor(opts: ConsoleSinkOptions = {}) {
    this.enabled = opts.enabled ?? true
    this.console = opts.console ?? globalThis.console
  }

  trackEvent(event: ObsEvent): void {
    if (!this.enabled || !this.console) return
    const fn =
      event.level === 'error'
        ? this.console.error
        : event.level === 'warn'
          ? this.console.warn
          : event.level === 'debug'
            ? this.console.debug
            : this.console.info
    fn.call(this.console, '[obs:event]', event.name, event.fields ?? {})
  }

  trackError(err: ObsError): void {
    if (!this.enabled || !this.console) return
    this.console.warn('[obs:error]', err.name, err.message, err.ctx ?? {})
  }
}

// ─── BufferSink ─────────────────────────────────────────────────────────────

export interface BufferSinkOptions {
  /** 最多保留多少条事件 / 错误（各自独立计数）；默认 200 */
  capacity?: number
}

export class BufferSink implements ObsSink {
  readonly events: ObsEvent[] = []
  readonly errors: ObsError[] = []
  private capacity: number

  constructor(opts: BufferSinkOptions = {}) {
    this.capacity = Math.max(1, opts.capacity ?? 200)
  }

  trackEvent(event: ObsEvent): void {
    this.events.push(event)
    if (this.events.length > this.capacity) {
      this.events.splice(0, this.events.length - this.capacity)
    }
  }

  trackError(err: ObsError): void {
    this.errors.push(err)
    if (this.errors.length > this.capacity) {
      this.errors.splice(0, this.errors.length - this.capacity)
    }
  }

  clear(): void {
    this.events.length = 0
    this.errors.length = 0
  }
}

// ─── HttpSink ───────────────────────────────────────────────────────────────

export interface HttpSinkOptions {
  /** POST 目标。空字符串 / undefined → sink 转 no-op */
  endpoint?: string
  /** 自定义 fetch（便于单测） */
  fetchImpl?: typeof fetch
  /** 是否按 keepalive 投递（页面卸载时仍能送达），默认 true */
  keepalive?: boolean
  /** 请求 timeout（毫秒）；默认 5000 */
  timeoutMs?: number
}

interface HttpPayload {
  type: 'event' | 'error'
  payload: ObsEvent | ObsError
}

export class HttpSink implements ObsSink {
  private endpoint: string
  private fetchImpl?: typeof fetch
  private keepalive: boolean
  private timeoutMs: number
  private pending: Set<Promise<void>> = new Set()

  constructor(opts: HttpSinkOptions = {}) {
    this.endpoint = (opts.endpoint ?? '').trim()
    this.fetchImpl = opts.fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined)
    this.keepalive = opts.keepalive ?? true
    this.timeoutMs = opts.timeoutMs ?? 5000
  }

  trackEvent(event: ObsEvent): void {
    this.send({ type: 'event', payload: event })
  }

  trackError(err: ObsError): void {
    this.send({ type: 'error', payload: err })
  }

  async flush(): Promise<void> {
    if (this.pending.size === 0) return
    await Promise.allSettled([...this.pending])
  }

  private send(body: HttpPayload): void {
    if (!this.endpoint || !this.fetchImpl) return
    const ctrl = typeof AbortController === 'function' ? new AbortController() : undefined
    const timer = ctrl
      ? setTimeout(() => {
          try {
            ctrl.abort()
          } catch {
            // best-effort; never throw from observability
          }
        }, this.timeoutMs)
      : undefined
    const p = this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: this.keepalive,
      signal: ctrl?.signal,
    })
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        if (timer !== undefined) clearTimeout(timer)
        this.pending.delete(p)
      })
    this.pending.add(p)
  }
}
