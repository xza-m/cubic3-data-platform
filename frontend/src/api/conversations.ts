/**
 * 对话 API 客户端
 */
import apiClient from './client'

// 类型定义
export interface Conversation {
  id: number
  title: string
  dataset_id: number
  dataset_name?: string
  user_id: string
  description?: string
  context: Record<string, any>
  created_at: string
  updated_at: string
  message_count: number
}

export interface SemanticTraceabilityContext {
  business_metric?: {
    name?: string
    title?: string
  }
  business_object?: {
    name?: string
    title?: string
  }
  analysis_measure?: {
    cube_name?: string
    measure_name?: string
  }
  analysis_cube?: {
    cube_name?: string
    title?: string
  }
}

export interface SemanticPlanContext {
  route?: {
    route_type?: string
    planning_mode?: string
  }
  traceability?: Record<string, any>
  primary_traceability?: SemanticTraceabilityContext
}

export interface Message {
  id: number
  conversation_id: number
  role: 'user' | 'assistant'
  content: string
  generated_sql?: string
  query_result?: {
    columns: Array<{ name: string; type: string }>
    data: Array<Record<string, any>>
  }
  visualization_config?: {
    type: 'bar' | 'line' | 'pie' | 'table' | 'number'
    config: Record<string, any>
  }
  error?: string
  created_at: string
}

export interface ConversationDetail extends Conversation {
  messages: Message[]
}

// API 函数

/**
 * 创建对话
 */
export const createConversation = (datasetId: number, title?: string, description?: string) => {
  return apiClient.post<Conversation>('/conversations', {
    dataset_id: datasetId,
    title,
    description
  })
}

/**
 * 列出对话
 */
export const listConversations = (offset: number = 0, limit: number = 20) => {
  return apiClient.get<{
    items: Conversation[]
    offset: number
    limit: number
    total: number
  }>('/conversations', {
    params: { offset, limit }
  })
}

/**
 * 获取对话详情
 */
export const getConversation = (id: number) => {
  return apiClient.get<ConversationDetail>(`/conversations/${id}`)
}

/**
 * 删除对话
 */
export const deleteConversation = (id: number) => {
  return apiClient.delete<void>(`/conversations/${id}`)
}

/**
 * 发送消息
 */
export const sendMessage = (conversationId: number, content: string) => {
  return apiClient.post<{
    user_message: Message
    ai_message: Message
  }>(`/conversations/${conversationId}/messages`, {
    content
  })
}

/**
 * 获取消息列表（如果需要单独接口）
 */
export const getMessages = (conversationId: number) => {
  return getConversation(conversationId).then(res => res.data.messages)
}
