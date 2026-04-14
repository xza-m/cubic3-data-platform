/**
 * 数据源管理页面
 * 基于 uiv2.pen 设计稿 (Hpudj)
 */
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Database,
  Plus,
  Edit2,
  Trash2,
  Play,
  Search,
  Loader2,
  Inbox
} from 'lucide-react'
import {
  getDataSources,
  createDataSource,
  updateDataSource,
  deleteDataSource,
  testDataSourceConnection,
  syncDataSourceCatalog,
  getDataSourceTypes,
} from '../api/datasources'
import type { CreateDataSourceRequest, UpdateDataSourceRequest } from '../api/datasources'
import type { DataSource } from '@/types'
import {
  FormButton,
  FormSelect,
  useToast,
  PageModal,
  DataCenterPageShell,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/business'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface AxiosLikeError {
  response?: { data?: { message?: string; details?: { reason_code?: string } } }
  message?: string
}

interface DataSourceFormData {
  name: string
  source_type: string
  description: string
  host: string
  port: string
  database: string
  username: string
  password: string
  project: string
  id?: number
}

interface DataSourceTypeOption {
  type: string
  display_name: string
  description?: string
  icon?: string
}

export function DataSourceBrandIcon({ sourceType }: { sourceType: string }) {
  const baseClass = 'flex h-12 w-12 items-center justify-center rounded-xl shadow-[inset_0_1px_0_#FFFFFF80]'

  if (sourceType === 'postgresql') {
    return (
      <div className={`${baseClass} bg-[#E8F0FF] text-[#336791]`} aria-hidden="true">
        <svg viewBox="0 0 24 24" className="h-7 w-7 fill-current">
          <path d="M12.2 2.4c-4.7 0-7.7 3.3-7.7 8.1 0 2.8 1.3 4.8 3.6 5.9v3.3c0 .6.7.9 1.2.5l2.1-1.6c.2-.1.4-.2.6-.2h1.1c4.1 0 6.9-3 6.9-7.8 0-4.9-3.1-8.2-7.8-8.2Zm2.7 11.4h-1.8l-.8 2.3a.8.8 0 0 1-1.5-.5l.7-1.8h-1.1c-1.9 0-3-1.2-3-3.1 0-2 1.2-3.3 3.3-3.3h4.1c1.9 0 3 1.2 3 3.1 0 1.9-1.2 3.3-2.9 3.3Z" />
        </svg>
      </div>
    )
  }

  if (sourceType === 'mysql') {
    return (
      <div className={`${baseClass} bg-[#FFF3E8] text-[#F29111]`} aria-hidden="true">
        <svg viewBox="0 0 24 24" className="h-7 w-7 fill-current">
          <path d="M17.7 6.2c-1.5-.7-3.2-.7-4.8-.1l-2 .7-1.8-.5a.8.8 0 0 0-.9 1.2l1.2 1.9-.7 1.7a6 6 0 0 0 1.8 7.1l1.4 1.1c.4.3 1 .1 1.2-.4l.5-1.5 1.6-.2a5.7 5.7 0 0 0 4.9-4.2l.3-1.2c.4-1.8-.5-4.1-2.7-5.6Zm-5 7.7a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8Zm3.4-1.7a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8Z" />
        </svg>
      </div>
    )
  }

  if (sourceType === 'clickhouse') {
    return (
      <div className={`${baseClass} bg-[#FFF7D6] text-[#FFCC01]`} aria-hidden="true">
        <svg viewBox="0 0 24 24" className="h-7 w-7">
          <rect x="4" y="5" width="4" height="14" rx="1" fill="currentColor" />
          <rect x="10" y="8" width="4" height="11" rx="1" fill="#FF6A00" />
          <rect x="16" y="11" width="4" height="8" rx="1" fill="#1D4ED8" />
        </svg>
      </div>
    )
  }

  if (sourceType === 'maxcompute') {
    return (
      <div className={`${baseClass} bg-[#EEF2FF] text-[#6D28D9]`} aria-hidden="true">
        <svg viewBox="0 0 24 24" className="h-7 w-7 fill-current">
          <path d="M12 3.5 4.8 7.7v8.6L12 20.5l7.2-4.2V7.7L12 3.5Zm0 2.1 4.9 2.8L12 11.2 7.1 8.4 12 5.6Zm-5.1 4.6 4.2 2.4v5l-4.2-2.5v-4.9Zm6 7.4v-5l4.2-2.4v5l-4.2 2.4Z" />
        </svg>
      </div>
    )
  }

  return (
    <div className={`${baseClass} bg-slate-100 text-slate-500`} aria-hidden="true">
      <Database className="h-6 w-6" />
    </div>
  )
}

