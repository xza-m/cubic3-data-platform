// frontend/src/v2/api/channels.ts
//
// 渠道域 API 层。禁止页面层直接调 axios，统一走 apiClient。
// 后端契约：app/interfaces/api/v1/channels.py
//           app/domain/entities/config/channel.py

import { apiClient } from './client'
import type { PaginatedResponse } from './types'

// ============================================================================
// 类型定义（snake_case 与后端 wire 格式一致）
// ============================================================================

/** 后端实际支持的渠道类型（align: app/domain/entities/config/channel.py ChannelType） */
export type ChannelType = 'feishu' | 'email' | 'webhook' | 'oss'

/**
 * 渠道配置结构按类型不同：
 * feishu:  { chat_id?, webhook_url?, message_template? }
 * email:   { recipients, subject_template?, body_template? }
 * webhook: { url, method?, headers?, body_template? }
 * oss:     { bucket, path_template?, filename_template? }
 */
export type ChannelConfig = Record<string, unknown>

export interface Channel {
  id: number
  name: string
  channel_type: ChannelType
  description: string | null
  config: ChannelConfig
  enabled: boolean
  created_by: string | null
  created_at: string | null
  updated_at: string | null
}

export interface ChannelListParams {
  channel_type?: ChannelType
  enabled?: boolean
  page?: number
  page_size?: number
}

export interface CreateChannelPayload {
  name: string
  channel_type: ChannelType
  config: ChannelConfig
  description?: string
  enabled?: boolean
}

export interface UpdateChannelPayload {
  name?: string
  config?: ChannelConfig
  description?: string
  enabled?: boolean
}

// ============================================================================
// API 函数
// ============================================================================

export async function listChannels(
  params: ChannelListParams = {},
): Promise<PaginatedResponse<Channel>> {
  const res = await apiClient.get<{ data: PaginatedResponse<Channel> }>('/channels', { params })
  return res.data.data
}

export async function getChannel(id: number): Promise<Channel> {
  const res = await apiClient.get<{ data: Channel }>(`/channels/${id}`)
  return res.data.data
}

export async function createChannel(payload: CreateChannelPayload): Promise<Channel> {
  const res = await apiClient.post<{ data: Channel }>('/channels', payload)
  return res.data.data
}

export async function updateChannel(id: number, payload: UpdateChannelPayload): Promise<Channel> {
  const res = await apiClient.put<{ data: Channel }>(`/channels/${id}`, payload)
  return res.data.data
}

export async function deleteChannel(id: number): Promise<void> {
  await apiClient.delete(`/channels/${id}`)
}

export async function enableChannel(id: number): Promise<Channel> {
  const res = await apiClient.post<{ data: Channel }>(`/channels/${id}/enable`)
  return res.data.data
}

export async function disableChannel(id: number): Promise<Channel> {
  const res = await apiClient.post<{ data: Channel }>(`/channels/${id}/disable`)
  return res.data.data
}

// ── 测试发送（P12）────────────────────────────────────────────────────────────
// 后端契约：POST /api/v1/channels/:id/test
//   body  : { message?: string }
//   data  : ChannelTestResult（字段与 channel_service.test_channel 返回值对齐）

export interface ChannelTestResult {
  ok: boolean
  channel_type: ChannelType
  latency_ms: number
  /** HTTP 状态码（feishu / webhook 类型可用，email / oss 为 null） */
  status_code: number | null
  /** 人类可读的诊断信息 */
  detail: string
  /** 失败原因（成功时为 null） */
  error: string | null
  /** true 表示仅做配置校验，未实际发送消息 */
  dry_run: boolean
}

export interface TestChannelPayload {
  /** 可选：自定义测试消息文本（飞书 / Webhook 使用） */
  message?: string
}

export async function testChannel(
  id: number,
  payload: TestChannelPayload = {},
): Promise<ChannelTestResult> {
  const res = await apiClient.post<{ data: ChannelTestResult }>(
    `/channels/${id}/test`,
    payload,
  )
  return res.data.data
}
