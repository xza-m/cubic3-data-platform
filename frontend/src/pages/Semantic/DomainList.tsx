import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
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
  SemanticStatusBanner,
  SemanticSurface,
  type SemanticValidationSummary,
} from '@/components/Semantic/workbench'
import { SemanticWorkbenchContextBar } from '@/components/Semantic/SemanticWorkbenchContextBar'
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
type DomainGovernanceLens = 'all' | 'empty' | 'draft' | 'join_gap'

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

function getCatalogHealth(catalog?: { name: string; domain_count: number; draft_count: number; active_count: number } | null, domains: DomainSummary[] = []) {
  if (!catalog) {
    return {
      tone: 'neutral',
      title: '先选择一个目录',
      description: '切换左侧目录后，再从中间列表筛出需要处理的领域。',
    }
  }
  const emptyCount = domains.filter((domain) => domain.cube_count === 0).length
  const joinGapCount = domains.filter((domain) => domain.cube_count > 1 && domain.join_count === 0).length
  if (catalog.domain_count === 0) {
    return {
      tone: 'warn',
      title: '当前目录还是空的',
      description: '建议先从领域建模入口创建领域，再逐步沉淀目录边界。',
    }
  }
  if (catalog.draft_count > 0) {
    return {
      tone: 'warn',
      title: '目录内仍有草稿积压',
      description: `当前目录有 ${catalog.draft_count} 个草稿领域，建议优先确认结构后发布。`,
    }
  }
  if (emptyCount > 0 || joinGapCount > 0) {
    return {
      tone: 'neutral',
      title: '目录治理仍需收口',
      description: `空领域 ${emptyCount} 个，Join 缺失 ${joinGapCount} 个，建议通过治理透镜继续排查。`,
    }
  }
  return {
    tone: 'ok',
    title: '目录结构已经稳定',
    description: '当前目录内领域已具备基本发布条件，可继续扩展说明和边界治理。',
  }
}

function matchesGovernanceLens(domain: DomainSummary, lens: DomainGovernanceLens) {
  if (lens === 'all') return true
  if (lens === 'empty') return domain.cube_count === 0
  if (lens === 'draft') return domain.status !== 'active'
  return domain.cube_count > 1 && domain.join_count === 0
}

