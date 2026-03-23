/**
 * 应用详情页面
 */
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, BookOpen } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { 
  PageTabs, 
  PageTabsContent, 
  PageTabsList, 
  PageTabsTrigger,
  FormButton,
  Badge,
  Skeleton,
  useToast 
} from '@/components/business'
import InstanceTable from '../../components/AppCenter/InstanceTable'
import ConfigDrawer from '../../components/AppCenter/ConfigDrawer'
import {
  getApp,
  getInstances,
  createInstance,
  updateInstance,
  type AppInstance,
  type CreateInstanceInput,
  type UpdateInstanceInput,
} from '../../api/appCenter'

export default function AppDetail() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const [activeTab, setActiveTab] = useState('overview')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingInstance, setEditingInstance] = useState<AppInstance | null>(null)
  const [page, setPage] = useState(1)
  const pageSize = 10

  // 获取应用详情
  const { data: app, isLoading: appLoading } = useQuery({
    queryKey: ['app', code],
    queryFn: () => getApp(code!),
    enabled: !!code,
  })

  // 获取实例列表
  const { data: instancesData, isLoading: instancesLoading } = useQuery({
    queryKey: ['app-instances', code, page],
    queryFn: () =>
      getInstances({
        app_code: code,
        page,
        page_size: pageSize,
      }),
    enabled: !!code,
  })

  // 创建实例 mutation
  const createMutation = useMutation({
    mutationFn: createInstance,
    onSuccess: () => {
      toast({ title: "创建成功" })
      queryClient.invalidateQueries({ queryKey: ['app-instances'] })
      queryClient.invalidateQueries({ queryKey: ['apps'] })
      setDrawerOpen(false)
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } }; message?: string }
      toast({ 
        title: "创建失败", 
        description: err.response?.data?.message || '创建失败',
        variant: "destructive" 
      })
    },
  })

  // 更新实例 mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateInstanceInput }) => updateInstance(id, data),
    onSuccess: () => {
      toast({ title: "更新成功" })
      queryClient.invalidateQueries({ queryKey: ['app-instances'] })
      setDrawerOpen(false)
      setEditingInstance(null)
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } }; message?: string }
      toast({ 
        title: "更新失败", 
        description: err.response?.data?.message || '更新失败',
        variant: "destructive" 
      })
    },
  })

  const handleCreateClick = () => {
    setEditingInstance(null)
    setDrawerOpen(true)
  }

  const handleEditClick = (instance: AppInstance) => {
    setEditingInstance(instance)
    setDrawerOpen(true)
  }

  const handleSubmit = async (data: CreateInstanceInput | UpdateInstanceInput) => {
    if (editingInstance) {
      await updateMutation.mutateAsync({ id: editingInstance.id, data })
    } else {
      await createMutation.mutateAsync(data as CreateInstanceInput)
    }
  }

  if (appLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!app) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="text-center">
          <p className="text-lg font-medium text-gray-900 mb-4">应用不存在</p>
          <FormButton onClick={() => navigate('/apps')}>
            返回应用市场
          </FormButton>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 返回按钮 + 标题 */}
      <div className="flex items-center gap-4">
        <FormButton 
          variant="ghost" 
          icon={<ArrowLeft className="w-4 h-4" />} 
          onClick={() => navigate('/apps')}
        >
          返回
        </FormButton>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{app.name}</h1>
          <p className="text-sm text-gray-500 mt-1">{app.description}</p>
        </div>
      </div>

      {/* Tabs */}
      <PageTabs value={activeTab} onValueChange={setActiveTab}>
        <PageTabsList>
          <PageTabsTrigger value="overview">概览</PageTabsTrigger>
          <PageTabsTrigger value="instances">
            我的实例 {instancesData?.total ? `(${instancesData.total})` : ''}
          </PageTabsTrigger>
          <PageTabsTrigger value="config">配置说明</PageTabsTrigger>
        </PageTabsList>

        <PageTabsContent value="overview">
          <div className="space-y-6">
            {/* 应用信息卡片 */}
            <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{app.name}</h2>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="default">{app.category}</Badge>
                    <Badge variant={app.enabled ? 'secondary' : 'outline'}>
                      {app.enabled ? '已启用' : '未启用'}
                    </Badge>
                    <span className="text-sm text-gray-500">v{app.version}</span>
                  </div>
                </div>
              </div>

              <div className="prose prose-sm max-w-none">
                <ReactMarkdown>{app.description}</ReactMarkdown>
              </div>

              {/* 统计信息 */}
              <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t">
                <div>
                  <p className="text-sm text-gray-500">实例数量</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{app.instance_count || 0}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">作者</p>
                  <p className="text-lg font-medium text-gray-900 mt-1">{app.author}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">版本</p>
                  <p className="text-lg font-medium text-gray-900 mt-1">{app.version}</p>
                </div>
              </div>
            </div>
          </div>
        </PageTabsContent>

        <PageTabsContent value="instances">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-500">管理此应用的所有实例</p>
              <FormButton icon={<Plus className="w-4 h-4" />} onClick={handleCreateClick}>
                创建实例
              </FormButton>
            </div>

            <InstanceTable
              instances={instancesData?.items || []}
              loading={instancesLoading}
              total={instancesData?.total}
              page={page}
              pageSize={pageSize}
              onPageChange={(newPage) => setPage(newPage)}
              onEdit={handleEditClick}
            />
          </div>
        </PageTabsContent>

        <PageTabsContent value="config">
          <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <BookOpen className="w-5 h-5 text-blue-500" />
              <h3 className="text-lg font-semibold text-gray-900">配置说明</h3>
            </div>

            {app.config_schema ? (
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">配置项</h4>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <pre className="text-sm font-mono text-gray-700 whitespace-pre-wrap overflow-auto">
                      {JSON.stringify(app.config_schema, null, 2)}
                    </pre>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900 mb-2">示例配置</h4>
                  <p className="text-sm text-gray-600">
                    请参考 JSON Schema 定义填写配置参数。创建实例时可使用表单模式或代码模式编辑。
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">暂无配置说明</p>
            )}
          </div>
        </PageTabsContent>
      </PageTabs>

      {/* 配置抽屉 */}
      <ConfigDrawer
        open={drawerOpen}
        app={app}
        instance={editingInstance}
        onClose={() => {
          setDrawerOpen(false)
          setEditingInstance(null)
        }}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
