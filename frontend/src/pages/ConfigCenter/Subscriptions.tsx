/**
 * 订阅管理页面 - Migrated to shadcn/ui
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCcw, Plus, Edit, Trash2, Bell, Inbox } from 'lucide-react'
import type { Subscription } from '@/types/config'
import { CHANNEL_TYPE_OPTIONS, EVENT_TYPE_OPTIONS } from '@/types/config'
import { getSubscriptions, deleteSubscription, toggleSubscription } from '@/api/subscriptions'
import { getChannels } from '@/api/channels'
import { getInstances } from '@/api/appCenter'
import SubscriptionForm from './SubscriptionForm'
import {
  FormButton,
  FormSelect,
  DataTable,
  useToast,
  Badge,
} from '@/components/business'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ColumnDef } from '@tanstack/react-table'
import { format } from 'date-fns'

export default function Subscriptions() {
    const queryClient = useQueryClient()
    const { toast } = useToast()
    const [formVisible, setFormVisible] = useState(false)
    const [editingSubscription, setEditingSubscription] = useState<Subscription | null>(null)
    const [appFilter, setAppFilter] = useState<number | ''>('')
    const [channelFilter, setChannelFilter] = useState<number | ''>('')
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
    const [subscriptionToDelete, setSubscriptionToDelete] = useState<Subscription | null>(null)

    // 获取订阅列表
    const { data, isLoading, refetch } = useQuery({
        queryKey: ['subscriptions'],
        queryFn: () => getSubscriptions()
    })

    // 获取渠道列表（用于筛选器）
    const { data: channelsData } = useQuery({
        queryKey: ['channels'],
        queryFn: () => getChannels()
    })

    // 获取应用实例列表（用于筛选器）
    const { data: appInstancesData } = useQuery({
        queryKey: ['app-instances'],
        queryFn: () => getInstances({ page: 1, page_size: 100 })
    })

    const subscriptions = data?.data?.items || []
    const channels = channelsData?.data?.items || []
    const appInstances = appInstancesData?.items || []

    // 过滤订阅
    const filteredSubscriptions = subscriptions.filter(sub => {
        const matchesApp = !appFilter || sub.app_instance_id === appFilter
        const matchesChannel = !channelFilter || sub.channel_id === channelFilter
        return matchesApp && matchesChannel
    })

    // 删除订阅
    const deleteMutation = useMutation({
        mutationFn: deleteSubscription,
        onSuccess: () => {
            toast({ title: '订阅已删除' })
            queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
            setDeleteConfirmOpen(false)
            setSubscriptionToDelete(null)
        },
        onError: (error: Error) => {
            toast({ title: '删除失败', description: error.message, variant: 'destructive' })
        }
    })

    // 切换启用状态
    const toggleMutation = useMutation({
        mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
            toggleSubscription(id, enabled),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
            toast({ title: '状态更新成功' })
        },
        onError: (error: Error) => {
            toast({ title: '操作失败', description: error.message, variant: 'destructive' })
        }
    })

    const handleDeleteClick = (subscription: Subscription) => {
        setSubscriptionToDelete(subscription)
        setDeleteConfirmOpen(true)
    }

    const handleDeleteConfirm = () => {
        if (subscriptionToDelete) {
            deleteMutation.mutate(subscriptionToDelete.id)
        }
    }

    const handleEdit = (subscription: Subscription) => {
        setEditingSubscription(subscription)
        setFormVisible(true)
    }

    const handleCreate = () => {
        setEditingSubscription(null)
        setFormVisible(true)
    }

    const handleFormClose = () => {
        setFormVisible(false)
        setEditingSubscription(null)
    }

    const handleFormSuccess = () => {
        handleFormClose()
        queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
    }

    const getEventTypeTags = (filter: Subscription['event_filter']) => {
        const types = filter?.event_types || []
        if (types.length === 0) return <Badge>所有事件</Badge>

        return (
            <div className="flex flex-wrap gap-1">
                {types.slice(0, 2).map(type => {
                    const opt = EVENT_TYPE_OPTIONS.find(o => o.value === type)
                    return <Badge key={type} variant="default">{opt?.label || type}</Badge>
                })}
                {types.length > 2 && <Badge variant="secondary">+{types.length - 2}</Badge>}
            </div>
        )
    }

    const getChannelTypeTag = (type: string) => {
        const option = CHANNEL_TYPE_OPTIONS.find(o => o.value === type)
        return <Badge variant={(option?.color as 'default' | 'secondary' | 'destructive' | 'outline') || 'default'}>{option?.label || type}</Badge>
    }

    const columns: ColumnDef<Subscription>[] = [
        {
            accessorKey: 'name',
            header: '订阅名称',
            cell: ({ row }) => (
                <span className="font-medium">{row.getValue('name') || '-'}</span>
            ),
        },
        {
            id: 'app_instance',
            header: '应用实例',
            cell: ({ row }) => (
                <div>
                    <div className="font-medium">{row.original.app_instance?.name || '-'}</div>
                    <div className="text-xs text-gray-400">
                        {row.original.app_instance?.app_name || row.original.app_instance?.app_code}
                    </div>
                </div>
            ),
        },
        {
            id: 'channel',
            header: '推送渠道',
            cell: ({ row }) => getChannelTypeTag(row.original.channel?.channel_type || ''),
        },
        {
            id: 'event_types',
            header: '订阅事件',
            cell: ({ row }) => getEventTypeTags(row.original.event_filter),
        },
        {
            accessorKey: 'enabled',
            header: '状态',
            cell: ({ row }) => (
                <Switch
                    checked={row.getValue('enabled')}
                    onCheckedChange={(checked) => toggleMutation.mutate({ id: row.original.id, enabled: checked })}
                    disabled={toggleMutation.isPending}
                    aria-label="Toggle subscription status"
                />
            ),
        },
        {
            accessorKey: 'created_at',
            header: '创建时间',
            cell: ({ row }) => {
                const date = row.getValue('created_at') as string
                return date ? format(new Date(date), 'yyyy-MM-dd HH:mm') : '-'
            },
        },
        {
            id: 'actions',
            header: '操作',
            cell: ({ row }) => (
                <div className="flex space-x-2">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <FormButton
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleEdit(row.original)}
                                >
                                    <Edit className="h-4 w-4" />
                                </FormButton>
                            </TooltipTrigger>
                            <TooltipContent><p>编辑</p></TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <FormButton
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeleteClick(row.original)}
                                    disabled={deleteMutation.isPending && subscriptionToDelete?.id === row.original.id}
                                >
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                </FormButton>
                            </TooltipTrigger>
                            <TooltipContent><p>删除</p></TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            ),
        },
    ]

    return (
        <div className="space-y-4 md:space-y-6 p-4 md:p-0">
            {/* 页面标题 */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex-1 min-w-0">
                    <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1 truncate">订阅管理</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 hidden sm:block">配置应用执行结果的推送规则</p>
                </div>
                <div className="flex gap-2">
                    <FormButton
                        variant="outline"
                        onClick={() => refetch()}
                        disabled={isLoading}
                        className="hidden sm:inline-flex"
                    >
                        <RefreshCcw className="h-4 w-4 mr-2" />
                        刷新
                    </FormButton>
                    <FormButton
                        variant="outline"
                        onClick={() => refetch()}
                        disabled={isLoading}
                        size="icon"
                        className="sm:hidden"
                    >
                        <RefreshCcw className="h-4 w-4" />
                    </FormButton>
                    <FormButton onClick={handleCreate}>
                        <Plus className="h-4 w-4 mr-2" />
                        <span className="hidden sm:inline">创建订阅</span>
                        <span className="sm:hidden">创建</span>
                    </FormButton>
                </div>
            </div>

            {/* 筛选栏 */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 shadow-sm">
                <div className="flex flex-col sm:flex-row gap-3">
                    <FormSelect
                        placeholder="筛选应用"
                        value={appFilter ? appFilter.toString() : ''}
                        onChange={(val: string) => setAppFilter(val ? Number(val) : '')}
                        options={appInstances.map((app: { id: number; instance_name?: string; name: string; app_code: string }) => ({
                            value: app.id.toString(),
                            label: `${app.instance_name || app.name} (${app.app_code})`
                        }))}
                        searchable
                        className="w-full sm:w-56"
                    />
                    <FormSelect
                        placeholder="筛选渠道"
                        value={channelFilter ? channelFilter.toString() : ''}
                        onChange={(val: string) => setChannelFilter(val ? Number(val) : '')}
                        options={channels.map((ch: { id: number; name: string; channel_type: string }) => ({
                            value: ch.id.toString(),
                            label: ch.name
                        }))}
                        className="w-full sm:w-44"
                    />
                </div>
            </div>

            {/* 订阅列表 */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                {isLoading ? (
                    <div className="flex items-center justify-center h-64">
                        <Skeleton className="h-32 w-full" />
                    </div>
                ) : filteredSubscriptions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 py-8">
                        <Inbox className="h-16 w-16 text-gray-300 mb-4" />
                        <div className="text-center">
                            <p className="text-lg font-medium text-gray-600 mb-2">
                                {appFilter || channelFilter ? '未找到匹配的订阅' : '还没有订阅'}
                            </p>
                            <p className="text-sm text-gray-400 mb-4">
                                {appFilter || channelFilter
                                    ? '尝试调整筛选条件'
                                    : '创建订阅规则，自动推送应用执行结果'}
                            </p>
                            <FormButton onClick={handleCreate}>
                                <Plus className="h-4 w-4 mr-2" />
                                立即创建
                            </FormButton>
                        </div>
                    </div>
                ) : (
                    <DataTable
                        columns={columns}
                        data={filteredSubscriptions}
                        showPagination={true}
                    />
                )}
            </div>

            {/* 创建/编辑表单 */}
            <SubscriptionForm
                open={formVisible}
                subscription={editingSubscription}
                onClose={handleFormClose}
                onSuccess={handleFormSuccess}
            />

            {/* 删除确认对话框 */}
            <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>确认删除</AlertDialogTitle>
                        <AlertDialogDescription>
                            确定要删除订阅 "{subscriptionToDelete?.name}" 吗？此操作无法撤销。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteConfirm} className="bg-red-600 hover:bg-red-700">
                            删除
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
