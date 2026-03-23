import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GitBranch, PlusCircle, Search, Settings2, Trash2 } from 'lucide-react'
import {
  deleteCatalog,
  listDomainCatalogs,
  listDomains,
  type DomainSummary,
} from '@/api/semantic'
import { DataTable, type DataTableColumn } from '@/components/business/DataTable'
import { CatalogEditorDialog } from '@/components/Semantic/CatalogEditorDialog'
import { useToast } from '@/components/business'
import {
  SemanticEmptyState,
  SemanticPageHeader,
  SemanticPageShell,
  SemanticSurface,
} from '@/components/Semantic/workbench'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useUrlState } from '@/hooks/useUrlState'
import { getSemanticStatusLabel } from '@/lib/semantic-status'
import { cn } from '@/lib/utils'

const PAGE_SIZE_OPTIONS = [10, 20, 50]

function statusVariant(status: string) {
  if (status === 'active') return 'default' as const
  if (status === 'draft') return 'secondary' as const
  return 'outline' as const
}

function formatSummaryTime(value?: string | null) {
  if (!value) return '未记录'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN')
}

function parsePositiveInt(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback
  }
  return parsed
}

function domainKey(domain?: DomainSummary | null) {
  return domain ? String(domain.id || domain.code) : ''
}

function getDomainHealth(domain?: DomainSummary | null) {
  if (!domain) {
    return {
      tone: 'neutral',
      title: '先选择一个领域',
      description: '从列表中选择领域后，再进入画布完成编排和发布。',
    }
  }
  if (domain.cube_count === 0) {
    return {
      tone: 'warn',
      title: '领域边界还没有沉淀下来',
      description: '当前领域还没有纳入 Cube，先进入画布补充核心模型。',
    }
  }
  if (domain.join_count === 0 && domain.cube_count > 1) {
    return {
      tone: 'warn',
      title: '关联关系仍然缺失',
      description: '领域里已有多个 Cube，但 Join 还未成型，优先补齐关系。',
    }
  }
  if (domain.status !== 'active') {
    return {
      tone: 'neutral',
      title: '领域仍处于草稿状态',
      description: '结构已具备基础规模，建议进入画布确认后发布。',
    }
  }
  return {
    tone: 'ok',
    title: '领域结构已可复用',
    description: '当前领域已发布，可继续补充边界、关系与说明。',
  }
}

function VisualModelSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-20 rounded-2xl" />
      <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1.2fr)_360px]">
        <Skeleton className="h-[42rem] rounded-2xl" />
        <Skeleton className="h-[42rem] rounded-2xl" />
        <Skeleton className="h-[42rem] rounded-2xl" />
      </div>
    </div>
  )
}

