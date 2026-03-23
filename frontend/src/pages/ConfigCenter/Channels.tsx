/**
 * 渠道管理页面 - Migrated to shadcn/ui
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, RefreshCw, Edit2, Trash2, Plus, Inbox } from 'lucide-react'
import type { Channel, ChannelType } from '@/types/config'
import { CHANNEL_TYPE_OPTIONS } from '@/types/config'
import { getChannels, deleteChannel, toggleChannel } from '@/api/channels'
import ChannelForm from './ChannelForm'
import { 
  DataTable,
  FormButton,
  FormSelect,
  Badge,
  useToast
} from '@/components/business'
import { Switch } from '@/components/ui/switch'
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'

export default function Channels() {
    const { toast } = useToast()
    const queryClient = useQueryClient()
    const [formVisible, setFormVisible] = useState(false)
    const [editingChannel, setEditingChannel] = useState<Channel | null>(null)
    const [searchText, setSearchText] = useState('')
    const [typeFilter, setTypeFilter] = useState<ChannelType | ''>('')
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
    const [channelToDelete, setChannelToDelete] = useState<Channel | null>(null)

    // 获取渠道列表
    const { data, isLoading, refetch } = useQuery({
        queryKey: ['channels'],
        queryFn: () => getChannels()
    })

    const channels = data?.data?.items || []

    // 过滤渠道
    const filteredChannels = channels.filter(ch => {
        const matchesSearch = !searchText ||
            ch.name.toLowerCase().includes(searchText.toLowerCase())
        const matchesType = !typeFilter || ch.channel_type === typeFilter
        return matchesSearch && matchesType
    })

    // 删除渠道
    const deleteMutation = useMutation({
        mutationFn: deleteChannel,
        onSuccess: () => {
            toast({ title: "渠道已删除" })
            queryClient.invalidateQueries({ queryKey: ['channels'] })
            setDeleteDialogOpen(false)
            setChannelToDelete(null)
        },
        onError: (error: Error) => {
            toast({ 
                title: "删除失败", 
                description: error.message,
                variant: "destructive" 
            })
        }
    })

    // 切换启用状态
    const toggleMutation = useMutation({
        mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
            toggleChannel(id, enabled),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['channels'] })
        },
        onError: (error: Error) => {
            toast({ 
                title: "操作失败", 
                description: error.message,
                variant: "destructive" 
            })
        }
    })

    const handleDelete = (channel: Channel) => {
        setChannelToDelete(channel)
        setDeleteDialogOpen(true)
    }

    const confirmDelete = () => {
        if (channelToDelete) {
            deleteMutation.mutate(channelToDelete.id)
        }
    }

    const handleEdit = (channel: Channel) => {
        setEditingChannel(channel)
        setFormVisible(true)
    }

    const handleCreate = () => {
        setEditingChannel(null)
        setFormVisible(true)
    }

    const handleFormClose = () => {
        setFormVisible(false)
        setEditingChannel(null)
    }

    const handleFormSuccess = () => {
        handleFormClose()
        queryClient.invalidateQueries({ queryKey: ['channels'] })
    }

    const getTypeTag = (type: ChannelType) => {
        const option = CHANNEL_TYPE_OPTIONS.find(o => o.value === type)
        return (
            <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                {option?.label || type}
            </Badge>
        )
    }

    const columns = [
        {
            key: 'name',
            title: '渠道名称',
            dataIndex: 'name',
            render: (text: string) => <span className="font-medium">{text}</span>
        },
        {
            key: 'channel_type',
            title: '类型',
            dataIndex: 'channel_type',
            render: (type: ChannelType) => getTypeTag(type)
        },
        {
            key: 'enabled',
            title: '状态',
            dataIndex: 'enabled',
            render: (enabled: boolean, record: Channel) => (
                <div className="flex items-center gap-2">
                    <Switch
                        checked={enabled}
                        onCheckedChange={(checked: boolean) => 
                            toggleMutation.mutate({ id: record.id, enabled: checked })
                        }
                        disabled={toggleMutation.isPending}
                    />
                    <span className="text-sm text-gray-500">
                        {enabled ? '启用' : '禁用'}
                    </span>
                </div>
            )
        },
        {
            key: 'config_summary',
            title: '配置摘要',
            render: (_: unknown, record: Channel) => {
                const config = record.config || {}
                if (record.channel_type === 'feishu') {
                    return <span className="text-gray-500 text-sm">{config.chat_id || '-'}</span>
                }
                if (record.channel_type === 'webhook') {
                    return (
                        <span className="text-gray-500 text-sm truncate max-w-[180px] block">
                            {config.url || '-'}
                        </span>
                    )
                }
                return <span className="text-gray-400">-</span>
            }
        },
        {
            key: 'created_at',
            title: '创建时间',
            dataIndex: 'created_at',
            render: (date: string) => date ? new Date(date).toLocaleString('zh-CN') : '-'
        },
        {
            key: 'actions',
            title: '操作',
            render: (_: unknown, record: Channel) => (
                <TooltipProvider>
                    <div className="flex items-center gap-1">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <FormButton
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleEdit(record)}
                                >
                                    <Edit2 className="h-4 w-4" />
                                </FormButton>
                            </TooltipTrigger>
                            <TooltipContent>编辑</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <FormButton
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDelete(record)}
                                    loading={deleteMutation.isPending && deleteMutation.variables === record.id}
                                >
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                </FormButton>
                            </TooltipTrigger>
                            <TooltipContent>删除</TooltipContent>
                        </Tooltip>
                    </div>
                </TooltipProvider>
            )
        }
    ]

    return (
        <div className="space-y-4 md:space-y-6 p-4 md:p-0">
            {/* 页面标题 */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex-1 min-w-0">
                    <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1 truncate">
                        渠道管理
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 hidden sm:block">
                        管理消息推送渠道（飞书、Webhook、邮件等）
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <FormButton
                        variant="outline"
                        size="sm"
                        onClick={() => refetch()}
                        loading={isLoading}
                        className="hidden sm:flex"
                    >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        刷新
                    </FormButton>
                    <FormButton
                        variant="outline"
                        size="sm"
                        onClick={() => refetch()}
                        loading={isLoading}
                        className="sm:hidden"
                    >
                        <RefreshCw className="h-4 w-4" />
                    </FormButton>
                    <FormButton onClick={handleCreate}>
                        <Plus className="h-4 w-4 mr-2" />
                        <span className="hidden sm:inline">创建渠道</span>
                        <span className="sm:hidden">创建</span>
                    </FormButton>
                </div>
            </div>

            {/* 筛选栏 */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 shadow-sm">
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="搜索渠道名称"
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            className="w-full h-11 pl-12 pr-4 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition-all"
                        />
                    </div>
                    <FormSelect
                        placeholder="渠道类型"
                        value={typeFilter || '__all__'}
                        onValueChange={(val: string) => setTypeFilter(val === '__all__' ? '' : val as ChannelType)}
                        options={[
                            { label: '全部类型', value: '__all__' },
                            ...CHANNEL_TYPE_OPTIONS.map(o => ({ value: o.value, label: o.label }))
                        ]}
                        className="w-full sm:w-40"
                    />
                </div>
            </div>

            {/* 渠道列表 */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                {isLoading ? (
                    <div className="p-8 space-y-4">
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                    </div>
                ) : filteredChannels.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 py-8">
                        <Inbox className="h-16 w-16 text-gray-300 mb-4" />
                        <p className="text-lg font-medium text-gray-600 mb-2">
                            {searchText || typeFilter ? '未找到匹配的渠道' : '还没有渠道'}
                        </p>
                        <p className="text-sm text-gray-400 mb-4">
                            {searchText || typeFilter
                                ? '尝试调整筛选条件'
                                : '创建第一个推送渠道，开始接收消息通知'}
                        </p>
                        {!searchText && !typeFilter && (
                            <FormButton onClick={handleCreate}>
                                <Plus className="h-4 w-4 mr-2" />
                                创建渠道
                            </FormButton>
                        )}
                    </div>
                ) : (
                    <DataTable
                        columns={columns}
                        data={filteredChannels}
                        pageSize={20}
                        showPagination={true}
                    />
                )}
            </div>

            {/* 创建/编辑表单 */}
            <ChannelForm
                open={formVisible}
                channel={editingChannel}
                onClose={handleFormClose}
                onSuccess={handleFormSuccess}
            />

            {/* 删除确认对话框 */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>确认删除</AlertDialogTitle>
                        <AlertDialogDescription>
                            确定要删除渠道 "{channelToDelete?.name}" 吗？关联的订阅也将被删除。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDelete}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            删除
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
