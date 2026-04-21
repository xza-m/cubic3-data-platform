// frontend/src/v2/observability/index.ts
//
// 公开门面。业务方只 import 这一个模块。

export type {
  ObsBrowserHandle,
  ObsError,
  ObsErrorContext,
  ObsEvent,
  ObsLevel,
  ObsSink,
} from './types'
export { Observability, toObsError } from './client'
export type { ObservabilityOptions } from './client'
export { BufferSink, ConsoleSink, HttpSink } from './sink'
export type {
  BufferSinkOptions,
  ConsoleSinkOptions,
  HttpSinkOptions,
} from './sink'
export { ev } from './events'
export type { EventFactory } from './events'
export { installObservability } from './bootstrap'
export type {
  InstallObservabilityOptions,
  InstalledObservability,
} from './bootstrap'
export { obs } from './instance'
