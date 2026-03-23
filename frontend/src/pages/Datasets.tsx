/**
 * 数据集管理页面 - Migrated to shadcn/ui
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Table2,
  Plus,
  Edit2,
  Trash2,
  CheckCircle,
  Clock,
  AlertCircle,
  Search,
  RefreshCw,
  Database,
  Code,
  FileText,
  ChevronDown,
  Loader2
} from 'lucide-react'
import { getDatasets, deleteDataset, getDatasetStatistics, syncDatasetSchema } from '../api/datasets'
import type { Dataset } from '@/types'
import {
  FormButton,
  useToast,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/business'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export default function Datasets() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [searchText, setSearchText] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [datasetToDelete, setDatasetToDelete] = useState<Dataset | null>(null)

  const { data: listData, isLoading } = useQuery({
    queryKey: ['datasets', currentPage, pageSize, searchText],
    queryFn: () => getDatasets({
      page: currentPage,
      page_size: pageSize,
      search: searchText
    })
  })

  const { data: statsData } = useQuery({
    queryKey: ['datasets', 'statistics'],
    queryFn: getDatasetStatistics
  })

  const deleteMutation = useMutation({
    mutationFn: deleteDataset,
    onSuccess: () => {
      toast({ title: '删除成功' })
      queryClient.invalidateQueries({ queryKey: ['datasets'] })
      queryClient.invalidateQueries({ queryKey: ['datasets', 'statistics'] })
      setDatasetToDelete(null)
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } }; message?: string }
      toast({ 
        title: '删除失败', 
        description: err.response?.data?.message || err.message,
        variant: 'destructive' 
      })
    }
  })

  const syncMutation = useMutation({
    mutationFn: syncDatasetSchema,
    onSuccess: () => {
      toast({ title: '元数据同步已触发', description: '正在刷新数据集元数据...' })
      queryClient.invalidateQueries({ queryKey: ['datasets'] })
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } }; message?: string }
      toast({ 
        title: '同步失败', 
        description: err.response?.data?.message || err.message,
        variant: 'destructive' 
      })
    }
  })

  const datasets = listData?.data?.items || []
  const total = listData?.data?.total || 0
  const rawStats = (statsData?.data || {}) as Record<string, number>
  const stats = {
    total: rawStats.total || 0,
    synced: rawStats.synced || 0,
    failed: rawStats.failed || 0
  }

  const statsList = [
    { label: '总数据集', value: stats.total, icon: Table2, gradient: 'from-emerald-500 to-emerald-600' },
    { label: '已同步', value: stats.synced, icon: CheckCircle, gradient: 'from-cyan-500 to-cyan-600' },
    { label: '同步失败', value: stats.failed, icon: AlertCircle, gradient: 'from-rose-500 to-rose-600' }
  ]

  const getSyncStatus = (status: string) => {
    const config: Record<string, { color: string; label: string }> = {
      synced: { color: 'bg-emerald-50 text-emerald-700', label: '已同步' },
      syncing: { color: 'bg-blue-50 text-blue-700', label: '同步中' },
      failed: { color: 'bg-red-50 text-red-700', label: '失败' }
    }
    return config[status] || { color: 'bg-gray-100 text-gray-600', label: status }
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/25">
            <Table2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">数据集管理</h1>
            <p className="text-gray-500 text-sm">管理注册的数据集和字段元信息</p>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <FormButton className="bg-gradient-to-r from-emerald-500 to-teal-500">
              <Plus className="w-5 h-5 mr-2" />
              注册数据集
              <ChevronDown className="w-4 h-4 ml-2" />
            </FormButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={5}>
            <DropdownMenuItem onClick={() => navigate('/data-center/datasets/register/table')}>
              <Database className="w-4 h-4 mr-2" />
              物理表数据集
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/queries/editor')}>
              <Code className="w-4 h-4 mr-2" />
              SQL 虚拟数据集
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/data-center/datasets/register/file')}>
              <FileText className="w-4 h-4 mr-2" />
              CSV 文件数据集
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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

      {/* 搜索和筛选 */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              type="text"
              placeholder="搜索数据集名称或编码..."
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value)
                setCurrentPage(1)
              }}
              className="h-11 pl-12 pr-4 bg-gray-50"
            />
          </div>
        </div>
      </div>

      {/* 数据集列表 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-16 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto mb-4" />
            <span className="text-gray-500">正在加载数据集...</span>
          </div>
        ) : datasets.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-5">
              <Table2 className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">暂无数据集</h3>
            <p className="text-gray-500 mb-6">从已连接的数据源注册您的第一个数据集</p>
            <FormButton onClick={() => navigate('/data-center/datasets/register')} className="bg-gradient-to-r from-emerald-500 to-teal-500">
              <Plus className="w-5 h-5 mr-2" />
              注册数据集
            </FormButton>
          </div>
        ) : (
          <>
            <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">数据集</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">物理表</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">同步状态</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">负责人</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {datasets.map((ds: Dataset) => {
                const syncStatus = getSyncStatus(ds.sync_status)
                return (
                  <tr key={ds.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center",
                          ds.dataset_type === 'virtual' ? 'bg-gradient-to-br from-indigo-500 to-purple-500' :
                          ds.dataset_type === 'file' ? 'bg-gradient-to-br from-blue-500 to-cyan-500' :
                          'bg-gradient-to-br from-emerald-500 to-teal-500'
                        )}>
                          {ds.dataset_type === 'virtual' ? <Code className="w-5 h-5 text-white" /> :
                           ds.dataset_type === 'file' ? <FileText className="w-5 h-5 text-white" /> :
                           <Table2 className="w-5 h-5 text-white" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900">{ds.dataset_name}</span>
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                              ID: {ds.id}
                            </span>
                            <span className={cn(
                              "px-2 py-0.5 rounded text-xs font-medium",
                              ds.dataset_type === 'virtual' ? 'bg-indigo-50 text-indigo-700' :
                              ds.dataset_type === 'file' ? 'bg-blue-50 text-blue-700' :
                              'bg-emerald-50 text-emerald-700'
                            )}>
                              {ds.dataset_type === 'virtual' ? 'SQL' : ds.dataset_type === 'file' ? '文件' : '物理表'}
                            </span>
                          </div>
                          {ds.description && (
                            <div className="text-xs text-gray-500 mt-1">{ds.description}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600 font-mono bg-gray-50 px-2 py-1 rounded">
                        {ds.physical_table || ds.dataset_type === 'virtual' ? 'SQL查询' : ds.dataset_type === 'file' ? ds.file_metadata?.file_name : '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn("inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold", syncStatus.color)}>
                        {syncStatus.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {ds.owner || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <FormButton
                          variant="ghost"
                          size="icon"
                          onClick={() => syncMutation.mutate(ds.id)}
                          disabled={syncMutation.isPending}
                          className="w-9 h-9"
                          title="同步元数据"
                        >
                          <RefreshCw className={cn("w-4 h-4", syncMutation.isPending && "animate-spin")} />
                        </FormButton>
                        <FormButton
                          variant="ghost"
                          size="icon"
                          onClick={() => navigate(`/data-center/datasets/${ds.id}`)}
                          className="w-9 h-9"
                          title="编辑"
                        >
                          <Edit2 className="w-4 h-4" />
                        </FormButton>
                        <FormButton
                          variant="ghost"
                          size="icon"
                          onClick={() => setDatasetToDelete(ds)}
                          className="w-9 h-9 hover:text-red-600 hover:bg-red-50"
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </FormButton>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            </table>
            
            {/* Custom Pagination */}
            <div className="p-4 border-t border-gray-100 flex items-center justify-between">
              <div className="text-sm text-gray-500">
                共 {total} 条
              </div>
              <div className="flex items-center gap-2">
                <FormButton
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                >
                  上一页
                </FormButton>
                <span className="text-sm text-gray-600">
                  第 {currentPage} / {totalPages} 页
                </span>
                <FormButton
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                >
                  下一页
                </FormButton>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 删除确认对话框 */}
      <AlertDialog open={!!datasetToDelete} onOpenChange={(open) => !open && setDatasetToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除数据集 "{datasetToDelete?.dataset_name}" 吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => datasetToDelete && deleteMutation.mutate(datasetToDelete.id)}
              className="bg-red-500 hover:bg-red-600"
            >
              确定删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
