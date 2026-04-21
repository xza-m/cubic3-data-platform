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

export interface ChannelTestResult {
  ok: boolean
  message: string
  latency_ms: number
  sent_at: string
  error_code?: string
}

export async function testChannel(id: number): Promise<ChannelTestResult> {
  try {
    const res = await apiClient.post<{ data: ChannelTestResult }>(`/channels/${id}/test`)
    return res.data.data
  } catch (err) {
    // TODO: 后端 POST /api/v1/channels/:id/test 接口待 W1 验证是否存在
    // 若后端返回错误，透传 error_code 给 UI
    const appErr = err as { code?: string; message?: string }
    return {
      ok: false,
      message: appErr.message ?? '测试发送失败',
      latency_ms: 0,
      sent_at: new Date().toISOString(),
      error_code: appErr.code ?? 'UNKNOWN_ERROR',
    }
  }
}
