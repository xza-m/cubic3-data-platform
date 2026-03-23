import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Blocks, Bug, FileCode, FolderTree, GitBranch, Layers3, RefreshCw } from 'lucide-react'
import { listCubes, listDomainCatalogs, listDomains, listViews } from '@/api/semantic'
import { useUrlState } from '@/hooks/useUrlState'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CompileDebugTab } from '@/components/Semantic/DevTools/CompileDebugTab'
import { SchemaSyncTab } from '@/components/Semantic/DevTools/SchemaSyncTab'
import { YamlEditorTab } from '@/components/Semantic/DevTools/YamlEditorTab'
import {
  SemanticEmptyState,
  SemanticPageHeader,
  SemanticPageShell,
  SemanticSurface,
} from '@/components/Semantic/workbench'
import { getSemanticStatusLabel } from '@/lib/semantic-status'
import { buildSemanticSelection, type SemanticObjectKind, type SemanticSelectionState } from '@/lib/semantic-workbench'
import { cn } from '@/lib/utils'

const tabMeta = {
  editor: {
    title: '定义文件',
    icon: FileCode,
  },
  compiler: {
    title: '编译调试',
    icon: Bug,
  },
  sync: {
    title: 'Schema 同步',
    icon: RefreshCw,
  },
} as const

type IdeTab = keyof typeof tabMeta

function IdeSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-20 rounded-2xl" />
      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <Skeleton className="h-[42rem] rounded-2xl" />
        <Skeleton className="h-[42rem] rounded-2xl" />
      </div>
    </div>
  )
}

function groupLabel(kind: SemanticObjectKind) {
  const labels: Record<SemanticObjectKind, string> = {
    catalog: 'Catalogs',
    domain: 'Domains',
    cube: 'Cubes',
    view: 'Views',
  }
  return labels[kind]
}

