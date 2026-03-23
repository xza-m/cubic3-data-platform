import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'
import ELK from 'elkjs/lib/elk.bundled.js'
import { ArrowLeft, GitBranch, Layout, PlusCircle, Save, Trash2 } from 'lucide-react'
import {
  getDomainCanvas,
  publishDomain,
  type CubeSummary,
  type DomainCanvasData,
  type DomainCanvasEdge,
} from '@/api/semantic'
import { CubeNode } from '@/components/Semantic/CubeNode'
import { JoinEdge } from '@/components/Semantic/JoinEdge'
import { SyncStatusBadge } from '@/components/Semantic/SyncStatusBadge'
import {
  SemanticPageHeader,
  SemanticPageShell,
  SemanticSurface,
} from '@/components/Semantic/workbench'
import { useToast } from '@/components/business'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useUnsavedChangesPrompt } from '@/hooks/useUnsavedChangesPrompt'
import { getSemanticStatusLabel } from '@/lib/semantic-status'
import { buildDomainValidationSummary, serializeDomainGraph } from './domainCanvasState'

import '@xyflow/react/dist/style.css'

const nodeTypes = { cube: CubeNode }
const edgeTypes = { join: JoinEdge }
const elk = new ELK()

type JoinFormState = {
  source_cube: string
  target_cube: string
  source_field: string
  target_field: string
  join_type: 'left' | 'inner' | 'right' | 'full'
  cardinality: '1:1' | 'N:1' | '1:N'
  aggregation_strategy: 'none' | 'aggregate_before_join' | 'latest_snapshot' | 'distinct_on_target'
  description: string
}

const defaultJoinForm = (source: string, target: string): JoinFormState => ({
  source_cube: source,
  target_cube: target,
  source_field: '',
  target_field: '',
  join_type: 'left',
  cardinality: 'N:1',
  aggregation_strategy: 'none',
  description: '',
})

async function layoutGraph(graphNodes: Node[], graphEdges: Edge[]) {
  if (graphNodes.length === 0) {
    return { nodes: graphNodes, edges: graphEdges }
  }
  const elkGraph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '56',
      'elk.layered.spacing.nodeNodeBetweenLayers': '96',
    },
    children: graphNodes.map((node) => ({ id: node.id, width: 220, height: 120 })),
    edges: graphEdges.map((edge) => ({ id: edge.id, sources: [edge.source], targets: [edge.target] })),
  }
  const result = await elk.layout(elkGraph)
  return {
    nodes: graphNodes.map((node) => {
      const hit = result.children?.find((child) => child.id === node.id)
      return { ...node, position: { x: hit?.x ?? 0, y: hit?.y ?? 0 } }
    }),
    edges: graphEdges,
  }
}

function toNode(cube: DomainCanvasData['nodes'][number]): Node {
  return {
    id: cube.id,
    type: 'cube',
    position: { x: 0, y: 0 },
    data: {
      name: cube.id,
      title: cube.title,
      type: cube.type,
      dimensions: cube.dimensions,
      measures: cube.measures,
      status: cube.status,
      sourceBindingSummary: cube.source_binding_summary,
      stateSummary: cube.state_summary,
    },
  }
}

function toEdge(edge: DomainCanvasEdge, index: number): Edge {
  return {
    id: edge.id || `edge-${index}-${edge.source}-${edge.target}`,
    source: edge.source,
    target: edge.target,
    type: 'join',
    data: {
      relationship: edge.relationship,
      join_type: edge.join_type,
      aggregation_strategy: edge.aggregation_strategy,
      source_field: edge.source_field,
      target_field: edge.target_field,
      description: edge.description,
    },
  }
}

function toEdgePayload(edge: Edge, index: number) {
  return {
    name: String(edge.id || `join_${index}`),
    source_cube: edge.source,
    target_cube: edge.target,
    source_field: String((edge.data as any)?.source_field || ''),
    target_field: String((edge.data as any)?.target_field || ''),
    join_type: String((edge.data as any)?.join_type || 'left') as 'left' | 'inner' | 'right' | 'full',
    cardinality: String((edge.data as any)?.relationship || 'N:1') as '1:1' | 'N:1' | '1:N',
    aggregation_strategy: String((edge.data as any)?.aggregation_strategy || 'none') as 'none' | 'aggregate_before_join' | 'latest_snapshot' | 'distinct_on_target',
    description: (edge.data as any)?.description || '',
  }
}

