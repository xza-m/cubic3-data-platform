// frontend/src/v2/api/subscriptions.ts
//
// 订阅域 API 层。禁止页面层直接调 axios，统一走 apiClient。
// 后端契约：app/interfaces/api/v1/subscriptions.py
//           app/domain/entities/config/subscription.py

import { apiClient } from './client'
import type { PaginatedResponse } from './types'

// ============================================================================
// 类型定义（snake_case 与后端 wire 格式一致）
// ============================================================================

export interface Subscription {
  id: number
  name: string
  description: string | null
  app_instance_id: number
  channel_id: number
  /** 订阅的事件类型列表，如 ['app.execution.completed', 'app.execution.failed'] */
  event_types: string[]
  /** 可选过滤条件，如 { "output.status": "success" } */
  filter_conditions: Record<string, unknown>
  /** 可覆盖渠道默认配置的投递配置 */
  delivery_config: Record<string, unknown>
  enabled: boolean
  created_by: string | null
  created_at: string | null
  updated_at: string | null
  /** include_relations=true 时后端附带（见 to_dict） */
  app_instance?: { id: number; name: string; app_code: string; app_name: string | null }
  channel?: { id: number; name: string; channel_type: string }
}

export interface SubscriptionListParams {
  app_instance_id?: number
  channel_id?: number
  enabled?: boolean
  page?: number
  page_size?: number
}

export interface CreateSubscriptionPayload {
  name: string
  app_instance_id: number
  channel_id: number
  event_types: string[]
  filter_conditions?: Record<string, unknown>
  delivery_config?: Record<string, unknown>
  description?: string
  enabled?: boolean
}

export interface UpdateSubscriptionPayload {
  name?: string
  event_types?: string[]
  filter_conditions?: Record<string, unknown>
  delivery_config?: Record<string, unknown>
  description?: string
  enabled?: boolean
}

// ============================================================================
// API 函数
// ============================================================================

export async function listSubscriptions(
  params: SubscriptionListParams = {},
): Promise<PaginatedResponse<Subscription>> {
  const res = await apiClient.get<{ data: PaginatedResponse<Subscription> }>(
    '/subscriptions',
    { params },
  )
  return res.data.data
}

export async function getSubscription(id: number): Promise<Subscription> {
  const res = await apiClient.get<{ data: Subscription }>(`/subscriptions/${id}`)
  return res.data.data
}

export async function createSubscription(
  payload: CreateSubscriptionPayload,
): Promise<Subscription> {
  const res = await apiClient.post<{ data: Subscription }>('/subscriptions', payload)
  return res.data.data
}

export async function updateSubscription(
  id: number,
  payload: UpdateSubscriptionPayload,
): Promise<Subscription> {
  const res = await apiClient.put<{ data: Subscription }>(`/subscriptions/${id}`, payload)
  return res.data.data
}

export async function deleteSubscription(id: number): Promise<void> {
  await apiClient.delete(`/subscriptions/${id}`)
}

export async function enableSubscription(id: number): Promise<Subscription> {
  const res = await apiClient.post<{ data: Subscription }>(`/subscriptions/${id}/enable`)
  return res.data.data
}

export async function disableSubscription(id: number): Promise<Subscription> {
  const res = await apiClient.post<{ data: Subscription }>(`/subscriptions/${id}/disable`)
  return res.data.data
}

/** 快捷：获取某应用实例下的所有订阅（挂在 /app-instances/:id/subscriptions） */
export async function listSubscriptionsByInstance(instanceId: number): Promise<Subscription[]> {
  const res = await apiClient.get<{ data: Subscription[] }>(
    `/app-instances/${instanceId}/subscriptions`,
  )
  return res.data.data
}

// ── 触发历史 ──────────────────────────────────────────────────────────────────
// 对接后端：GET /api/v1/subscriptions/:id/history
// 响应契约：app/application/services/config/subscription_service.py::list_delivery_history

export interface SubscriptionHistoryItem {
  id: number
  subscription_id: number
  channel_id: number | null
  trigger_at: string
  status: 'success' | 'failed' | 'skipped'
  message: string | null
  duration_ms: number | null
  event_type: string | null
}

export interface SubscriptionHistoryParams {
  page?: number
  page_size?: number
}

export async function listSubscriptionHistory(
  id: number,
  params: SubscriptionHistoryParams = {},
): Promise<PaginatedResponse<SubscriptionHistoryItem>> {
  const res = await apiClient.get<{ data: PaginatedResponse<SubscriptionHistoryItem> }>(
    `/subscriptions/${id}/history`,
    { params },
  )
  return res.data.data
}
