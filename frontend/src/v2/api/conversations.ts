// frontend/src/v2/api/conversations.ts
//
// Data Chat 对话域 API 层。所有调用统一走 apiClient。
// 后端契约：app/interfaces/api/v1/conversations.py

import { apiClient } from './client'

export interface ConversationMessage {
  id: number
  conversation_id: number
  role: 'user' | 'assistant' | string
  content: string
  generated_sql: string | null
  query_result: unknown
  visualization_config: unknown
  error: string | null
  /** Phase 5 可信标注：semantic | agent | legacy_llm（历史消息可能为 null） */
  source?: 'semantic' | 'agent' | 'legacy_llm' | string | null
  via_semantic_layer?: boolean | null
  created_at: string | null
}

export interface Conversation {
  id: number
  title: string
  dataset_id: number | null
  dataset_name: string | null
  user_id?: string
  description: string | null
  context?: Record<string, unknown> | null
  created_at: string | null
  updated_at: string | null
  message_count: number
  messages?: ConversationMessage[]
}

export interface ConversationListParams {
  offset?: number
  limit?: number
}

export interface ConversationListResponse {
  items: Conversation[]
  offset: number
  limit: number
  total: number
}

export interface CreateConversationPayload {
  dataset_id: number
  title?: string
  description?: string
}

export interface SendConversationMessageResult {
  user_message: ConversationMessage
  ai_message: ConversationMessage
}

export async function listConversations(
  params: ConversationListParams = {},
): Promise<ConversationListResponse> {
  const res = await apiClient.get<{ data: ConversationListResponse }>('/conversations', { params })
  return res.data.data
}

export async function getConversation(id: number): Promise<Conversation> {
  const res = await apiClient.get<{ data: Conversation }>(`/conversations/${id}`)
  return res.data.data
}

export async function createConversation(
  payload: CreateConversationPayload,
): Promise<Conversation> {
  const res = await apiClient.post<{ data: Conversation }>('/conversations', payload)
  return res.data.data
}

export async function sendConversationMessage(
  conversationId: number,
  content: string,
): Promise<SendConversationMessageResult> {
  const res = await apiClient.post<{ data: SendConversationMessageResult }>(
    `/conversations/${conversationId}/messages`,
    { content },
  )
  return res.data.data
}
