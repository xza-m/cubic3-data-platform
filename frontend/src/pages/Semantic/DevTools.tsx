import { useCallback, useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle, ChevronRight, Link as LinkIcon, Upload } from 'lucide-react'
import { describeCube, type CubeDetail } from '@/api/semantic'
import { CompileDebugTab } from '@/components/Semantic/DevTools/CompileDebugTab'
import { SchemaSyncTab } from '@/components/Semantic/DevTools/SchemaSyncTab'
import { SemanticEditorEmptyState } from '@/components/Semantic/DevTools/SemanticEditorEmptyState'
import { SemanticResourceTree } from '@/components/Semantic/DevTools/SemanticResourceTree'
import { SemanticWorkbenchContextBar } from '@/components/Semantic/SemanticWorkbenchContextBar'
import { YamlEditorTab } from '@/components/Semantic/DevTools/YamlEditorTab'
import { SemanticPageHeader, SemanticPageShell, SemanticSurface } from '@/components/Semantic/workbench'
import { Skeleton } from '@/components/ui/skeleton'
import { useSemanticDevTools } from '@/hooks/semantic-ia'
import { useUrlState } from '@/hooks/useUrlState'
import type { SemanticObjectKind } from '@/lib/semantic-workbench'

const tabMeta = {
  editor: { title: 'YAML', description: '查看和维护对象定义文件。' },
  compiler: { title: '编译调试', description: '查看编译结果、执行日志和 SQL 输出。' },
  sync: { title: '预览', description: '查看 Schema 漂移、同步状态和建议动作。' },
} as const

type IdeTab = keyof typeof tabMeta

function IdeSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-20 rounded-2xl" />
      <Skeleton className="h-16 rounded-2xl" />
      <div className="grid gap-0 xl:grid-cols-[280px_minmax(0,1fr)_280px]">
        <Skeleton className="h-[42rem] rounded-l-2xl" />
        <Skeleton className="h-[42rem]" />
        <Skeleton className="h-[42rem] rounded-r-2xl" />
      </div>
    </div>
  )
}

function InspectorField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-[hsl(var(--workbench-muted-foreground))]">{label}</div>
      <div className="rounded-md bg-[hsl(var(--workbench-surface-2))] px-3 py-2">
        <span className={`text-[13px] text-[hsl(var(--workbench-ink))] ${mono ? 'font-mono' : ''}`}>
          {value || '—'}
        </span>
      </div>
    </div>
  )
}

function InspectorStat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-[10px] bg-[hsl(var(--workbench-surface-2))] px-3 py-3">
      <span className="text-[22px] font-semibold text-[hsl(var(--workbench-accent))]">{value}</span>
      <span className="text-[11px] text-[hsl(var(--workbench-muted-foreground))]">{label}</span>
    </div>
  )
}

function InspectorJoinItem({ name, joinType }: { name: string; joinType: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-[hsl(var(--workbench-surface-2))] px-3 py-2">
      <LinkIcon className="h-3.5 w-3.5 text-[hsl(var(--workbench-muted-foreground))]" />
      <span className="flex-1 text-[13px] text-[hsl(var(--workbench-ink))]">{name}</span>
      <span className="font-mono text-[10px] font-medium text-[hsl(var(--workbench-accent))]">
        {joinType.toUpperCase()}
      </span>
    </div>
  )
}

