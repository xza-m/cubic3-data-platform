import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { describeCube, type CubeDetail } from '@/api/semantic'
import { PlaygroundTab } from '@/components/Semantic/DevTools/PlaygroundTab'
import { PythonPreviewTab } from '@/components/Semantic/DevTools/PythonPreviewTab'
import { SemanticEditorEmptyState } from '@/components/Semantic/DevTools/SemanticEditorEmptyState'
import { YamlEditorTab } from '@/components/Semantic/DevTools/YamlEditorTab'
import { WorkbenchHeader } from '@/components/Semantic/Workbench/WorkbenchHeader'
import { WorkbenchModelingTab } from '@/components/Semantic/Workbench/WorkbenchModelingTab'
import { WorkbenchStartPanel } from '@/components/Semantic/Workbench/WorkbenchStartPanel'
import { Skeleton } from '@/components/ui/skeleton'
import { useSemanticDevTools, useSemanticWorkbench } from '@/hooks/semantic-ia'
import type { SemanticObjectKind } from '@/lib/semantic-workbench'

type WorkspaceTab = 'modeling' | 'preview' | 'yaml' | 'python'

function WorkbenchSkeleton() {
  return (
    <div className="flex h-full flex-col gap-5" data-testid="devtools-screen">
      <Skeleton className="h-36 rounded-[28px]" />
      <Skeleton className="h-[34rem] rounded-[28px]" />
    </div>
  )
}

function resolveWorkspaceTab(rawTab: string | null, defaultTab: 'modeling' | 'preview'): WorkspaceTab {
  const normalized = String(rawTab || '').toLowerCase()

  if (normalized === 'python' || normalized === 'py') return 'python'
  if (normalized === 'yaml' || normalized === 'editor') return 'yaml'
  if (normalized === 'preview' || normalized === 'sync' || normalized === 'compiler') return 'preview'
  if (normalized === 'modeling') return 'modeling'

  return defaultTab
}

function resolveLegacyObjectTab(rawTab: string | null, fallback: WorkspaceTab = 'yaml'): WorkspaceTab {
  const normalized = String(rawTab || '').toLowerCase()

  if (normalized === 'python' || normalized === 'py') return 'python'
  if (normalized === 'preview' || normalized === 'sync' || normalized === 'compiler') return 'preview'
  if (normalized === 'modeling') return 'modeling'
  if (normalized === 'yaml' || normalized === 'editor') return 'yaml'

  return fallback
}

