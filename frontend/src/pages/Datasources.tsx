/**
 * 数据源管理页面 - Migrated to shadcn/ui
 */
import { useState, type Dispatch, type SetStateAction } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Database,
  Plus,
  Edit2,
  Trash2,
  Activity,
  CheckCircle,
  XCircle,
  Play,
  Search,
  AlertCircle,
  Server,
  Loader2,
  Inbox
} from 'lucide-react'
import {
  getDataSources,
  createDataSource,
  updateDataSource,
  deleteDataSource,
  testDataSourceConnection,
  getDataSourceStatistics,
  getDataSourceTypes,
} from '../api/datasources'
import type { CreateDataSourceRequest, UpdateDataSourceRequest } from '../api/datasources'
import type { DataSource } from '@/types'
import {
  FormButton,
  FormSelect,
  useToast,
  PageModal,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
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
  response?: { data?: { message?: string } }
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

export default function Datasources() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [createVisible, setCreateVisible] = useState(false)
  const [editVisible, setEditVisible] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [searchText, setSearchText] = useState('')
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [dsToDelete, setDsToDelete] = useState<DataSource | null>(null)
  const [testingConnection, setTestingConnection] = useState(false)
  
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

  const { data: listData, isLoading, isError } = useQuery({
    queryKey: ['datasources'],
    queryFn: () => getDataSources({ page: 1, page_size: 100 })
  })

  const { data: statsData } = useQuery({
    queryKey: ['datasources', 'statistics'],
    queryFn: getDataSourceStatistics
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

  const handleEdit = (ds: DataSource) => {
    setEditingId(ds.id)
    setEditFormData({
      name: ds.name,
      source_type: ds.source_type,
      description: ds.description || '',
      host: ds.connection_config?.host || '',
      port: ds.connection_config?.port || '',
      database: ds.connection_config?.database || '',
      username: ds.connection_config?.username || '',
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

  const handleTestConnection = async (formData: DataSourceFormData) => {
    setTestingConnection(true)
    try {
      const config: Record<string, string> = {}
      if (formData.source_type === 'maxcompute') {
        config.project = formData.project
        config.access_id = formData.username
        config.access_key = formData.password
      } else {
        config.host = formData.host
        config.port = formData.port
        config.database = formData.database
        config.username = formData.username
        config.password = formData.password
      }

      await testDataSourceConnection(formData.id || 0)
      
      toast({ title: '连接测试成功', description: '数据源连接正常' })
    } catch (error: unknown) {
      const err = error as AxiosLikeError
      toast({ 
        title: '连接测试失败', 
        description: err.response?.data?.message || err.message,
        variant: 'destructive' 
      })
    } finally {
      setTestingConnection(false)
    }
  }

  // 卡片上的测试连接 - 使用已保存的数据源ID
  const handleCardTestConnection = async (ds: DataSource) => {
    setTestingConnection(true)
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
      queryClient.invalidateQueries({ queryKey: ['datasources-stats'] })
    } catch (error: unknown) {
      const err = error as AxiosLikeError
      toast({ 
        title: '连接测试失败', 
        description: err.response?.data?.message || err.message,
        variant: 'destructive' 
      })
      // 异常情况也刷新列表
      queryClient.invalidateQueries({ queryKey: ['datasources'] })
      queryClient.invalidateQueries({ queryKey: ['datasources-stats'] })
    } finally {
      setTestingConnection(false)
    }
  }

  const datasources = listData?.data?.items || []
  const stats = statsData?.data || { total: 0, active: 0, connected: 0, inactive: 0 }

  const typeConfig: Record<string, { gradient: string; icon: string; name: string }> = {
    postgresql: { gradient: 'from-blue-500 to-blue-600', icon: '🐘', name: 'PostgreSQL' },
    mysql: { gradient: 'from-orange-500 to-orange-600', icon: '🐬', name: 'MySQL' },
    clickhouse: { gradient: 'from-yellow-500 to-yellow-600', icon: '⚡', name: 'ClickHouse' },
    maxcompute: { gradient: 'from-purple-500 to-purple-600', icon: '☁️', name: 'MaxCompute' }
  }

  const filteredData = datasources.filter((ds: DataSource) =>
    ds.name.toLowerCase().includes(searchText.toLowerCase()) ||
    ds.source_type.toLowerCase().includes(searchText.toLowerCase())
  )

  const statsList = [
    { label: '总数据源', value: stats.total, icon: Database, gradient: 'from-indigo-500 to-indigo-600' },
    { label: '活跃', value: stats.active, icon: Activity, gradient: 'from-emerald-500 to-emerald-600' },
    { label: '已连接', value: stats.connected, icon: CheckCircle, gradient: 'from-cyan-500 to-cyan-600' },
    { label: '未激活', value: stats.inactive, icon: XCircle, gradient: 'from-rose-500 to-rose-600' }
  ]

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
            <Label>项目名称 (Project) *</Label>
            <Input
              value={formData.project}
              onChange={(e) => setFormData({ ...formData, project: e.target.value })}
              placeholder="MaxCompute 项目名"
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Access ID *</Label>
              <Input
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="阿里云 Access ID"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Access Key {isCreate ? '*' : '(留空保持不变)'}</Label>
              <Input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder={isCreate ? "阿里云 Access Key" : "留空表示保持原密码"}
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

  return (
    <TooltipProvider>
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/25">
            <Database className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">数据源管理</h1>
            <p className="text-gray-500 text-sm">管理所有数据库连接配置</p>
          </div>
        </div>
        <FormButton onClick={() => setCreateVisible(true)} className="bg-gradient-to-r from-blue-500 to-cyan-500">
          <Plus className="w-5 h-5 mr-2" />
          新建数据源
        </FormButton>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statsList.map((stat, index) => {
          const Icon = stat.icon
          return (
            <div key={index} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-gray-500 font-medium mb-1">{stat.label}</div>
                  <div className="text-3xl font-bold text-gray-900">{stat.value}</div>
                </div>
                <div className={cn("w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-lg", stat.gradient)}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 搜索栏 */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            type="text"
            placeholder="搜索数据源名称或类型..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="h-11 pl-12 pr-4"
          />
        </div>
      </div>

      {/* 数据源列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="col-span-full flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : filteredData.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center h-64">
            <Inbox className="w-16 h-16 text-gray-300 mb-4" />
            <p className="text-gray-500 mb-4">
              {searchText ? '未找到匹配的数据源' : '还没有数据源'}
            </p>
            <FormButton onClick={() => setCreateVisible(true)}>
              <Plus className="w-4 h-4 mr-2" />
              创建第一个数据源
            </FormButton>
          </div>
        ) : (
          filteredData.map((ds: DataSource) => {
            const config = typeConfig[ds.source_type] || typeConfig.postgresql
            return (
              <div
                key={ds.id}
                className="bg-white rounded-2xl border border-gray-200 p-5 hover:shadow-lg transition-all"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={cn("w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center text-2xl", config.gradient)}>
                      {config.icon}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{ds.name}</h3>
                      <Badge variant="secondary" className="mt-1 text-xs">
                        {config.name}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <FormButton
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCardTestConnection(ds)}
                          className="h-8 w-8 hover:text-green-600 hover:bg-green-50"
                        >
                          <Play className="w-4 h-4" />
                        </FormButton>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>测试连接</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <FormButton
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(ds)}
                          className="h-8 w-8"
                        >
                          <Edit2 className="w-4 h-4" />
                        </FormButton>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>编辑</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <FormButton
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setDsToDelete(ds)
                            setDeleteConfirmOpen(true)
                          }}
                          className="h-8 w-8 hover:text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </FormButton>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>删除</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>

                {ds.description && (
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">{ds.description}</p>
                )}

                <div className="flex items-center justify-between text-xs text-gray-500 pt-3 border-t border-gray-100 mt-3">
                  <span>ID: {ds.id}</span>
                  <div className="flex items-center gap-1">
                    {ds.connection_status === 'connected' ? (
                      <CheckCircle className="w-3 h-3 text-green-500" />
                    ) : ds.connection_status === 'error' ? (
                      <XCircle className="w-3 h-3 text-red-500" />
                    ) : (
                      <XCircle className="w-3 h-3 text-gray-400" />
                    )}
                    <span>
                      {ds.connection_status === 'connected' ? '已连接' : 
                       ds.connection_status === 'error' ? '连接失败' : 
                       '未连接'}
                  </span>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* 创建数据源弹窗 */}
      <PageModal
        open={createVisible}
        onOpenChange={setCreateVisible}
        title="新建数据源"
        description="配置数据库连接信息"
        className="max-w-3xl"
        footer={
          <div className="flex justify-end gap-2">
            <FormButton variant="outline" onClick={() => setCreateVisible(false)}>
              取消
            </FormButton>
            <FormButton onClick={handleCreate} loading={createMutation.isPending}>
              创建
            </FormButton>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <Label>数据源名称 *</Label>
            <Input 
              value={createFormData.name}
              onChange={(e) => setCreateFormData({ ...createFormData, name: e.target.value })}
              placeholder="例如：生产环境 PostgreSQL"
              className="mt-1"
            />
          </div>
          <div>
            <Label>数据源类型 *</Label>
            <FormSelect
              value={createFormData.source_type}
              onValueChange={(val) => setCreateFormData({ ...createFormData, source_type: val })}
              placeholder="选择数据库类型"
              options={sourceTypeOptions}
              className="mt-1"
            />
            </div>
          <div>
            <Label>描述</Label>
            <Textarea
              value={createFormData.description}
              onChange={(e) => setCreateFormData({ ...createFormData, description: e.target.value })}
              rows={1}
              placeholder="数据源描述"
              className="mt-1"
            />
          </div>
          {createFormData.source_type && (
            <div className="border-t border-gray-200 pt-3 mt-2">
              <h4 className="font-medium text-gray-900 mb-3 text-sm">连接配置</h4>
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
            <FormButton variant="outline" onClick={() => setEditVisible(false)}>
              取消
            </FormButton>
            <FormButton onClick={handleUpdate} loading={updateMutation.isPending}>
              保存
            </FormButton>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <Label>数据源名称 *</Label>
            <Input
              value={editFormData.name}
              onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
              placeholder="例如：生产环境 PostgreSQL"
              className="mt-1"
            />
          </div>
          <div>
            <Label>数据源类型</Label>
            <Input
              value={typeConfig[editFormData.source_type]?.name || editFormData.source_type}
              disabled
              className="mt-1 bg-gray-50"
            />
          </div>
          <div>
            <Label>描述</Label>
            <Textarea
              value={editFormData.description}
              onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
              rows={1}
              placeholder="数据源描述"
              className="mt-1"
            />
          </div>
          <div className="border-t border-gray-200 pt-3 mt-2">
            <h4 className="font-medium text-gray-900 mb-3 text-sm">连接配置</h4>
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
              确定要删除数据源 "{dsToDelete?.name}" 吗？此操作无法撤销，关联的数据集也将无法访问。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => dsToDelete && deleteMutation.mutate(dsToDelete.id)}
              className="bg-red-500 hover:bg-red-600"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </TooltipProvider>
  )
}
