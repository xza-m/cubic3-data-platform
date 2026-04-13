/**
 * 订阅表单组件 - Migrated to shadcn/ui
 */
import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { Subscription, CreateSubscriptionRequest } from '@/types/config'
import { EVENT_TYPE_OPTIONS } from '@/types/config'
import { createSubscription, updateSubscription } from '@/api/subscriptions'
import { getChannels } from '@/api/channels'
import { getInstances } from '@/api/appCenter'
import {
  PageModal,
  FormSelect,
  FormButton,
  useToast,
} from '@/components/business'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { X } from 'lucide-react'

interface SubscriptionFormProps {
    open: boolean
    subscription: Subscription | null
    onClose: () => void
    onSuccess: () => void
}

export default function SubscriptionForm({ open, subscription, onClose, onSuccess }: SubscriptionFormProps) {
    const { toast } = useToast()
    const isEditing = !!subscription
    
    // Form state
    const [name, setName] = useState('')
    const [appInstanceId, setAppInstanceId] = useState<number | ''>('')
    const [channelId, setChannelId] = useState<number | ''>('')
    const [eventTypes, setEventTypes] = useState<string[]>([])
    const [enabled, setEnabled] = useState(true)

    // 获取渠道列表
    const { data: channelsData } = useQuery({
        queryKey: ['channels'],
        queryFn: () => getChannels(),
        enabled: open
    })

    // 获取应用实例列表
    const { data: appInstancesData } = useQuery({
        queryKey: ['app-instances'],
        queryFn: () => getInstances({ page: 1, page_size: 100 }),
        enabled: open
    })

    const channels = channelsData?.data?.items || []
    const appInstances = appInstancesData?.items || []

    useEffect(() => {
        if (open) {
            if (subscription) {
                // 编辑模式 - 填充数据
                setName(subscription.name || '')
                setAppInstanceId(subscription.app_instance_id)
                setChannelId(subscription.channel_id)
                setEventTypes(subscription.event_types || subscription.event_filter?.event_types || [])
                setEnabled(subscription.enabled)
            } else {
                // 新建模式 - 重置
                resetForm()
            }
        }
    }, [open, subscription])

    const resetForm = () => {
        setName('')
        setAppInstanceId('')
        setChannelId('')
        setEventTypes([])
        setEnabled(true)
    }

    // 创建订阅
    const createMutation = useMutation({
        mutationFn: createSubscription,
        onSuccess: () => {
            toast({ title: '订阅创建成功' })
            onSuccess()
        },
        onError: (error: Error) => {
            toast({ title: '创建失败', description: error.message, variant: 'destructive' })
        }
    })

    // 更新订阅
    const updateMutation = useMutation({
        mutationFn: (data: { id: number; payload: Partial<CreateSubscriptionRequest> }) =>
            updateSubscription(data.id, data.payload),
        onSuccess: () => {
            toast({ title: '订阅更新成功' })
            onSuccess()
        },
        onError: (error: Error) => {
            toast({ title: '更新失败', description: error.message, variant: 'destructive' })
        }
    })

    const handleSubmit = () => {
        // 验证
        if (!name) {
            toast({ title: '请输入订阅名称', variant: 'destructive' })
            return
        }
        if (!appInstanceId) {
            toast({ title: '请选择应用实例', variant: 'destructive' })
            return
        }
        if (!channelId) {
            toast({ title: '请选择推送渠道', variant: 'destructive' })
            return
        }

        const payload: CreateSubscriptionRequest = {
            name,
            app_instance_id: appInstanceId as number,
            channel_id: channelId as number,
            event_types: eventTypes,
            enabled
        }

        if (isEditing && subscription) {
            updateMutation.mutate({
                id: subscription.id,
                payload: {
                    name: payload.name,
                    event_types: payload.event_types,
                    enabled: payload.enabled
                }
            })
        } else {
            createMutation.mutate(payload)
        }
    }

    const handleRemoveEventType = (typeToRemove: string) => {
        setEventTypes(eventTypes.filter(t => t !== typeToRemove))
    }

    const handleAddEventType = (type: string) => {
        if (type && !eventTypes.includes(type)) {
            setEventTypes([...eventTypes, type])
        }
    }

    const isLoading = createMutation.isPending || updateMutation.isPending

    return (
        <PageModal
            open={open}
            onOpenChange={(isOpen: boolean) => !isOpen && onClose()}
            title={isEditing ? '编辑订阅' : '创建订阅'}
            width="min(720px,calc(100vw-2rem))"
            className="top-4 translate-y-0 sm:top-[50%] sm:translate-y-[-50%]"
            bodyClassName="pr-1"
            footer={
                <div className="flex justify-end gap-2">
                    <FormButton variant="outline" onClick={onClose}>
                        取消
                    </FormButton>
                    <FormButton onClick={handleSubmit} loading={isLoading}>
                        {isEditing ? '保存' : '创建'}
                    </FormButton>
                </div>
            }
        >
            <div className="space-y-4 mt-4">
                <div>
                    <Label htmlFor="name">订阅名称 *</Label>
                    <Input
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="例如: 数据集推送通知"
                        className="mt-1"
                    />
                </div>

                <div>
                    <Label htmlFor="app_instance_id">应用实例 *</Label>
                    <FormSelect
                        id="app_instance_id"
                        value={appInstanceId ? appInstanceId.toString() : ''}
                        onChange={(val: string) => setAppInstanceId(val ? Number(val) : '')}
                        options={appInstances.map((app: { id: number; name: string; instance_name?: string; app_code: string }) => ({
                            value: app.id.toString(),
                            label: `${app.instance_name || app.name || 'Unnamed'} (${app.app_code})`
                        }))}
                        disabled={isEditing}
                        searchable
                        placeholder="选择要订阅的应用实例"
                        className="mt-1"
                    />
                </div>

                <div>
                    <Label htmlFor="channel_id">推送渠道 *</Label>
                    <FormSelect
                        id="channel_id"
                        value={channelId ? channelId.toString() : ''}
                        onChange={(val: string) => setChannelId(val ? Number(val) : '')}
                        options={channels.map((ch: { id: number; name: string; channel_type: string }) => ({
                            value: ch.id.toString(),
                            label: `${ch.name} (${ch.channel_type})`
                        }))}
                        disabled={isEditing}
                        placeholder="选择推送渠道"
                        className="mt-1"
                    />
                </div>

                <div>
                    <Label htmlFor="event_types">订阅事件</Label>
                    <FormSelect
                        id="event_types"
                        value=""
                        onChange={handleAddEventType}
                        options={EVENT_TYPE_OPTIONS.filter(o => !eventTypes.includes(o.value)).map(o => ({
                            value: o.value,
                            label: o.label
                        }))}
                        placeholder="选择要订阅的事件类型"
                        className="mt-1"
                    />
                    <p className="text-sm text-gray-500 mt-1">不选择则订阅所有事件</p>
                    
                    {/* Selected event types */}
                    {eventTypes.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                            {eventTypes.map(type => {
                                const option = EVENT_TYPE_OPTIONS.find(o => o.value === type)
                                return (
                                    <Badge key={type} variant="secondary" className="pr-1">
                                        {option?.label || type}
                                        <button
                                            onClick={() => handleRemoveEventType(type)}
                                            className="ml-1 hover:text-red-600"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </Badge>
                                )
                            })}
                        </div>
                    )}
                </div>

                <div className="flex items-center space-x-2">
                    <Switch
                        id="enabled"
                        checked={enabled}
                        onCheckedChange={setEnabled}
                    />
                    <Label htmlFor="enabled">启用状态</Label>
                </div>
            </div>
        </PageModal>
    )
}
