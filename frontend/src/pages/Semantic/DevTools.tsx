import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bug, FileCode, RefreshCw } from 'lucide-react'
import {
  listCubes,
  listDomainCatalogs,
  listDomains,
  listViews,
  type CubeSummary,
  type DomainCatalogSummary,
  type DomainSummary,
  type ViewSummary,
} from '@/api/semantic'
import { CompileDebugTab, type CompileDebugStatus } from '@/components/Semantic/DevTools/CompileDebugTab'
import { SchemaSyncTab } from '@/components/Semantic/DevTools/SchemaSyncTab'
import { SemanticEditorEmptyState } from '@/components/Semantic/DevTools/SemanticEditorEmptyState'
import { SemanticResourceTree, type SemanticResourceTreeGroup } from '@/components/Semantic/DevTools/SemanticResourceTree'
import { SemanticWorkspaceHeader } from '@/components/Semantic/DevTools/SemanticWorkspaceHeader'
import { YamlEditorTab, type YamlEditorFileType } from '@/components/Semantic/DevTools/YamlEditorTab'
import { SemanticPageHeader, SemanticPageShell, SemanticSurface } from '@/components/Semantic/workbench'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useUrlState } from '@/hooks/useUrlState'
import { getSemanticStatusLabel } from '@/lib/semantic-status'
import { buildSemanticSelection, type SemanticObjectKind } from '@/lib/semantic-workbench'

const tabMeta = {
  editor: {
    title: '定义文件',
    description: '当前区只承载对象定义、校验和保存，不再重复显示第二套文件树。',
  },
  compiler: {
    title: '编译调试',
    description: '先看结论，再看步骤日志和 SQL 结果，避免一开始陷入长日志。',
  },
  sync: {
    title: 'Schema 同步',
    description: '把漂移结果收敛成可扫描的问题列表和建议动作，而不是大段说明。',
  },
} as const

type IdeTab = keyof typeof tabMeta

type SelectedResource =
  | {
      kind: 'catalog'
      name: string
      code: string
      pathLabel: string
      objectTypeLabel: string
      schemaLabel: string
      schemaTone: 'default' | 'accent' | 'warning'
      editorType: null
      editorSupported: false
      actionHref: string
      highlightObjectName: null
    }
  | {
      kind: 'domain'
      name: string
      code: string
      pathLabel: string
      objectTypeLabel: string
      schemaLabel: string
      schemaTone: 'default' | 'accent' | 'warning'
      editorType: null
      editorSupported: false
      actionHref: string
      highlightObjectName: string
    }
  | {
      kind: 'cube'
      name: string
      code: string
      pathLabel: string
      objectTypeLabel: string
      schemaLabel: string
      schemaTone: 'default' | 'accent' | 'warning'
      editorType: YamlEditorFileType
      editorSupported: true
      actionHref: string
      highlightObjectName: string
    }
  | {
      kind: 'view'
      name: string
      code: string
      pathLabel: string
      objectTypeLabel: string
      schemaLabel: string
      schemaTone: 'default' | 'accent' | 'warning'
      editorType: YamlEditorFileType
      editorSupported: true
      actionHref: string
      highlightObjectName: string
    }

function IdeSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-20 rounded-2xl" />
      <Skeleton className="h-16 rounded-2xl" />
      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <Skeleton className="h-[42rem] rounded-2xl" />
        <Skeleton className="h-[42rem] rounded-2xl" />
      </div>
    </div>
  )
}

function getKindLabel(kind: SemanticObjectKind) {
  const labels: Record<SemanticObjectKind, string> = {
    catalog: 'Catalog',
    domain: 'Domain',
    cube: 'Cube',
    view: 'View',
  }
  return labels[kind]
}

function getSyncMeta(status?: string | null) {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'ok' || normalized === 'active') {
    return { label: '正常', tone: 'accent' as const }
  }
  if (normalized === 'warn' || normalized === 'draft') {
    return { label: '待处理', tone: 'warning' as const }
  }
  if (normalized === 'error') {
    return { label: '异常', tone: 'warning' as const }
  }
  return { label: '未记录', tone: 'default' as const }
}

