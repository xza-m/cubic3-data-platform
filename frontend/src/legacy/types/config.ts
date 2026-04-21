/**
 * 配置中心类型定义
 */

// 渠道类型枚举
export type ChannelType = 'feishu' | 'webhook' | 'email' | 'oss'

// 渠道实体
export interface Channel {
    id: number
    name: string
    channel_type: ChannelType
    config: Record<string, any>
    enabled: boolean
    created_at: string
    updated_at: string
}

// 创建渠道请求
export interface CreateChannelRequest {
    name: string
    channel_type: ChannelType
    config: Record<string, any>
    enabled?: boolean
}

// 更新渠道请求
export interface UpdateChannelRequest {
    name?: string
    config?: Record<string, any>
    enabled?: boolean
}

// 订阅实体
export interface Subscription {
    id: number
    name: string
    description?: string
    app_instance_id: number
    channel_id: number
    event_types?: string[]
    filter_conditions?: Record<string, any>
    delivery_config?: Record<string, any>
    event_filter?: EventFilter
    enabled: boolean
    created_at: string
    updated_at: string
    // 关联数据（列表查询时返回）
    app_instance?: {
        id: number
        name: string  // 实例名称
        app_code: string
        app_name?: string  // 应用的中文名称（待后端添加）
    }
    channel?: {
        id: number
        name: string
        channel_type: ChannelType
    }
}

// 事件过滤器
export interface EventFilter {
    event_types?: string[]
    conditions?: Record<string, any>
}

// 创建订阅请求
export interface CreateSubscriptionRequest {
    name: string
    app_instance_id: number
    channel_id: number
    event_types: string[]
    filter_conditions?: Record<string, any>
    delivery_config?: Record<string, any>
    description?: string
    enabled?: boolean
}

// 更新订阅请求
export interface UpdateSubscriptionRequest {
    name?: string
    event_types?: string[]
    filter_conditions?: Record<string, any>
    delivery_config?: Record<string, any>
    description?: string
    enabled?: boolean
}

// 渠道类型配置
export const CHANNEL_TYPE_OPTIONS = [
    { value: 'feishu', label: '飞书群', color: 'blue' },
    { value: 'webhook', label: 'Webhook', color: 'purple' },
    { value: 'email', label: '邮件', color: 'orange' },
    { value: 'oss', label: 'OSS 存储', color: 'green' },
] as const

// 事件类型选项
export const EVENT_TYPE_OPTIONS = [
    { value: 'app.execution.completed', label: '应用执行完成' },
    { value: 'app.execution.failed', label: '应用执行失败' },
    { value: 'app.instance.created', label: '应用实例创建' },
    { value: 'app.instance.enabled', label: '应用实例启用' },
    { value: 'app.instance.disabled', label: '应用实例禁用' },
] as const
