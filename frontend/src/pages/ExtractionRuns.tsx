/**
 * 数据提取执行历史页面 - Migrated to shadcn/ui
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  History,
  Download,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  ArrowLeft
} from 'lucide-react'
import { getRuns, downloadRun } from '../api/extraction'
import type { ExtractionRun } from '@/types'
import { FormButton, PageModal, useToast } from '@/components/business'
import { Skeleton } from '@/components/ui/skeleton'

export default function ExtractionRuns() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const taskIdParam = searchParams.get('task_id')
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [selectedRun, setSelectedRun] = useState<ExtractionRun | null>(null)
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const { toast } = useToast()

  const { data, isLoading } = useQuery({
    queryKey: ['extraction-runs', taskIdParam, page, pageSize],
    queryFn: () => getRuns({
      task_id: taskIdParam ? parseInt(taskIdParam) : undefined,
      page,
      page_size: pageSize
    })
  })

  const runs = data?.data?.items || []
  const total = data?.data?.total || 0

  const handleDownload = (run: ExtractionRun) => {
    if (run.delivery_method === 'local' && run.status === 'success') {
      downloadRun(run.id)
      toast({ title: "开始下载文件" })
    } else {
      toast({ title: "该记录不支持下载" })
    }
  }

  const handleViewDetail = (run: ExtractionRun) => {
    setSelectedRun(run)
    setDetailModalOpen(true)
  }

  const getStatusTag = (status: string) => {
    const statusMap: Record<string, { color: string; icon: typeof CheckCircle; text: string }> = {
      'success': { color: 'text-emerald-600 bg-emerald-50', icon: CheckCircle, text: '成功' },
      'failed': { color: 'text-red-600 bg-red-50', icon: XCircle, text: '失败' },
      'running': { color: 'text-blue-600 bg-blue-50', icon: Clock, text: '运行中' }
    }
    const config = statusMap[status] || statusMap['running']
    const Icon = config.icon
    
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${config.color}`}>
        <Icon className="w-3.5 h-3.5" />
        {config.text}
      </span>
    )
  }

  const getDeliveryTag = (method: string) => {
    const methodMap: Record<string, { color: string; text: string }> = {
      'local': { color: 'bg-blue-100 text-blue-700', text: '本地下载' },
      'feishu': { color: 'bg-purple-100 text-purple-700', text: '飞书推送' },
      'oss': { color: 'bg-orange-100 text-orange-700', text: 'OSS链接' }
    }
    const config = methodMap[method] || { color: 'bg-gray-100 text-gray-700', text: method || '-' }
    
    return (
      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        {config.text}
      </span>
    )
  }

  const formatDuration = (ms: number) => {
    if (!ms) return '-'
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}min`
  }

  const formatFileSize = (mb: number) => {
    if (!mb) return '-'
    if (mb < 1) return `${(mb * 1024).toFixed(2)}KB`
    return `${mb.toFixed(2)}MB`
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <FormButton
            variant="outline"
            size="icon"
            onClick={() => navigate('/extraction-tasks')}
          >
            <ArrowLeft className="w-5 h-5" />
          </FormButton>
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/25">
            <History className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">执行历史</h1>
            <p className="text-gray-500 text-sm">
              {taskIdParam ? '查看任务的执行记录' : '所有任务的执行记录'}
            </p>
          </div>
        </div>
      </div>

      {/* 数据表格 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-16 text-center">
            <Skeleton className="h-32 w-full" />
          </div>
        ) : runs.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-5">
              <History className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">暂无执行记录</h3>
            <p className="text-gray-500 mb-6">执行任务后会在这里显示记录</p>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">执行时间</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">任务ID</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">状态</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">数据行数</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">文件大小</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">交付方式</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">耗时</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {runs.map((run: ExtractionRun) => (
                  <tr key={run.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {run.start_time ? new Date(run.start_time).toLocaleString() : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {run.task_id || '-'}
                    </td>
                    <td className="px-6 py-4">
                      {getStatusTag(run.status)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                      {run.row_count?.toLocaleString() || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {formatFileSize(run.result_size_mb)}
                    </td>
                    <td className="px-6 py-4">
                      {getDeliveryTag(run.delivery_method)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {formatDuration(run.duration_ms)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {run.status === 'success' && run.delivery_method === 'local' && (
                          <FormButton
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDownload(run)}
                            title="下载"
                          >
                            <Download className="w-4 h-4" />
                          </FormButton>
                        )}
                        <FormButton
                          variant="ghost"
                          size="icon"
                          onClick={() => handleViewDetail(run)}
                          title="详情"
                        >
                          <Eye className="w-4 h-4" />
                        </FormButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 分页 */}
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              <div className="text-sm text-gray-500">
                共 {total} 条记录
              </div>
              <div className="flex items-center gap-2">
                <FormButton
                  variant="outline"
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                >
                  上一页
                </FormButton>
                <span className="px-4 py-2 text-sm text-gray-700">
                  第 {page} 页
                </span>
                <FormButton
                  variant="outline"
                  onClick={() => setPage(page + 1)}
                  disabled={page * pageSize >= total}
                >
                  下一页
                </FormButton>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 执行详情 Modal */}
      <PageModal
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        title="执行详情"
        width="800px"
      >
        {selectedRun && (
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-500 mb-1">执行ID</div>
                <div className="text-sm font-medium text-gray-900">{selectedRun.id}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">任务ID</div>
                <div className="text-sm font-medium text-gray-900">{selectedRun.task_id}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">状态</div>
                <div>{getStatusTag(selectedRun.status)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">执行时间</div>
                <div className="text-sm text-gray-700">
                  {selectedRun.start_time ? new Date(selectedRun.start_time).toLocaleString() : '-'}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">数据行数</div>
                <div className="text-sm font-semibold text-gray-900">{selectedRun.row_count?.toLocaleString() || '-'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">文件大小</div>
                <div className="text-sm text-gray-700">{formatFileSize(selectedRun.result_size_mb)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">交付方式</div>
                <div>{getDeliveryTag(selectedRun.delivery_method)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">耗时</div>
                <div className="text-sm text-gray-700">{formatDuration(selectedRun.duration_ms)}</div>
              </div>
            </div>

            {selectedRun.generated_sql && (
              <div>
                <div className="text-xs text-gray-500 mb-2">执行SQL</div>
                <pre className="bg-gray-50 p-4 rounded-lg text-xs text-gray-800 overflow-x-auto border border-gray-200">
                  {selectedRun.generated_sql}
                </pre>
              </div>
            )}

            {selectedRun.error_message && (
              <div>
                <div className="text-xs text-red-500 mb-2">错误信息</div>
                <div className="bg-red-50 p-4 rounded-lg text-sm text-red-700 border border-red-100">
                  {selectedRun.error_message}
                </div>
              </div>
            )}

            {selectedRun.delivery_info && Object.keys(selectedRun.delivery_info).length > 0 && (
              <div>
                <div className="text-xs text-gray-500 mb-2">交付信息</div>
                <pre className="bg-gray-50 p-4 rounded-lg text-xs text-gray-800 overflow-x-auto border border-gray-200">
                  {JSON.stringify(selectedRun.delivery_info, null, 2)}
                </pre>
              </div>
            )}

            {selectedRun.status === 'success' && selectedRun.delivery_method === 'local' && (
              <div className="flex justify-end pt-4">
                <FormButton onClick={() => handleDownload(selectedRun)}>
                  <Download className="w-5 h-5 mr-2" />
                  下载文件
                </FormButton>
              </div>
            )}
          </div>
        )}
      </PageModal>
    </div>
  )
}
