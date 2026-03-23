/**
 * 订阅 API 客户端
 */
import client from './client'
import type { Subscription, CreateSubscriptionRequest, UpdateSubscriptionRequest } from '@/types/config'

// 获取订阅列表
export const getSubscriptions = (params?: {
    app_instance_id?: number
    channel_id?: number
    enabled?: boolean
}) => {
    return client.get<{ items: Subscription[]; total: number }>('/subscriptions', { params })
}

// 获取单个订阅
export const getSubscription = (id: number) => {
    return client.get<Subscription>(`/subscriptions/${id}`)
}

// 创建订阅
export const createSubscription = (data: CreateSubscriptionRequest) => {
    return client.post<Subscription>('/subscriptions', data)
}

// 更新订阅
export const updateSubscription = (id: number, data: UpdateSubscriptionRequest) => {
    return client.put<Subscription>(`/subscriptions/${id}`, data)
}

// 删除订阅
export const deleteSubscription = (id: number) => {
    return client.delete(`/subscriptions/${id}`)
}

// 切换订阅启用状态
export const toggleSubscription = (id: number, enabled: boolean) => {
    return client.put<Subscription>(`/subscriptions/${id}`, { enabled })
}

// 获取应用实例的订阅
export const getSubscriptionsByAppInstance = (appInstanceId: number) => {
    return client.get<{ items: Subscription[]; total: number }>(
        `/app-instances/${appInstanceId}/subscriptions`
    )
}
