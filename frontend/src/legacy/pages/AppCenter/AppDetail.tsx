import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, BookOpen, Plus } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import {
  Badge,
  FormButton,
  PageTabs,
  PageTabsContent,
  PageTabsList,
  PageTabsTrigger,
  Skeleton,
  useToast,
} from '@/components/business'
import ConfigDrawer from '../../components/AppCenter/ConfigDrawer'
import InstanceTable from '../../components/AppCenter/InstanceTable'
import {
  createInstance,
  getApp,
  getInstances,
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

  const { data: app, isLoading: appLoading } = useQuery({
    queryKey: ['app', code],
    queryFn: () => getApp(code!),
    enabled: Boolean(code),
  })

  const { data: instancesData, isLoading: instancesLoading } = useQuery({
    queryKey: ['app-instances', code, page, pageSize],
    queryFn: () =>
      getInstances({
        app_code: code,
        page,
        page_size: pageSize,
      }),
    enabled: Boolean(code),
  })

  const createMutation = useMutation({
    mutationFn: createInstance,
    onSuccess: async () => {
      toast({ title: '创建成功' })
      await queryClient.invalidateQueries({ queryKey: ['app-instances'] })
      await queryClient.invalidateQueries({ queryKey: ['apps'] })
      setDrawerOpen(false)
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : '创建失败'
      toast({ title: '创建失败', description: message, variant: 'destructive' })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateInstanceInput }) => updateInstance(id, data),
    onSuccess: async () => {
      toast({ title: '更新成功' })
      await queryClient.invalidateQueries({ queryKey: ['app-instances'] })
      setDrawerOpen(false)
      setEditingInstance(null)
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : '更新失败'
      toast({ title: '更新失败', description: message, variant: 'destructive' })
    },
  })

  const handleSubmit = async (data: CreateInstanceInput | UpdateInstanceInput) => {
    if (editingInstance) {
      await updateMutation.mutateAsync({ id: editingInstance.id, data })
      return
    }

    await createMutation.mutateAsync(data as CreateInstanceInput)
  }

  if (appLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (!app) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-3xl border border-dashed border-[#CBD5E1] bg-white px-6 py-12 text-center">
        <div>
          <h1 className="text-lg font-medium text-[#0F172A]">应用不存在</h1>
          <p className="mt-2 text-sm text-[#64748B]">当前深链没有命中应用定义，可以返回应用市场重新选择。</p>
          <FormButton className="mt-5" onClick={() => navigate('/apps')}>
            返回应用市场
          </FormButton>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <FormButton variant="ghost" onClick={() => navigate('/apps')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回
        </FormButton>
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">{app.name}</h1>
          <p className="mt-1 text-sm text-[#64748B]">{app.description}</p>
        </div>
      </div>

      <PageTabs value={activeTab} onValueChange={setActiveTab}>
        <PageTabsList>
          <PageTabsTrigger value="overview">概览</PageTabsTrigger>
          <PageTabsTrigger value="instances">
            我的实例 {instancesData?.total ? `(${instancesData.total})` : ''}
          </PageTabsTrigger>
          <PageTabsTrigger value="config">配置说明</PageTabsTrigger>
        </PageTabsList>

        <PageTabsContent value="overview">
          <div className="rounded-3xl border border-[#E2E8F0] bg-white p-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{app.category}</Badge>
              <Badge variant={app.enabled ? 'secondary' : 'outline'}>
                {app.enabled ? '已启用' : '未启用'}
              </Badge>
              <span className="text-sm text-[#64748B]">v{app.version}</span>
            </div>
            <div className="prose prose-sm mt-4 max-w-none text-[#334155]">
              <ReactMarkdown>{app.description}</ReactMarkdown>
            </div>

            <div className="mt-6 grid gap-4 border-t border-[#E2E8F0] pt-6 sm:grid-cols-3">
              <div>
                <div className="text-sm text-[#64748B]">实例数量</div>
                <div className="mt-1 text-2xl font-semibold text-[#0F172A]">{app.instance_count || 0}</div>
              </div>
              <div>
                <div className="text-sm text-[#64748B]">作者</div>
                <div className="mt-1 text-lg font-medium text-[#0F172A]">{app.author}</div>
              </div>
              <div>
                <div className="text-sm text-[#64748B]">版本</div>
                <div className="mt-1 text-lg font-medium text-[#0F172A]">{app.version}</div>
              </div>
            </div>
          </div>
        </PageTabsContent>

        <PageTabsContent value="instances">
          <div className="space-y-4 rounded-3xl border border-[#E2E8F0] bg-white p-6">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-[#64748B]">管理当前应用的实例配置与执行入口。</p>
              <FormButton
                onClick={() => {
                  setEditingInstance(null)
                  setDrawerOpen(true)
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                创建实例
              </FormButton>
            </div>

            <InstanceTable
              instances={instancesData?.items || []}
              loading={instancesLoading}
              total={instancesData?.total}
              page={page}
              pageSize={pageSize}
              onPageChange={(nextPage) => setPage(nextPage)}
              onEdit={(instance) => {
                setEditingInstance(instance)
                setDrawerOpen(true)
              }}
            />
          </div>
        </PageTabsContent>

        <PageTabsContent value="config">
          <div className="rounded-3xl border border-[#E2E8F0] bg-white p-6">
            <div className="flex items-center gap-2 text-sm font-medium text-[#0F172A]">
              <BookOpen className="h-4 w-4 text-[#2563EB]" />
              配置说明
            </div>
            {app.config_schema ? (
              <pre className="mt-4 overflow-auto rounded-2xl bg-[#0F172A] p-5 text-xs leading-6 text-[#E2E8F0]">
                {JSON.stringify(app.config_schema, null, 2)}
              </pre>
            ) : (
              <p className="mt-4 text-sm text-[#64748B]">当前应用暂无额外配置说明。</p>
            )}
          </div>
        </PageTabsContent>
      </PageTabs>

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
