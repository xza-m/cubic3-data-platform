// frontend/src/v2/hooks/subscriptions.ts
//
// 订阅域 react-query hooks。
// query key 统一用 qk('subscriptions', ...)。
// mutation 必须 invalidate 相关 key。

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from './query-client'
import {
  createSubscription,
  deleteSubscription,
  disableSubscription,
  enableSubscription,
  getSubscription,
  listSubscriptions,
  listSubscriptionsByInstance,
  listSubscriptionHistory,
  triggerSubscription,
  updateSubscription,
  type CreateSubscriptionPayload,
  type SubscriptionListParams,
  type TriggerSubscriptionPayload,
  type UpdateSubscriptionPayload,
} from '../api/subscriptions'

// ============================================================================
// 列表
// ============================================================================

export function useSubscriptions(params: SubscriptionListParams = {}) {
  return useQuery({
    queryKey: qk('subscriptions', 'list', params),
    queryFn: () => listSubscriptions(params),
    staleTime: 30_000,
  })
}

export function useSubscriptionsByInstance(instanceId: number) {
  return useQuery({
    queryKey: qk('subscriptions', 'by-instance', instanceId),
    queryFn: () => listSubscriptionsByInstance(instanceId),
    enabled: Number.isFinite(instanceId) && instanceId > 0,
    staleTime: 30_000,
  })
}

// ============================================================================
// 详情
// ============================================================================

export function useSubscription(id: number) {
  return useQuery({
    queryKey: qk('subscriptions', 'detail', id),
    queryFn: () => getSubscription(id),
    enabled: Number.isFinite(id) && id > 0,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

// ============================================================================
// 创建
// ============================================================================

export function useCreateSubscription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateSubscriptionPayload) => createSubscription(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subscriptions'] })
    },
  })
}

// ============================================================================
// 更新
// ============================================================================

export function useUpdateSubscription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdateSubscriptionPayload }) =>
      updateSubscription(id, payload),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['subscriptions'] })
      qc.invalidateQueries({ queryKey: qk('subscriptions', 'detail', id) })
    },
  })
}

// ============================================================================
// 删除
// ============================================================================

export function useDeleteSubscription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteSubscription(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subscriptions'] })
    },
  })
}

// ============================================================================
// 启用 / 禁用
// ============================================================================

export function useEnableSubscription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => enableSubscription(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['subscriptions'] })
      qc.invalidateQueries({ queryKey: qk('subscriptions', 'detail', id) })
    },
  })
}

export function useDisableSubscription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => disableSubscription(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['subscriptions'] })
      qc.invalidateQueries({ queryKey: qk('subscriptions', 'detail', id) })
    },
  })
}

// ============================================================================
// 手动触发
// ============================================================================

export function useTriggerSubscription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload?: TriggerSubscriptionPayload }) =>
      triggerSubscription(id, payload ?? {}),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['subscriptions'] })
      qc.invalidateQueries({ queryKey: qk('subscriptions', 'detail', id) })
      qc.invalidateQueries({ queryKey: qk('subscriptions', 'detail', id, 'history') })
    },
  })
}

// ============================================================================
// 触发历史（P13）
// ============================================================================

export function useSubscriptionHistory(id: number) {
  return useQuery({
    queryKey: qk('subscriptions', 'detail', id, 'history'),
    queryFn: () => listSubscriptionHistory(id),
    enabled: Number.isFinite(id) && id > 0,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

/** 便捷：根据当前 enabled 状态自动切换 */
export function useToggleSubscription() {
  const enable = useEnableSubscription()
  const disable = useDisableSubscription()
  return {
    mutate: (id: number, currentEnabled: boolean) =>
      currentEnabled ? disable.mutate(id) : enable.mutate(id),
    mutateAsync: (id: number, currentEnabled: boolean) =>
      currentEnabled ? disable.mutateAsync(id) : enable.mutateAsync(id),
    isPending: enable.isPending || disable.isPending,
  }
}
