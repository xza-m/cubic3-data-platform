// frontend/src/v2/observability/types.ts
//
// 前端可观测性层 — 类型契约（vendor-agnostic）。
// 所有事件 / 错误 / sink 必须使用这些类型，不得引入 Sentry / Datadog 专属字段。
//
// 命名约定：
//   - 事件：`<domain>.<verb>` snake/dot — 例 `datasource.tested`
//   - 错误 kind：'api' | 'react' | 'window' | 'unhandled' | 'manual'
//   - 字段命名：snake_case（与后端契约对齐）

export type ObsLevel = 'debug' | 'info' | 'warn' | 'error'

/** 单条业务事件。fields 必须是 JSON 可序列化对象。 */
export interface ObsEvent {
  name: string
  level: ObsLevel
  ts: number
  fields?: Record<string, unknown>
}

/** 错误上下文。kind 描述错误来源；其余字段按 kind 分类填写。 */
export interface ObsErrorContext {
  kind?: 'api' | 'react' | 'window' | 'unhandled' | 'manual'
  componentStack?: string
  url?: string
  method?: string
  status?: number
  route?: string
  component?: string
  [key: string]: unknown
}

/** 归一化后的错误记录。所有 sink 看到的都是这个结构。 */
export interface ObsError {
  name: string
  message: string
  stack?: string
  ts: number
  ctx?: ObsErrorContext
}

/** Sink 接口。实现必须满足"永不抛出"。 */
export interface ObsSink {
  trackEvent(event: ObsEvent): void
  trackError(err: ObsError): void
  flush?(): Promise<void> | void
}

/** 暴露给浏览器调试 / E2E 的全局句柄。 */
export interface ObsBrowserHandle {
  /** 顺序累积的事件流（最旧 → 最新） */
  events: readonly ObsEvent[]
  /** 顺序累积的错误流 */
  errors: readonly ObsError[]
  /** 清空 buffer（仅影响 BufferSink） */
  clear: () => void
}

declare global {
  interface Window {
    __cubic3_obs__?: ObsBrowserHandle
  }
}