export default function DevTools() {
  const [tab, setTab] = useUrlState<IdeTab>('tab', 'editor')
  const [selectedKind, setSelectedKind] = useUrlState<SemanticObjectKind>('kind', 'cube')
  const [selectedCode, setSelectedCode] = useUrlState<string>('resource', '')
  const [selectedName, setSelectedName] = useUrlState<string>('file', '')

  const { data: catalogsData, isLoading: catalogsLoading } = useQuery({
    queryKey: ['semantic', 'catalogs'],
    queryFn: async () => (await listDomainCatalogs()).data,
  })
  const { data: domainsData, isLoading: domainsLoading } = useQuery({
    queryKey: ['semantic', 'domains'],
    queryFn: async () => (await listDomains()).data,
  })
  const { data: cubesData, isLoading: cubesLoading } = useQuery({
    queryKey: ['semantic', 'cubes'],
    queryFn: async () => (await listCubes()).data,
  })
  const { data: viewsData, isLoading: viewsLoading } = useQuery({
    queryKey: ['semantic', 'views'],
    queryFn: async () => (await listViews()).data,
  })

  const isLoading = catalogsLoading || domainsLoading || cubesLoading || viewsLoading
  const catalogs = catalogsData?.catalogs ?? []
  const domains = domainsData?.domains ?? []
  const cubes = cubesData?.cubes ?? []
  const views = viewsData?.views ?? []

  const selection = useMemo<SemanticSelectionState | null>(() => {
    if (selectedKind === 'cube') {
      const cube = cubes.find((item) => item.name === selectedCode || item.name === selectedName)
      return cube ? buildSemanticSelection('ide', 'cube', { name: cube.title, code: cube.name }) : null
    }
    if (selectedKind === 'view') {
      const view = views.find((item) => item.name === selectedCode || item.name === selectedName)
      return view ? buildSemanticSelection('ide', 'view', { name: view.title, code: view.name }) : null
    }
    if (selectedKind === 'domain') {
      const domain = domains.find((item) => String(item.id || item.code) === selectedCode || item.code === selectedCode)
      return domain ? buildSemanticSelection('ide', 'domain', { name: domain.name, code: String(domain.id || domain.code) }) : null
    }
    const catalog = catalogs.find((item) => item.code === selectedCode)
    return catalog ? buildSemanticSelection('ide', 'catalog', { name: catalog.name, code: catalog.code }) : null
  }, [catalogs, cubes, domains, selectedCode, selectedKind, selectedName, views])

  useEffect(() => {
    if (selectedCode) return
    if (cubes.length > 0) {
      setSelectedKind('cube')
      setSelectedCode(cubes[0].name)
      setSelectedName(cubes[0].name)
      return
    }
    if (views.length > 0) {
      setSelectedKind('view')
      setSelectedCode(views[0].name)
      setSelectedName(views[0].name)
      return
    }
    if (domains.length > 0) {
      const nextCode = String(domains[0].id || domains[0].code)
      setSelectedKind('domain')
      setSelectedCode(nextCode)
      return
    }
    if (catalogs.length > 0) {
      setSelectedKind('catalog')
      setSelectedCode(catalogs[0].code)
    }
  }, [catalogs, cubes, domains, selectedCode, setSelectedCode, setSelectedKind, setSelectedName, views])

  const current = tabMeta[tab]

  if (isLoading) {
    return <IdeSkeleton />
  }

  return (
    <SemanticPageShell>
      <SemanticPageHeader
        title="开发工具"
        description="用轻量 IDE 方式查看资源树、编辑定义文件，并执行编译调试与 Schema 治理。"
        status="ready"
        eyebrow="Dev Tools"
        meta={
          <>
            <Badge variant="outline" className="border-transparent bg-[hsl(var(--workbench-panel))] text-[hsl(var(--workbench-muted-foreground))]">{catalogs.length} 个目录</Badge>
            <Badge variant="outline" className="border-transparent bg-[hsl(var(--workbench-panel))] text-[hsl(var(--workbench-muted-foreground))]">{domains.length} 个领域</Badge>
            <Badge variant="outline" className="border-transparent bg-[hsl(var(--workbench-panel))] text-[hsl(var(--workbench-muted-foreground))]">{cubes.length} 个 Cube</Badge>
            <Badge variant="outline" className="border-transparent bg-[hsl(var(--workbench-panel))] text-[hsl(var(--workbench-muted-foreground))]">{views.length} 个 View</Badge>
          </>
        }
        actions={
          <Button variant="outline" asChild className="h-10 rounded-full border-[hsl(var(--workbench-outline))] bg-white/88 px-4">
            <Link to="/semantic/cubes">进入 Cube 模块</Link>
          </Button>
        }
      />

      <SemanticSurface bodyClassName="p-0">
        <div className="grid min-h-[42rem] xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="border-r border-[hsl(var(--workbench-outline))] bg-[rgba(249,251,254,0.82)]">
            <div className="border-b border-[hsl(var(--workbench-outline))] px-4 py-3.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--workbench-muted-foreground))]">
                Resources
              </div>
            </div>
            <div className="space-y-4 p-4">
              {([
              {
                kind: 'catalog',
                icon: FolderTree,
                items: catalogs.map((item) => ({
                  key: item.code,
                  label: item.name,
                  meta: `${item.domain_count} 个领域 · ${getSemanticStatusLabel(item.status)}`,
                })),
              },
              {
                kind: 'domain',
                icon: GitBranch,
                items: domains.map((item) => ({
                  key: String(item.id || item.code),
                  label: item.name,
                  meta: `${item.catalog_name || '默认目录'} · ${getSemanticStatusLabel(item.status)}`,
                })),
              },
              {
                kind: 'cube',
                icon: Blocks,
                items: cubes.map((item) => ({
                  key: item.name,
                  label: item.title,
                  meta: `${item.name} · ${getSemanticStatusLabel(item.status || 'draft')}`,
                })),
              },
              {
                kind: 'view',
                icon: Layers3,
                items: views.map((item) => ({
                  key: item.name,
                  label: item.title,
                  meta: item.name,
                })),
              },
            ] as const).map((group) => {
              const Icon = group.icon
              return (
                <div key={group.kind} className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-[0.12em] text-[hsl(var(--workbench-muted-foreground))]">
                    {groupLabel(group.kind)}
                  </div>
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const isActive = selectedKind === group.kind && selectedCode === item.key
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => {
                            setSelectedKind(group.kind)
                            setSelectedCode(item.key)
                            if (group.kind === 'cube' || group.kind === 'view') {
                              setSelectedName(item.key)
                            }
                            setTab(group.kind === 'cube' || group.kind === 'view' ? 'editor' : tab)
                          }}
                          className={cn(
                            'w-full rounded-[var(--workbench-radius-sm)] border px-3 py-2.5 text-left transition-colors',
                            isActive
                              ? 'border-[hsl(var(--workbench-accent))]/25 bg-[hsl(var(--workbench-accent-soft))]'
                              : 'border-transparent bg-white/68 hover:border-[hsl(var(--workbench-outline))] hover:bg-white',
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <Icon className="mt-0.5 h-4 w-4 text-[hsl(var(--workbench-muted-foreground))]" />
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-[hsl(var(--workbench-ink))]">{item.label}</div>
                              <div className="mt-1 truncate text-xs text-[hsl(var(--workbench-muted-foreground))]">{item.meta}</div>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            </div>
          </aside>

          <section className="bg-[rgba(255,255,255,0.9)]">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[hsl(var(--workbench-outline))] px-6 py-4">
              <div className="space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--workbench-muted-foreground))]">
                  Workspace
                </div>
                <div className="text-lg font-semibold text-[hsl(var(--workbench-ink))]">{current.title}</div>
              </div>
              {selection ? (
                <div className="rounded-[var(--workbench-radius-sm)] border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface-2))] px-3 py-2 text-right">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-[hsl(var(--workbench-muted-foreground))]">
                    当前对象
                  </div>
                  <div className="mt-1 text-sm font-semibold text-[hsl(var(--workbench-ink))]">{selection.name || '未命名对象'}</div>
                  <div className="mt-1 font-mono text-xs text-[hsl(var(--workbench-muted-foreground))]">{selection.code}</div>
                </div>
              ) : null}
            </div>

            <div className="px-6 py-5">
              <Tabs value={tab} onValueChange={(value) => setTab(value as IdeTab)}>
                <TabsList className="bg-[hsl(var(--workbench-surface-2))]">
                  <TabsTrigger value="editor">
                    <FileCode className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    定义文件
                  </TabsTrigger>
                  <TabsTrigger value="compiler">
                    <Bug className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    编译调试
                  </TabsTrigger>
                  <TabsTrigger value="sync">
                    <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    Schema 同步
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="editor">
                  {selectedKind === 'domain' || selectedKind === 'catalog' ? (
                    <div className="mt-4">
                      <SemanticEmptyState
                        icon={selectedKind === 'domain' ? <GitBranch className="h-6 w-6" /> : <FolderTree className="h-6 w-6" />}
                        title={`${selectedKind === 'domain' ? '领域' : '目录'}定义当前仍以可视化方式维护`}
                        description="当前后端只开放 Cube / View 的在线 YAML 编辑。领域和目录先纳入资源树索引，真实修改仍通过领域模块完成。"
                        action={
                          <Button asChild>
                            <Link to={selectedKind === 'domain' && selection?.code ? `/semantic/domains/${selection.code}` : '/semantic/domains'}>
                              打开领域模块
                            </Link>
                          </Button>
                        }
                      />
                    </div>
                  ) : (
                    <YamlEditorTab />
                  )}
                </TabsContent>
                <TabsContent value="compiler"><CompileDebugTab /></TabsContent>
                <TabsContent value="sync"><SchemaSyncTab /></TabsContent>
              </Tabs>
            </div>
          </section>
        </div>
      </SemanticSurface>
    </SemanticPageShell>
  )
}
