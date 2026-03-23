/**
 * 查询历史页面 - Migrated to shadcn/ui
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Play, Eye, CheckCircle, XCircle, Clock } from 'lucide-react'
import { getHistories } from '../../api/queries'
import type { QueryHistory } from '../../api/queries'
import { getDataSources } from '../../api/datasources'
import {
  FormSelect,
  FormButton,
  FormRangeDatePicker,
  PageModal,
} from '@/components/business'
import { Skeleton } from '@/components/ui/skeleton'
import { format } from 'date-fns'
import { DateRange } from 'react-day-picker'

export default function QueryHistory() {
  const navigate = useNavigate()
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [selectedSource, setSelectedSource] = useState<number>()
  const [selectedStatus, setSelectedStatus] = useState<string>()
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedHistory, setSelectedHistory] = useState<QueryHistory | null>(null)
  
  // 获取数据源列表
  const { data: datasourcesData } = useQuery({
    queryKey: ['datasources'],
    queryFn: () => getDataSources({ page: 1, page_size: 100 })
  })
  
  const datasources = datasourcesData?.data?.items || []
  
  // 获取查询历史
  const { data: historiesData, isLoading } = useQuery({
    queryKey: ['histories', { 
      source_id: selectedSource, 
      status: selectedStatus, 
      date_from: dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : undefined, 
      date_to: dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : undefined 
    }],
    queryFn: () => getHistories({
      page: 1,
      page_size: 50,
      source_id: selectedSource,
      status: selectedStatus,
      date_from: dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : undefined,
      date_to: dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : undefined
    })
  })
  
  const histories = historiesData?.items || []
  
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-emerald-500" />
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />
      case 'timeout':
        return <Clock className="w-5 h-5 text-orange-500" />
      default:
        return null
    }
  }
  
  const getStatusText = (status: string) => {
    switch (status) {
      case 'success':
        return '成功'
      case 'failed':
        return '失败'
      case 'timeout':
        return '超时'
      default:
        return status
    }
  }
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'bg-emerald-50 text-emerald-700'
      case 'failed':
        return 'bg-red-50 text-red-700'
      case 'timeout':
        return 'bg-orange-50 text-orange-700'
      default:
        return 'bg-gray-50 text-gray-700'
    }
  }
  
  const handleViewDetail = (history: QueryHistory) => {
    setSelectedHistory(history)
    setDetailModalVisible(true)
  }
  
  const handleRerun = (history: QueryHistory) => {
    navigate(`/queries/editor?sql=${encodeURIComponent(history.sql_query)}&source_id=${history.source_id}`)
  }
  
  return (
    <div className="h-full flex flex-col">
      {/* 页面标题和过滤器 */}
      <div className="px-6 py-4 bg-white border-b border-gray-200">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">查询历史</h1>
        
        <div className="flex items-center gap-3 flex-wrap">
          <FormRangeDatePicker
            value={dateRange}
            onChange={(range) => setDateRange(range)}
            placeholder="选择日期范围"
            className="w-[280px]"
          />
          
          <FormSelect
            placeholder="数据源"
            value={selectedSource?.toString() || '__all__'}
            onValueChange={(val: string) => setSelectedSource(val === '__all__' ? undefined : Number(val))}
            options={[
              { label: '全部', value: '__all__' },
              ...datasources.map((ds: { id: number; name: string; source_type: string }) => ({
                label: `${ds.name} (${ds.source_type})`,
                value: ds.id.toString()
              }))
            ]}
            className="w-[200px]"
          />
          
          <FormSelect
            placeholder="执行状态"
            value={selectedStatus || '__all__'}
            onValueChange={(val: string) => setSelectedStatus(val === '__all__' ? undefined : val)}
            options={[
              { label: '全部', value: '__all__' },
              { label: '成功', value: 'success' },
              { label: '失败', value: 'failed' },
              { label: '超时', value: 'timeout' }
            ]}
            className="w-[160px]"
          />
        </div>
      </div>
      
      {/* 历史记录列表 */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : histories.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Clock className="w-16 h-16 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">暂无历史记录</h3>
            <p className="text-sm text-gray-500">
              {dateRange || selectedSource || selectedStatus
                ? '未找到匹配的历史记录'
                : '执行查询后将在此显示历史记录'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {histories.map((history: QueryHistory) => (
              <div
                key={history.id}
                className="bg-white border border-gray-200 rounded-lg p-5 hover:border-indigo-200 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(history.status)}
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded ${getStatusColor(history.status)}`}>
                          {getStatusText(history.status)}
                        </span>
                        <span className="text-sm text-gray-500">
                          {history.datasource_name}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400">
                        {new Date(history.executed_at).toLocaleString('zh-CN')} · 
                        耗时 {history.execution_time_ms}ms
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <FormButton
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewDetail(history)}
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      详情
                    </FormButton>
                    <FormButton
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRerun(history)}
                    >
                      <Play className="w-4 h-4 mr-1" />
                      重新执行
                    </FormButton>
                  </div>
                </div>
                
                <div className="bg-gray-50 rounded p-3 border border-gray-100">
                  <pre className="text-xs text-gray-700 font-mono whitespace-pre-wrap break-all line-clamp-3">
                    {history.sql_query}
                  </pre>
                </div>
                
                {history.status === 'failed' && history.error_message && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded">
                    <p className="text-xs text-red-600">
                      <strong>错误:</strong> {history.error_message}
                    </p>
                  </div>
                )}
                
                {history.status === 'success' && (
                  <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
                    <span>返回行数: {history.row_count || 0}</span>
                    {history.result_size && (
                      <span>结果大小: {(history.result_size / 1024).toFixed(2)} KB</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* 详情模态框 */}
      <PageModal
        open={detailModalVisible}
        onClose={() => setDetailModalVisible(false)}
        title="查询详情"
        width="800px"
      >
        {selectedHistory && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">执行状态</label>
              <div className="mt-1 flex items-center gap-2">
                {getStatusIcon(selectedHistory.status)}
                <span className={`px-2 py-0.5 text-xs font-medium rounded ${getStatusColor(selectedHistory.status)}`}>
                  {getStatusText(selectedHistory.status)}
                </span>
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-700">数据源</label>
              <p className="mt-1 text-sm text-gray-900">{selectedHistory.datasource_name}</p>
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-700">执行时间</label>
              <p className="mt-1 text-sm text-gray-900">
                {new Date(selectedHistory.executed_at).toLocaleString('zh-CN')}
              </p>
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-700">耗时</label>
              <p className="mt-1 text-sm text-gray-900">{selectedHistory.execution_time_ms} ms</p>
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-700">SQL 查询</label>
              <div className="mt-1 bg-gray-50 rounded p-3 border border-gray-200">
                <pre className="text-xs text-gray-700 font-mono whitespace-pre-wrap break-all">
                  {selectedHistory.sql_query}
                </pre>
              </div>
            </div>
            
            {selectedHistory.status === 'failed' && selectedHistory.error_message && (
              <div>
                <label className="text-sm font-medium text-red-700">错误信息</label>
                <div className="mt-1 p-3 bg-red-50 border border-red-100 rounded">
                  <p className="text-xs text-red-600 whitespace-pre-wrap">
                    {selectedHistory.error_message}
                  </p>
                </div>
              </div>
            )}
            
            {selectedHistory.status === 'success' && (
              <>
                <div>
                  <label className="text-sm font-medium text-gray-700">返回行数</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedHistory.row_count || 0}</p>
                </div>
                {selectedHistory.result_size && (
                  <div>
                    <label className="text-sm font-medium text-gray-700">结果大小</label>
                    <p className="mt-1 text-sm text-gray-900">
                      {(selectedHistory.result_size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </PageModal>
    </div>
  )
}