function buildResourceGroups({
  catalogs,
  domains,
  cubes,
  views,
  keyword,
}: {
  catalogs: DomainCatalogSummary[]
  domains: DomainSummary[]
  cubes: CubeSummary[]
  views: ViewSummary[]
  keyword: string
}): SemanticResourceTreeGroup[] {
  const matches = (values: Array<string | null | undefined>) => {
    if (!keyword) return true
    return values.some((value) => String(value || '').toLowerCase().includes(keyword))
  }

  return [
    {
      kind: 'catalog',
      label: 'Catalog',
      count: catalogs.length,
      items: catalogs
        .filter((item) => matches([item.name, item.code, item.description]))
        .map((item) => ({
          key: item.code,
          label: item.name,
          meta: `${item.domain_count} 个领域 · 草稿 ${item.draft_count}`,
        })),
    },
    {
      kind: 'domain',
      label: 'Domain',
      count: domains.length,
      items: domains
        .filter((item) => matches([item.name, item.code, item.catalog_name]))
        .map((item) => ({
          key: String(item.id || item.code),
          label: item.name,
          meta: `${item.catalog_name || '默认目录'} · ${getSemanticStatusLabel(item.status)}`,
        })),
    },
    {
      kind: 'cube',
      label: 'Cube',
      count: cubes.length,
      items: cubes
        .filter((item) => matches([item.title, item.name, item.domain_name, item.description]))
        .map((item) => ({
          key: item.name,
          label: item.title,
          meta: `${item.name} · ${getSemanticStatusLabel(item.status || 'draft')}`,
        })),
    },
    {
      kind: 'view',
      label: 'View',
      count: views.length,
      items: views
        .filter((item) => matches([item.title, item.name, item.description]))
        .map((item) => ({
          key: item.name,
          label: item.title,
          meta: `${item.name} · ${item.public ? '公开' : '私有'}`,
        })),
    },
  ]
}