export default function DevTools() {
  const [searchParams, setSearchParams] = useSearchParams()
  const cubeName = searchParams.get('cube') ?? ''
  const requestedTab = searchParams.get('tab')
  const legacyKind = (searchParams.get('kind') as SemanticObjectKind | null) ?? null
  const legacyResource = searchParams.get('resource') ?? ''
  const legacyFile = searchParams.get('file') ?? ''
  const hasLegacyObjectQuery = Boolean(legacyKind || legacyResource || legacyFile)
  const previewRequested = ['preview', 'sync', 'compiler'].includes(String(requestedTab || '').toLowerCase())
  const {
    cubes,
    selectedResource,
    defaultSelection,
    isLoading,
  } = useSemanticDevTools({
    selectedKind: cubeName ? 'cube' : (legacyKind ?? 'cube'),
    selectedCode: cubeName || legacyResource,
    selectedName: cubeName || legacyFile || legacyResource,
    preserveLegacySelection: hasLegacyObjectQuery,
  })
  const fallbackCubeName = useMemo(() => {
    if (cubeName || hasLegacyObjectQuery || !previewRequested) return ''
    return defaultSelection?.kind === 'cube' ? defaultSelection.resource : ''
  }, [cubeName, defaultSelection, hasLegacyObjectQuery, previewRequested])
  const effectiveCubeName = cubeName
    || (hasLegacyObjectQuery && selectedResource?.kind === 'cube' ? selectedResource.code : '')
    || fallbackCubeName
  const currentCube = useMemo(
    () => cubes.find((cube) => cube.name === effectiveCubeName) ?? null,
    [cubes, effectiveCubeName],
  )
  const workbench = useSemanticWorkbench({
    currentCube: currentCube ? { name: currentCube.name, status: currentCube.status } : null,
    requestedTab,
  })
  const activeTab = useMemo<WorkspaceTab>(
    () => resolveWorkspaceTab(requestedTab, workbench.currentTab),
    [requestedTab, workbench.currentTab],
  )

  const detailCubeName = currentCube?.name || (selectedResource?.kind === 'cube' ? selectedResource.code : '')
  const cubeDetailQuery = useQuery({
    queryKey: ['semantic', 'cube-detail', detailCubeName],
    queryFn: async () => (await describeCube(detailCubeName)).data,
    enabled: Boolean(detailCubeName),
  })
  const legacyActiveTab = useMemo(
    () => resolveLegacyObjectTab(requestedTab),
    [requestedTab],
  )

  const draftCubes = useMemo(
    () => cubes.filter((cube) => String(cube.status || '').toLowerCase() === 'draft'),
    [cubes],
  )
  const publishedCubes = useMemo(
    () => cubes.filter((cube) => String(cube.status || '').toLowerCase() === 'active'),
    [cubes],
  )

  const updateTab = (tab: WorkspaceTab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('cube', currentCube?.name ?? cubeName)
      next.set('tab', tab)
      return next
    }, { replace: true })
  }

  if (isLoading) {
    return <WorkbenchSkeleton />
  }

  if (!currentCube) {
    if (hasLegacyObjectQuery && selectedResource) {
      return (
        <div className="flex h-full flex-col gap-5" data-testid="devtools-screen">
          <h1 className="sr-only">语义工作台</h1>
          <section className="overflow-hidden rounded-[28px] border border-[hsl(var(--workbench-outline))] bg-[linear-gradient(135deg,#071A2F_0%,#102A43_48%,#EDF6FF_180%)] shadow-[0_24px_60px_rgba(15,23,42,0.16)]">
            <div className="flex flex-col gap-4 px-5 py-5 text-white md:px-7 md:py-6">
              <div className="space-y-2">
                <div className="inline-flex items-center rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/78">
                  语义工作台
                </div>
                <div className="text-3xl font-semibold tracking-[-0.04em]">{selectedResource.name}</div>
                <div className="text-sm text-white/68">{selectedResource.pathLabel}</div>
              </div>
              <div className="inline-flex w-full flex-wrap items-center gap-2 rounded-[20px] border border-white/10 bg-white/8 p-2 backdrop-blur">
                {(['yaml', 'preview', 'python'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => {
                      setSearchParams((prev) => {
                        const next = new URLSearchParams(prev)
                        next.set('tab', tab)
                        return next
                      }, { replace: true })
                    }}
                    data-testid={`devtools-tab-${tab}`}
                    data-state={legacyActiveTab === tab ? 'active' : 'inactive'}
                    className={legacyActiveTab === tab
                      ? 'inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-medium text-slate-950'
                      : 'inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium text-white/72'}
                  >
                    {tab === 'yaml' ? 'YAML' : tab === 'preview' ? '预览' : 'PY'}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="min-h-0 flex-1 overflow-hidden rounded-[28px] border border-[hsl(var(--workbench-outline))] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,250,255,0.94))] shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
            <div className="h-full overflow-auto px-5 py-5 md:px-6 md:py-6">
              {legacyActiveTab === 'yaml' ? (
                selectedResource.editorSupported ? (
                  <YamlEditorTab
                    fileType={selectedResource.editorType}
                    fileName={selectedResource.code}
                    recipeMeta={selectedResource.recipeMeta}
                    onDirtyChange={() => undefined}
                  />
                ) : (
                  <SemanticEditorEmptyState
                    kind={selectedResource.kind === 'domain' ? 'domain' : 'catalog'}
                    selectionCode={selectedResource.code}
                  />
                )
              ) : null}

              {legacyActiveTab === 'preview' ? (
                <PlaygroundTab
                  preferredCube={selectedResource?.kind === 'cube'
                    ? selectedResource.code
                    : defaultSelection?.kind === 'cube'
                      ? defaultSelection.resource
                      : undefined}
                  hideCubeSelect={selectedResource?.kind === 'cube'}
                />
              ) : null}

              {legacyActiveTab === 'python' ? (
                <PythonPreviewTab cube={cubeDetailQuery.data} />
              ) : null}
            </div>
          </section>
        </div>
      )
    }

    return (
      <div className="flex h-full flex-col" data-testid="devtools-screen">
        <WorkbenchStartPanel
          draftCubes={draftCubes}
          publishedCubes={publishedCubes}
        />
      </div>
    )
  }

  const cubeDetail: CubeDetail | undefined = cubeDetailQuery.data

  return (
    <div className="flex h-full flex-col gap-5" data-testid="devtools-screen">
      <WorkbenchHeader
        cube={currentCube}
        activeTab={activeTab}
        onTabChange={updateTab}
      />

      <section className="min-h-0 flex-1 overflow-hidden rounded-[28px] border border-[hsl(var(--workbench-outline))] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,250,255,0.94))] shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
        <div className="h-full overflow-auto px-5 py-5 md:px-6 md:py-6">
          {activeTab === 'modeling' ? (
            <WorkbenchModelingTab cube={currentCube} cubeDetail={cubeDetail} />
          ) : null}

          {activeTab === 'preview' ? (
            <PlaygroundTab preferredCube={currentCube.name} hideCubeSelect />
          ) : null}

          {activeTab === 'yaml' ? (
            <YamlEditorTab
              fileType="cubes"
              fileName={currentCube.name}
              onDirtyChange={() => undefined}
            />
          ) : null}

          {activeTab === 'python' ? (
            <div className="pt-1">
              <PythonPreviewTab cube={cubeDetail} />
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
