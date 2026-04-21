// frontend/src/v2/observability/bootstrap.ts
//
// installObservability：
//   1) 装配 sinks（Console + Buffer 默认；HttpSink 仅当 VITE_OBS_ENDPOINT 配置时启用）
//   2) 暴露 window.__cubic3_obs__ 句柄供调试 / E2E
//   3) 订阅全局错误：window 'error' / 'unhandledrejection'
//
// API client / ErrorBoundary 通过直接 import { obs } from '@v2/observability' 上报，
// 故 bootstrap 不需要再去打补丁；这里只负责"系统级"事件源。

import { Observability } from './client'
import { obs } from './instance'
import { BufferSink, ConsoleSink, HttpSink } from './sink'
import type { ObsBrowserHandle, ObsSink } from './types'

export interface InstallObservabilityOptions {
  /** 显式覆盖 sinks（用于单测 / 高级场景）；提供后忽略 env */
  sinks?: ObsSink[]
  /** 显式覆盖 HTTP endpoint（默认读 VITE_OBS_ENDPOINT） */
  endpoint?: string
  /** 0..1 采样率（默认读 VITE_OBS_SAMPLE_RATE，缺省 1.0） */
  sampleRate?: number
  /** 是否启用 ConsoleSink（默认 true） */
  console?: boolean
  /** 是否启用 BufferSink + 暴露 window.__cubic3_obs__（默认 true） */
  buffer?: boolean
  /** 单测可注入自定义 obs 实例（默认使用模块单例） */
  client?: Observability
  /** 单测可注入自定义 window（默认 globalThis.window） */
  win?: Window
}

export interface InstalledObservability {
  client: Observability
  buffer?: BufferSink
  uninstall: () => void
}

let currentInstall: InstalledObservability | null = null

export function installObservability(
  opts: InstallObservabilityOptions = {},
): InstalledObservability {
  // 同一进程多次调用：先清理上一次（典型于 HMR / 测试）
  if (currentInstall) {
    currentInstall.uninstall()
    currentInstall = null
  }

  const client = opts.client ?? obs
  const win = opts.win ?? (typeof window !== 'undefined' ? window : undefined)

  let buffer: BufferSink | undefined
  let sinks: ObsSink[]

  if (opts.sinks) {
    sinks = [...opts.sinks]
    // 即便 sinks 显式给出，也尝试从中识别第一个 BufferSink，便于句柄暴露
    const found = sinks.find((s): s is BufferSink => s instanceof BufferSink)
    buffer = found
  } else {
    sinks = []
    if (opts.console ?? true) {
      sinks.push(new ConsoleSink())
    }
    if (opts.buffer ?? true) {
      buffer = new BufferSink()
      sinks.push(buffer)
    }
    const endpoint = (opts.endpoint ?? readEnvEndpoint()).trim()
    if (endpoint) {
      sinks.push(new HttpSink({ endpoint }))
    }
  }

  client.setSinks(sinks)
  const sampleRate = opts.sampleRate ?? readEnvSampleRate()
  client.setSampleRate(sampleRate)

  const detachers: Array<() => void> = []

  if (win && buffer && (opts.buffer ?? true)) {
    const handle: ObsBrowserHandle = {
      events: buffer.events,
      errors: buffer.errors,
      clear: () => buffer!.clear(),
    }
    win.__cubic3_obs__ = handle
    detachers.push(() => {
      if (win.__cubic3_obs__ === handle) {
        delete win.__cubic3_obs__
      }
    })
  }

  if (win) {
    const onError = (e: ErrorEvent) => {
      const err = e.error instanceof Error ? e.error : new Error(e.message || 'window error')
      client.error(err, {
        kind: 'window',
        url: typeof e.filename === 'string' ? e.filename : undefined,
      })
    }
    const onRejection = (e: PromiseRejectionEvent) => {
      client.error(e.reason, { kind: 'unhandled' })
    }
    win.addEventListener('error', onError)
    win.addEventListener('unhandledrejection', onRejection)
    detachers.push(() => {
      win.removeEventListener('error', onError)
      win.removeEventListener('unhandledrejection', onRejection)
    })
  }

  const installed: InstalledObservability = {
    client,
    buffer,
    uninstall: () => {
      for (const fn of detachers.splice(0)) {
        try {
          fn()
        } catch {
          // ignore
        }
      }
      client.setSinks([])
      if (currentInstall === installed) currentInstall = null
    },
  }
  currentInstall = installed
  return installed
}

function readEnvEndpoint(): string {
  try {
    const v = (import.meta.env?.VITE_OBS_ENDPOINT ?? '') as unknown
    return typeof v === 'string' ? v : ''
  } catch {
    return ''
  }
}

function readEnvSampleRate(): number {
  try {
    const raw = (import.meta.env?.VITE_OBS_SAMPLE_RATE ?? '') as unknown
    if (typeof raw === 'number') return raw
    if (typeof raw === 'string' && raw.trim()) {
      const n = Number(raw)
      if (Number.isFinite(n)) return n
    }
  } catch {
    // ignore
  }
  return 1
}
