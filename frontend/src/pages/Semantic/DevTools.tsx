import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Link as LinkIcon, Upload } from 'lucide-react'
import { describeCube, type CubeDetail } from '@/api/semantic'
import { PythonPreviewTab } from '@/components/Semantic/DevTools/PythonPreviewTab'
import { SemanticEditorEmptyState } from '@/components/Semantic/DevTools/SemanticEditorEmptyState'
import { PlaygroundTab } from '@/components/Semantic/DevTools/PlaygroundTab'
import { SemanticResourceTree } from '@/components/Semantic/DevTools/SemanticResourceTree'
// SemanticWorkbenchContextBar removed — design spec shows no context bar
import { YamlEditorTab } from '@/components/Semantic/DevTools/YamlEditorTab'
// workbench wrappers removed — page uses direct layout matching design spec
import { Skeleton } from '@/components/ui/skeleton'
import { normalizeSemanticWorkbenchTab, useSemanticDevTools } from '@/hooks/semantic-ia'
import { useUrlState } from '@/hooks/useUrlState'
import type { SemanticObjectKind } from '@/lib/semantic-workbench'

const tabMeta = {
  editor: { title: 'YAML', description: '查看和维护对象定义文件。' },
  python: { title: 'PY', description: '查看 Python 版对象定义参考。' },
  sync: { title: '预览', description: '查看 DSL、SQL、编译结果与执行反馈。' },
} as const

type IdeTab = keyof typeof tabMeta

const COMPACT_VIEWPORT_QUERY = '(max-width: 1279px)'

function useCompactViewport() {
  const [isCompact, setIsCompact] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return

    const media = window.matchMedia(COMPACT_VIEWPORT_QUERY)
    const update = () => setIsCompact(media.matches)

    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return isCompact
}

