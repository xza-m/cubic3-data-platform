import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from '@xyflow/react'
import ELK from 'elkjs/lib/elk.bundled.js'
import { ArrowRight, Layout, PlusCircle, Save, Wand2 } from 'lucide-react'
import {
  activateCube,
  createCube,
  createCubeDraftFromSource,
  deprecateCube,
  describeCube,
  getGraph,
  updateCube,
  type CubeDetail,
  type CubeDraftPayload,
  type GraphData,
} from '@/api/semantic'
import { getDataSources } from '@/api/datasources'
import { CubeNode } from '@/components/Semantic/CubeNode'
import { JoinEdge } from '@/components/Semantic/JoinEdge'
import { SyncStatusBadge, type SyncStatus } from '@/components/Semantic/SyncStatusBadge'
import { SchemaBrowser, useToast } from '@/components/business'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { fmtDate } from '@/lib/format'
import {
  buildCreateCubeDraftRequest,
  notifyCreateCubeFailure,
  type SelectedTable,
} from '@/lib/semantic-cube-draft'
import { getSemanticStatusLabel } from '@/lib/semantic-status'
import type { DataSource } from '@/types'
import type { TreeNode } from '@/components/business/SchemaBrowser/types'

import '@xyflow/react/dist/style.css'

const nodeTypes = { cube: CubeNode }
const edgeTypes = { join: JoinEdge }
const elk = new ELK()

export { buildCreateCubeDraftRequest, notifyCreateCubeFailure } from '@/lib/semantic-cube-draft'

export function resolveSelectedCubeId({
  name,
  draft,
  isCreateRoute,
}: {
  name?: string
  draft: CubeDraftPayload | null
  isCreateRoute: boolean
}) {
  if (name) {
    return name
  }
  if (!draft && !isCreateRoute) {
    return null
  }
  return undefined
}

export function buildLegacyCubeWorkbenchHref({
  name,
  pathname,
  search,
}: {
  name?: string
  pathname: string
  search?: string
}) {
  const params = new URLSearchParams(search || '')

  if (name) {
    params.set('cube', name)
    if (!params.get('tab')) {
      params.set('tab', 'modeling')
    }
  } else if (pathname.endsWith('/cubes/new')) {
    params.delete('cube')
    params.delete('tab')
  }

  const query = params.toString()
  return `/semantic/workbench${query ? `?${query}` : ''}`
}

export function LegacyCubeWorkbenchRedirect() {
  const { name } = useParams<{ name: string }>()
  const location = useLocation()

  return (
    <Navigate
      to={buildLegacyCubeWorkbenchHref({
        name,
        pathname: location.pathname,
        search: location.search,
      })}
      replace
    />
  )
}

async function layoutGraph(
  graphNodes: Node[],
  graphEdges: Edge[],
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  const elkGraph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '60',
      'elk.layered.spacing.nodeNodeBetweenLayers': '100',
    },
    children: graphNodes.map((n) => ({
      id: n.id,
      width: 208,
      height: 112,
    })),
    edges: graphEdges.map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })),
  }

  const result = await elk.layout(elkGraph)
  const positioned = graphNodes.map((n) => {
    const elkNode = result.children?.find((c) => c.id === n.id)
    return {
      ...n,
      position: { x: elkNode?.x ?? 0, y: elkNode?.y ?? 0 },
    }
  })

  return { nodes: positioned, edges: graphEdges }
}

function inferCubeType(node: GraphData['nodes'][number]): 'fact' | 'dimension' {
  return node.type || (node.measures > 2 ? 'fact' : 'dimension')
}

function panelTitle(
  draft: CubeDraftPayload | null,
  cube: CubeDetail | undefined,
  isEditMode: boolean,
): string {
  if (draft) return '创建 Cube 草稿'
  if (isEditMode) return '编辑 Cube'
  return cube?.title || 'Cube 详情'
}

function toSyncStatus(value: string | undefined): SyncStatus {
  return value === 'ok' || value === 'warn' || value === 'error' ? value : undefined
}

