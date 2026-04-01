/**
 * 数据集管理页面
 * 基于 uiv2.pen 设计稿 (PGvGl)
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Table2,
  Plus,
  Edit2,
  Trash2,
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
  CapabilityGateCard,
  DataCenterPageShell,
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
import { cn } from '@/lib/utils'

export default function Datasets() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [searchText, setSearchText] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(10)
  const [datasetToDelete, setDatasetToDelete] = useState<Dataset | null>(null)
  const [syncingDatasetIds, setSyncingDatasetIds] = useState<number[]>([])

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
    onMutate: async (datasetId) => {
      setSyncingDatasetIds((currentIds) =>
        currentIds.includes(datasetId) ? currentIds : [...currentIds, datasetId],
      )
    },
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
    },
    onSettled: (_data, _error, datasetId) => {
      setSyncingDatasetIds((currentIds) => currentIds.filter((id) => id !== datasetId))
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
    { label: '总数据集', value: stats.total, color: 'text-[#0F172A]' },
    { label: '已同步', value: stats.synced, color: 'text-[#10B981]' },
    { label: '同步失败', value: stats.failed, color: 'text-[#94A3B8]' },
  ]

  const getSyncStatusStyle = (status: string) => {
    const config: Record<string, { color: string; label: string }> = {
      synced: { color: 'text-[#10B981]', label: '已同步' },
      syncing: { color: 'text-[#2563EB]', label: '同步中' },
      failed: { color: 'text-[#EF4444]', label: '失败' },
    }
    return config[status] || { color: 'text-[#94A3B8]', label: status }
  }

  const totalPages = Math.ceil(total / pageSize)
  const governanceCards = [
    { title: '血缘分析', reason: '血缘关系识别依赖后端真实链路计算能力，当前阶段仅保留入口。' },
    { title: '影响分析', reason: '下游影响范围尚未接入真实任务和订阅关系，暂不开放操作。' },
    { title: '质量评分', reason: '质量评分依赖真实治理规则与监控结果回传，当前阶段仅显示禁用态。' },
  ]
  const tableColumnsClass = 'grid grid-cols-[minmax(220px,1.9fr)_minmax(220px,1.5fr)_minmax(120px,0.8fr)_110px_minmax(120px,0.8fr)_120px] gap-4'

  return (
    <DataCenterPageShell
      title="数据集管理"
      description="管理注册的数据集和字段元信息"
      className="px-10 py-8"
      actions={(
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg bg-[#2563EB] px-5 py-2.5 text-sm font-medium text-white shadow-[0_2px_8px_#2563EB30] cursor-pointer"
            >
              注册数据集
              <ChevronDown className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={5}>
            <DropdownMenuItem onClick={() => navigate('/data-center/datasets/register/table')}>
              <Database className="mr-2 h-4 w-4" />
              物理表数据集
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/queries')}>
              <Code className="mr-2 h-4 w-4" />
              SQL 虚拟数据集
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/data-center/datasets/register/file')}>
              <FileText className="mr-2 h-4 w-4" />
              CSV / Excel 文件数据集
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    >

      {/* Stat Cards */}
      <div className="grid grid-cols-3 gap-4">
        {statsList.map((stat) => (
          <div
            key={stat.label}
            className="relative overflow-hidden rounded-xl bg-white p-5 shadow-[0_4px_20px_#0F172A08]"
          >
            <div className="absolute left-0 top-0 h-full w-1 rounded-l-xl bg-gradient-to-b from-[#2563EB] to-[#3B82F6]" />
            <span className={`text-[28px] font-semibold ${stat.color}`}>{stat.value}</span>
            <p className="mt-2 text-[13px] text-[#64748B]">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-2.5 rounded-lg bg-[#F1F5F9] px-4 py-3">
        <Search className="h-[18px] w-[18px] text-[#94A3B8]" />
        <input
          type="text"
          placeholder="搜索数据集名称或编码..."
          value={searchText}
          onChange={(e) => {
            setSearchText(e.target.value)
            setCurrentPage(1)
          }}
          className="flex-1 bg-transparent text-sm text-[#0F172A] placeholder-[#94A3B8] outline-none"
        />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl bg-white shadow-[0_2px_24px_#0F172A08]">
        {isLoading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="h-8 w-8 animate-spin text-[#94A3B8]" />
          </div>
        ) : datasets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32">
            <Table2 className="h-12 w-12 text-[#E2E8F0] mb-4" />
            <h3 className="text-base font-semibold text-[#0F172A] mb-2">暂无数据集</h3>
            <p className="text-sm text-[#64748B] mb-6">从已连接的数据源注册您的第一个数据集</p>
            <button
              type="button"
              onClick={() => navigate('/data-center/datasets/register/table')}
              className="flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-4 py-2 text-sm text-white cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              注册数据集
            </button>
          </div>
        ) : (
          <>
            {/* Table Header */}
            <div className={`${tableColumnsClass} items-center border-b border-[#E2E8F0] bg-[#F8FAFC] px-5 py-3.5`}>
              <span className="min-w-0 text-xs font-semibold text-[#64748B]">数据集</span>
              <span className="min-w-0 text-xs font-semibold text-[#64748B]">物理表</span>
              <span className="text-xs font-semibold text-[#64748B]">数据源类型</span>
              <span className="text-xs font-semibold text-[#64748B]">同步状态</span>
              <span className="text-xs font-semibold text-[#64748B]">负责人</span>
              <span className="text-xs font-semibold text-[#64748B]">操作</span>
            </div>

            {/* Table Rows */}
            {datasets.map((ds: Dataset, i: number) => {
              const syncStyle = getSyncStatusStyle(ds.sync_status)
              const typeLabel = ds.dataset_type === 'virtual' ? 'SQL' : ds.dataset_type === 'file' ? '文件' : '物理表'
              const syncReason = ds.sync_status === 'failed' ? (ds.sync_error || '同步失败，后端未返回具体原因') : null
              const isCurrentRowSyncing = syncingDatasetIds.includes(ds.id)
              return (
                <div
                  key={ds.id}
                  className={`${tableColumnsClass} items-start px-5 py-4 ${i < datasets.length - 1 ? 'border-b border-[#F1F5F9]' : ''}`}
                >
                  {/* Dataset info */}
                  <div className="min-w-0 pr-4">
                    <span className="block truncate text-[13px] font-medium text-[#0F172A]" title={ds.dataset_name}>
                      {ds.dataset_name}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-[#94A3B8]">ID:{ds.id} · {typeLabel}</span>
                    {syncReason ? <span className="mt-1 block truncate text-xs text-[#EF4444]" title={syncReason}>{syncReason}</span> : null}
                  </div>

                  {/* Physical table */}
                  <span
                    className="block min-w-0 truncate pr-4 text-[13px] text-[#64748B]"
                    title={
                      ds.physical_table ||
                      (ds.dataset_type === 'virtual'
                        ? '视图'
                        : ds.dataset_type === 'file'
                          ? ds.file_metadata?.file_name || '-'
                          : '-')
                    }
                  >
                    {ds.physical_table || (ds.dataset_type === 'virtual' ? '视图' : ds.dataset_type === 'file' ? ds.file_metadata?.file_name : '-')}
                  </span>

                  {/* Source type */}
                  <span className="block min-w-0 truncate text-[13px] text-[#64748B]" title={ds.source_type || '-'}>
                    {ds.source_type || '-'}
                  </span>

                  {/* Sync status */}
                  <span className={`block min-w-0 truncate text-[13px] font-medium ${syncStyle.color}`}>
                    {syncStyle.label}
                  </span>

                  {/* Owner */}
                  <span className="block min-w-0 truncate pr-4 text-[13px] text-[#64748B]" title={ds.owner || '-'}>
                    {ds.owner || '-'}
                  </span>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-3 self-center">
                    <button
                      type="button"
                      onClick={() => syncMutation.mutate(ds.id)}
                      disabled={isCurrentRowSyncing}
                      className="text-[#94A3B8] hover:text-[#2563EB] disabled:opacity-50 cursor-pointer"
                      title="同步元数据"
                    >
                      <RefreshCw className={cn("h-4 w-4", isCurrentRowSyncing && "animate-spin")} />
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(`/data-center/datasets/${ds.id}`)}
                      className="text-[#94A3B8] hover:text-[#64748B] cursor-pointer"
                      title="编辑"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDatasetToDelete(ds)}
                      className="text-[#94A3B8] hover:text-[#EF4444] cursor-pointer"
                      title="删除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )
            })}

            {/* Pagination */}
            <div className="flex items-center justify-between border-t border-[#E2E8F0] px-5 py-3">
              <span className="text-xs text-[#94A3B8]">共 {total} 条</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="rounded-md border border-[#E2E8F0] px-3 py-1 text-xs text-[#64748B] disabled:opacity-50 cursor-pointer"
                >
                  上一页
                </button>
                <span className="text-xs text-[#64748B]">
                  第 {currentPage} / {totalPages} 页
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded-md border border-[#E2E8F0] px-3 py-1 text-xs text-[#64748B] disabled:opacity-50 cursor-pointer"
                >
                  下一页
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {governanceCards.map((card) => (
          <CapabilityGateCard key={card.title} title={card.title} reason={card.reason} />
        ))}
      </div>

      {/* Delete Dialog */}
      <AlertDialog open={!!datasetToDelete} onOpenChange={(open) => !open && setDatasetToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除数据集 &ldquo;{datasetToDelete?.dataset_name}&rdquo; 吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => datasetToDelete && deleteMutation.mutate(datasetToDelete.id)}
              className="bg-[#EF4444] hover:bg-[#DC2626]"
            >
              确定删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DataCenterPageShell>
  )
}