export default function DomainCanvas() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const initialSnapshotRef = useRef<string>('')

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [joinForm, setJoinForm] = useState<JoinFormState | null>(null)
  const [cubeSearch, setCubeSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['semantic', 'domain-canvas', id],
    queryFn: async () => (await getDomainCanvas(id!)).data,
    enabled: !!id,
  })

  useEffect(() => {
    if (!data) return
    const nextNodes = data.nodes.map(toNode)
    const nextEdges = data.edges.map(toEdge)
    layoutGraph(nextNodes, nextEdges).then(({ nodes: layoutNodes, edges: layoutEdges }) => {
      setNodes(layoutNodes)
      setEdges(layoutEdges)
      initialSnapshotRef.current = serializeDomainGraph(layoutNodes, layoutEdges)
    })
  }, [data, setEdges, setNodes])

  const cubeIndex = useMemo(() => {
    const result = new Map<string, CubeSummary>()
    for (const cube of data?.library_cubes || []) {
      result.set(cube.name, cube)
    }
    return result
  }, [data?.library_cubes])

  const visibleLibrary = useMemo(() => {
    const keyword = cubeSearch.trim().toLowerCase()
    return (data?.library_cubes || []).filter((cube) => {
      if (cube.in_domain) return false
      if (!keyword) return true
      return cube.name.toLowerCase().includes(keyword) || cube.title.toLowerCase().includes(keyword)
    })
  }, [cubeSearch, data?.library_cubes])

  const selectedCube = useMemo(() => {
    if (!selectedNodeId) return null
    return data?.library_cubes.find((cube) => cube.name === selectedNodeId) || null
  }, [data?.library_cubes, selectedNodeId])

  const selectedEdge = useMemo(() => {
    if (!selectedEdgeId) return null
    return edges.find((edge) => edge.id === selectedEdgeId) || null
  }, [edges, selectedEdgeId])

  const graphSnapshot = useMemo(() => serializeDomainGraph(nodes, edges), [nodes, edges])
  const hasDirtyChanges = Boolean(initialSnapshotRef.current && graphSnapshot !== initialSnapshotRef.current)

  useUnsavedChangesPrompt(hasDirtyChanges, '当前领域画布存在未发布变更，确认离开吗？')

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error('缺少领域 ID')
      return (
        await publishDomain(id, {
          cubes: nodes.map((node) => node.id),
          joins: edges.map(toEdgePayload),
        })
      ).data
    },
    onSuccess: async () => {
      toast({ title: '领域 YAML 发布成功' })
      await queryClient.invalidateQueries({ queryKey: ['semantic', 'domain-canvas', id] })
      await queryClient.invalidateQueries({ queryKey: ['semantic', 'domains'] })
    },
    onError: (err) => {
      toast({ title: '发布失败', description: (err as Error).message, variant: 'destructive' })
    },
  })

  const summary = buildDomainValidationSummary(data?.domain, nodes, edges, data?.library_cubes || [], hasDirtyChanges, publishMutation.isPending)

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id)
    setSelectedEdgeId(null)
    setJoinForm(null)
  }, [])

  const handleEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedEdgeId(String(edge.id))
    setSelectedNodeId(null)
    setJoinForm({
      source_cube: edge.source,
      target_cube: edge.target,
      source_field: String((edge.data as any)?.source_field || ''),
      target_field: String((edge.data as any)?.target_field || ''),
      join_type: String((edge.data as any)?.join_type || 'left') as any,
      cardinality: String((edge.data as any)?.relationship || 'N:1') as any,
      aggregation_strategy: String((edge.data as any)?.aggregation_strategy || 'none') as any,
      description: String((edge.data as any)?.description || ''),
    })
  }, [])

  const handleConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return
    setSelectedEdgeId('__draft__')
    setSelectedNodeId(null)
    setJoinForm(defaultJoinForm(connection.source, connection.target))
  }, [])

  const handleDragStart = (cubeName: string) => (event: React.DragEvent<HTMLButtonElement>) => {
    event.dataTransfer.setData('application/x-semantic-cube', cubeName)
    event.dataTransfer.setData('text/plain', cubeName)
    event.dataTransfer.effectAllowed = 'move'
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const cubeName = event.dataTransfer.getData('application/x-semantic-cube') || event.dataTransfer.getData('text/plain')
    if (!cubeName) return
    const cube = cubeIndex.get(cubeName)
    if (!cube) return
    const rect = wrapperRef.current?.getBoundingClientRect()
    const x = rect ? event.clientX - rect.left - 104 : 120
    const y = rect ? event.clientY - rect.top - 56 : 120
    setNodes((prev) => {
      if (prev.some((node) => node.id === cube.name)) {
        return prev
      }
      return [
        ...prev,
        {
          id: cube.name,
          type: 'cube',
          position: { x, y },
          data: {
            name: cube.name,
            title: cube.title,
            type: cube.measure_count > 2 ? 'fact' : 'dimension',
            dimensions: cube.dimension_count,
            measures: cube.measure_count,
            status: cube.status,
            stateSummary: cube.state_summary,
            sourceBindingSummary: cube.state_summary?.source_binding_summary,
          },
        },
      ]
    })
  }

  const handleJoinSave = () => {
    if (!joinForm) return
    if (!joinForm.source_field || !joinForm.target_field) {
      toast({ title: '请补全 Join 字段', variant: 'destructive' })
      return
    }
    if (joinForm.cardinality === '1:N' && joinForm.aggregation_strategy === 'none') {
      toast({ title: '1:N 必须指定聚合策略', variant: 'destructive' })
      return
    }
    const edgeId = selectedEdgeId && selectedEdgeId !== '__draft__'
      ? selectedEdgeId
      : `${joinForm.source_cube}__${joinForm.target_cube}`

    const nextEdge: Edge = {
      id: edgeId,
      source: joinForm.source_cube,
      target: joinForm.target_cube,
      type: 'join',
      data: {
        relationship: joinForm.cardinality,
        join_type: joinForm.join_type,
        aggregation_strategy: joinForm.aggregation_strategy,
        source_field: joinForm.source_field,
        target_field: joinForm.target_field,
        description: joinForm.description,
      },
    }

    setEdges((prev) => [...prev.filter((edge) => String(edge.id) !== edgeId), nextEdge])
    setSelectedEdgeId(edgeId)
  }

  const handleDeleteSelectedEdge = () => {
    if (!selectedEdgeId || selectedEdgeId === '__draft__') {
      setSelectedEdgeId(null)
      setJoinForm(null)
      return
    }
    setEdges((prev) => prev.filter((edge) => String(edge.id) !== selectedEdgeId))
    setSelectedEdgeId(null)
    setJoinForm(null)
  }

  const handleAutoLayout = () =>
    layoutGraph(nodes, edges).then(({ nodes: layoutNodes, edges: layoutEdges }) => {
      setNodes(layoutNodes)
      setEdges(layoutEdges)
    })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 rounded-3xl" />
        <Skeleton className="h-40 rounded-3xl" />
        <Skeleton className="h-[calc(100vh-16rem)] rounded-3xl" />
      </div>
    )
  }

  return (
    <SemanticPageShell>
      <SemanticPageHeader
        backHref="/semantic/modeling"
        backLabel="返回领域建模"
        title="领域设计"
        description="围绕当前领域编排 Cube、配置 Join、处理阻塞项并完成发布，页面只保留建模必需的信息。"
        status={summary.status}
        meta={
          <>
            {data?.domain.name && <Badge variant="secondary">当前领域：{data.domain.name}</Badge>}
            <Badge variant={data?.domain.status === 'active' ? 'default' : 'secondary'}>{getSemanticStatusLabel(data?.domain.status)}</Badge>
            {data?.domain.state_summary?.sync_status && <SyncStatusBadge status={data.domain.state_summary.sync_status as any} />}
            {data?.domain.state_summary?.last_published_at && (
              <Badge variant="outline">最近发布 {new Date(data.domain.state_summary.last_published_at).toLocaleString('zh-CN')}</Badge>
            )}
          </>
        }
      />

      <SemanticSurface
        bodyClassName="p-0"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[hsl(var(--workbench-outline))] px-5 py-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-transparent bg-[hsl(var(--workbench-surface-2))] text-[hsl(var(--workbench-muted-foreground))]">
              <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
              从左侧拖入 Cube 添加实体
            </Badge>
            <Badge variant="outline" className="border-transparent bg-[hsl(var(--workbench-surface-2))] text-[hsl(var(--workbench-muted-foreground))]">
              <GitBranch className="mr-1.5 h-3.5 w-3.5" />
              连接节点添加关系
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-transparent bg-[hsl(var(--workbench-surface-2))] text-[hsl(var(--workbench-muted-foreground))]">
              {nodes.length} 个实体
            </Badge>
            <Badge variant="outline" className="border-transparent bg-[hsl(var(--workbench-surface-2))] text-[hsl(var(--workbench-muted-foreground))]">
              {edges.length} 条关系
            </Badge>
            <Button variant="outline" onClick={handleAutoLayout} className="rounded-full border-[hsl(var(--workbench-outline))] bg-white px-4">
              <Layout className="mr-1.5 h-4 w-4" />
              自动布局
            </Button>
            <Button
              data-testid="publish-domain-button"
              onClick={() => publishMutation.mutate()}
              disabled={publishMutation.isPending || summary.status === 'blocked'}
              className="rounded-full px-4"
            >
              <Save className="mr-1.5 h-4 w-4" />
              发布领域
            </Button>
          </div>
        </div>

        <div className="grid gap-0 xl:grid-cols-[280px_minmax(0,1fr)_340px]">
          <aside className="border-r border-[hsl(var(--workbench-outline))] bg-[rgba(249,251,254,0.84)] p-4">
          <div className="space-y-4">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-[hsl(var(--workbench-ink))]" style={{ fontFamily: 'var(--font-workbench-display)' }}>
                可选 Cube
              </div>
              <p className="text-xs leading-5 text-[hsl(var(--workbench-muted-foreground))]">
                只显示可纳入当前领域的活跃 Cube。拖入画布后，在右侧补充 Join 细节。
              </p>
            </div>
            <Input
              name="cube_library_search"
              autoComplete="off"
              placeholder="搜索 Cube…"
              value={cubeSearch}
              onChange={(e) => setCubeSearch(e.target.value)}
              aria-label="搜索可加入领域的 Cube"
              className="border-[hsl(var(--workbench-outline))] bg-white"
            />
            <div className="max-h-[calc(100vh-23rem)] space-y-2 overflow-auto pr-1">
              {visibleLibrary.map((cube) => (
                <button
                  key={cube.name}
                  type="button"
                  draggable
                  data-testid={`domain-library-cube-${cube.name}`}
                  onDragStart={handleDragStart(cube.name)}
                  className="w-full rounded-[var(--workbench-radius-sm)] border border-[hsl(var(--workbench-outline))] bg-white/92 p-3 text-left transition-colors hover:border-[hsl(var(--workbench-accent))]/35"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-[hsl(var(--workbench-ink))]">{cube.title}</div>
                      <div className="font-mono text-xs text-[hsl(var(--workbench-muted-foreground))]">{cube.name}</div>
                    </div>
                    <Badge variant="outline">{getSemanticStatusLabel(cube.status || 'draft')}</Badge>
                  </div>
                  <div className="mt-3 flex gap-3 text-[11px] text-[hsl(var(--workbench-muted-foreground))]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    <span>{cube.dimension_count} 维度</span>
                    <span>{cube.measure_count} 指标</span>
                  </div>
                </button>
              ))}
              {visibleLibrary.length === 0 && (
                <div className="rounded-xl border border-dashed border-[hsl(var(--workbench-outline))] bg-white/92 p-4 text-xs text-[hsl(var(--workbench-muted-foreground))]">
                  当前没有可加入的 Cube，可能都已在本领域中或检索条件过窄。
                </div>
              )}
            </div>
          </div>
        </aside>

        <section
          ref={wrapperRef}
          data-testid="domain-canvas-surface"
          className="overflow-hidden border-r border-[hsl(var(--workbench-outline))] bg-[rgba(255,255,255,0.92)]"
          onDragOver={(e) => e.preventDefault()}
          onDragOverCapture={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[hsl(var(--workbench-outline))] px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-[hsl(var(--workbench-ink))]" style={{ fontFamily: 'var(--font-workbench-display)' }}>
                领域画布
              </div>
              <p className="text-xs leading-5 text-[hsl(var(--workbench-muted-foreground))]">
                点击节点查看 Cube 摘要，点击连线编辑 Join 规则与聚合策略。
              </p>
            </div>
            <div className="text-xs text-[hsl(var(--workbench-muted-foreground))]" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {nodes.length} 个节点 · {edges.length} 条关系
            </div>
          </div>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick}
            onEdgeClick={handleEdgeClick}
            onConnect={handleConnect}
            onPaneClick={() => {
              setSelectedNodeId(null)
              setSelectedEdgeId(null)
              setJoinForm(null)
            }}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            minZoom={0.3}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
            className="h-[calc(100vh-21rem)]"
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
            <MiniMap nodeStrokeWidth={3} zoomable pannable className="!rounded-lg !border !bg-card" />
            <Controls className="!rounded-lg !border !bg-card !shadow-sm" />
          </ReactFlow>
        </section>

        <aside
          className="space-y-4 bg-[rgba(249,251,254,0.84)] p-4"
          data-testid="domain-inspector-panel"
        >
          <div className="space-y-1">
            <div className="text-sm font-semibold text-[hsl(var(--workbench-ink))]" style={{ fontFamily: 'var(--font-workbench-display)' }}>
              {selectedEdgeId ? 'Join 设置' : selectedCube ? 'Cube 摘要' : '领域摘要'}
            </div>
            <p className="text-xs leading-5 text-[hsl(var(--workbench-muted-foreground))]">
              {selectedEdgeId
                ? '在右侧直接编辑 Join 字段、基数和聚合策略。'
                : selectedCube
                  ? '这里只展示当前节点的模型摘要，不提供跨页设计跳转。'
                  : '这里展示当前领域的规模、阻塞项和发布前摘要。'}
            </p>
          </div>
          {selectedEdgeId && joinForm ? (
            <>
                <div data-testid="domain-inspector-join" className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <div className="mb-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">源 Cube</div>
                    <Input value={joinForm.source_cube} disabled className="border-[hsl(var(--workbench-outline))] bg-white" />
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">目标 Cube</div>
                    <Input value={joinForm.target_cube} disabled className="border-[hsl(var(--workbench-outline))] bg-white" />
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <div className="mb-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">源字段</div>
                    <Select value={joinForm.source_field} onValueChange={(value) => setJoinForm((prev) => prev ? ({ ...prev, source_field: value }) : prev)}>
                      <SelectTrigger data-testid="domain-inspector-source-field">
                        <SelectValue placeholder="选择字段" />
                      </SelectTrigger>
                      <SelectContent>
                        {(cubeIndex.get(joinForm.source_cube)?.dimensions || []).map((field) => (
                          <SelectItem key={field} value={field}>
                            {field}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">目标字段</div>
                    <Select value={joinForm.target_field} onValueChange={(value) => setJoinForm((prev) => prev ? ({ ...prev, target_field: value }) : prev)}>
                      <SelectTrigger data-testid="domain-inspector-target-field">
                        <SelectValue placeholder="选择字段" />
                      </SelectTrigger>
                      <SelectContent>
                        {(cubeIndex.get(joinForm.target_cube)?.dimensions || []).map((field) => (
                          <SelectItem key={field} value={field}>
                            {field}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <div className="mb-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">Join Type</div>
                    <Select value={joinForm.join_type} onValueChange={(value: any) => setJoinForm((prev) => prev ? ({ ...prev, join_type: value }) : prev)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="left">left</SelectItem>
                        <SelectItem value="inner">inner</SelectItem>
                        <SelectItem value="right">right</SelectItem>
                        <SelectItem value="full">full</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">Cardinality</div>
                    <Select
                      value={joinForm.cardinality}
                      onValueChange={(value: any) =>
                        setJoinForm((prev) => prev ? ({
                          ...prev,
                          cardinality: value,
                          aggregation_strategy: value === '1:N' ? prev.aggregation_strategy : 'none',
                        }) : prev)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1:1">1:1</SelectItem>
                        <SelectItem value="N:1">N:1</SelectItem>
                        <SelectItem value="1:N">1:N</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">聚合策略</div>
                    <Select value={joinForm.aggregation_strategy} onValueChange={(value: any) => setJoinForm((prev) => prev ? ({ ...prev, aggregation_strategy: value }) : prev)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">none</SelectItem>
                        <SelectItem value="aggregate_before_join">aggregate_before_join</SelectItem>
                        <SelectItem value="latest_snapshot">latest_snapshot</SelectItem>
                        <SelectItem value="distinct_on_target">distinct_on_target</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">说明</div>
                  <Textarea
                    rows={3}
                    value={joinForm.description}
                    onChange={(e) => setJoinForm((prev) => prev ? ({ ...prev, description: e.target.value }) : prev)}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleJoinSave} data-testid="domain-inspector-save" className="rounded-full px-4">
                    <Save className="mr-1.5 h-4 w-4" />
                    保存当前 Join
                  </Button>
                  <Button variant="outline" onClick={handleDeleteSelectedEdge} className="rounded-full border-[hsl(var(--workbench-outline))] bg-white/88 px-4">
                    <Trash2 className="mr-1.5 h-4 w-4" />
                    删除 Join
                  </Button>
                </div>
              </div>
            </>
          ) : selectedCube ? (
            <>
              <div data-testid="domain-inspector-cube" className="space-y-3">
                <div className="rounded-xl border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] p-4">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold text-[hsl(var(--workbench-ink))]">{selectedCube.title}</div>
                    <Badge variant="outline">{getSemanticStatusLabel(selectedCube.status || 'draft')}</Badge>
                  </div>
                  <div className="mt-1 font-mono text-xs text-[hsl(var(--workbench-muted-foreground))]">{selectedCube.name}</div>
                  <div className="mt-3 text-sm text-[hsl(var(--workbench-muted-foreground))]">
                    {selectedCube.dimension_count} 维度 · {selectedCube.measure_count} 指标 · {selectedCube.join_count ?? 0} 条关联
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] p-3">
                    <div className="text-xs text-[hsl(var(--workbench-muted-foreground))]">数据源</div>
                    <div className="mt-2 text-sm font-medium text-[hsl(var(--workbench-ink))]">
                      {selectedCube.state_summary?.source_binding_summary?.source_name || '未绑定'}
                    </div>
                  </div>
                  <div className="rounded-xl border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] p-3">
                    <div className="text-xs text-[hsl(var(--workbench-muted-foreground))]">同步状态</div>
                    <div className="mt-2">
                      <SyncStatusBadge status={selectedCube.state_summary?.sync_status as any} />
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-xl border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] p-4">
                <div className="flex items-center gap-2">
                  <div className="font-semibold text-[hsl(var(--workbench-ink))]">{data?.domain.name}</div>
                  <Badge variant={data?.domain.status === 'active' ? 'default' : 'secondary'}>
                    {getSemanticStatusLabel(data?.domain.status)}
                  </Badge>
                </div>
                <div className="mt-1 font-mono text-xs text-[hsl(var(--workbench-muted-foreground))]">{data?.domain.code}</div>
                <p className="mt-3 text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">
                  {data?.domain.description || '当前领域尚未补充说明。建议先定义边界，再逐步补足 Join 关系。'}
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] p-3">
                  <div className="text-xs text-[hsl(var(--workbench-muted-foreground))]">当前规模</div>
                  <div className="mt-2 text-lg font-semibold text-[hsl(var(--workbench-ink))]">{nodes.length}</div>
                  <div className="text-xs text-[hsl(var(--workbench-muted-foreground))]">已入域 Cube</div>
                </div>
                <div className="rounded-xl border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] p-3">
                  <div className="text-xs text-[hsl(var(--workbench-muted-foreground))]">关系数</div>
                  <div className="mt-2 text-lg font-semibold text-[hsl(var(--workbench-ink))]">{edges.length}</div>
                  <div className="text-xs text-[hsl(var(--workbench-muted-foreground))]">领域 Join</div>
                </div>
              </div>
              <div className="space-y-2 rounded-xl border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] px-4 py-4">
                <div className="text-sm font-semibold text-[hsl(var(--workbench-ink))]">发布前检查</div>
                <div className="text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">
                  {summary.description}
                </div>
                {summary.blockers && summary.blockers.length > 0 && (
                  <ul className="space-y-1 text-sm text-[hsl(var(--semantic-error))]">
                    {summary.blockers.map((blocker) => (
                      <li key={blocker}>• {blocker}</li>
                    ))}
                  </ul>
                )}
                {summary.hints && summary.hints.length > 0 && (
                  <ul className="space-y-1 text-sm text-[hsl(var(--workbench-muted-foreground))]">
                    {summary.hints.map((hint) => (
                      <li key={hint}>• {hint}</li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </aside>
      </div>
      </SemanticSurface>
    </SemanticPageShell>
  )
}