export default function RelationCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedCubeId, setSelectedCubeId] = useState<string | null>(null)
  const [selectedSource, setSelectedSource] = useState<string>('')
  const [selectedTable, setSelectedTable] = useState<SelectedTable | null>(null)
  const [draft, setDraft] = useState<CubeDraftPayload | null>(null)
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    status: 'active' as 'draft' | 'active' | 'deprecated' | string,
  })
  const { name } = useParams<{ name: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const reactFlowRef = useRef<ReactFlowInstance<Node, Edge> | null>(null)

  const isCreateRoute = location.pathname.endsWith('/semantic/cubes/new')
  const isEditMode = location.pathname.endsWith('/edit')
  const openPanel = Boolean(draft || selectedCubeId || name)

  const { data: graphData, isLoading } = useQuery({
    queryKey: ['semantic', 'graph'],
    queryFn: async () => (await getGraph()).data,
  })

  const { data: datasourceResp } = useQuery({
    queryKey: ['datasources', 'semantic-modeling'],
    queryFn: async () => (await getDataSources({ is_active: true, page_size: 200 })).data,
  })

  const datasources = datasourceResp?.items ?? []

  useEffect(() => {
    if (!selectedSource && datasources.length > 0) {
      setSelectedSource(String(datasources[0].id))
    }
  }, [datasources, selectedSource])

  const currentCubeName = draft?.name || selectedCubeId || name || null
  const { data: cubeDetail } = useQuery({
    queryKey: ['semantic', 'cube', currentCubeName],
    queryFn: async () => (await describeCube(currentCubeName!)).data as CubeDetail,
    enabled: !!currentCubeName && !draft,
  })

  useEffect(() => {
    if (!cubeDetail) return
    setEditForm({
      title: cubeDetail.title,
      description: cubeDetail.description || '',
      status: cubeDetail.status || 'active',
    })
  }, [cubeDetail])

  useEffect(() => {
    if (!cubeDetail?.source_id || draft) return
    const boundSource = String(cubeDetail.source_id)
    if (boundSource !== selectedSource) {
      setSelectedSource(boundSource)
    }
  }, [cubeDetail?.source_id, draft, selectedSource])

  useEffect(() => {
    setSelectedTable(null)
    setDraft(null)
    if (!name && !isEditMode && selectedCubeId) {
      const selectedNode = graphData?.nodes.find((node) => node.id === selectedCubeId)
      if (selectedNode?.source_id && String(selectedNode.source_id) !== selectedSource) {
        setSelectedCubeId(null)
      }
    }
  }, [selectedSource, graphData?.nodes, isEditMode, name, selectedCubeId])

  const filteredGraphData = useMemo(() => {
    if (!graphData) return null
    if (!selectedSource) return graphData

    const nodeIds = new Set(
      graphData.nodes
        .filter((node) => node.source_id && String(node.source_id) === selectedSource)
        .map((node) => node.id),
    )
    return {
      nodes: graphData.nodes.filter((node) => nodeIds.has(node.id)),
      edges: graphData.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)),
    }
  }, [graphData, selectedSource])

  const rawNodes = useMemo<Node[]>(() => {
    if (!filteredGraphData) return []
    return filteredGraphData.nodes.map((n) => ({
      id: n.id,
      type: 'cube',
      position: { x: 0, y: 0 },
      data: {
        name: n.id,
        title: n.title,
        type: inferCubeType(n),
        dimensions: n.dimensions,
        measures: n.measures,
        status: n.status,
        sourceBindingSummary: n.source_binding_summary,
        stateSummary: n.state_summary,
      },
    }))
  }, [filteredGraphData])

  const rawEdges = useMemo<Edge[]>(() => {
    if (!filteredGraphData) return []
    return filteredGraphData.edges.map((e, i) => ({
      id: `e-${i}-${e.source}-${e.target}`,
      source: e.source,
      target: e.target,
      type: 'join',
      data: {
        relationship: e.relationship,
        join_type: e.join_type,
      },
    }))
  }, [filteredGraphData])

  const fitCanvas = useCallback(() => {
    if (!reactFlowRef.current?.viewportInitialized) {
      return
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void reactFlowRef.current?.fitView({
          padding: 0.12,
          duration: 0,
          includeHiddenNodes: false,
        })
      })
    })
  }, [])

  const applyLayout = useCallback(async () => {
    if (rawNodes.length === 0) {
      setNodes([])
      setEdges([])
      return
    }

    const { nodes: layoutedNodes, edges: layoutedEdges } = await layoutGraph(rawNodes, rawEdges)
    setNodes(layoutedNodes)
    setEdges(layoutedEdges)
  }, [rawEdges, rawNodes, setEdges, setNodes])

  useEffect(() => {
    void applyLayout()
  }, [applyLayout])

  useEffect(() => {
    if (nodes.length === 0) {
      return
    }

    fitCanvas()
  }, [fitCanvas, nodes])

  useEffect(() => {
    const nextSelectedCubeId = resolveSelectedCubeId({ name, draft, isCreateRoute })
    if (nextSelectedCubeId !== undefined) {
      setSelectedCubeId(nextSelectedCubeId)
    }
  }, [name, draft, isCreateRoute])

  const createDraftMutation = useMutation({
    mutationFn: async () => {
      return (
        await createCubeDraftFromSource(buildCreateCubeDraftRequest(selectedSource, selectedTable))
      ).data
    },
    onSuccess: (payload) => {
      setDraft(payload)
      toast({ title: 'Cube 草稿已生成' })
    },
    onError: (err) => {
      toast({ title: '生成草稿失败', description: (err as Error).message, variant: 'destructive' })
    },
  })

  const createCubeMutation = useMutation({
    mutationFn: async (payload: CubeDraftPayload) => (await createCube(payload)).data,
    onSuccess: async (payload) => {
      toast({ title: 'Cube 创建成功' })
      setDraft(null)
      await queryClient.invalidateQueries({ queryKey: ['semantic'] })
      navigate(`/semantic/cubes/${payload.name}`)
    },
    onError: (err) => {
      notifyCreateCubeFailure({ toast, error: err })
    },
  })

  const updateCubeMutation = useMutation({
    mutationFn: async (payload: Partial<CubeDraftPayload>) => {
      if (!currentCubeName) throw new Error('缺少 Cube 名称')
      return (await updateCube(currentCubeName, payload)).data
    },
    onSuccess: async (payload) => {
      toast({ title: 'Cube 更新成功' })
      await queryClient.invalidateQueries({ queryKey: ['semantic'] })
      navigate(`/semantic/cubes/${payload.name}`)
    },
    onError: (err) => {
      toast({ title: '更新 Cube 失败', description: (err as Error).message, variant: 'destructive' })
    },
  })

  const activateMutation = useMutation({
    mutationFn: async (cubeName: string) => (await activateCube(cubeName)).data,
    onSuccess: async (payload) => {
      toast({ title: `Cube 已激活: ${payload.title}` })
      await queryClient.invalidateQueries({ queryKey: ['semantic'] })
    },
    onError: (err) => {
      toast({ title: '激活失败', description: (err as Error).message, variant: 'destructive' })
    },
  })

  const deprecateMutation = useMutation({
    mutationFn: async (cubeName: string) => (await deprecateCube(cubeName)).data,
    onSuccess: async (payload) => {
      toast({ title: `Cube 已弃用: ${payload.title}` })
      await queryClient.invalidateQueries({ queryKey: ['semantic'] })
    },
    onError: (err) => {
      toast({ title: '弃用失败', description: (err as Error).message, variant: 'destructive' })
    },
  })

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setDraft(null)
      setSelectedCubeId(node.id)
      if (isEditMode) {
        navigate(`/semantic/cubes/${node.id}/edit`)
      }
    },
    [isEditMode, navigate],
  )

  const selectedDataSource = datasources.find((item) => String(item.id) === selectedSource)
  const pageTitle = isCreateRoute
    ? '新建 Cube'
    : isEditMode
      ? '编辑 Cube'
      : cubeDetail?.title || name || 'Cube 关系画布'
  const pageDescription = isCreateRoute
    ? '从数据源和物理表生成 Cube 草稿，并补充基础定义。'
    : isEditMode
      ? '维护 Cube 基础信息、状态与来源绑定。'
      : '查看当前 Cube 的来源、字段规模与同步状态。'

  const handleSchemaSelect = useCallback((node: TreeNode) => {
    if (node.type !== 'table' && node.type !== 'view') {
      return
    }
    setSelectedCubeId(null)
    setDraft(null)
    setSelectedTable({
      database: node.metadata?.database || '',
      schema: node.metadata?.schema,
      table: node.metadata?.table || node.name,
      comment: node.metadata?.comment,
    })
  }, [])

  const handlePanelClose = () => {
    setDraft(null)
    setSelectedCubeId(null)
    if (isCreateRoute || isEditMode) {
      navigate('/semantic/cubes')
    }
  }

  const handleCreateFromDraft = () => {
    if (!draft) return
    createCubeMutation.mutate(draft)
  }

  const handleQuickSave = () => {
    if (!cubeDetail) return
    updateCubeMutation.mutate({
      title: editForm.title,
      description: editForm.description,
      status: editForm.status,
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-[calc(100vh-14rem)] rounded-lg" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">{pageTitle}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{pageDescription}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/semantic/cubes')}>
            返回索引页
          </Button>
          <Button variant="outline" size="sm" onClick={() => void applyLayout()}>
            <Layout className="w-4 h-4 mr-1.5" aria-hidden="true" />
            自动布局
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-[280px_1fr] gap-4">
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="border-b p-4 space-y-3">
            <div className="space-y-1">
              <div className="text-sm font-medium">新建 Cube</div>
              <p className="text-xs text-muted-foreground">
                先选数据源，再从物理表生成标准化 Cube 草稿。
              </p>
            </div>
            <Select value={selectedSource} onValueChange={setSelectedSource}>
              <SelectTrigger>
                <SelectValue placeholder="选择数据源" />
              </SelectTrigger>
              <SelectContent>
                {datasources.map((ds: DataSource) => (
                  <SelectItem key={ds.id} value={String(ds.id)}>
                    {ds.name} · {ds.source_type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTable && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                <div className="text-xs text-muted-foreground">当前物理表</div>
                <div className="text-sm font-medium">{selectedTable.table}</div>
                <div className="text-xs text-muted-foreground">
                  {selectedTable.database}{selectedTable.schema ? ` / ${selectedTable.schema}` : ''}
                </div>
              </div>
            )}
            {!selectedTable && (
              <div className="rounded-lg border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
                切换数据源后请重新在下方物理表结构中选择表，画布也会同步过滤为当前数据源的 Cube。
              </div>
            )}
            <Button
              className="w-full"
              data-testid="cube-generate-draft"
              disabled={!selectedSource || !selectedTable || createDraftMutation.isPending}
              onClick={() => createDraftMutation.mutate()}
            >
              <Wand2 className="w-4 h-4 mr-1.5" aria-hidden="true" />
              生成 Cube 草稿
            </Button>
          </div>

          <SchemaBrowser
            datasourceId={selectedSource ? Number(selectedSource) : undefined}
            sourceType={selectedDataSource?.source_type}
            collapsible={false}
            title="物理表结构"
            className="border-l-0"
            onSelect={handleSchemaSelect}
          />
        </div>

        <div className="rounded-lg border overflow-hidden" style={{ height: 'calc(100vh - 14rem)' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onInit={(instance) => {
              reactFlowRef.current = instance
              fitCanvas()
            }}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            minZoom={0.3}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
            <MiniMap nodeStrokeWidth={3} zoomable pannable className="!bg-card !border !rounded-lg" />
            <Controls className="!bg-card !border !rounded-lg !shadow-sm" />
          </ReactFlow>
        </div>
      </div>

      <Sheet open={openPanel} onOpenChange={(open) => !open && handlePanelClose()}>
        <SheetContent className="w-[420px] sm:max-w-[420px] overflow-y-auto" aria-label="Cube 建模侧边栏">
          <SheetHeader>
            <SheetTitle>{panelTitle(draft, cubeDetail, isEditMode)}</SheetTitle>
            <SheetDescription>
              {draft
                ? '补充草稿名称、标题与说明，然后保存为语义中心中的 Draft Cube。'
                : isEditMode
                  ? '更新当前 Cube 的基础信息、生命周期状态和来源绑定。'
                  : '查看当前 Cube 的字段规模、来源绑定和最近同步状态。'}
            </SheetDescription>
          </SheetHeader>

          {draft ? (
            <div className="space-y-4 py-4">
              <div className="grid gap-3">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Cube 名称</div>
                  <Input
                    value={draft.name}
                    data-testid="cube-draft-name"
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">显示名称</div>
                  <Input
                    value={draft.title}
                    data-testid="cube-draft-title"
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">说明</div>
                  <Textarea value={draft.description || ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={3} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground mb-1">来源数据源</div>
                  <div className="font-medium">{selectedDataSource?.name || draft.data_source}</div>
                  <div className="text-xs text-muted-foreground">{draft.source_database || '未指定数据库'}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground mb-1">字段概览</div>
                  <div className="font-medium">{Object.keys(draft.dimensions || {}).length} 维度</div>
                  <div className="text-xs text-muted-foreground">{Object.keys(draft.measures || {}).length} 指标</div>
                </div>
              </div>
              <div className="rounded-lg border p-3 text-sm">
                <div className="text-xs text-muted-foreground mb-1">物理表</div>
                <div className="font-mono text-xs">{draft.table}</div>
                <div className="mt-2">
                  <Badge variant="outline">{getSemanticStatusLabel(draft.status || 'draft')}</Badge>
                </div>
              </div>
              <Button
                className="w-full"
                data-testid="cube-banner-save-draft"
                onClick={handleCreateFromDraft}
                disabled={createCubeMutation.isPending}
              >
                <PlusCircle className="w-4 h-4 mr-1.5" aria-hidden="true" />
                创建 Draft Cube
              </Button>
            </div>
          ) : cubeDetail ? (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{getSemanticStatusLabel(cubeDetail.status || 'active')}</Badge>
                <SyncStatusBadge status={toSyncStatus(cubeDetail.state_summary?.sync_status)} />
              </div>
              <div className="grid gap-3">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Cube 名称</div>
                  <Input value={cubeDetail.name} disabled />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">显示名称</div>
                  <Input
                    value={editForm.title}
                    disabled={!isEditMode}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, title: e.target.value }))}
                  />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">说明</div>
                  <Textarea
                    value={editForm.description}
                    disabled={!isEditMode}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
                    rows={3}
                  />
                </div>
                {isEditMode && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">状态</div>
                    <Select value={editForm.status} onValueChange={(value) => setEditForm((prev) => ({ ...prev, status: value }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">{getSemanticStatusLabel('draft')}</SelectItem>
                        <SelectItem value="active">{getSemanticStatusLabel('active')}</SelectItem>
                        <SelectItem value="deprecated">{getSemanticStatusLabel('deprecated')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="rounded-lg border p-3 text-sm space-y-2">
                <div>
                  <span className="text-muted-foreground">来源：</span>
                  <span>
                    {cubeDetail.source_binding_summary?.source_name ||
                      cubeDetail.source_binding_summary?.source_type ||
                      '未绑定'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">数据库：</span>
                  <span>{cubeDetail.source_binding_summary?.database || cubeDetail.source_database || '—'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">表：</span>
                  <code className="text-xs">{cubeDetail.table}</code>
                </div>
                <div>
                  <span className="text-muted-foreground">最近校验：</span>
                  <span>{cubeDetail.state_summary?.last_drift_checked_at ? fmtDate(cubeDetail.state_summary.last_drift_checked_at) : '未校验'}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground mb-1">维度</div>
                  <div className="text-xl font-semibold">{Object.keys(cubeDetail.dimensions).length}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground mb-1">指标</div>
                  <div className="text-xl font-semibold">{Object.keys(cubeDetail.measures).length}</div>
                </div>
              </div>

              <div className="space-y-2">
                {isEditMode ? (
                  <Button className="w-full" onClick={handleQuickSave} disabled={updateCubeMutation.isPending}>
                    <Save className="w-4 h-4 mr-1.5" aria-hidden="true" />
                    保存基础信息
                  </Button>
                ) : (
                  <Button variant="outline" asChild className="w-full">
                    <Link to={`/semantic/cubes/${cubeDetail.name}/edit`}>
                      编辑基础信息 <ArrowRight className="w-4 h-4 ml-1" aria-hidden="true" />
                    </Link>
                  </Button>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    disabled={cubeDetail.status === 'active' || activateMutation.isPending}
                    onClick={() => activateMutation.mutate(cubeDetail.name)}
                  >
                    激活
                  </Button>
                  <Button
                    variant="outline"
                    disabled={cubeDetail.status === 'deprecated' || deprecateMutation.isPending}
                    onClick={() => deprecateMutation.mutate(cubeDetail.name)}
                  >
                    弃用
                  </Button>
                </div>
                <Button variant="outline" asChild className="w-full">
                  <Link to={`/semantic/cubes/${cubeDetail.name}`}>查看详情</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="py-8 text-sm text-muted-foreground">选择一个 Cube，或从左侧物理表生成新的 Cube 草稿。</div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