function IdeSkeleton() {
  return (
    <div className="flex h-full flex-col" data-testid="devtools-screen">
      <div className="flex-1 overflow-auto rounded-xl bg-white shadow-[0_2px_24px_#0F172A08] xl:overflow-hidden">
        <div className="flex h-full flex-col xl:flex-row" data-testid="devtools-workbench-shell">
          <Skeleton className="h-24 rounded-none xl:h-[42rem] xl:w-[280px] xl:rounded-l-xl" />
          <div className="flex min-h-[28rem] flex-1 flex-col xl:h-[42rem]">
            <Skeleton className="h-14 rounded-none" />
            <Skeleton className="flex-1 rounded-none" />
          </div>
          <Skeleton className="h-28 rounded-none xl:h-[42rem] xl:w-[280px] xl:rounded-r-xl" />
        </div>
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
  const isCompactViewport = useCompactViewport()
  const [rawTab] = useUrlState<string>('tab', 'editor')
  const [selectedKind] = useUrlState<SemanticObjectKind>('kind', 'cube')
  const [selectedCode] = useUrlState<string>('resource', '')
  const [selectedName] = useUrlState<string>('file', '')
  const [resourceSearch] = useUrlState<string>('q', '')
  const [treeCollapsed, setTreeCollapsed] = useState(false)
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false)
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

  const tab = useMemo<IdeTab>(() => {
    if (rawTab === 'python') return 'python'
    return normalizeSemanticWorkbenchTab('workspace', rawTab, 'modeling') === 'preview'
      ? 'sync'
      : 'editor'
  }, [rawTab])

  const handleSelectResource = useCallback((kind: SemanticObjectKind, key: string) => {
    updateQueryParams({
      kind: kind === 'cube' ? undefined : kind,
      resource: key,
      file: kind === 'cube' || kind === 'view' || kind === 'recipe' ? key : undefined,
    })
  }, [updateQueryParams])

  const {
    cubes,
    selection,
    resolvedSelection,
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

  const normalizedSelection = resolvedSelection ?? {
    selectedKind,
    selectedCode,
    selectedName,
  }
  const targetSelection = useMemo(() => {
    if (resolvedSelection) {
      return {
        kind: resolvedSelection.selectedKind,
        resource: resolvedSelection.selectedCode,
        file: resolvedSelection.selectedName || undefined,
      }
    }

    if (!selectedCode && defaultSelection) {
      return defaultSelection
    }

    return null
  }, [defaultSelection, resolvedSelection, selectedCode])
  const selectionNeedsSync = useMemo(() => {
    if (!targetSelection) return false

    const expectedKind = targetSelection.kind
    const expectedResource = targetSelection.resource
    const expectedFile = targetSelection.file ?? ''

    return (
      selectedKind !== expectedKind
      || selectedCode !== expectedResource
      || selectedName !== expectedFile
    )
  }, [selectedCode, selectedKind, selectedName, targetSelection])
  const activeKind = selection?.kind ?? normalizedSelection.selectedKind
  const activeCode = selection?.code ?? normalizedSelection.selectedCode
  const activeName = selection?.name ?? normalizedSelection.selectedName
  const previewCube = useMemo(() => {
    if (selectedResource?.kind === 'cube') return selectedResource.code
    if (selection?.kind === 'cube') return selection.code
    if (defaultSelection?.kind === 'cube') return defaultSelection.resource
    return cubes[0]?.name
  }, [cubes, defaultSelection, selectedResource, selection])
  const hideCubeSelectInPreview = selectedResource?.kind === 'cube' || selection?.kind === 'cube'

  // Fetch cube detail for inspector panel
  const cubeDetailQuery = useQuery({
    queryKey: ['semantic', 'cube-detail', activeCode],
    queryFn: async () => (await describeCube(activeCode)).data,
    enabled: Boolean(activeCode && activeKind === 'cube'),
  })
  const cubeDetail: CubeDetail | undefined = cubeDetailQuery.data

  // Find the selected cube from cubes list as fallback
  const selectedCubeSummary = useMemo(
    () => cubes.find((c) => c.name === activeCode),
    [activeCode, cubes],
  )

  useEffect(() => {
    if (!targetSelection || !selectionNeedsSync) return

    updateQueryParams({
      kind: targetSelection.kind === 'cube' ? undefined : targetSelection.kind,
      resource: targetSelection.resource,
      file: targetSelection.file,
    })
  }, [selectionNeedsSync, targetSelection, updateQueryParams])

  useEffect(() => {
    if (isCompactViewport) {
      setTreeCollapsed(true)
      setInspectorCollapsed(true)
      return
    }

    setTreeCollapsed(false)
    setInspectorCollapsed(false)
  }, [isCompactViewport])

  const workspaceTitle = selectedResource?.name || activeName || '请选择对象'
  const cubeResourceGroups = useMemo(
    () => resourceGroups.filter((group) => group.kind === 'cube'),
    [resourceGroups],
  )

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

  if (isLoading || selectionNeedsSync) {
    return <IdeSkeleton />
  }

  return (
    <div className="flex h-full flex-col" data-testid="devtools-screen">
      <h1 className="sr-only">语义工作台</h1>
      <div className="flex-1 overflow-auto rounded-xl bg-white shadow-[0_2px_24px_#0F172A08] xl:overflow-hidden">
        <div className="flex h-full flex-col xl:flex-row" data-testid="devtools-workbench-shell">
            {/* ── Left Panel: Resource Tree ── */}
            <div className={treeCollapsed ? 'order-2 w-full xl:order-1 xl:h-full xl:w-[56px]' : 'order-2 w-full xl:order-1 xl:h-full xl:w-[240px]'} data-testid="devtools-tree-panel">
            <SemanticResourceTree
              search={resourceSearch}
              onSearchChange={(value) => updateQueryParams({ q: value || undefined })}
              groups={cubeResourceGroups}
              collapsed={treeCollapsed}
              onToggleCollapsed={() => setTreeCollapsed((current) => !current)}
              selectedCode={activeCode}
              onSelect={(_kind, key) => handleSelectResource('cube', key)}
            />
            </div>

            {/* ── Center Panel: Toolbar + Editor ── */}
            <section className="order-1 flex min-w-0 flex-1 flex-col border-b border-[hsl(var(--workbench-outline))] xl:order-2 xl:h-full xl:border-b-0 xl:border-x">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[hsl(var(--workbench-outline))] px-4 py-0 sm:px-5">
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
                  {(['editor', 'python', 'sync'] as const).map((item) => (
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
              <div className="flex-1 bg-[hsl(var(--workbench-surface))]">
                {tab === 'editor' ? (
                  selectedResource?.editorSupported ? (
                    <div className="h-full">
                      <YamlEditorTab
                        fileType={selectedResource.editorType}
                        fileName={selectedResource.code}
                        recipeMeta={selectedResource.recipeMeta}
                        onDirtyChange={() => undefined}
                      />
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center bg-[hsl(var(--workbench-surface))] px-6 py-5">
                      <SemanticEditorEmptyState kind={activeKind === 'domain' ? 'domain' : 'catalog'} selectionCode={activeCode} />
                    </div>
                  )
                ) : null}

                {tab === 'python' ? (
                  <div className="h-full overflow-auto px-6 py-5">
                    <PythonPreviewTab cube={cubeDetail} />
                  </div>
                ) : null}

                {tab === 'sync' ? (
                  <div className="h-full overflow-auto px-6 py-5">
                    <PlaygroundTab
                      preferredCube={previewCube}
                      hideCubeSelect={hideCubeSelectInPreview}
                    />
                  </div>
                ) : null}
              </div>
            </section>

            {/* ── Right Panel: Inspector ── */}
            <div className={inspectorCollapsed ? 'order-3 w-full xl:order-3 xl:h-full xl:w-[56px]' : 'order-3 w-full xl:order-3 xl:h-full xl:w-[280px]'} data-testid="devtools-inspector-wrapper">
            <aside className="flex flex-col gap-5 overflow-y-auto bg-[hsl(var(--workbench-surface))] p-4 sm:p-5 xl:h-full" data-testid="devtools-inspector-panel">
              {/* Header */}
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-bold text-[hsl(var(--workbench-ink))]">属性</span>
                <button
                  type="button"
                  onClick={() => setInspectorCollapsed((current) => !current)}
                  aria-label={inspectorCollapsed ? '展开属性面板' : '折叠属性面板'}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] shadow-sm"
                >
                  <ChevronRight className="h-3.5 w-3.5 text-[hsl(var(--workbench-muted-foreground))]" />
                </button>
              </div>

              {!inspectorCollapsed ? (
                <>
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
              {selectedResource && activeKind === 'cube' ? (
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
              {selectedResource && activeKind !== 'cube' ? (
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
                </>
              ) : null}
            </aside>
            </div>
          </div>
        </div>
      </div>
  )
}