function getGovernanceLabel(domain: DomainSummary) {
  if (domain.cube_count === 0) {
    return { label: '空领域', tone: 'warning' as const }
  }
  if (domain.cube_count > 1 && domain.join_count === 0) {
    return { label: 'Join 缺失', tone: 'warning' as const }
  }
  if (domain.status !== 'active') {
    return { label: '待发布', tone: 'default' as const }
  }
  return { label: '已发布', tone: 'accent' as const }
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
  const [, setSearchParams] = useSearchParams()

  const [catalogDialogOpen, setCatalogDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [catalogEditingCode, setCatalogEditingCode] = useState<string | null>(null)
  const [activeCatalogCode, setActiveCatalogCode] = useUrlState<string>('catalog', '')
  const [selectedDomainKey, setSelectedDomainKey] = useUrlState<string>('selected', '')
  const [search, setSearch] = useUrlState<string>('q', '')
  const [lens, setLens] = useUrlState<DomainGovernanceLens>('lens', 'all')
  const [panelMode, setPanelMode] = useUrlState<'catalog' | 'domain'>('panel', 'catalog')
  const [page, setPage] = useUrlState<string>('page', '1')
  const [pageSize, setPageSize] = useUrlState<string>('page_size', '10')
  const updateQueryParams = (updates: Record<string, string | undefined>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      for (const [key, value] of Object.entries(updates)) {
        if (!value) {
          next.delete(key)
        } else {
          next.set(key, value)
        }
      }
      return next
    }, { replace: true })
  }

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
  const filteredDomains = useMemo(
    () => domains.filter((domain) => matchesGovernanceLens(domain, lens)),
    [domains, lens],
  )
  const selectedDomain = useMemo(() => {
    if (!filteredDomains.length) return null
    return filteredDomains.find((domain) => domainKey(domain) === selectedDomainKey) ?? filteredDomains[0] ?? null
  }, [filteredDomains, selectedDomainKey])

  useEffect(() => {
    if (pageCount > 0 && pageNumber > pageCount) {
      setPage(String(pageCount))
    }
  }, [pageCount, pageNumber, setPage])

  useEffect(() => {
    if (!filteredDomains.length) {
      if (selectedDomainKey) {
        setSelectedDomainKey('')
      }
      return
    }
    if (!selectedDomainKey || !filteredDomains.some((domain) => domainKey(domain) === selectedDomainKey)) {
      setSelectedDomainKey(domainKey(filteredDomains[0]))
    }
  }, [filteredDomains, selectedDomainKey, setSelectedDomainKey])

  useEffect(() => {
    if (!selectedDomain) {
      setPanelMode('catalog')
      return
    }
    if (panelMode !== 'domain') return
    setPanelMode('domain')
  }, [panelMode, selectedDomain, setPanelMode])

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
      key: 'governance',
      title: '治理',
      width: 120,
      render: (_value, record) => {
        const governance = getGovernanceLabel(record)
        return (
          <Badge
            variant="outline"
            className={cn(
              'border-transparent',
              governance.tone === 'accent'
                ? 'bg-[hsl(var(--workbench-accent))]/10 text-[hsl(var(--workbench-accent))]'
                : governance.tone === 'warning'
                  ? 'bg-[hsl(var(--semantic-warn))]/10 text-[hsl(var(--semantic-warn))]'
                  : 'bg-[hsl(var(--workbench-panel))] text-[hsl(var(--workbench-muted-foreground))]',
            )}
          >
            {governance.label}
          </Badge>
        )
      },
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
  const catalogHealth = getCatalogHealth(activeCatalog, domains)
  const canDeleteCatalog = Boolean(activeCatalog && activeCatalog.code !== 'default' && activeCatalog.domain_count === 0)
  const summary: SemanticValidationSummary = {
    status: catalogHealth.tone === 'warn' ? 'blocked' : 'ready',
    title: catalogHealth.title,
    description: catalogHealth.description,
    blockers: catalogHealth.tone === 'warn' ? [catalogHealth.description] : [],
    hints: [
      lens === 'all' ? '全部领域' : lens === 'empty' ? '空领域透镜' : lens === 'draft' ? '草稿透镜' : 'Join 缺失透镜',
    ],
  }

  return (
    <SemanticPageShell>
      <SemanticPageHeader
        title="领域目录"
        description="围绕目录治理领域结构，先判断目录健康度，再继续进入画布完成建模闭环。"
        status="ready"
        eyebrow="Domain Catalog"
        meta={
          <>
            <Badge variant="outline" className="border-transparent bg-[hsl(var(--workbench-panel))] text-[hsl(var(--workbench-muted-foreground))]">{activeCatalog?.name || '未选择目录'}</Badge>
            <Badge variant="outline" className="border-transparent bg-[hsl(var(--workbench-panel))] text-[hsl(var(--workbench-muted-foreground))]">{totalDomains} 个领域</Badge>
            <Badge variant="outline" className="border-transparent bg-[hsl(var(--workbench-panel))] text-[hsl(var(--workbench-muted-foreground))]">{activeCatalog?.draft_count || 0} 个草稿</Badge>
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

      <SemanticStatusBanner
        summary={summary}
        primaryAction={{
          label: '进入领域建模',
          href: '/semantic/modeling',
          icon: <GitBranch className="mr-1.5 h-4 w-4" />,
        }}
      />

      <SemanticWorkbenchContextBar
        items={[
          { label: '当前目录', value: activeCatalog?.name || '未选择', tone: 'default' },
          { label: '领域数', value: totalDomains, tone: 'default' },
          { label: '草稿数', value: activeCatalog?.draft_count || 0, tone: activeCatalog?.draft_count ? 'warning' : 'default' },
          { label: '治理透镜', value: lens === 'all' ? '全部' : lens === 'empty' ? '空领域' : lens === 'draft' ? '草稿积压' : 'Join 缺失', tone: lens === 'all' ? 'default' : 'accent' },
        ]}
        actions={(
          <Button asChild variant="outline" className="rounded-full border-[hsl(var(--workbench-outline))] bg-white px-4">
            <Link to="/semantic/modeling">
              <GitBranch className="mr-1.5 h-4 w-4" />
              去领域建模
            </Link>
          </Button>
        )}
        testId="domain-list-context-bar"
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
                    updateQueryParams({
                      catalog: catalog.code,
                      page: undefined,
                    })
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
                    <span className="rounded-full bg-[hsl(var(--workbench-surface-2))] px-2.5 py-1">{catalog.draft_count} 个草稿</span>
                    {catalog.domain_count === 0 ? (
                      <span className="rounded-full bg-[hsl(var(--semantic-warn))]/10 px-2.5 py-1 text-[hsl(var(--semantic-warn))]">空目录</span>
                    ) : null}
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
                  当前页展示 {filteredDomains.length} / {totalDomains}，目录切换、治理透镜和分页状态都会保留在 URL 中。
                </p>
              </div>
              <div className="flex w-full max-w-[42rem] flex-col gap-3">
                <div className="flex flex-wrap gap-2" data-testid="domain-governance-lens">
                  {([
                    { value: 'all', label: '全部' },
                    { value: 'empty', label: '空领域' },
                    { value: 'draft', label: '草稿积压' },
                    { value: 'join_gap', label: 'Join 缺失' },
                  ] as const).map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => {
                        updateQueryParams({
                          lens: item.value === 'all' ? undefined : item.value,
                          page: undefined,
                        })
                      }}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-sm transition-colors',
                        lens === item.value
                          ? 'border-[hsl(var(--workbench-accent))]/20 bg-[hsl(var(--workbench-accent-soft))] text-[hsl(var(--workbench-accent))]'
                          : 'border-[hsl(var(--workbench-outline))] bg-white text-[hsl(var(--workbench-muted-foreground))]',
                      )}
                      data-testid={`domain-governance-lens-${item.value}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="relative w-full max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--workbench-muted-foreground))]" />
                  <Input
                    name="domain_search"
                    autoComplete="off"
                    value={search}
                    onChange={(event) => {
                      updateQueryParams({
                        q: event.target.value || undefined,
                        page: undefined,
                      })
                    }}
                    placeholder="搜索领域名称、编码或说明…"
                    className="h-10 rounded-xl border-[hsl(var(--workbench-outline))] bg-white pl-9"
                    data-testid="domain-list-search"
                  />
                </div>
              </div>
            </div>

            <div className="grid xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="min-w-0 border-b border-[hsl(var(--workbench-outline))] p-5 xl:border-b-0 xl:border-r">
                <DataTable
                  columns={domainColumns}
                  data={filteredDomains}
                  rowKey={(record) => domainKey(record)}
                  emptyText={trimmedSearch ? '当前目录下没有命中搜索条件的领域。' : lens === 'all' ? '当前目录下还没有可浏览的领域。' : '当前治理透镜下没有命中的领域。'}
                  onRow={(record) => ({
                    onClick: () => {
                      updateQueryParams({
                        selected: domainKey(record),
                        panel: 'domain',
                      })
                    },
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
                <div className="inline-flex rounded-[var(--workbench-radius-sm)] bg-[hsl(var(--workbench-surface-2))] p-1">
                  <button
                    type="button"
                    onClick={() => setPanelMode('catalog')}
                    className={panelMode === 'catalog'
                      ? 'rounded-[var(--workbench-radius-sm)] bg-white px-3 py-1.5 text-sm font-medium text-[hsl(var(--workbench-ink))]'
                      : 'rounded-[var(--workbench-radius-sm)] px-3 py-1.5 text-sm text-[hsl(var(--workbench-muted-foreground))]'}
                    data-testid="domain-panel-catalog"
                  >
                    目录摘要
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedDomain) return
                      setPanelMode('domain')
                    }}
                    className={panelMode === 'domain'
                      ? 'rounded-[var(--workbench-radius-sm)] bg-white px-3 py-1.5 text-sm font-medium text-[hsl(var(--workbench-ink))]'
                      : 'rounded-[var(--workbench-radius-sm)] px-3 py-1.5 text-sm text-[hsl(var(--workbench-muted-foreground))]'}
                    disabled={!selectedDomain}
                    data-testid="domain-panel-domain"
                  >
                    当前领域
                  </button>
                </div>

                {panelMode === 'catalog' || !selectedDomain ? (
                  <div className="space-y-5" data-testid="catalog-summary-panel">
                    <div className="rounded-[var(--workbench-radius)] border border-[hsl(var(--workbench-outline))] bg-white/92 px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--workbench-muted-foreground))]">
                            当前目录
                          </div>
                          <h2 className="mt-2 truncate text-[1.22rem] font-semibold text-[hsl(var(--workbench-ink))]" data-semantic-display="true">
                            {activeCatalog?.name || '未选择目录'}
                          </h2>
                          <div className="mt-1 truncate font-mono text-xs text-[hsl(var(--workbench-muted-foreground))]">{activeCatalog?.code || '—'}</div>
                        </div>
                        {activeCatalog ? (
                          <Badge
                            variant={statusVariant(activeCatalog.status)}
                            className={cn(
                              'border-transparent',
                              activeCatalog.status === 'active'
                                ? 'bg-[hsl(var(--workbench-accent))]/10 text-[hsl(var(--workbench-accent))]'
                                : 'bg-[hsl(var(--workbench-panel))] text-[hsl(var(--workbench-muted-foreground))]',
                            )}
                          >
                            {getSemanticStatusLabel(activeCatalog.status)}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-4 text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">
                        {activeCatalog?.description || '当前目录还没有补充说明。'}
                      </div>
                    </div>

                    <div
                      className={cn(
                        'rounded-[var(--workbench-radius)] border px-4 py-4 text-sm leading-6',
                        catalogHealth.tone === 'ok'
                          ? 'border-[hsl(var(--semantic-ok))]/20 bg-[hsl(var(--semantic-ok))]/8 text-[hsl(var(--semantic-ok))]'
                          : catalogHealth.tone === 'warn'
                            ? 'border-[hsl(var(--semantic-warn))]/20 bg-[hsl(var(--semantic-warn))]/8 text-[hsl(var(--workbench-ink))]'
                            : 'border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface-2))] text-[hsl(var(--workbench-ink))]',
                      )}
                    >
                      <div className="text-sm font-semibold">{catalogHealth.title}</div>
                      <div className="mt-2 text-[hsl(var(--workbench-muted-foreground))]">{catalogHealth.description}</div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      {[
                        { label: '领域总数', value: String(activeCatalog?.domain_count || 0) },
                        { label: '草稿数', value: String(activeCatalog?.draft_count || 0) },
                        { label: '已发布', value: String(activeCatalog?.active_count || 0) },
                        { label: '当前透镜', value: lens === 'all' ? '全部' : lens === 'empty' ? '空领域' : lens === 'draft' ? '草稿积压' : 'Join 缺失' },
                      ].map((item) => (
                        <div key={item.label} className="rounded-[var(--workbench-radius-sm)] border border-[hsl(var(--workbench-outline))] bg-white/90 px-4 py-3">
                          <div className="text-[10px] uppercase tracking-[0.12em] text-[hsl(var(--workbench-muted-foreground))]">{item.label}</div>
                          <div className="mt-1.5 text-sm font-semibold text-[hsl(var(--workbench-ink))]">{item.value}</div>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button asChild className="rounded-full px-4 shadow-[0_12px_24px_rgba(67,97,238,0.12)]">
                        <Link to="/semantic/modeling">
                          <GitBranch className="mr-1.5 h-4 w-4" />
                          去领域建模
                        </Link>
                      </Button>
                      {selectedDomain ? (
                        <Button asChild variant="outline" className="rounded-full border-[hsl(var(--workbench-outline))] bg-white/88 px-4">
                          <Link to={`/semantic/domains/${domainKey(selectedDomain)}`}>
                            <PlusCircle className="mr-1.5 h-4 w-4" />
                            继续最近草稿
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-5" data-testid="domain-detail-panel">
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
                        <div key={item.label} className="rounded-[var(--workbench-radius-sm)] border border-[hsl(var(--workbench-outline))] bg-white/90 px-4 py-3">
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
          updateQueryParams({
            catalog: catalog.code,
            page: undefined,
          })
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
