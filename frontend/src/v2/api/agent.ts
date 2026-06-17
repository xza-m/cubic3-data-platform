// frontend/src/v2/api/agent.ts
//
// Agent 编排域 API。正式入口固定 official Runtime，plan 返回规划 / Binding / 治理材料；
// execute 在治理允许时提交 dw-query-gateway。

import { apiClient } from '@v2/api/client'

interface Envelope<T> {
  code: number
  message: string
  data: T
  trace_id?: string | null
}

const post = <T>(url: string, body?: unknown): Promise<T> =>
  apiClient.post<Envelope<T>>(url, body).then((r) => r.data.data)

export interface AgentSemanticPlanRequest {
  question: string
  viewer_roles?: string[]
  principal_context?: Record<string, unknown>
  runtime_options?: Record<string, unknown>
}

export interface AgentSemanticPlanResponse {
  semantic_plan_id?: string | null
  question: string
  runtime_mode?: 'official' | string
  principal_context?: Record<string, unknown>
  business_intent?: Record<string, unknown>
  route?: Record<string, unknown>
  projection_result?: Record<string, unknown>
  resolved_bindings?: Array<Record<string, unknown>>
  planning_steps?: Array<Record<string, unknown>>
  compiled_targets?: Array<Record<string, unknown>>
  policy_decision?: Record<string, unknown>
  pre_route_policy_decision?: Record<string, unknown>
  ticket_preview?: Record<string, unknown>
  traceability?: Record<string, unknown>
  semantic_trace?: Record<string, unknown>
}

export const createAgentSemanticPlan = (body: AgentSemanticPlanRequest) =>
  post<AgentSemanticPlanResponse>('/agent/semantic/plan', body)

export interface AgentSemanticExecuteRequest {
  question: string
  viewer_roles?: string[]
  principal_context?: Record<string, unknown>
  runtime_options?: Record<string, unknown>
  idempotency_key?: string
}

export interface AgentSemanticExecuteResponse {
  status: 'submitted' | 'blocked' | 'approval_required' | string
  gateway_query_id?: string | number | null
  gateway?: Record<string, unknown>
  decision?: string | null
  reason?: string | null
  reason_code?: string | null
  policy_decision?: Record<string, unknown>
  ticket_preview?: Record<string, unknown>
  semantic_trace?: Record<string, unknown>
  plan?: AgentSemanticPlanResponse | Record<string, unknown>
}

export const executeAgentSemanticPlan = (body: AgentSemanticExecuteRequest) =>
  post<AgentSemanticExecuteResponse>('/agent/semantic/execute', body)