export default function DomainList() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const [catalogDialogOpen, setCatalogDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [catalogEditingCode, setCatalogEditingCode] = useState<string | null>(null)
  const [activeCatalogCode, setActiveCatalogCode] = useUrlState<string>('catalog', '')
  const [selectedDomainKey, setSelectedDomainKey] = useUrlState<string>('selected', '')
  const [search, setSearch] = useUrlState<string>('q', '')
  const [page, setPage] = useUrlState<string>('page', '1')
  const [pageSize, setPageSize] = useUrlState<string>('page_size', '10')

  const pageNumber = parsePositiveInt(page, 1)
  const pageSizeNumber = parsePositiveInt(pageSize, 10)
  const trimmedSearch = search.trim()

  const { data: catalogsData, isLoading: catalogsLoading } = useQuery({
    queryKey: ['semantic', 'catalogs'],
    queryFn: async () => (await listDomainCatalogs()).data,
  })

  const catalogs = catalogsData?.catalogs ?? []
  const activeCatalog = useMemo(
    () => catalogs.find((catalog) => catalog.code === activeCatalogCode) ?? catalogs[0] ?? null,
    [activeCatalogCode, catalogs],
  )

  useEffect(() => {
    if (!catalogs.length) return
    if (!activeCatalogCode || !catalogs.some((catalog) => catalog.code === activeCatalogCode)) {
      setActiveCatalogCode(catalogs[0].code)
    }
  }, [activeCatalogCode, catalogs, setActiveCatalogCode])

  const resolvedCatalogCode = activeCatalog?.code || ''

  const { data: domainsData, isLoading: domainsLoading } = useQuery({
    queryKey: ['semantic', 'domains', { catalog: resolvedCatalogCode, q: trimmedSearch, page: pageNumber, pageSize: pageSizeNumber }],
    queryFn: async () => (
      await listDomains({
        catalog_code: resolvedCatalogCode || undefined,
        q: trimmedSearch || undefined,
        page: pageNumber,
        page_size: pageSizeNumber,
      })
    ).data,
    enabled: !catalogsLoading,
  })

  const domains = domainsData?.domains ?? []
  const totalDomains = domainsData?.total ?? 0
  const pageCount = domainsData?.page_count ?? 0
  const selectedDomain = useMemo(() => {
    if (!domains.length) return null
    return domains.find((domain) => domainKey(domain) === selectedDomainKey) ?? domains[0] ?? null
  }, [domains, selectedDomainKey])

  useEffect(() => {
    if (pageCount > 0 && pageNumber > pageCount) {
      setPage(String(pageCount))
    }
  }, [pageCount, pageNumber, setPage])

  useEffect(() => {
    if (!domains.length) {
      if (selectedDomainKey) {
        setSelectedDomainKey('')
      }
      return
    }
    if (!selectedDomainKey || !domains.some((domain) => domainKey(domain) === selectedDomainKey)) {
      setSelectedDomainKey(domainKey(domains[0]))
    }
  }, [domains, selectedDomainKey, setSelectedDomainKey])

  const deleteCatalogMutation = useMutation({
    mutationFn: async () => {
      if (!activeCatalog) throw new Error('未选择目录')
      return (await deleteCatalog(activeCatalog.code)).data
    },
    onSuccess: async () => {
      toast({ title: '目录已删除' })
      setDeleteDialogOpen(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['semantic', 'catalogs'] }),
        queryClient.invalidateQueries({ queryKey: ['semantic', 'domains'] }),
      ])
    },
    onError: (err) => {
      toast({ title: '删除目录失败', description: (err as Error).message, variant: 'destructive' })
    },
  })

  const domainColumns = useMemo<DataTableColumn<DomainSummary>[]>(() => [
    {
      key: 'name',
      title: '领域',
      dataIndex: 'name',
      render: (_value, record) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[hsl(var(--workbench-ink))]">{record.name}</div>
          <div className="mt-1 truncate font-mono text-xs text-[hsl(var(--workbench-muted-foreground))]">{record.code}</div>
        </div>
      ),
    },
    {
      key: 'status',
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (value) => (
        <Badge variant={statusVariant((value as string) || 'draft')}>
          {getSemanticStatusLabel((value as string) || 'draft')}
        </Badge>
      ),
    },
    {
      key: 'cube_count',
      title: 'Cube',
      dataIndex: 'cube_count',
      width: 90,
      align: 'right',
    },
    {
      key: 'join_count',
      title: 'Join',
      dataIndex: 'join_count',
      width: 90,
      align: 'right',
    },
    {
      key: 'published_at',
      title: '最近发布',
      width: 180,
      render: (_value, record) => formatSummaryTime(record.state_summary?.last_published_at),
    },
    {
      key: 'updated_at',
      title: '最近变更',
      width: 180,
      render: (_value, record) => formatSummaryTime(record.state_summary?.updated_at),
    },
  ], [])

  if (catalogsLoading || domainsLoading) {
    return <VisualModelSkeleton />
  }

  const domainHealth = getDomainHealth(selectedDomain)
  const canDeleteCatalog = Boolean(activeCatalog && activeCatalog.code !== 'default' && activeCatalog.domain_count === 0)

  return (
    <SemanticPageShell>
      <SemanticPageHeader
        title="领域目录"
        description="按 Catalog 管理领域资源，左侧切目录，中间看列表，右侧继续进入画布。"
        status="ready"
        eyebrow="Domain Catalog"
        meta={
          <>
            <Badge variant="outline" className="border-transparent bg-[hsl(var(--workbench-panel))] text-[hsl(var(--workbench-muted-foreground))]">{activeCatalog?.name || '未选择目录'}</Badge>
            <Badge variant="outline" className="border-transparent bg-[hsl(var(--workbench-panel))] text-[hsl(var(--workbench-muted-foreground))]">{totalDomains} 个领域</Badge>
            <Badge variant="outline" className="border-transparent bg-[hsl(var(--workbench-panel))] text-[hsl(var(--workbench-muted-foreground))]">{`第 ${Math.max(pageNumber, 1)} / ${Math.max(pageCount, 1)} 页`}</Badge>
          </>
        }
        actions={
          <>
            <Button type="button" onClick={() => setCatalogDialogOpen(true)} className="h-10 rounded-full px-4 shadow-[0_14px_28px_rgba(67,97,238,0.16)]" data-testid="catalog-create-trigger">
              <PlusCircle className="mr-1.5 h-4 w-4" />
              新建目录
            </Button>
            <Button asChild variant="outline" className="h-10 rounded-full border-[hsl(var(--workbench-outline))] bg-white/84 px-4" data-testid="domain-create-trigger">
              <Link to="/semantic/modeling">
                <GitBranch className="mr-1.5 h-4 w-4" />
                进入领域建模
              </Link>
            </Button>
          </>
        }
      />

      <SemanticSurface bodyClassName="p-0">
        <div className="grid xl:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="border-b border-[hsl(var(--workbench-outline))] bg-[rgba(249,251,254,0.86)] p-4 xl:border-b-0 xl:border-r">
            <div className="flex items-center justify-between gap-2 px-1 pb-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--workbench-muted-foreground))]">
                Catalogs
              </div>
              {activeCatalog ? (
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label="编辑当前目录"
                    onClick={() => {
                      setCatalogEditingCode(activeCatalog.code)
                      setCatalogDialogOpen(true)
                    }}
                    data-testid="catalog-edit-trigger"
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label="删除当前目录"
                    disabled={!canDeleteCatalog}
                    onClick={() => setDeleteDialogOpen(true)}
                    data-testid="catalog-delete-trigger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="space-y-1.5">
              {catalogs.map((catalog) => (
                <button
                  key={catalog.code}
                  type="button"
                  data-testid={`domain-catalog-${catalog.code}`}
                  onClick={() => {
                    setActiveCatalogCode(catalog.code)
                    setPage('1')
                  }}
                  className={cn(
                    'w-full rounded-[var(--workbench-radius)] border px-3.5 py-3 text-left transition-all',
                    catalog.code === activeCatalog?.code
                      ? 'border-[hsl(var(--workbench-accent))]/20 bg-[hsl(var(--workbench-accent-soft))]'
                      : 'border-transparent bg-white/72 hover:border-[hsl(var(--workbench-outline))] hover:bg-white',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[hsl(var(--workbench-ink))]">{catalog.name}</div>
                      <div className="mt-1 truncate font-mono text-xs text-[hsl(var(--workbench-muted-foreground))]">{catalog.code}</div>
                    </div>
                    <Badge
                      variant={statusVariant(catalog.status)}
                      className={cn(
                        'border-transparent',
                        catalog.status === 'active'
                          ? 'bg-[hsl(var(--workbench-accent))]/10 text-[hsl(var(--workbench-accent))]'
                          : 'bg-[hsl(var(--workbench-surface-2))] text-[hsl(var(--workbench-muted-foreground))]',
                      )}
                    >
                      {getSemanticStatusLabel(catalog.status)}
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-[hsl(var(--workbench-muted-foreground))]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    <span className="rounded-full bg-[hsl(var(--workbench-surface-2))] px-2.5 py-1">{catalog.domain_count} 个领域</span>
                    <span className="rounded-full bg-[hsl(var(--workbench-surface-2))] px-2.5 py-1">{catalog.active_count} 个已发布</span>
                  </div>
                </button>
              ))}
            </div>

            {activeCatalog ? (
              <div className="mt-4 rounded-[var(--workbench-radius)] border border-dashed border-[hsl(var(--workbench-outline))] bg-white/82 px-4 py-4 text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">
                {activeCatalog.description || '当前目录还没有补充说明。'}
              </div>
            ) : null}
          </aside>

          <section className="min-w-0">
            <div className="flex flex-col gap-3 border-b border-[hsl(var(--workbench-outline))] px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--workbench-muted-foreground))]">
                  Domains
                </div>
                <div className="text-[1.02rem] font-semibold text-[hsl(var(--workbench-ink))]">
                  {activeCatalog?.name || '未选择目录'}
                </div>
                <p className="text-sm leading-5 text-[hsl(var(--workbench-muted-foreground))]">
                  当前页展示 {domains.length} / {totalDomains}，目录切换与分页状态都会保留在 URL 中。
                </p>
              </div>
              <div className="relative w-full max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--workbench-muted-foreground))]" />
                <Input
                  name="domain_search"
                  autoComplete="off"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value)
                    setPage('1')
                  }}
                  placeholder="搜索领域名称、编码或说明…"
                  className="h-10 rounded-xl border-[hsl(var(--workbench-outline))] bg-white pl-9"
                  data-testid="domain-list-search"
                />
              </div>
            </div>

            <div className="grid xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="min-w-0 border-b border-[hsl(var(--workbench-outline))] p-5 xl:border-b-0 xl:border-r">
                <DataTable
                  columns={domainColumns}
                  data={domains}
                  rowKey={(record) => domainKey(record)}
                  emptyText={trimmedSearch ? '当前目录下没有命中搜索条件的领域。' : '当前目录下还没有可浏览的领域。'}
                  onRow={(record) => ({
                    onClick: () => setSelectedDomainKey(domainKey(record)),
                    testId: `domain-list-item-${domainKey(record)}`,
                    className: cn(
                      recordKey(record) === selectedDomainKey
                        ? 'bg-[hsl(var(--workbench-accent-soft))] hover:bg-[hsl(var(--workbench-accent-soft))]'
                        : 'hover:bg-[hsl(var(--workbench-panel))]',
                    ),
                  })}
                  pagination={{
                    current: pageNumber,
                    pageSize: pageSizeNumber,
                    total: totalDomains,
                    pageSizeOptions: PAGE_SIZE_OPTIONS,
                    onChange: (nextPage) => setPage(String(nextPage)),
                    onPageSizeChange: (nextPageSize) => {
                      setPage('1')
                      setPageSize(String(nextPageSize))
                    },
                  }}
                />
              </div>

              <aside className="space-y-5 bg-[rgba(250,252,255,0.74)] p-5" data-testid="domain-summary-panel">
                {!selectedDomain ? (
                  <SemanticEmptyState
                    icon={<GitBranch className="h-6 w-6" />}
                    title="还没有选中领域"
                    description="从左侧目录筛到中间列表后，选择一个领域查看摘要并进入画布。"
                  />
                ) : (
                  <div className="space-y-5">
                    <div className="rounded-[var(--workbench-radius)] border border-[hsl(var(--workbench-outline))] bg-white/92 px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--workbench-muted-foreground))]">
                            当前领域
                          </div>
                          <h2 className="mt-2 truncate text-[1.22rem] font-semibold text-[hsl(var(--workbench-ink))]" data-semantic-display="true">
                            {selectedDomain.name}
                          </h2>
                          <div className="mt-1 truncate font-mono text-xs text-[hsl(var(--workbench-muted-foreground))]">{selectedDomain.code}</div>
                        </div>
                        <Badge
                          variant={statusVariant(selectedDomain.status)}
                          className={cn(
                            'border-transparent',
                            selectedDomain.status === 'active'
                              ? 'bg-[hsl(var(--workbench-accent))]/10 text-[hsl(var(--workbench-accent))]'
                              : 'bg-[hsl(var(--workbench-panel))] text-[hsl(var(--workbench-muted-foreground))]',
                          )}
                        >
                          {getSemanticStatusLabel(selectedDomain.status)}
                        </Badge>
                      </div>
                      <div className="mt-4 text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">
                        {selectedDomain.description || '当前领域还没有补充业务边界说明。'}
                      </div>
                    </div>

                    <div
                      className={cn(
                        'rounded-[var(--workbench-radius)] border px-4 py-4 text-sm leading-6',
                        domainHealth.tone === 'ok'
                          ? 'border-[hsl(var(--semantic-ok))]/20 bg-[hsl(var(--semantic-ok))]/8 text-[hsl(var(--semantic-ok))]'
                        : domainHealth.tone === 'warn'
                          ? 'border-[hsl(var(--semantic-warn))]/20 bg-[hsl(var(--semantic-warn))]/8 text-[hsl(var(--workbench-ink))]'
                            : 'border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface-2))] text-[hsl(var(--workbench-ink))]',
                      )}
                    >
                      <div className="text-sm font-semibold">{domainHealth.title}</div>
                      <div className="mt-2 text-[hsl(var(--workbench-muted-foreground))]">{domainHealth.description}</div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      {[
                        { label: '所属目录', value: selectedDomain.catalog_name || '默认目录' },
                        { label: 'Cube 数', value: String(selectedDomain.cube_count) },
                        { label: 'Join 数', value: String(selectedDomain.join_count) },
                        { label: '最近发布', value: formatSummaryTime(selectedDomain.state_summary?.last_published_at) },
                        { label: '最近变更', value: formatSummaryTime(selectedDomain.state_summary?.updated_at) },
                        { label: '同步状态', value: selectedDomain.state_summary?.sync_status || '未记录' },
                      ].map((item) => (
                        <div
                          key={item.label}
                          className="rounded-[var(--workbench-radius-sm)] border border-[hsl(var(--workbench-outline))] bg-white/90 px-4 py-3"
                        >
                          <div className="text-[10px] uppercase tracking-[0.12em] text-[hsl(var(--workbench-muted-foreground))]">{item.label}</div>
                          <div className="mt-1.5 text-sm font-semibold text-[hsl(var(--workbench-ink))]">{item.value}</div>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button asChild className="rounded-full px-4 shadow-[0_12px_24px_rgba(67,97,238,0.12)]" data-testid="domain-open-design">
                        <Link to={`/semantic/domains/${domainKey(selectedDomain)}`}>
                          <GitBranch className="mr-1.5 h-4 w-4" />
                          进入画布
                        </Link>
                      </Button>
                      <Button asChild variant="outline" className="rounded-full border-[hsl(var(--workbench-outline))] bg-white/88 px-4">
                        <Link to="/semantic/modeling">
                          <PlusCircle className="mr-1.5 h-4 w-4" />
                          去领域建模
                        </Link>
                      </Button>
                    </div>
                  </div>
                )}
              </aside>
            </div>
          </section>
        </div>
      </SemanticSurface>

      <CatalogEditorDialog
        open={catalogDialogOpen}
        catalog={catalogEditingCode ? catalogs.find((catalog) => catalog.code === catalogEditingCode) : undefined}
        onOpenChange={(open) => {
          setCatalogDialogOpen(open)
          if (!open) setCatalogEditingCode(null)
        }}
        onSuccess={(catalog) => {
          setActiveCatalogCode(catalog.code)
          setPage('1')
        }}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除目录</AlertDialogTitle>
            <AlertDialogDescription>
              只有空目录才能删除。删除后不会保留当前目录的名称和说明。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                deleteCatalogMutation.mutate()
              }}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SemanticPageShell>
  )
}

function recordKey(record: DomainSummary) {
  return domainKey(record)
}
