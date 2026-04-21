import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { FileSearch, FolderOpen, PlusCircle } from 'lucide-react'
import { getFolders, getQueries, type Query } from '../../api/queries'
import { FormButton, FormInput, FormSelect, Skeleton } from '@/components/business'

function buildEditorSearch(query: Query) {
  const params = new URLSearchParams()
  params.set('queryId', String(query.id))
  params.set('id', String(query.id))
  params.set('sourceId', String(query.source_id))
  params.set('source_id', String(query.source_id))
  params.set('sql', query.sql_query)
  params.set('name', query.query_name)
  return params.toString()
}

export default function MyQueries() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [selectedFolder, setSelectedFolder] = useState<number>()

  const { data: folders = [] } = useQuery({
    queryKey: ['query-folders'],
    queryFn: getFolders,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['saved-queries', { search, folderId: selectedFolder }],
    queryFn: () =>
      getQueries({
        page: 1,
        page_size: 100,
        search: search || undefined,
        folder_id: selectedFolder,
      }),
  })

  const folderOptions = useMemo(
    () => [
      { value: '__all__', label: '全部文件夹' },
      ...folders.map((folder) => ({
        value: String(folder.id),
        label: folder.folder_name,
      })),
    ],
    [folders],
  )

  const queries = data?.items || []

  return (
    <div className="flex h-full flex-col bg-[#F8FAFC]">
      <div className="border-b border-[#E2E8F0] bg-white px-8 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-[#0F172A]">我的查询</h1>
            <p className="mt-2 text-sm text-[#64748B]">保留已保存查询的独立入口，便于继续编辑和回看沉淀结果。</p>
          </div>
          <FormButton onClick={() => navigate('/queries/editor')}>
            <PlusCircle className="mr-2 h-4 w-4" />
            新建查询
          </FormButton>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_240px]">
          <FormInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索查询名称或 SQL 内容..."
          />
          <FormSelect
            value={selectedFolder ? String(selectedFolder) : '__all__'}
            onValueChange={(value) => setSelectedFolder(value === '__all__' ? undefined : Number(value))}
            options={folderOptions}
            placeholder="选择文件夹"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto px-8 py-6">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-28 w-full rounded-2xl" />
            ))}
          </div>
        ) : queries.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center rounded-3xl border border-dashed border-[#CBD5E1] bg-white px-6 py-12 text-center">
            <FileSearch className="h-10 w-10 text-[#94A3B8]" />
            <h2 className="mt-4 text-lg font-medium text-[#0F172A]">暂无已保存查询</h2>
            <p className="mt-2 max-w-md text-sm text-[#64748B]">
              当前筛选条件下没有查询结果，可以回到 SQL 工作台新建一个查询。
            </p>
            <FormButton className="mt-5" onClick={() => navigate('/queries/editor')}>
              新建查询
            </FormButton>
          </div>
        ) : (
          <div className="space-y-4">
            {queries.map((query) => (
              <article
                key={query.id}
                className="rounded-3xl border border-[#E2E8F0] bg-white p-6 shadow-[0_12px_40px_-24px_rgba(15,23,42,0.35)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate text-lg font-semibold text-[#0F172A]">{query.query_name}</h2>
                      {query.folder_name ? (
                        <span className="inline-flex items-center rounded-full bg-[#EFF6FF] px-2.5 py-1 text-xs font-medium text-[#2563EB]">
                          <FolderOpen className="mr-1 h-3.5 w-3.5" />
                          {query.folder_name}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[#64748B]">{query.description || '暂无描述'}</p>
                    <pre className="mt-3 overflow-hidden rounded-2xl bg-[#0F172A] p-4 text-xs leading-5 text-[#E2E8F0]">
                      {query.sql_query}
                    </pre>
                    <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-[#64748B]">
                      <span>执行次数 {query.execute_count}</span>
                      <span>更新于 {new Date(query.updated_at || query.created_at).toLocaleString('zh-CN')}</span>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col gap-2">
                    <FormButton
                      onClick={() =>
                        navigate({
                          pathname: '/queries/editor',
                          search: `?${buildEditorSearch(query)}`,
                        })
                      }
                    >
                      继续编辑
                    </FormButton>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
