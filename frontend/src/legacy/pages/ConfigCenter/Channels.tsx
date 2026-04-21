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
  useToast
} from '@/components/business'
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
    const { data, isLoading, isFetching, refetch } = useQuery({
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

    const handleRefresh = async () => {
        const result = await refetch()
        if (result.error) {
            toast({
                title: '刷新失败',
                description: result.error.message,
                variant: 'destructive',
            })
            return
        }
        toast({ title: '渠道列表已刷新' })
    }

    const handleFormClose = () => {
        setFormVisible(false)
        setEditingChannel(null)
    }

    const handleFormSuccess = () => {
        handleFormClose()
        queryClient.invalidateQueries({ queryKey: ['channels'] })
    }

    const getTypeText = (type: ChannelType) => {
        const option = CHANNEL_TYPE_OPTIONS.find(o => o.value === type)
        const colorMap: Record<ChannelType, string> = {
            feishu: 'text-blue-600',
            webhook: 'text-violet-600',
            email: 'text-amber-600',
            oss: 'text-emerald-600',
        }
        return (
            <span className={`text-sm font-medium ${colorMap[type] || 'text-slate-600'}`}>
                {option?.label || type}
            </span>
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
            render: (type: ChannelType) => getTypeText(type)
        },
        {
            key: 'enabled',
            title: '状态',
            dataIndex: 'enabled',
            render: (enabled: boolean, record: Channel) => (
                <button
                    type="button"
                    onClick={() => toggleMutation.mutate({ id: record.id, enabled: !enabled })}
                    disabled={toggleMutation.isPending}
                    className={`text-sm font-medium ${enabled ? 'text-emerald-600' : 'text-slate-500'}`}
                >
                    {enabled ? '启用' : '禁用'}
                </button>
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
        <div className="flex h-full flex-col gap-6 p-8 px-10">
            {/* 页面标题 */}
            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                    <h1 className="text-xl font-bold text-slate-900">渠道管理</h1>
                    <p className="text-sm text-slate-500">管理消息推送渠道（飞书、Webhook、邮件等）</p>
                </div>
                <div className="flex items-center gap-2">
                    <FormButton
                        variant="outline"
                        onClick={() => void handleRefresh()}
                        loading={isFetching}
                        icon={<RefreshCw className="h-3.5 w-3.5 text-slate-500" />}
                        className="rounded-lg border-slate-200 px-4 text-[13px] font-medium text-slate-900 hover:bg-slate-50"
                    >
                        刷新
                    </FormButton>
                    <FormButton
                        onClick={handleCreate}
                        icon={<Plus className="h-3.5 w-3.5" />}
                        className="rounded-lg bg-blue-600 px-4 text-[13px] font-medium text-white shadow-[0_2px_8px_rgba(37,99,235,0.19)] hover:bg-blue-700"
                    >
                        新建
                    </FormButton>
                </div>
            </div>

            {/* 筛选栏 */}
            <div className="flex items-center gap-3">
                <div className="flex w-[280px] items-center gap-2 rounded-lg bg-slate-100 px-3.5 py-2">
                    <Search className="h-3.5 w-3.5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="搜索渠道名称"
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        className="w-full bg-transparent text-[13px] text-slate-900 placeholder:text-slate-400 outline-none"
                    />
                </div>
                <select
                    value={typeFilter || ''}
                    onChange={(e) => setTypeFilter(e.target.value as ChannelType | '')}
                    className="flex items-center gap-2 rounded-lg bg-slate-100 px-3.5 py-2 text-[13px] text-slate-500 outline-none"
                >
                    <option value="">全部类型</option>
                    {CHANNEL_TYPE_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                </select>
            </div>

            {/* 渠道列表 */}
            <div className="flex-1 overflow-hidden">
                {isLoading ? (
                    <div className="space-y-4 rounded-xl bg-white p-8 shadow-[0_2px_24px_rgba(15,23,42,0.03)]">
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                    </div>
                ) : filteredChannels.length === 0 ? (
                    <div className="flex h-64 flex-col items-center justify-center rounded-xl bg-white py-8 shadow-[0_2px_24px_rgba(15,23,42,0.03)]">
                        <Inbox className="h-16 w-16 text-slate-200 mb-4" />
                        <p className="text-base font-medium text-slate-600 mb-2">
                            {searchText || typeFilter ? '未找到匹配的渠道' : '还没有渠道'}
                        </p>
                        <p className="text-sm text-slate-400 mb-4">
                            {searchText || typeFilter
                                ? '尝试调整筛选条件'
                                : '创建第一个推送渠道，开始接收消息通知'}
                        </p>
                        {!searchText && !typeFilter && (
                            <FormButton
                                onClick={handleCreate}
                                icon={<Plus className="h-3.5 w-3.5" />}
                                className="rounded-lg bg-blue-600 px-4 text-[13px] font-medium text-white shadow-[0_2px_8px_rgba(37,99,235,0.19)] hover:bg-blue-700"
                            >
                                新建
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