export default function DevTools() {
  const [, setSearchParams] = useSearchParams()
  const [tab] = useUrlState<IdeTab>('tab', 'editor')
  const [selectedKind] = useUrlState<SemanticObjectKind>('kind', 'cube')
  const [selectedCode] = useUrlState<string>('resource', '')
  const [selectedName] = useUrlState<string>('file', '')
  const [resourceSearch] = useUrlState<string>('q', '')
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
      file: kind === 'cube' || kind === 'view' || kind === 'recipe' ? key : undefined,
    })
  }, [updateQueryParams])

  const {
    cubes,
    views,
    recipes,
    selection,
    selectedResource,
    resourceGroups,
    defaultSelection,
    isLoading,
  } = useSemanticDevTools({
    keyword: resourceSearch,
    selectedKind,
    selectedCode,
    selectedName,
  })

  // Fetch cube detail for inspector panel
  const cubeDetailQuery = useQuery({
    queryKey: ['semantic', 'cube-detail', selectedCode],
    queryFn: async () => (await describeCube(selectedCode)).data,
    enabled: Boolean(selectedCode && selectedKind === 'cube'),
  })
  const cubeDetail: CubeDetail | undefined = cubeDetailQuery.data

  // Find the selected cube from cubes list as fallback
  const selectedCubeSummary = useMemo(
    () => cubes.find((c) => c.name === selectedCode),
    [cubes, selectedCode],
  )

  useEffect(() => {
    if (selectedCode) return
    if (defaultSelection) {
      updateQueryParams({
        kind: defaultSelection.kind === 'cube' ? undefined : defaultSelection.kind,
        resource: defaultSelection.resource,
        file: defaultSelection.file,
      })
    }
  }, [defaultSelection, selectedCode, updateQueryParams])

  const currentTabMeta = tabMeta[tab]
  const workspaceTitle = selectedResource?.name || '请选择对象'

  const workbenchContextItems = useMemo(() => [
    {
      label: '当前对象',
      value: selectedResource?.pathLabel || '未选择',
      tone: selectedResource ? 'default' as const : 'warning' as const,
    },
    {
      label: '当前标签页',
      value: currentTabMeta.title,
      tone: 'accent' as const,
    },
    {
      label: 'Schema 状态',
      value: selectedResource?.schemaLabel || '未记录',
      tone: selectedResource?.schemaTone || 'default',
    },
    {
      label: '资源规模',
      value: `${cubes.length} Cube / ${views.length} View / ${recipes.length} Recipe`,
      tone: 'default' as const,
    },
  ], [cubes.length, currentTabMeta.title, recipes.length, selectedResource, views.length])

  // Inspector data
  const inspectorMeasureCount = cubeDetail
    ? Object.keys(cubeDetail.measures).length
    : selectedCubeSummary?.measure_count ?? 0
  const inspectorDimensionCount = cubeDetail
    ? Object.keys(cubeDetail.dimensions).length
    : selectedCubeSummary?.dimension_count ?? 0
  const inspectorJoinCount = cubeDetail
    ? Object.keys(cubeDetail.joins).length
    : selectedCubeSummary?.join_count ?? 0
  const inspectorJoins = cubeDetail
    ? Object.entries(cubeDetail.joins).map(([key, join]) => ({ name: join.target_cube, joinType: join.type, key }))
    : []

  if (isLoading) {
    return <IdeSkeleton />
  }

  return (
    <SemanticPageShell>
      <SemanticPageHeader
        title="语义模型"
        description="查看语义对象定义、编译结果和 Schema 同步状态。"
        eyebrow={null}
      />

      <div className="space-y-4" data-testid="devtools-screen">
        <SemanticWorkbenchContextBar
          items={workbenchContextItems}
          testId="devtools-workbench-context-bar"
        />

        <SemanticSurface bodyClassName="p-0">
          <div className="grid min-h-[42rem] xl:grid-cols-[280px_minmax(0,1fr)_280px]">
            {/* ── Left Panel: Resource Tree ── */}
            <SemanticResourceTree
              search={resourceSearch}
              onSearchChange={(value) => updateQueryParams({ q: value || undefined })}
              groups={resourceGroups}
              selectedKind={selectedKind}
              selectedCode={selectedCode}
              onSelect={handleSelectResource}
            />

            {/* ── Center Panel: Toolbar + Editor ── */}
            <section className="flex min-w-0 flex-col border-x border-[hsl(var(--workbench-outline))]">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[hsl(var(--workbench-outline))] px-5 py-0">
                {/* Left: object name + sync badge */}
                <div className="flex items-center gap-3 py-3">
                  <span className="text-[15px] font-semibold text-[hsl(var(--workbench-ink))]">
                    {workspaceTitle}
                  </span>
                  {selectedResource ? (
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                        selectedResource.schemaTone === 'accent'
                          ? 'bg-[#F0FDF4] text-[#15803D]'
                          : selectedResource.schemaTone === 'warning'
                            ? 'bg-[hsl(var(--semantic-warn))]/10 text-[hsl(var(--semantic-warn))]'
                            : 'bg-[hsl(var(--workbench-surface-2))] text-[hsl(var(--workbench-muted-foreground))]'
                      }`}
                    >
                      {selectedResource.schemaTone === 'accent' ? (
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#22C55E]" />
                      ) : null}
                      {selectedResource.schemaLabel}
                    </span>
                  ) : null}
                </div>

                {/* Center: tab group */}
                <div className="flex items-center">
                  {(['editor', 'compiler', 'sync'] as const).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setTabValue(item)}
                      className={
                        item === tab
                          ? 'border-b-2 border-[hsl(var(--workbench-accent))] px-4 py-3 text-[13px] font-medium text-[hsl(var(--workbench-accent))]'
                          : 'px-4 py-3 text-[13px] text-[hsl(var(--workbench-muted-foreground))] transition-colors hover:text-[hsl(var(--workbench-ink))]'
                      }
                      data-testid={`devtools-tab-${item}`}
                    >
                      {tabMeta[item].title}
                    </button>
                  ))}
                </div>

                {/* Right: action buttons */}
                <div className="flex items-center gap-2 py-3">
                  {selectedResource?.editorSupported && tab === 'editor' ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[hsl(var(--workbench-outline))] px-4 py-2 text-[13px] font-medium text-[hsl(var(--workbench-ink))] transition-colors hover:bg-[hsl(var(--workbench-surface-2))]"
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      验证
                    </button>
                  ) : null}
                  {selectedResource ? (
                    <Link
                      to={selectedResource.actionHref}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[hsl(var(--workbench-accent))] px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      发布
                    </Link>
                  ) : null}
                </div>
              </div>

              {/* Editor Area */}
              <div className={`flex-1 ${tab === 'editor' ? 'bg-[#1E293B]' : 'bg-[rgba(255,255,255,0.9)]'}`}>
                {tab === 'editor' ? (
                  selectedResource?.editorSupported ? (
                    <div className="h-full [&_.monaco-editor]:!bg-[#1E293B] [&_.monaco-editor_.margin]:!bg-[#1E293B]">
                      <YamlEditorTab
                        fileType={selectedResource.editorType}
                        fileName={selectedResource.code}
                        recipeMeta={selectedResource.recipeMeta}
                        onDirtyChange={setEditorDirty}
                      />
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center bg-[rgba(255,255,255,0.9)]">
                      <SemanticEditorEmptyState kind={selectedKind === 'domain' ? 'domain' : 'catalog'} selectionCode={selectedCode} />
                    </div>
                  )
                ) : null}

                {tab === 'compiler' ? (
                  <div className="px-6 py-5">
                    <CompileDebugTab onStatusChange={setCompileStatus} />
                  </div>
                ) : null}

                {tab === 'sync' ? (
                  <div className="px-6 py-5">
                    <SchemaSyncTab highlightObjectName={selectedResource?.highlightObjectName} />
                  </div>
                ) : null}
              </div>
            </section>

            {/* ── Right Panel: Inspector ── */}
            <aside className="flex flex-col gap-5 overflow-y-auto bg-[hsl(var(--workbench-surface))] p-5" data-testid="devtools-inspector-panel">
              {/* Header */}
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-bold text-[hsl(var(--workbench-ink))]">属性</span>
                <div className="flex h-7 w-7 items-center justify-center rounded-full border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] shadow-sm">
                  <ChevronRight className="h-3.5 w-3.5 text-[hsl(var(--workbench-muted-foreground))]" />
                </div>
              </div>

              {/* Properties Section */}
              {selectedResource ? (
                <div className="space-y-4">
                  <InspectorField
                    label="模型名称"
                    value={cubeDetail?.title || selectedResource.name}
                  />
                  <InspectorField
                    label="数据源"
                    value={
                      cubeDetail?.source_binding_summary?.source_name
                      || (cubeDetail?.source_database ? `${cubeDetail.source_database}` : '')
                      || selectedCubeSummary?.source_database
                      || '—'
                    }
                  />
                  <InspectorField
                    label="SQL 表名"
                    value={cubeDetail?.table || selectedCubeSummary?.table || ''}
                    mono
                  />
                  <InspectorField
                    label="描述"
                    value={cubeDetail?.description || ''}
                  />
                </div>
              ) : (
                <div className="text-sm text-[hsl(var(--workbench-muted-foreground))]">
                  在左侧选择一个对象后查看属性。
                </div>
              )}

              {/* Divider */}
              {selectedResource ? (
                <div className="h-px bg-[hsl(var(--workbench-outline))]" />
              ) : null}

              {/* Stats Section */}
              {selectedResource && selectedKind === 'cube' ? (
                <div className="space-y-3">
                  <span className="text-[13px] font-semibold text-[hsl(var(--workbench-ink))]">模型统计</span>
                  <div className="grid grid-cols-3 gap-2">
                    <InspectorStat value={inspectorMeasureCount} label="度量" />
                    <InspectorStat value={inspectorDimensionCount} label="维度" />
                    <InspectorStat value={inspectorJoinCount} label="关联" />
                  </div>
                </div>
              ) : null}

              {/* Joins Section */}
              {inspectorJoins.length > 0 ? (
                <div className="space-y-2">
                  <span className="text-[13px] font-semibold text-[hsl(var(--workbench-ink))]">关联模型</span>
                  {inspectorJoins.map((join) => (
                    <InspectorJoinItem key={join.key} name={join.name} joinType={join.joinType} />
                  ))}
                </div>
              ) : null}

              {/* Non-cube resource info */}
              {selectedResource && selectedKind !== 'cube' ? (
                <div className="space-y-3">
                  <span className="text-[13px] font-semibold text-[hsl(var(--workbench-ink))]">对象信息</span>
                  <div className="grid grid-cols-2 gap-2">
                    <InspectorStat value={selection ? selectedResource.objectTypeLabel : '—'} label="类型" />
                    <InspectorStat value={selectedResource.schemaLabel} label="状态" />
                  </div>
                </div>
              ) : null}

              {/* Recipe meta */}
              {selectedResource?.recipeMeta ? (
                <div className="space-y-2">
                  <span className="text-[13px] font-semibold text-[hsl(var(--workbench-ink))]">Recipe 信息</span>
                  <div className="grid grid-cols-2 gap-2">
                    <InspectorStat value={selectedResource.recipeMeta.relatedCubes.length} label="关联 Cube" />
                    <InspectorStat value={selectedResource.recipeMeta.exampleCount} label="示例数" />
                  </div>
                  {selectedResource.recipeMeta.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedResource.recipeMeta.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-[hsl(var(--workbench-surface-2))] px-2.5 py-1 text-[10px] text-[hsl(var(--workbench-muted-foreground))]">
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </aside>
          </div>
        </SemanticSurface>
      </div>
    </SemanticPageShell>
  )
}
