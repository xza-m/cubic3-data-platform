import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { Clock3, Eye, PlayCircle } from 'lucide-react'
import { getDataSources } from '../../api/datasources'
import { getHistories, type QueryHistory } from '../../api/queries'
import { FormButton, FormSelect, PageModal, Skeleton } from '@/components/business'

function buildEditorSearch(history: QueryHistory) {
  const params = new URLSearchParams()
  params.set('sql', history.sql_query)
  if (history.source_id) {
    params.set('source_id', String(history.source_id))
    params.set('sourceId', String(history.source_id))
  }
  if (history.query_id) {
    params.set('id', String(history.query_id))
    params.set('queryId', String(history.query_id))
  }
  return params.toString()
}

const STATUS_OPTIONS = [
  { value: '__all__', label: '全部状态' },
  { value: 'success', label: '成功' },
  { value: 'failed', label: '失败' },
  { value: 'timeout', label: '超时' },
]

const STATUS_LABELS: Record<string, string> = {
  success: '成功',
  failed: '失败',
  timeout: '超时',
}

export default function QueryHistoryPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const initialParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const initialSourceId = initialParams.get('source_id') || initialParams.get('sourceId')
  const initialStatus = initialParams.get('status')
  const [selectedSource, setSelectedSource] = useState<number | undefined>(
    initialSourceId ? Number(initialSourceId) : undefined,
  )
  const [selectedStatus, setSelectedStatus] = useState<string | undefined>(initialStatus || undefined)
  const [selectedHistory, setSelectedHistory] = useState<QueryHistory | null>(null)

  const { data: datasourceResponse } = useQuery({
    queryKey: ['query-history-datasources'],
    queryFn: () => getDataSources({ page: 1, page_size: 100 }),
  })

  const { data: historiesResponse, isLoading } = useQuery({
    queryKey: ['query-history-list', { selectedSource, selectedStatus }],
    queryFn: () =>
      getHistories({
        page: 1,
        page_size: 50,
        source_id: selectedSource,
        status: selectedStatus,
      }),
  })

  const datasources = datasourceResponse?.data?.items || []
  const histories = historiesResponse?.items || []
  const datasourceOptions = useMemo(
    () => [
      { value: '__all__', label: '全部数据源' },
      ...datasources.map((datasource: { id: number; name: string; source_type: string }) => ({
        value: String(datasource.id),
        label: `${datasource.name} (${datasource.source_type})`,
      })),
    ],
    [datasources],
  )

  return (
    <div className="flex h-full flex-col bg-[#F8FAFC]">
      <div className="border-b border-[#E2E8F0] bg-white px-8 py-6">
        <h1 className="text-2xl font-semibold text-[#0F172A]">查询历史</h1>
        <p className="mt-2 text-sm text-[#64748B]">保留历史记录和重跑入口，避免旧深链在工作台重构后失效。</p>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <FormSelect
            value={selectedSource ? String(selectedSource) : '__all__'}
            onValueChange={(value) => setSelectedSource(value === '__all__' ? undefined : Number(value))}
            options={datasourceOptions}
            placeholder="数据源"
          />
          <FormSelect
            value={selectedStatus || '__all__'}
            onValueChange={(value) => setSelectedStatus(value === '__all__' ? undefined : value)}
            options={STATUS_OPTIONS}
            placeholder="执行状态"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto px-8 py-6">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-32 w-full rounded-2xl" />
            ))}
          </div>
        ) : histories.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center rounded-3xl border border-dashed border-[#CBD5E1] bg-white px-6 py-12 text-center">
            <Clock3 className="h-10 w-10 text-[#94A3B8]" />
            <h2 className="mt-4 text-lg font-medium text-[#0F172A]">暂无历史记录</h2>
            <p className="mt-2 max-w-md text-sm text-[#64748B]">调整筛选条件或先执行一次查询，历史记录就会显示在这里。</p>
          </div>
        ) : (
          <div className="space-y-4">
            {histories.map((history) => (
              <article
                key={history.id}
                className="rounded-3xl border border-[#E2E8F0] bg-white p-6 shadow-[0_12px_40px_-24px_rgba(15,23,42,0.35)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex rounded-full bg-[#EFF6FF] px-2.5 py-1 text-xs font-medium text-[#2563EB]">
                        {STATUS_LABELS[history.status] || history.status}
                      </span>
                      <span className="text-sm text-[#475569]">{history.datasource_name || '未标记数据源'}</span>
                    </div>
                    <div className="mt-3 text-xs text-[#64748B]">
                      执行于 {new Date(history.executed_at).toLocaleString('zh-CN')} · 耗时 {history.execution_time_ms}ms
                    </div>
                    <pre className="mt-3 overflow-hidden rounded-2xl bg-[#0F172A] p-4 text-xs leading-5 text-[#E2E8F0]">
                      {history.sql_query}
                    </pre>
                  </div>

                  <div className="flex shrink-0 flex-col gap-2">
                    <FormButton onClick={() => setSelectedHistory(history)}>
                      <Eye className="mr-2 h-4 w-4" />
                      详情
                    </FormButton>
                    <FormButton
                      variant="outline"
                      onClick={() =>
                        navigate({
                          pathname: '/queries/editor',
                          search: `?${buildEditorSearch(history)}`,
                        })
                      }
                    >
                      <PlayCircle className="mr-2 h-4 w-4" />
                      重新执行
                    </FormButton>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <PageModal
        open={Boolean(selectedHistory)}
        onClose={() => setSelectedHistory(null)}
        title="查询详情"
        width="720px"
      >
        {selectedHistory ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-[#94A3B8]">状态</div>
                <div className="mt-1 text-sm text-[#0F172A]">{STATUS_LABELS[selectedHistory.status] || selectedHistory.status}</div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-[#94A3B8]">数据源</div>
                <div className="mt-1 text-sm text-[#0F172A]">{selectedHistory.datasource_name || '未标记数据源'}</div>
              </div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-[#94A3B8]">SQL</div>
              <pre className="mt-2 overflow-auto rounded-2xl bg-[#0F172A] p-4 text-xs leading-5 text-[#E2E8F0]">
                {selectedHistory.sql_query}
              </pre>
            </div>
          </div>
        ) : null}
      </PageModal>
    </div>
  )
}
