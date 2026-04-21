// frontend/src/v2/observability/client.ts
//
// Observability 客户端：把 ObsEvent / ObsError 多路复用到任意数量的 sink。
// 单测通过 `setSinks` 注入 BufferSink 实例做断言；生产由 bootstrap 装配。
//
// 不直接依赖 React / axios — 业务模块只通过 `obs.track()` / `obs.error()` 调用。

import type { ObsError, ObsErrorContext, ObsEvent, ObsSink } from './types'

export interface ObservabilityOptions {
  sinks?: ObsSink[]
  /** 0 ≤ rate ≤ 1。事件按比例采样（错误永远全量上报） */
  sampleRate?: number
  /** 自定义随机源（注入便于单测） */
  random?: () => number
}

export class Observability {
  private sinks: ObsSink[]
  private sampleRate: number
  private random: () => number

  constructor(opts: ObservabilityOptions = {}) {
    this.sinks = opts.sinks ? [...opts.sinks] : []
    this.sampleRate = clampRate(opts.sampleRate ?? 1)
    this.random = opts.random ?? Math.random
  }

  setSinks(sinks: ObsSink[]): void {
    this.sinks = [...sinks]
  }

  getSinks(): readonly ObsSink[] {
    return this.sinks
  }

  setSampleRate(rate: number): void {
    this.sampleRate = clampRate(rate)
  }

  /** 上报一条业务事件。失败/抛错的 sink 会被静默吞掉。 */
  track(event: ObsEvent): void {
    if (this.sampleRate < 1 && this.random() > this.sampleRate) return
    for (const s of this.sinks) {
      try {
        s.trackEvent(event)
      } catch {
        // sink 故障不应影响业务路径
      }
    }
  }

  /** 上报一条错误。errors 始终全量发，不受 sampleRate 影响。 */
  error(err: unknown, ctx?: ObsErrorContext): void {
    const normalized = toObsError(err, ctx)
    for (const s of this.sinks) {
      try {
        s.trackError(normalized)
      } catch {
        // 同上
      }
    }
  }

  /** 等待所有 sink 完成异步落盘（HttpSink 需要） */
  async flush(): Promise<void> {
    const ps: Array<Promise<void> | void> = []
    for (const s of this.sinks) {
      if (typeof s.flush === 'function') {
        try {
          ps.push(s.flush())
        } catch {
          // ignore
        }
      }
    }
    await Promise.allSettled(ps.map((p) => Promise.resolve(p)))
  }
}

function clampRate(r: number): number {
  if (!Number.isFinite(r)) return 1
  if (r < 0) return 0
  if (r > 1) return 1
  return r
}

/** 把任意 unknown 归一化成 ObsError。 */
export function toObsError(err: unknown, ctx?: ObsErrorContext): ObsError {
  const ts = Date.now()
  if (err instanceof Error) {
    return {
      name: err.name || 'Error',
      message: err.message || '(no message)',
      stack: err.stack,
      ts,
      ctx,
    }
  }
  if (typeof err === 'string') {
    return { name: 'Error', message: err, ts, ctx }
  }
  if (err && typeof err === 'object') {
    const maybeMsg = (err as { message?: unknown }).message
    const maybeName = (err as { name?: unknown }).name
    return {
      name: typeof maybeName === 'string' && maybeName ? maybeName : 'Error',
      message: typeof maybeMsg === 'string' && maybeMsg ? maybeMsg : safeStringify(err),
      ts,
      ctx,
    }
  }
  return { name: 'Error', message: safeStringify(err), ts, ctx }
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v) ?? String(v)
  } catch {
    return '(unserializable error value)'
  }
}
