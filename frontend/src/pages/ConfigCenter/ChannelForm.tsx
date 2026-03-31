/**
 * 渠道表单组件 - Migrated to shadcn/ui
 */
import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import type { Channel, ChannelType, CreateChannelRequest } from '@/types/config'
import { CHANNEL_TYPE_OPTIONS } from '@/types/config'
import { createChannel, updateChannel } from '@/api/channels'
import {
  PageModal,
  FormInput,
  FormPassword,
  FormSelect,
  FormButton,
  FormTextarea,
  useToast,
} from '@/components/business'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

interface ChannelFormProps {
    open: boolean
    channel: Channel | null
    onClose: () => void
    onSuccess: () => void
}

export default function ChannelForm({ open, channel, onClose, onSuccess }: ChannelFormProps) {
    const { toast } = useToast()
    const isEditing = !!channel
    
    // Form state
    const [name, setName] = useState('')
    const [channelType, setChannelType] = useState<ChannelType>('feishu')
    const [enabled, setEnabled] = useState(true)
    
    // Feishu config
    const [feishuChatId, setFeishuChatId] = useState('')
    const [feishuWebhookUrl, setFeishuWebhookUrl] = useState('')
    
    // Webhook config
    const [webhookUrl, setWebhookUrl] = useState('')
    const [webhookMethod, setWebhookMethod] = useState('POST')
    const [webhookSecret, setWebhookSecret] = useState('')
    
    // Email config
    const [emailRecipients, setEmailRecipients] = useState('')
    const [emailSubjectTemplate, setEmailSubjectTemplate] = useState('')
    
    // OSS config
    const [ossBucket, setOssBucket] = useState('')
    const [ossPathTemplate, setOssPathTemplate] = useState('')

    useEffect(() => {
        if (open) {
            if (channel) {
                // 编辑模式 - 填充数据
                setName(channel.name)
                setChannelType(channel.channel_type)
                setEnabled(channel.enabled)
                
                const config = channel.config || {}
                switch (channel.channel_type) {
                    case 'feishu':
                        setFeishuChatId(config.chat_id || '')
                        setFeishuWebhookUrl(config.webhook_url || '')
                        break
                    case 'webhook':
                        setWebhookUrl(config.url || '')
                        setWebhookMethod(config.method || 'POST')
                        setWebhookSecret(config.secret || '')
                        break
                    case 'email':
                        setEmailRecipients(Array.isArray(config.recipients) ? config.recipients.join(', ') : config.recipients || '')
                        setEmailSubjectTemplate(config.subject_template || '')
                        break
                    case 'oss':
                        setOssBucket(config.bucket || '')
                        setOssPathTemplate(config.path_template || '')
                        break
                }
            } else {
                // 新建模式 - 重置
                resetForm()
            }
        }
    }, [open, channel])

    const resetForm = () => {
        setName('')
        setChannelType('feishu')
        setEnabled(true)
        setFeishuChatId('')
        setFeishuWebhookUrl('')
        setWebhookUrl('')
        setWebhookMethod('POST')
        setWebhookSecret('')
        setEmailRecipients('')
        setEmailSubjectTemplate('')
        setOssBucket('')
        setOssPathTemplate('')
    }

    // 创建渠道
    const createMutation = useMutation({
        mutationFn: createChannel,
        onSuccess: () => {
            toast({ title: '渠道创建成功' })
            onSuccess()
        },
        onError: (error: Error) => {
            toast({ title: '创建失败', description: error.message, variant: 'destructive' })
        }
    })

    // 更新渠道
    const updateMutation = useMutation({
        mutationFn: (data: { id: number; payload: Partial<CreateChannelRequest> }) =>
            updateChannel(data.id, data.payload),
        onSuccess: () => {
            toast({ title: '渠道更新成功' })
            onSuccess()
        },
        onError: (error: Error) => {
            toast({ title: '更新失败', description: error.message, variant: 'destructive' })
        }
    })

    const handleSubmit = () => {
        // 验证
        if (!name) {
            toast({ title: '请输入渠道名称', variant: 'destructive' })
            return
        }
        
        // 构建配置
        let config: Record<string, unknown> = {}
        switch (channelType) {
            case 'feishu':
                if (!feishuChatId) {
                    toast({ title: '请输入群聊 ID', variant: 'destructive' })
                    return
                }
                config = {
                    chat_id: feishuChatId,
                    webhook_url: feishuWebhookUrl || undefined
                }
                break
            case 'webhook':
                if (!webhookUrl) {
                    toast({ title: '请输入 Webhook URL', variant: 'destructive' })
                    return
                }
                config = {
                    url: webhookUrl,
                    method: webhookMethod || 'POST',
                    secret: webhookSecret || undefined
                }
                break
            case 'email':
                if (!emailRecipients) {
                    toast({ title: '请输入收件人邮箱', variant: 'destructive' })
                    return
                }
                config = {
                    recipients: emailRecipients.split(',').map(s => s.trim()).filter(Boolean),
                    subject_template: emailSubjectTemplate
                }
                break
            case 'oss':
                if (!ossBucket) {
                    toast({ title: '请输入 Bucket 名称', variant: 'destructive' })
                    return
                }
                config = {
                    bucket: ossBucket,
                    path_template: ossPathTemplate
                }
                break
        }

        const payload: CreateChannelRequest = {
            name,
            channel_type: channelType,
            config,
            enabled
        }

        if (isEditing && channel) {
            updateMutation.mutate({ id: channel.id, payload })
        } else {
            createMutation.mutate(payload)
        }
    }

    const isLoading = createMutation.isPending || updateMutation.isPending

    return (
        <PageModal
            open={open}
            onOpenChange={(isOpen: boolean) => !isOpen && onClose()}
            title={isEditing ? '编辑渠道' : '创建渠道'}
            description="配置渠道类型、目标地址和发送参数。"
            width="500px"
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
            <div className="mt-2 space-y-4">
                <div>
                    <Label htmlFor="name">渠道名称 *</Label>
                    <FormInput
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="例如：数据团队飞书群"
                        className="mt-1"
                    />
                </div>

                <div>
                    <Label htmlFor="channel_type">渠道类型 *</Label>
                    <FormSelect
                        id="channel_type"
                        value={channelType}
                        onValueChange={(val) => setChannelType(val as ChannelType)}
                        options={CHANNEL_TYPE_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
                        disabled={isEditing}
                        className="mt-1"
                    />
                </div>

                <div className="flex items-center space-x-2">
                    <Switch
                        id="enabled"
                        checked={enabled}
                        onCheckedChange={setEnabled}
                    />
                    <Label htmlFor="enabled">启用状态</Label>
                </div>

                {/* 飞书配置 */}
                {channelType === 'feishu' && (
                    <>
                        <div>
                            <Label htmlFor="feishu_chat_id">群聊 ID *</Label>
                            <FormInput
                                id="feishu_chat_id"
                                value={feishuChatId}
                                onChange={(e) => setFeishuChatId(e.target.value)}
                                placeholder="oc_xxxxxx"
                                className="mt-1"
                            />
                            <p className="mt-1 text-[0.875rem] leading-5 text-gray-500">格式如：oc_xxxxxx</p>
                        </div>
                        <div>
                            <Label htmlFor="feishu_webhook_url">Webhook URL (可选)</Label>
                            <FormInput
                                id="feishu_webhook_url"
                                value={feishuWebhookUrl}
                                onChange={(e) => setFeishuWebhookUrl(e.target.value)}
                                placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/xxx"
                                className="mt-1"
                            />
                            <p className="mt-1 text-[0.875rem] leading-5 text-gray-500">留空时使用应用默认的飞书机器人。</p>
                        </div>
                    </>
                )}

                {/* Webhook 配置 */}
                {channelType === 'webhook' && (
                    <>
                        <div>
                            <Label htmlFor="webhook_url">Webhook URL *</Label>
                            <FormInput
                                id="webhook_url"
                                value={webhookUrl}
                                onChange={(e) => setWebhookUrl(e.target.value)}
                                placeholder="https://your-webhook-endpoint.com/callback"
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label htmlFor="webhook_method">HTTP 方法</Label>
                            <FormSelect
                                id="webhook_method"
                                value={webhookMethod}
                                onValueChange={setWebhookMethod}
                                options={[
                                    { value: 'POST', label: 'POST' },
                                    { value: 'PUT', label: 'PUT' }
                                ]}
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label htmlFor="webhook_secret">Secret (可选)</Label>
                            <FormPassword
                                id="webhook_secret"
                                value={webhookSecret}
                                onChange={(e) => setWebhookSecret(e.target.value)}
                                placeholder="可选的签名密钥"
                                className="mt-1"
                            />
                            <p className="mt-1 text-[0.875rem] leading-5 text-gray-500">用于签名验证。</p>
                        </div>
                    </>
                )}

                {/* 邮件配置 */}
                {channelType === 'email' && (
                    <>
                        <div>
                            <Label htmlFor="email_recipients">收件人 *</Label>
                            <FormTextarea
                                id="email_recipients"
                                value={emailRecipients}
                                onChange={(e) => setEmailRecipients(e.target.value)}
                                placeholder="user1@example.com, user2@example.com"
                                rows={2}
                                className="mt-1"
                            />
                            <p className="mt-1 text-[0.875rem] leading-5 text-gray-500">多个邮箱用逗号分隔。</p>
                        </div>
                        <div>
                            <Label htmlFor="email_subject_template">邮件主题模板</Label>
                            <FormInput
                                id="email_subject_template"
                                value={emailSubjectTemplate}
                                onChange={(e) => setEmailSubjectTemplate(e.target.value)}
                                placeholder="[数据平台] {{app_name}} 执行通知"
                                className="mt-1"
                            />
                        </div>
                    </>
                )}

                {/* OSS 配置 */}
                {channelType === 'oss' && (
                    <>
                        <div>
                            <Label htmlFor="oss_bucket">Bucket 名称 *</Label>
                            <FormInput
                                id="oss_bucket"
                                value={ossBucket}
                                onChange={(e) => setOssBucket(e.target.value)}
                                placeholder="my-bucket"
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label htmlFor="oss_path_template">路径模板</Label>
                            <FormInput
                                id="oss_path_template"
                                value={ossPathTemplate}
                                onChange={(e) => setOssPathTemplate(e.target.value)}
                                placeholder="exports/{{app_code}}/{{date}}/"
                                className="mt-1"
                            />
                            <p className="mt-1 text-[0.875rem] leading-5 text-gray-500">
                                支持变量: {'{{app_code}}'}, {'{{date}}'}, {'{{execution_id}}'}
                            </p>
                        </div>
                    </>
                )}
            </div>
        </PageModal>
    )
}
