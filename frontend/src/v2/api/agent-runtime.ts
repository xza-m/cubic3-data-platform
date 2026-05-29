// frontend/src/v2/api/agent-runtime.ts
//
// 平台级 Agent Runtime 管理 API。业务页面只消费状态，不直接管理进程。

import { apiClient } from '@v2/api/client'

interface Envelope<T> {
  code: number
  message: string
  data: T
  trace_id?: string | null
}

const get = <T>(url: string): Promise<T> =>
  apiClient.get<Envelope<T>>(url).then((r) => r.data.data)

const post = <T>(url: string, body?: unknown): Promise<T> =>
  apiClient.post<Envelope<T>>(url, body).then((r) => r.data.data)

export type AgentRuntimeName = 'openai_compatible' | 'codex_app_server' | string
export type AgentRuntimeOperationName =
  | 'test'
  | 'test_connection'
  | 'start'
  | 'restart'
  | 'stop'
  | 'logs'
  | 'capabilities'
  | string

export interface AgentRuntimeProviderStatus {
  runtime_name: AgentRuntimeName
  label: string
  configured: boolean
  available: boolean
  status: 'ready' | 'disabled' | 'missing_config' | 'not_verified' | 'unavailable' | string
  message: string
  operations: AgentRuntimeOperationName[]
  details?: Record<string, unknown>
}

export interface AgentRuntimeActionBinding {
  action: string
  default_runtime: AgentRuntimeName
  allowed_runtimes: AgentRuntimeName[]
  expose_selector: boolean
  requires_connection: boolean
  reason: string
}

export interface AgentRuntimeManagementSnapshot {
  providers: AgentRuntimeProviderStatus[]
  action_bindings: AgentRuntimeActionBinding[]
  can_manage?: boolean
}

export interface AgentRuntimeOperationResult {
  runtime_name: AgentRuntimeName
  operation: string
  status: 'succeeded' | 'blocked' | 'failed' | string
  message: string
  details?: Record<string, unknown>
}

export interface AgentRuntimeLogView {
  runtime_name: AgentRuntimeName
  log_path: string
  lines: string[]
  truncated: boolean
}

export interface AgentRuntimeCapabilities {
  runtime_name: AgentRuntimeName
  available: boolean
  actions: string[]
  artifacts: string[]
  events: string[]
  details?: Record<string, unknown>
}

export const getAgentRuntimeStatus = () =>
  get<AgentRuntimeManagementSnapshot>('/agent-runtime/providers/status')

export const testAgentRuntimeProvider = (runtimeName: AgentRuntimeName) =>
  post<AgentRuntimeProviderStatus>(`/agent-runtime/providers/${runtimeName}/test`)

export const startAgentRuntimeProvider = (runtimeName: AgentRuntimeName) =>
  post<AgentRuntimeOperationResult>(`/agent-runtime/providers/${runtimeName}/start`)

export const restartAgentRuntimeProvider = (runtimeName: AgentRuntimeName) =>
  post<AgentRuntimeOperationResult>(`/agent-runtime/providers/${runtimeName}/restart`)

export const getAgentRuntimeProviderLogs = (runtimeName: AgentRuntimeName) =>
  get<AgentRuntimeLogView>(`/agent-runtime/providers/${runtimeName}/logs`)

export const getAgentRuntimeProviderCapabilities = (runtimeName: AgentRuntimeName) =>
  get<AgentRuntimeCapabilities>(`/agent-runtime/providers/${runtimeName}/capabilities`)
