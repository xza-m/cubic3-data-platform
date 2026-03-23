/**
 * 渠道 API 客户端
 */
import client from './client'
import type { Channel, CreateChannelRequest, UpdateChannelRequest } from '@/types/config'

// 获取渠道列表
export const getChannels = (params?: { enabled?: boolean }) => {
    return client.get<{ items: Channel[]; total: number }>('/channels', { params })
}

// 获取单个渠道
export const getChannel = (id: number) => {
    return client.get<Channel>(`/channels/${id}`)
}

// 创建渠道
export const createChannel = (data: CreateChannelRequest) => {
    return client.post<Channel>('/channels', data)
}

// 更新渠道
export const updateChannel = (id: number, data: UpdateChannelRequest) => {
    return client.put<Channel>(`/channels/${id}`, data)
}

// 删除渠道
export const deleteChannel = (id: number) => {
    return client.delete(`/channels/${id}`)
}

// 切换渠道启用状态
export const toggleChannel = (id: number, enabled: boolean) => {
    return client.put<Channel>(`/channels/${id}`, { enabled })
}
