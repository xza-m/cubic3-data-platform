// frontend/src/v2/hooks/conversations.ts
//
// Data Chat 对话域 react-query hooks。

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from './query-client'
import {
  createConversation,
  getConversation,
  listConversations,
  sendConversationMessage,
  type ConversationListParams,
  type CreateConversationPayload,
} from '@v2/api/conversations'

export function useConversations(params: ConversationListParams = { offset: 0, limit: 20 }) {
  return useQuery({
    queryKey: qk('conversations', 'list', params),
    queryFn: () => listConversations(params),
    staleTime: 15_000,
  })
}

export function useConversation(id: number | null) {
  return useQuery({
    queryKey: qk('conversations', 'detail', id),
    queryFn: () => getConversation(id as number),
    enabled: Number.isFinite(id) && Number(id) > 0,
    staleTime: 5_000,
  })
}

export function useCreateConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateConversationPayload) => createConversation(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversations'] })
    },
  })
}

export function useSendConversationMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ conversationId, content }: { conversationId: number; content: string }) =>
      sendConversationMessage(conversationId, content),
    onSuccess: (_data, { conversationId }) => {
      qc.invalidateQueries({ queryKey: ['conversations'] })
      qc.invalidateQueries({ queryKey: qk('conversations', 'detail', conversationId) })
    },
  })
}