export default function DevTools() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab] = useUrlState<IdeTab>('tab', 'editor')
  const [selectedKind] = useUrlState<SemanticObjectKind>('kind', 'cube')
  const [selectedCode] = useUrlState<string>('resource', '')
  const [selectedName] = useUrlState<string>('file', '')
  const [resourceSearch] = useUrlState<string>('q', '')
  const [compileStatus, setCompileStatus] = useState<CompileDebugStatus>({ state: 'idle', label: '未执行', lastRunAt: null })
  const [editorDirty, setEditorDirty] = useState(false)

  const updateQueryParams = useCallback((updates: Record<string, string | undefined>) => {
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
  }, [setSearchParams])

  const setTabValue = useCallback((value: IdeTab) => {
    updateQueryParams({ tab: value === 'editor' ? undefined : value })
  }, [updateQueryParams])

  const handleSelectResource = useCallback((kind: SemanticObjectKind, key: string) => {
    updateQueryParams({
      kind: kind === 'cube' ? undefined : kind,
      resource: key,
      file: kind === 'cube' || kind === 'view' ? key : undefined,
    })
  }, [updateQueryParams])

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

  useEffect(() => {
    if (selectedCode) return
    if (cubes.length > 0) {
      updateQueryParams({ kind: undefined, resource: cubes[0].name, file: cubes[0].name })
      return
    }
    if (views.length > 0) {
      updateQueryParams({ kind: 'view', resource: views[0].name, file: views[0].name })
      return
    }
    if (domains.length > 0) {
      updateQueryParams({ kind: 'domain', resource: String(domains[0].id || domains[0].code), file: undefined })
      return
    }
    if (catalogs.length > 0) {
      updateQueryParams({ kind: 'catalog', resource: catalogs[0].code, file: undefined })
    }
  }, [catalogs, cubes, domains, selectedCode, updateQueryParams, views])

  useEffect(() => {
    setEditorDirty(false)
  }, [selectedCode, selectedKind, selectedName])

  const selection = useMemo(() => {
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

  const selectedResource = useMemo<SelectedResource | null>(() => {
    if (selectedKind === 'cube') {
      const cube = cubes.find((item) => item.name === selectedCode || item.name === selectedName)
      if (!cube) return null
      const syncMeta = getSyncMeta(cube.state_summary?.sync_status || cube.sync_status)
      return {
        kind: 'cube',
        name: cube.title,
        code: cube.name,
        pathLabel: `Cube / ${cube.name}`,
        objectTypeLabel: 'Cube',
        schemaLabel: syncMeta.label,
        schemaTone: syncMeta.tone,
        editorType: 'cubes',
        editorSupported: true,
        actionHref: `/semantic/cubes/${cube.name}`,
        highlightObjectName: cube.name,
      }
    }
    if (selectedKind === 'view') {
      const view = views.find((item) => item.name === selectedCode || item.name === selectedName)
      if (!view) return null
      return {
        kind: 'view',
        name: view.title,
        code: view.name,
        pathLabel: `View / ${view.name}`,
        objectTypeLabel: 'View',
        schemaLabel: '仅发布后可检测',
        schemaTone: 'default',
        editorType: 'views',
        editorSupported: true,
        actionHref: `/semantic/views/${view.name}`,
        highlightObjectName: view.name,
      }
    }
    if (selectedKind === 'domain') {
      const domain = domains.find((item) => String(item.id || item.code) === selectedCode || item.code === selectedCode)
      if (!domain) return null
      const syncMeta = getSyncMeta(domain.state_summary?.sync_status)
      return {
        kind: 'domain',
        name: domain.name,
        code: String(domain.id || domain.code),
        pathLabel: `Domain / ${domain.code}`,
        objectTypeLabel: 'Domain',
        schemaLabel: syncMeta.label,
        schemaTone: syncMeta.tone,
        editorType: null,
        editorSupported: false,
        actionHref: `/semantic/domains/${domain.id || domain.code}`,
        highlightObjectName: domain.code,
      }
    }
    const catalog = catalogs.find((item) => item.code === selectedCode)
    if (!catalog) return null
    const syncMeta = getSyncMeta(catalog.status)
    return {
      kind: 'catalog',
      name: catalog.name,
      code: catalog.code,
      pathLabel: `Catalog / ${catalog.code}`,
      objectTypeLabel: 'Catalog',
      schemaLabel: syncMeta.label,
      schemaTone: syncMeta.tone,
      editorType: null,
      editorSupported: false,
      actionHref: '/semantic/domains',
      highlightObjectName: null,
    }
  }, [catalogs, cubes, domains, selectedCode, selectedKind, selectedName, views])

  const resourceGroups = useMemo(() => buildResourceGroups({
    catalogs,
    domains,
    cubes,
    views,
    keyword: resourceSearch.trim().toLowerCase(),
  }), [catalogs, cubes, domains, resourceSearch, views])

  const currentTabMeta = tabMeta[tab]
  const workspaceTitle = selectedResource?.name || '请选择对象'
  const workspaceDescription = selectedResource
    ? `${selectedResource.pathLabel}。${currentTabMeta.description}`
    : currentTabMeta.description

  const workspaceItems = useMemo(() => [
    { label: '对象类型', value: selection ? getKindLabel(selection.kind) : '未选择', tone: 'default' as const },
    { label: 'Schema 状态', value: selectedResource?.schemaLabel || '未记录', tone: selectedResource?.schemaTone || 'default' as const },
    tab === 'compiler'
      ? {
          label: '最近编译',
          value: compileStatus.lastRunAt ? `${compileStatus.label} · ${compileStatus.lastRunAt}` : compileStatus.label,
          tone: compileStatus.state === 'error' ? 'warning' as const : compileStatus.state === 'success' ? 'accent' as const : 'default' as const,
        }
      : tab === 'editor'
      ? {
          label: selectedResource?.editorSupported ? '编辑状态' : '维护方式',
          value: selectedResource?.editorSupported ? (editorDirty ? '有未保存修改' : '未修改') : '可视化维护',
          tone: editorDirty ? 'warning' as const : 'default' as const,
        }
      : {
          label: '当前工作区',
          value: currentTabMeta.title,
          tone: 'accent' as const,
        },
  ], [compileStatus.label, compileStatus.lastRunAt, compileStatus.state, currentTabMeta.title, editorDirty, selectedResource, selection, tab])

  if (isLoading) {
    return <IdeSkeleton />
  }

  return (
    <SemanticPageShell>
      <SemanticPageHeader
        title="开发工具"
        description="用轻量 IDE 方式切换语义对象、查看定义文件、执行编译调试，并集中处理 Schema 同步问题。"
        status="ready"
        eyebrow="Dev Tools"
        meta={(
          <>
            <Badge variant="outline" className="border-transparent bg-[hsl(var(--workbench-panel))] text-[hsl(var(--workbench-muted-foreground))]">{catalogs.length} 个目录</Badge>
            <Badge variant="outline" className="border-transparent bg-[hsl(var(--workbench-panel))] text-[hsl(var(--workbench-muted-foreground))]">{domains.length} 个领域</Badge>
            <Badge variant="outline" className="border-transparent bg-[hsl(var(--workbench-panel))] text-[hsl(var(--workbench-muted-foreground))]">{cubes.length} 个 Cube</Badge>
            <Badge variant="outline" className="border-transparent bg-[hsl(var(--workbench-panel))] text-[hsl(var(--workbench-muted-foreground))]">{views.length} 个 View</Badge>
          </>
        )}
        actions={(
          <Button variant="outline" asChild className="h-10 rounded-full border-[hsl(var(--workbench-outline))] bg-white/88 px-4">
            <Link to="/semantic/cubes">进入 Cube 模块</Link>
          </Button>
        )}
      />

      <SemanticSurface bodyClassName="p-0">
        <div className="grid min-h-[42rem] xl:grid-cols-[300px_minmax(0,1fr)]">
          <SemanticResourceTree
            search={resourceSearch}
            onSearchChange={(value) => updateQueryParams({ q: value || undefined })}
            groups={resourceGroups}
            selectedKind={selectedKind}
            selectedCode={selectedCode}
            onSelect={handleSelectResource}
          />

          <section className="bg-[rgba(255,255,255,0.9)]">
            <SemanticWorkspaceHeader
              title={workspaceTitle}
              description={workspaceDescription}
              items={workspaceItems}
              actions={(
                <div className="flex flex-wrap items-center gap-2">
                  {selectedResource ? (
                    <Button variant="outline" asChild className="rounded-full border-[hsl(var(--workbench-outline))] bg-white px-4">
                      <Link to={selectedResource.actionHref}>
                        {selectedResource.kind === 'domain'
                          ? '打开领域模块'
                          : selectedResource.kind === 'catalog'
                            ? '打开目录治理'
                            : '查看对象'}
                      </Link>
                    </Button>
                  ) : null}
                  {tab !== 'editor' && selectedResource?.editorSupported ? (
                    <Button variant="outline" onClick={() => setTabValue('editor')} className="rounded-full border-[hsl(var(--workbench-outline))] bg-white px-4">
                      <FileCode className="mr-1.5 h-4 w-4" />
                      定义文件
                    </Button>
                  ) : null}
                  {tab !== 'compiler' ? (
                    <Button variant="outline" onClick={() => setTabValue('compiler')} className="rounded-full border-[hsl(var(--workbench-outline))] bg-white px-4">
                      <Bug className="mr-1.5 h-4 w-4" />
                      编译调试
                    </Button>
                  ) : null}
                  {tab !== 'sync' ? (
                    <Button variant="outline" onClick={() => setTabValue('sync')} className="rounded-full border-[hsl(var(--workbench-outline))] bg-white px-4">
                      <RefreshCw className="mr-1.5 h-4 w-4" />
                      Schema 同步
                    </Button>
                  ) : null}
                </div>
              )}
              testId="devtools-workspace-header"
            />

            <div className="px-6 py-5">
              <div className="inline-flex rounded-[var(--workbench-radius-sm)] bg-[hsl(var(--workbench-surface-2))] p-1">
                {(['editor', 'compiler', 'sync'] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setTabValue(item)}
                    className={
                      item === tab
                        ? 'rounded-[var(--workbench-radius-sm)] bg-white px-4 py-2 text-sm font-medium text-[hsl(var(--workbench-ink))] shadow-[0_8px_24px_rgba(15,23,42,0.08)]'
                        : 'rounded-[var(--workbench-radius-sm)] px-4 py-2 text-sm text-[hsl(var(--workbench-muted-foreground))] transition-colors hover:text-[hsl(var(--workbench-ink))]'
                    }
                    data-testid={`devtools-tab-${item}`}
                  >
                    {tabMeta[item].title}
                  </button>
                ))}
              </div>

              {tab === 'editor' ? (
                selectedResource?.editorSupported ? (
                  <YamlEditorTab
                    fileType={selectedResource.editorType}
                    fileName={selectedResource.code}
                    onDirtyChange={setEditorDirty}
                  />
                ) : (
                  <SemanticEditorEmptyState kind={selectedKind === 'domain' ? 'domain' : 'catalog'} selectionCode={selectedCode} />
                )
              ) : null}

              {tab === 'compiler' ? (
                <CompileDebugTab onStatusChange={setCompileStatus} />
              ) : null}

              {tab === 'sync' ? (
                <SchemaSyncTab highlightObjectName={selectedResource?.highlightObjectName} />
              ) : null}
            </div>
          </section>
        </div>
      </SemanticSurface>
    </SemanticPageShell>
  )
}
