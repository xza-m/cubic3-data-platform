/**
 * 应用市场页面
 * 基于 uiv2.pen 设计稿 (dyDJm)
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Search, Sparkles, Users } from 'lucide-react'
import { PageModal, Skeleton } from '@/components/business'
import { Button } from '@/components/ui/button'
import AppCard from '../../components/AppCenter/AppCard'
import ConfigDrawer from '../../components/AppCenter/ConfigDrawer'
import InstanceTable from '../../components/AppCenter/InstanceTable'
import {
  createInstance,
  getApps,
  getCategories,
  getInstances,
  updateInstance,
  type AppDefinition,
  type AppInstance,
  type CreateInstanceInput,
  type UpdateInstanceInput,
} from '../../api/appCenter'

const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  agent: 'Agent',
  ai: 'AI',
  bi: 'BI',
  bi_integration: 'BI集成',
  data_alert: '数据告警',
  data_notification: '数据通知',
  data_report: '数据报告',
  report: '数据报告',
  system_maintenance: '系统维护',
}

function getCategoryDisplayName(category: string, displayName?: string) {
  const normalizedCategory = category.trim().toLowerCase()
  const normalizedDisplayName = displayName?.trim()

  if (normalizedDisplayName) {
    const mappedDisplayName = CATEGORY_DISPLAY_NAMES[normalizedDisplayName.toLowerCase()]
    if (mappedDisplayName) {
      return mappedDisplayName
    }
    if (/[\u4e00-\u9fff]/.test(normalizedDisplayName)) {
      return normalizedDisplayName
    }
  }

  return CATEGORY_DISPLAY_NAMES[normalizedCategory] || normalizedDisplayName || category
}

export default function AppMarket() {
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [selectedApp, setSelectedApp] = useState<AppDefinition | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [configModalOpen, setConfigModalOpen] = useState(false)
  const [editingInstance, setEditingInstance] = useState<AppInstance | null>(null)
  const [instancePage, setInstancePage] = useState(1)
  const instancePageSize = 5

  const { data: apps, isLoading } = useQuery({
    queryKey: ['apps', activeCategory],
    queryFn: () =>
      getApps({
        category: activeCategory === 'all' ? undefined : activeCategory,
        enabled_only: true,
        include_stats: true,
      }),
  })

  const { data: categoriesData } = useQuery({
    queryKey: ['app-categories'],
    queryFn: getCategories,
    staleTime: 30 * 60 * 1000,
  })

  const { data: instanceData, isLoading: instancesLoading } = useQuery({
    queryKey: ['app-instances', selectedApp?.code, instancePage, instancePageSize],
    queryFn: () =>
      getInstances({
        app_code: selectedApp?.code,
        page: instancePage,
        page_size: instancePageSize,
      }),
    enabled: detailOpen && !!selectedApp,
  })

  const createOrUpdateMutation = useMutation({
    mutationFn: async (payload: CreateInstanceInput | UpdateInstanceInput) => {
      if (!selectedApp) {
        throw new Error('请先选择应用')
      }
      if (editingInstance) {
        return updateInstance(editingInstance.id, payload as UpdateInstanceInput)
      }
      return createInstance(payload as CreateInstanceInput)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['apps'] })
      await queryClient.invalidateQueries({ queryKey: ['app-instances'] })
      setConfigModalOpen(false)
      setEditingInstance(null)
      if (!detailOpen) {
        setSelectedApp(null)
      }
    },
  })

  const filteredApps = apps?.filter((app) =>
    searchQuery
      ? app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        app.description.toLowerCase().includes(searchQuery.toLowerCase())
      : true
  )

  const selectedAppInstances = instanceData?.items || []
  const selectedAppTotal = instanceData?.total ?? selectedApp?.instance_count ?? 0
  const summaryCards = useMemo(() => {
    if (!selectedApp) return []
    return [
      { label: '实例总数', value: selectedAppTotal, icon: Users },
      { label: '应用状态', value: selectedApp.enabled ? '已启用' : '未启用', icon: CheckCircle2 },
      { label: '版本', value: selectedApp.version || '-', icon: Sparkles },
      {
        label: '分类',
        value: selectedApp.category ? getCategoryDisplayName(selectedApp.category) : '-',
        icon: Search,
      },
    ]
  }, [selectedApp, selectedAppTotal])

  const openAppDetail = (app: AppDefinition) => {
    setSelectedApp(app)
    setInstancePage(1)
    setDetailOpen(true)
    setConfigModalOpen(false)
    setEditingInstance(null)
  }

  const closeAppDetail = (open: boolean) => {
    setDetailOpen(open)
    if (!open) {
      setSelectedApp(null)
      setEditingInstance(null)
      setConfigModalOpen(false)
      setInstancePage(1)
    }
  }

  const openCreateInstance = () => {
    setEditingInstance(null)
    setDetailOpen(false)
    setConfigModalOpen(true)
  }

  const openEditInstance = (instance: AppInstance) => {
    setDetailOpen(false)
    setEditingInstance(instance)
    setConfigModalOpen(true)
  }

  const handleSubmitInstance = async (payload: CreateInstanceInput | UpdateInstanceInput) => {
    await createOrUpdateMutation.mutateAsync(payload)
  }

  const categories = [
    { key: 'all', label: '全部' },
    ...(categoriesData || [
      { category: 'system_maintenance', display_name: '系统维护', app_count: 0 },
      { category: 'bi_integration', display_name: 'BI集成', app_count: 0 },
      { category: 'data_alert', display_name: '数据告警', app_count: 0 },
      { category: 'agent', display_name: 'Agent', app_count: 0 },
      { category: 'data_notification', display_name: '数据通知', app_count: 0 },
      { category: 'data_report', display_name: '数据报告', app_count: 0 },
    ]).map((cat: { category: string; display_name: string; app_count: number }) => ({
      key: cat.category,
      label: getCategoryDisplayName(cat.category, cat.display_name),
    })),
  ]

  return (
    <div className="flex flex-col gap-5 px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold text-[#0F172A]">应用中心</h1>
          <p className="text-sm text-[#64748B]">统一管理和调度各类运行型数据应用，不承载交互式问答助手</p>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2.5 rounded-lg bg-[#F1F5F9] px-4 py-3">
        <Search className="h-[18px] w-[18px] text-[#94A3B8]" />
        <input
          type="text"
          placeholder="搜索应用名称或描述..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 bg-transparent text-sm text-[#0F172A] placeholder-[#94A3B8] outline-none"
        />
      </div>

      {/* Category Tabs */}
      <div className="-mx-1 flex items-center gap-1 overflow-x-auto border-b border-[#E2E8F0] pb-px">
        {categories.map((cat) => (
          <button
            key={cat.key}
            type="button"
            onClick={() => setActiveCategory(cat.key)}
            className={`shrink-0 px-4 py-3 text-sm cursor-pointer sm:px-5 ${
              activeCategory === cat.key
                ? 'font-medium text-[#2563EB] border-b-2 border-[#2563EB]'
                : 'text-[#64748B]'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* App Cards Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3" data-testid="app-market-grid">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="rounded-xl bg-white p-6 shadow-[0_2px_16px_#0F172A08]">
              <Skeleton className="h-10 w-10 rounded-[10px] mb-4" />
              <Skeleton className="h-5 w-3/4 mb-3" />
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          ))}
        </div>
      ) : filteredApps && filteredApps.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3" data-testid="app-market-grid">
          {filteredApps.map((app) => (
            <AppCard
              key={app.code}
              app={app}
              onClick={() => openAppDetail(app)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24">
          <Search className="h-12 w-12 text-[#E2E8F0] mb-4" />
          <p className="text-base font-medium text-[#0F172A]">未找到应用</p>
          <p className="mt-1 text-sm text-[#94A3B8]">尝试更换搜索关键词或选择其他分类</p>
        </div>
      )}

      <PageModal
        open={detailOpen}
        onOpenChange={closeAppDetail}
        ariaLabel={selectedApp?.name || '应用详情'}
        width="min(960px, 88vw)"
        className="max-h-[88vh] overflow-hidden"
        bodyClassName="modal-scrollbar-hidden p-0"
      >
          {selectedApp ? (
            <div className="mx-auto flex min-h-0 w-full max-w-[920px] flex-col overflow-hidden px-1 pb-1">
              <div className="flex items-start justify-between gap-6 border-b border-[#E2E8F0] px-5 pb-5 pt-2 pr-14 sm:px-6 sm:pr-16">
                <div className="min-w-0">
                  <div className="inline-flex items-center rounded-full bg-[#EFF6FF] px-3 py-1 text-xs font-medium text-[#2563EB]">
                    应用详情
                  </div>
                  <h2 className="mt-3 text-[28px] font-bold leading-[1.1] text-[#0F172A]">
                    {selectedApp.name}
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-[#64748B]">
                    {selectedApp.description}
                  </p>
                </div>
              <div
                data-testid="app-detail-header-actions"
                className="mr-12 flex shrink-0 items-center gap-2 sm:mr-14"
              >
                <Button
                  type="button"
                  className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-medium text-white shadow-[0_2px_8px_#2563EB30] hover:bg-[#1D4ED8]"
                  onClick={openCreateInstance}
                >
                    新建实例
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 sm:px-6 xl:grid-cols-2">
                {summaryCards.map((card) => {
                  const Icon = card.icon
                  return (
                    <div key={card.label} className="rounded-xl bg-white p-4 shadow-[0_2px_16px_#0F172A08]">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#EFF6FF]">
                          <Icon className="h-5 w-5 text-[#2563EB]" />
                        </div>
                        <div>
                          <p className="text-xs text-[#64748B]">{card.label}</p>
                          <p className="mt-1 text-lg font-semibold text-[#0F172A]">{card.value}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="px-5 pb-5 sm:px-6 sm:pb-6">
                <div className="mb-3 flex items-center justify-between border-b border-[#E2E8F0] pb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[#0F172A]">实例列表</h3>
                    <p className="mt-1 text-xs text-[#64748B]">查看、编辑和启停当前应用的实例配置</p>
                  </div>
                  <span className="text-xs text-[#94A3B8]">{selectedAppTotal} 条</span>
                </div>
                <InstanceTable
                  instances={selectedAppInstances}
                  loading={instancesLoading}
                  total={instanceData?.total}
                  page={instanceData?.page || instancePage}
                  pageSize={instanceData?.page_size || instancePageSize}
                  onPageChange={(page, pageSize) => {
                    setInstancePage(page)
                    if (pageSize !== instancePageSize) {
                      setInstancePage(1)
                    }
                  }}
                  onEdit={openEditInstance}
                />
              </div>
            </div>
          ) : null}
      </PageModal>

      <ConfigDrawer
        open={configModalOpen}
        app={selectedApp}
        instance={editingInstance}
        onClose={() => {
          setConfigModalOpen(false)
          setEditingInstance(null)
          if (!detailOpen) {
            setSelectedApp(null)
          }
        }}
        onSubmit={handleSubmitInstance}
      />
    </div>
  )
}
