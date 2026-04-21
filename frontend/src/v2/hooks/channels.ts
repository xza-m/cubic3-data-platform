// frontend/src/v2/hooks/channels.ts
//
// 渠道域 react-query hooks。
// query key 统一用 qk('channels', ...)。
// mutation 必须 invalidate 相关 key。

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from './query-client'
import { ev, obs } from '@v2/observability'
import {
  createChannel,
  deleteChannel,
  disableChannel,
  enableChannel,
  getChannel,
  listChannels,
  testChannel,
  updateChannel,
  type ChannelListParams,
  type CreateChannelPayload,
  type UpdateChannelPayload,
} from '../api/channels'

// ============================================================================
// 列表
// ============================================================================

export function useChannels(params: ChannelListParams = {}) {
  return useQuery({
    queryKey: qk('channels', 'list', params),
    queryFn: () => listChannels(params),
    staleTime: 5 * 60_000,
  })
}

// ============================================================================
// 详情
// ============================================================================

export function useChannel(id: number) {
  return useQuery({
    queryKey: qk('channels', 'detail', id),
    queryFn: () => getChannel(id),
    enabled: Number.isFinite(id) && id > 0,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

// ============================================================================
// 创建
// ============================================================================

export function useCreateChannel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateChannelPayload) => createChannel(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channels'] })
    },
  })
}

// ============================================================================
// 更新
// ============================================================================

export function useUpdateChannel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdateChannelPayload }) =>
      updateChannel(id, payload),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['channels'] })
      qc.invalidateQueries({ queryKey: qk('channels', 'detail', id) })
    },
  })
}

// ============================================================================
// 删除
// ============================================================================

export function useDeleteChannel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteChannel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channels'] })
    },
  })
}

// ============================================================================
// 启用 / 禁用
// ============================================================================

export function useEnableChannel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => enableChannel(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['channels'] })
      qc.invalidateQueries({ queryKey: qk('channels', 'detail', id) })
    },
  })
}

export function useDisableChannel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => disableChannel(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['channels'] })
      qc.invalidateQueries({ queryKey: qk('channels', 'detail', id) })
    },
  })
}

// ============================================================================
// 测试发送（P12）
// ============================================================================

export function useTestChannel() {
  return useMutation({
    mutationFn: async (id: number) => {
      try {
        const result = await testChannel(id)
        obs.track(ev.channelTestSent(id, !!result.ok))
        return result
      } catch (err) {
        obs.track(ev.channelTestSent(id, false))
        throw err
      }
    },
    retry: 0,
  })
}

/** 便捷：根据当前 enabled 状态自动切换 */
export function useToggleChannel() {
  const enable = useEnableChannel()
  const disable = useDisableChannel()
  return {
    mutate: (id: number, currentEnabled: boolean) =>
      currentEnabled ? disable.mutate(id) : enable.mutate(id),
    mutateAsync: (id: number, currentEnabled: boolean) =>
      currentEnabled ? disable.mutateAsync(id) : enable.mutateAsync(id),
    isPending: enable.isPending || disable.isPending,
  }
}
