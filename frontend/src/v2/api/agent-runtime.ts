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

const put = <T>(url: string, body?: unknown): Promise<T> =>
  apiClient.put<Envelope<T>>(url, body).then((r) => r.data.data)

export type AgentRuntimeName = 'openai_compatible' | 'codex_sdk' | string
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
  /** 调用形态：sync = 同步补全/工具调用，async = 异步 agentic run */
  kind?: 'sync' | 'async'
}

export interface AgentRuntimeProviderConfig {
  runtime_name: AgentRuntimeName
  enabled: boolean
  endpoint: string | null
  model: string | null
  /** 始终脱敏返回（"********" 或 null），前端不可还原原始值 */
  api_key: string | null
  extra: Record<string, unknown>
  updated_by: string | null
  updated_at: string | null
}

export interface UpdateAgentRuntimeProviderConfigPayload {
  enabled: boolean
  endpoint?: string | null
  model?: string | null
  /**
   * api_key 语义：
   *  - 省略/undefined/null = 保留现有密钥
   *  - 非空字符串 = 更新密钥
   *  - 空字符串 = 清除密钥
   */
  api_key?: string | null
  extra?: Record<string, unknown>
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

export const getAgentRuntimeProviderConfig = (runtimeName: AgentRuntimeName) =>
  get<AgentRuntimeProviderConfig>(`/agent-runtime/providers/${runtimeName}/config`)

export const updateAgentRuntimeProviderConfig = (
  runtimeName: AgentRuntimeName,
  payload: UpdateAgentRuntimeProviderConfigPayload,
) =>
  put<AgentRuntimeProviderConfig>(`/agent-runtime/providers/${runtimeName}/config`, payload)
