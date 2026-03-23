/**
 * 应用市场页面
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { PageTabs, PageTabsList, PageTabsTrigger, Skeleton, FormSearch } from '@/components/business'
import AppCard from '../../components/AppCenter/AppCard'
import { getApps, getCategories } from '../../api/appCenter'

export default function AppMarket() {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<string>('all')

  // 获取应用列表
  const { data: apps, isLoading } = useQuery({
    queryKey: ['apps', activeCategory],
    queryFn: () =>
      getApps({
        category: activeCategory === 'all' ? undefined : activeCategory,
        enabled_only: true,
        include_stats: true,
      }),
  })

  // 获取应用分类列表
  const { data: categoriesData } = useQuery({
    queryKey: ['app-categories'],
    queryFn: getCategories,
    staleTime: 30 * 60 * 1000 // 缓存30分钟
  })

  // 筛选应用（搜索）
  const filteredApps = apps?.filter((app) =>
    searchQuery
      ? app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        app.description.toLowerCase().includes(searchQuery.toLowerCase())
      : true
  )

  // 动态获取分类（从后端接口），提供硬编码作为降级方案
  const categories = [
    { key: 'all', label: '全部' },
    ...(categoriesData || [
      { category: 'bi_integration', display_name: 'BI 集成', app_count: 0 },
      { category: 'data_notification', display_name: '数据通知', app_count: 0 },
      { category: 'data_report', display_name: '数据报表', app_count: 0 },
      { category: 'data_alert', display_name: '数据告警', app_count: 0 }
    ]).map((cat: { category: string; display_name: string; app_count: number }) => ({
      key: cat.category,
      label: cat.display_name || cat.category
    }))
  ]

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">应用中心</h1>
        <p className="mt-1 text-sm text-gray-500">统一管理和调度各种数据推送、告警、报告应用</p>
      </div>

      {/* 搜索栏 */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
        <div className="max-w-md">
          <FormSearch
            placeholder="搜索应用名称或描述..."
            value={searchQuery}
            onChange={setSearchQuery}
          />
        </div>
      </div>

      {/* 分类 Tabs */}
      <PageTabs value={activeCategory} onValueChange={setActiveCategory}>
        <PageTabsList>
          {categories.map((cat) => (
            <PageTabsTrigger key={cat.key} value={cat.key}>
              {cat.label}
            </PageTabsTrigger>
          ))}
        </PageTabsList>
      </PageTabs>

      {/* 应用卡片网格 */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6 space-y-3">
              <Skeleton className="h-14 w-14 rounded-xl" />
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      ) : filteredApps && filteredApps.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredApps.map((app) => (
            <AppCard key={app.code} app={app} onClick={() => navigate(`/apps/${app.code}`)} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="text-gray-400 text-center">
            <Search className="w-16 h-16 mx-auto mb-4" />
            <p className="text-lg font-medium">未找到应用</p>
            <p className="text-sm mt-2">尝试更换搜索关键词或选择其他分类</p>
          </div>
        </div>
      )}
    </div>
  )
}