export function optimisticallyMarkCatalogSync<
  T extends { data?: { items?: Array<{ id: number; extra_config?: Record<string, unknown> & { catalog_sync?: Record<string, unknown> } }> } }
>(current: T | undefined, id: number): T | undefined {
  if (!current?.data?.items) {
    return current
  }

  return {
    ...current,
    data: {
      ...current.data,
      items: current.data.items.map((item) => {
        if (item.id !== id) {
          return item
        }

        const existingSync = item.extra_config?.catalog_sync || {}
        return {
          ...item,
          extra_config: {
            ...(item.extra_config || {}),
            catalog_sync: {
              ...existingSync,
              status: 'syncing',
              last_error: null,
            },
          },
        }
      }),
    },
  }
}

export default function Datasources() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [createVisible, setCreateVisible] = useState(false)
  const [editVisible, setEditVisible] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [searchText, setSearchText] = useState('')
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [dsToDelete, setDsToDelete] = useState<DataSource | null>(null)
  const [syncingCatalogId, setSyncingCatalogId] = useState<number | null>(null)
  const [pollingCatalogIds, setPollingCatalogIds] = useState<number[]>([])
  // 创建表单数据
  const [createFormData, setCreateFormData] = useState({
    name: '',
    source_type: '',
    description: '',
    host: '',
    port: '',
    database: '',
    username: '',
    password: '',
    project: '' // MaxCompute specific
  })
  
  // 编辑表单数据
  const [editFormData, setEditFormData] = useState({
    name: '',
    source_type: '',
    description: '',
    host: '',
    port: '',
    database: '',
    username: '',
    password: '',
    project: ''
  })

  const { data: listData, isLoading, isError, error } = useQuery({
    queryKey: ['datasources'],
    queryFn: () => getDataSources({ page: 1, page_size: 100 }),
    refetchInterval: pollingCatalogIds.length > 0 ? 2000 : false,
  })

  // 获取数据源类型列表
  const { data: typesData } = useQuery({
    queryKey: ['datasource-types'],
    queryFn: getDataSourceTypes,
    staleTime: 30 * 60 * 1000 // 缓存30分钟
  })

  const createMutation = useMutation({
    mutationFn: createDataSource,
    onSuccess: () => {
      toast({ title: '创建成功' })
      setCreateVisible(false)
      setCreateFormData({
        name: '',
        source_type: '',
        description: '',
        host: '',
        port: '',
        database: '',
        username: '',
        password: '',
        project: ''
      })
      queryClient.invalidateQueries({ queryKey: ['datasources'] })
    },
    onError: (error: unknown) => {
      const err = error as AxiosLikeError
      toast({ 
        title: '创建失败', 
        description: err.response?.data?.message || err.message,
        variant: 'destructive' 
      })
    }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateDataSourceRequest }) => updateDataSource(id, data),
    onSuccess: () => {
      toast({ title: '更新成功' })
      setEditVisible(false)
      setEditingId(null)
      setEditFormData({
        name: '',
        source_type: '',
        description: '',
        host: '',
        port: '',
        database: '',
        username: '',
        password: '',
        project: ''
      })
      queryClient.invalidateQueries({ queryKey: ['datasources'] })
    },
    onError: (error: unknown) => {
      const err = error as AxiosLikeError
      toast({ 
        title: '更新失败', 
        description: err.response?.data?.message || err.message,
        variant: 'destructive' 
      })
    }
  })

  const deleteMutation = useMutation({
    mutationFn: deleteDataSource,
    onSuccess: () => {
      toast({ title: '删除成功' })
      queryClient.invalidateQueries({ queryKey: ['datasources'] })
      setDeleteConfirmOpen(false)
      setDsToDelete(null)
    },
    onError: (error: unknown) => {
      const err = error as AxiosLikeError
      toast({ 
        title: '删除失败', 
        description: err.response?.data?.message || err.message,
        variant: 'destructive' 
      })
    }
  })

  const syncCatalogMutation = useMutation({
    mutationFn: (id: number) => syncDataSourceCatalog(id),
    onMutate: (id: number) => {
      setSyncingCatalogId(id)
      setPollingCatalogIds((current) => (current.includes(id) ? current : [...current, id]))
      queryClient.setQueryData(['datasources'], (current: typeof listData) => optimisticallyMarkCatalogSync(current, id))
    },
    onSuccess: (_result, id) => {
      toast({
        title: '目录同步已触发',
        description: '目录刷新任务已加入队列，卡片会自动刷新同步状态。',
      })
      setPollingCatalogIds((current) => (current.includes(id) ? current : [...current, id]))
      queryClient.invalidateQueries({ queryKey: ['datasources'] })
    },
    onError: (error: unknown) => {
      const err = error as AxiosLikeError
      toast({
        title: '目录同步失败',
        description: err.response?.data?.message || err.message,
        variant: 'destructive',
      })
    },
    onSettled: () => {
      setSyncingCatalogId(null)
    }
  })

  useEffect(() => {
    const items = listData?.data?.items || []
    if (!pollingCatalogIds.length) {
      return
    }

    const finishedIds = new Set(
      items
        .filter((item) => {
          if (!pollingCatalogIds.includes(item.id)) {
            return false
          }
          const status = item.extra_config?.catalog_sync?.status
          return status === 'synced' || status === 'failed'
        })
        .map((item) => item.id),
    )

    if (!finishedIds.size) {
      return
    }

    setPollingCatalogIds((current) => current.filter((id) => !finishedIds.has(id)))
  }, [listData, pollingCatalogIds])

  const handleEdit = (ds: DataSource) => {
    setEditingId(ds.id)
    setEditFormData({
      name: ds.name,
      source_type: ds.source_type,
      description: ds.description || '',
      host: ds.connection_config?.host || '',
      port: ds.connection_config?.port || '',
      database: ds.connection_config?.database || '',
      username: ds.connection_config?.access_id || ds.connection_config?.username || '',
      password: '', // 编辑时密码留空，表示不修改
      project: ds.connection_config?.project || ''
    })
    setEditVisible(true)
  }

  const handleCreate = () => {
    if (!createFormData.name || !createFormData.source_type) {
      toast({ title: '请填写名称和类型', variant: 'warning' })
      return
    }

    const connectionConfig = createFormData.source_type === 'maxcompute'
      ? {
          project: createFormData.project,
          access_id: createFormData.username,
          access_key: createFormData.password
        }
      : {
          host: createFormData.host,
          port: createFormData.port,
          database: createFormData.database,
          username: createFormData.username,
          password: createFormData.password
        }

    const data: CreateDataSourceRequest = {
      name: createFormData.name,
      source_type: createFormData.source_type,
      description: createFormData.description,
      connection_config: connectionConfig
    }

    createMutation.mutate(data)
  }

  const handleUpdate = () => {
    if (!editFormData.name) {
      toast({ title: '请填写名称', variant: 'warning' })
      return
    }

    const connectionConfig = editFormData.source_type === 'maxcompute'
      ? {
          project: editFormData.project,
          access_id: editFormData.username,
          // 只有当用户输入了新密码时才更新密码
          ...(editFormData.password ? { access_key: editFormData.password } : {})
        }
      : {
          host: editFormData.host,
          port: editFormData.port,
          database: editFormData.database,
          username: editFormData.username,
          // 只有当用户输入了新密码时才更新密码
          ...(editFormData.password ? { password: editFormData.password } : {})
        }

    const data: UpdateDataSourceRequest = {
      name: editFormData.name,
      description: editFormData.description,
      connection_config: connectionConfig
    }

    updateMutation.mutate({ id: editingId!, data })
  }

  // 卡片上的测试连接 - 使用已保存的数据源ID
  const handleCardTestConnection = async (ds: DataSource) => {
    try {
      const response = await testDataSourceConnection(ds.id)
      
      // 检查返回的 success 字段
      if (response.data?.success) {
        toast({ 
          title: '连接测试成功', 
          description: response.data.message || '数据源连接正常' 
        })
      } else {
        toast({ 
          title: '连接测试失败', 
          description: response.data?.message || '连接失败，请检查配置',
          variant: 'destructive' 
        })
      }
      
      // 无论成功还是失败，都刷新数据源列表以更新状态
      queryClient.invalidateQueries({ queryKey: ['datasources'] })
    } catch (error: unknown) {
      const err = error as AxiosLikeError
      toast({ 
        title: '连接测试失败', 
        description: err.response?.data?.message || err.message,
        variant: 'destructive' 
      })
      // 异常情况也刷新列表
      queryClient.invalidateQueries({ queryKey: ['datasources'] })
    }
  }

  const getCatalogSyncSummary = (ds: DataSource) => ({
    status: ds.extra_config?.catalog_sync?.status || 'pending',
    last_run_at: ds.extra_config?.catalog_sync?.last_run_at || null,
    last_error: ds.extra_config?.catalog_sync?.last_error || null,
    database_count: ds.extra_config?.catalog_sync?.database_count || 0,
    tracked_databases: ds.extra_config?.catalog_sync?.tracked_databases || [],
  })

  const getCatalogSyncBadge = (status: string) => {
    const config: Record<string, { label: string; className: string }> = {
      pending: { label: '待同步', className: 'bg-amber-50 text-amber-700' },
      syncing: { label: '目录同步中', className: 'bg-blue-50 text-blue-700' },
      synced: { label: '目录已同步', className: 'bg-emerald-50 text-emerald-700' },
      failed: { label: '目录同步失败', className: 'bg-rose-50 text-rose-700' },
    }
    return config[status] || { label: status, className: 'bg-gray-100 text-gray-600' }
  }

  const formatRelativeSummaryTime = (value?: string | null) => {
    if (!value) {
      return '尚未执行'
    }

    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) {
      return value
    }

    return parsed.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const datasources = listData?.data?.items || []
  const stats = {
    total: datasources.length,
    active: datasources.filter((ds) => ds.is_active).length,
    connected: datasources.filter((ds) => ds.connection_status === 'connected').length,
    inactive: datasources.filter((ds) => !ds.is_active).length,
  }
  const listErrorMessage =
    (error as AxiosLikeError | null)?.response?.data?.message ||
    (error as AxiosLikeError | null)?.message ||
    '数据源列表加载失败，请稍后重试。'

  const typeConfig: Record<string, { name: string }> = {
    postgresql: { name: 'PostgreSQL' },
    mysql: { name: 'MySQL' },
    clickhouse: { name: 'ClickHouse' },
    maxcompute: { name: 'MaxCompute' }
  }

  const filteredData = datasources.filter((ds: DataSource) =>
    ds.name.toLowerCase().includes(searchText.toLowerCase()) ||
    ds.source_type.toLowerCase().includes(searchText.toLowerCase())
  )

  // 动态获取数据源类型（从后端接口），提供硬编码作为降级方案
  const sourceTypeOptions = (typesData?.data || [
    { type: 'postgresql', display_name: 'PostgreSQL' },
    { type: 'mysql', display_name: 'MySQL' },
    { type: 'clickhouse', display_name: 'ClickHouse' },
    { type: 'maxcompute', display_name: 'MaxCompute' }
  ]).map((t: DataSourceTypeOption) => ({
    value: t.type,
    label: t.display_name || t.type
  }))

  const renderConfigFields = (formData: DataSourceFormData, setFormData: Dispatch<SetStateAction<DataSourceFormData>>, isCreate: boolean) => {
    if (formData.source_type === 'maxcompute') {
      return (
        <>
          <div>
            <Label>Project *</Label>
            <Input
              value={formData.project}
              onChange={(e) => setFormData({ ...formData, project: e.target.value })}
              placeholder="MaxCompute 项目名"
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>AccessKey ID *</Label>
              <Input
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="阿里云 Access ID"
                className="mt-1"
              />
            </div>
            <div>
              <Label>AccessKey Secret {isCreate ? '*' : '(留空保持不变)'}</Label>
              <Input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder={isCreate ? "阿里云 Access Key Secret" : "留空表示保持原 AccessKey Secret"}
                className="mt-1"
              />
            </div>
          </div>
        </>
      )
    }

    return (
      <>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>主机地址 *</Label>
            <Input
              value={formData.host}
              onChange={(e) => setFormData({ ...formData, host: e.target.value })}
              placeholder="localhost 或 IP"
              className="mt-1"
            />
          </div>
          <div>
            <Label>端口 *</Label>
            <Input
              value={formData.port}
              onChange={(e) => setFormData({ ...formData, port: e.target.value })}
              placeholder="3306/5432/9000"
              className="mt-1"
            />
          </div>
        </div>
        <div>
          <Label>数据库名 *</Label>
          <Input
            value={formData.database}
            onChange={(e) => setFormData({ ...formData, database: e.target.value })}
            placeholder="数据库名称"
            className="mt-1"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>用户名 *</Label>
            <Input
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              placeholder="数据库用户名"
              className="mt-1"
            />
          </div>
          <div>
            <Label>密码 {isCreate ? '*' : '(留空保持不变)'}</Label>
            <Input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder={isCreate ? "数据库密码" : "留空表示保持原密码"}
              className="mt-1"
            />
          </div>
        </div>
      </>
    )
  }

  const statsCards = [
    { label: '总数据源', value: stats.total, color: 'text-slate-950' },
    { label: '活跃', value: stats.active, color: 'text-blue-600' },
    { label: '已连接', value: stats.connected, color: 'text-emerald-600' },
    { label: '未激活', value: stats.inactive, color: 'text-slate-400' },
  ]

  return (
    <TooltipProvider>
      <DataCenterPageShell
        title="数据源管理"
        description="管理所有数据库连接配置"
        className="px-10 py-8"
        actions={(
          <FormButton
            onClick={() => setCreateVisible(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#2563EB] px-5 py-2.5 text-sm font-medium text-white shadow-[0_2px_8px_#2563EB30] hover:bg-[#1D4ED8]"
          >
            <Plus className="h-4 w-4" />
            新建数据源
          </FormButton>
        )}
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {statsCards.map((stat) => (
              <div
                key={stat.label}
                className="relative overflow-hidden rounded-xl bg-white p-5 shadow-[0_4px_20px_#0F172A08]"
              >
                <div className="absolute left-0 top-0 h-full w-1 rounded-l-xl bg-gradient-to-b from-[#2563EB] to-[#3B82F6]" />
                <div className={`text-[28px] font-semibold ${stat.color}`}>{stat.value}</div>
                <div className="mt-2 text-[13px] text-[#64748B]">{stat.label}</div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2.5 rounded-lg bg-[#F1F5F9] px-4 py-3">
            <Search className="h-[18px] w-[18px] text-[#94A3B8]" />
            <input
              type="text"
              placeholder="搜索数据源名称或类型..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="flex-1 bg-transparent text-sm text-[#0F172A] placeholder:text-[#94A3B8] outline-none"
            />
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center rounded-xl bg-white py-32 shadow-[0_2px_24px_#0F172A08]">
              <Loader2 className="h-8 w-8 animate-spin text-[#94A3B8]" />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center rounded-xl bg-white py-32 shadow-[0_2px_24px_#0F172A08]">
              <Inbox className="mb-4 h-16 w-16 text-[#E2E8F0]" />
              <p className="mb-2 text-base font-semibold text-[#0F172A]">加载数据源失败</p>
              <p className="text-sm text-[#64748B]">{listErrorMessage}</p>
            </div>
          ) : filteredData.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl bg-white py-32 shadow-[0_2px_24px_#0F172A08]">
              <Inbox className="mb-4 h-16 w-16 text-[#E2E8F0]" />
              <p className="mb-4 text-sm text-[#64748B]">
                {searchText ? '未找到匹配的数据源' : '还没有数据源'}
              </p>
              <FormButton
                onClick={() => setCreateVisible(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-4 py-2 text-sm text-white"
              >
                <Plus className="h-4 w-4" />
                创建第一个数据源
              </FormButton>
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-3">
              {filteredData.map((ds: DataSource) => {
                const config = typeConfig[ds.source_type] || typeConfig.postgresql
                const catalogSync = getCatalogSyncSummary(ds)
                const syncBadge = getCatalogSyncBadge(catalogSync.status)
                const isCatalogSyncing = syncingCatalogId === ds.id || catalogSync.status === 'syncing'

                const typeBadgeColors: Record<string, { bg: string; text: string }> = {
                  postgresql: { bg: 'bg-blue-50', text: 'text-blue-700' },
                  mysql: { bg: 'bg-amber-50', text: 'text-amber-700' },
                  clickhouse: { bg: 'bg-amber-50', text: 'text-amber-700' },
                  maxcompute: { bg: 'bg-indigo-50', text: 'text-indigo-700' },
                }
                const badge = typeBadgeColors[ds.source_type] || typeBadgeColors.postgresql

                return (
                  <div
                    key={ds.id}
                    className="flex flex-col gap-3 rounded-xl bg-white p-5 shadow-[0_2px_16px_#0F172A08]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <DataSourceBrandIcon sourceType={ds.source_type} />
                        <div className="min-w-0 space-y-2">
                          <span className="block truncate text-[15px] font-semibold text-[#0F172A]">{ds.name}</span>
                          {ds.description ? (
                            <p className="line-clamp-2 text-[13px] leading-6 text-[#64748B]">{ds.description}</p>
                          ) : null}
                        </div>
                      </div>
                      <span className={`rounded-md px-2.5 py-1 text-xs font-medium ${badge.bg} ${badge.text}`}>
                        {config.name}
                      </span>
                    </div>

                    <div className="space-y-2 rounded-lg bg-[#F8FAFC] px-3.5 py-3">
                      <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                        <span>ID: {ds.id}</span>
                        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', syncBadge.className)}>
                          {syncBadge.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {ds.connection_status === 'connected' ? (
                          <>
                            <div className="h-2 w-2 rounded-full bg-emerald-500" />
                            <span className="font-medium text-emerald-600">已连接</span>
                          </>
                        ) : ds.connection_status === 'error' ? (
                          <>
                            <div className="h-2 w-2 rounded-full bg-rose-500" />
                            <span className="font-medium text-rose-600">连接失败</span>
                          </>
                        ) : (
                          <>
                            <div className="h-2 w-2 rounded-full bg-slate-400" />
                            <span className="font-medium text-slate-500">未连接</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                        <span>最近同步</span>
                        <span>{formatRelativeSummaryTime(catalogSync.last_run_at)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                        <span>已追踪库</span>
                        <span>{catalogSync.database_count || 0} 个数据库</span>
                      </div>
                      {catalogSync.last_error ? (
                        <div className="text-xs text-rose-600" title={catalogSync.last_error}>
                          {catalogSync.last_error}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-4 pt-1 text-[#94A3B8]">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            title="同步目录"
                            onClick={() => syncCatalogMutation.mutate(ds.id)}
                            disabled={isCatalogSyncing}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 transition-colors hover:bg-blue-50 hover:text-[#2563EB] disabled:opacity-50"
                          >
                            {isCatalogSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent><p>同步目录</p></TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            title="测试连接"
                            onClick={() => handleCardTestConnection(ds)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 transition-colors hover:bg-emerald-50 hover:text-[#10B981]"
                          >
                            <Play className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent><p>测试连接</p></TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            title="编辑"
                            onClick={() => handleEdit(ds)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 transition-colors hover:bg-slate-100 hover:text-[#64748B]"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent><p>编辑</p></TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            title="删除"
                            onClick={() => {
                              setDsToDelete(ds)
                              setDeleteConfirmOpen(true)
                            }}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 transition-colors hover:bg-rose-50 hover:text-[#EF4444]"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent><p>删除</p></TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </DataCenterPageShell>

      {/* 创建数据源弹窗 */}
      <PageModal
        open={createVisible}
        onOpenChange={setCreateVisible}
        title="新建数据源"
        description="配置数据库连接信息"
        className="max-w-3xl"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateVisible(false)}
              className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm text-[#64748B] cursor-pointer"
            >
              取消
            </button>
            <FormButton onClick={handleCreate} loading={createMutation.isPending}>
              创建
            </FormButton>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <Label className="text-[#0F172A]">数据源名称 *</Label>
            <Input
              value={createFormData.name}
              onChange={(e) => setCreateFormData({ ...createFormData, name: e.target.value })}
              placeholder="例如：生产环境 PostgreSQL"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-[#0F172A]">数据源类型 *</Label>
            <FormSelect
              value={createFormData.source_type}
              onValueChange={(val) => setCreateFormData({ ...createFormData, source_type: val })}
              placeholder="选择数据库类型"
              options={sourceTypeOptions}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-[#0F172A]">描述</Label>
            <Textarea
              value={createFormData.description}
              onChange={(e) => setCreateFormData({ ...createFormData, description: e.target.value })}
              rows={1}
              placeholder="数据源描述"
              className="mt-1"
            />
          </div>
          {createFormData.source_type && (
            <div className="border-t border-[#E2E8F0] pt-3 mt-2">
              <h4 className="font-medium text-[#0F172A] mb-3 text-sm">连接配置</h4>
              <div className="space-y-3">
                {renderConfigFields(createFormData, setCreateFormData, true)}
              </div>
            </div>
          )}
        </div>
      </PageModal>

      {/* 编辑数据源弹窗 */}
      <PageModal
        open={editVisible}
        onOpenChange={setEditVisible}
        title="编辑数据源"
        description="修改数据库连接信息"
        className="max-w-3xl"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditVisible(false)}
              className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm text-[#64748B] cursor-pointer"
            >
              取消
            </button>
            <FormButton onClick={handleUpdate} loading={updateMutation.isPending}>
              保存
            </FormButton>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <Label className="text-[#0F172A]">数据源名称 *</Label>
            <Input
              value={editFormData.name}
              onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
              placeholder="例如：生产环境 PostgreSQL"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-[#0F172A]">数据源类型</Label>
            <Input
              value={typeConfig[editFormData.source_type]?.name || editFormData.source_type}
              disabled
              className="mt-1 bg-[#F1F5F9]"
            />
          </div>
          <div>
            <Label className="text-[#0F172A]">描述</Label>
            <Textarea
              value={editFormData.description}
              onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
              rows={1}
              placeholder="数据源描述"
              className="mt-1"
            />
          </div>
          <div className="border-t border-[#E2E8F0] pt-3 mt-2">
            <h4 className="font-medium text-[#0F172A] mb-3 text-sm">连接配置</h4>
            <div className="space-y-3">
              {renderConfigFields(editFormData, setEditFormData, false)}
            </div>
          </div>
        </div>
      </PageModal>

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除数据源 &ldquo;{dsToDelete?.name}&rdquo; 吗？此操作无法撤销，关联的数据集也将无法访问。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => dsToDelete && deleteMutation.mutate(dsToDelete.id)}
              className="bg-[#EF4444] hover:bg-[#DC2626]"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  )
}
