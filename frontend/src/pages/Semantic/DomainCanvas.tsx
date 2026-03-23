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
import { GitBranch, Layout, Save } from 'lucide-react'
import {
  getDomainCanvas,
  publishDomain,
  type CubeSummary,
  type DomainCanvasData,
  type DomainCanvasEdge,
} from '@/api/semantic'
import { DomainCubeLibrary, type DomainLibraryFilter } from '@/components/Semantic/DomainCanvas/DomainCubeLibrary'
import { DomainGraphLegend, type DomainCanvasLens } from '@/components/Semantic/DomainCanvas/DomainGraphLegend'
import { DomainInspectorPanel } from '@/components/Semantic/DomainCanvas/DomainInspectorPanel'
import { CubeNode } from '@/components/Semantic/CubeNode'
import { JoinEdge } from '@/components/Semantic/JoinEdge'
import {
  SemanticPageHeader,
  SemanticPageShell,
  SemanticStatusBanner,
  SemanticSurface,
} from '@/components/Semantic/workbench'
import { useToast } from '@/components/business'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
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

function isLibraryCubeAttention(cube: CubeSummary) {
  const syncStatus = (cube.state_summary?.sync_status || cube.sync_status || '').toLowerCase()
  return cube.status !== 'active' || syncStatus === 'warn' || syncStatus === 'error' || !cube.state_summary?.source_binding_summary?.source_id
}

function isRecentlyUpdated(cube: CubeSummary) {
  const value = cube.state_summary?.updated_at
  if (!value) return false
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  return Date.now() - date.getTime() <= 1000 * 60 * 60 * 24 * 14
}

function getProblemEdgeIds(edges: Edge[]) {
  return new Set(
    edges
      .filter((edge) => {
        const sourceField = String((edge.data as any)?.source_field || '')
        const targetField = String((edge.data as any)?.target_field || '')
        const relationship = String((edge.data as any)?.relationship || 'N:1')
        const aggregationStrategy = String((edge.data as any)?.aggregation_strategy || 'none')
        return !sourceField || !targetField || (relationship === '1:N' && aggregationStrategy === 'none')
      })
      .map((edge) => String(edge.id)),
  )
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
  const [libraryFilter, setLibraryFilter] = useState<DomainLibraryFilter>('all')
  const [canvasLens, setCanvasLens] = useState<DomainCanvasLens>('all')

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

  const libraryCounts = useMemo(() => ({
    all: (data?.library_cubes || []).filter((cube) => !cube.in_domain).length,
    attention: (data?.library_cubes || []).filter((cube) => !cube.in_domain && isLibraryCubeAttention(cube)).length,
    recent: (data?.library_cubes || []).filter((cube) => !cube.in_domain && isRecentlyUpdated(cube)).length,
  }), [data?.library_cubes])

  const visibleLibrary = useMemo(() => {
    const keyword = cubeSearch.trim().toLowerCase()
    return (data?.library_cubes || []).filter((cube) => {
      if (cube.in_domain) return false
      if (libraryFilter === 'attention' && !isLibraryCubeAttention(cube)) return false
      if (libraryFilter === 'recent' && !isRecentlyUpdated(cube)) return false
      if (!keyword) return true
      return cube.name.toLowerCase().includes(keyword) || cube.title.toLowerCase().includes(keyword)
    })
  }, [cubeSearch, data?.library_cubes, libraryFilter])

  const selectedCube = useMemo(() => {
    if (!selectedNodeId) return null
    return data?.library_cubes.find((cube) => cube.name === selectedNodeId) || null
  }, [data?.library_cubes, selectedNodeId])

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
  const problemEdgeIds = useMemo(() => getProblemEdgeIds(edges), [edges])
  const problemNodeIds = useMemo(() => {
    const ids = new Set<string>()
    edges.forEach((edge) => {
      if (problemEdgeIds.has(String(edge.id))) {
        ids.add(edge.source)
        ids.add(edge.target)
      }
    })
    nodes.forEach((node) => {
      const status = cubeIndex.get(node.id)?.status
      if (status && status !== 'active') {
        ids.add(node.id)
      }
    })
    return ids
  }, [cubeIndex, edges, nodes, problemEdgeIds])
  const issueCount = problemEdgeIds.size + Math.max(problemNodeIds.size - problemEdgeIds.size, 0)

  const displayNodes = useMemo(() => {
    if (canvasLens === 'all') {
      return nodes.map((node) => ({ ...node, hidden: false }))
    }
    if (canvasLens === 'issues') {
      if (problemNodeIds.size === 0 && problemEdgeIds.size === 0) {
        return nodes.map((node) => ({ ...node, hidden: false }))
      }
      return nodes.map((node) => ({ ...node, hidden: !problemNodeIds.has(node.id) }))
    }
    if (selectedNodeId) {
      const relatedIds = new Set<string>([selectedNodeId])
      edges.forEach((edge) => {
        if (edge.source === selectedNodeId || edge.target === selectedNodeId) {
          relatedIds.add(edge.source)
          relatedIds.add(edge.target)
        }
      })
      return nodes.map((node) => ({ ...node, hidden: !relatedIds.has(node.id) }))
    }
    if (selectedEdgeId) {
      const edge = edges.find((item) => String(item.id) === selectedEdgeId)
      if (!edge) return nodes.map((node) => ({ ...node, hidden: false }))
      return nodes.map((node) => ({ ...node, hidden: !(node.id === edge.source || node.id === edge.target) }))
    }
    return nodes.map((node) => ({ ...node, hidden: false }))
  }, [canvasLens, edges, nodes, problemEdgeIds.size, problemNodeIds, selectedEdgeId, selectedNodeId])

  const displayEdges = useMemo(() => {
    if (canvasLens === 'all') {
      return edges.map((edge) => ({ ...edge, hidden: false }))
    }
    if (canvasLens === 'issues') {
      if (problemEdgeIds.size === 0) {
        return edges.map((edge) => ({ ...edge, hidden: false }))
      }
      return edges.map((edge) => ({ ...edge, hidden: !problemEdgeIds.has(String(edge.id)) }))
    }
    if (selectedNodeId) {
      return edges.map((edge) => ({
        ...edge,
        hidden: !(edge.source === selectedNodeId || edge.target === selectedNodeId),
      }))
    }
    if (selectedEdgeId) {
      return edges.map((edge) => ({
        ...edge,
        hidden: String(edge.id) !== selectedEdgeId,
      }))
    }
    return edges.map((edge) => ({ ...edge, hidden: false }))
  }, [canvasLens, edges, problemEdgeIds, selectedEdgeId, selectedNodeId])

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id)
    setSelectedEdgeId(null)
    setJoinForm(null)
    if (canvasLens === 'selection') {
      setCanvasLens('selection')
    }
  }, [canvasLens])

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
        description="围绕当前领域编排 Cube、配置 Join、处理阻塞项并完成发布。页面首屏只保留建模、判断和发布必需的信息。"
        status={summary.status}
        meta={(
          <>
            {data?.domain.name ? <Badge variant="secondary">当前领域：{data.domain.name}</Badge> : null}
            <Badge variant={data?.domain.status === 'active' ? 'default' : 'secondary'}>{getSemanticStatusLabel(data?.domain.status)}</Badge>
            {data?.domain.state_summary?.last_published_at ? (
              <Badge variant="outline">最近发布 {new Date(data.domain.state_summary.last_published_at).toLocaleString('zh-CN')}</Badge>
            ) : null}
          </>
        )}
        actions={(
          <Button asChild variant="outline" className="h-10 rounded-full border-[hsl(var(--workbench-outline))] bg-white/86 px-4">
            <Link to="/semantic/cubes">
              <GitBranch className="mr-1.5 h-4 w-4" />
              返回 Cube 管理
            </Link>
          </Button>
        )}
      />

      <SemanticStatusBanner
        summary={summary}
        primaryAction={{
          label: '发布领域',
          onClick: () => publishMutation.mutate(),
          icon: <Save className="mr-1.5 h-4 w-4" />,
          disabled: publishMutation.isPending || summary.status === 'blocked',
          testId: 'publish-domain-button',
        }}
      />

      <SemanticSurface bodyClassName="grid gap-0 p-0 xl:grid-cols-[280px_minmax(0,1fr)_340px]">
        <DomainCubeLibrary
          search={cubeSearch}
          onSearchChange={setCubeSearch}
          filter={libraryFilter}
          onFilterChange={setLibraryFilter}
          counts={libraryCounts}
          cubes={visibleLibrary}
          onDragStart={handleDragStart}
        />

        <section
          ref={wrapperRef}
          data-testid="domain-canvas-surface"
          className="relative flex min-h-[44rem] flex-col overflow-hidden border-r border-[hsl(var(--workbench-outline))] bg-[rgba(252,253,255,0.94)]"
          onDragOver={(event) => event.preventDefault()}
          onDragOverCapture={(event) => event.preventDefault()}
          onDrop={handleDrop}
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[hsl(var(--workbench-outline))] px-4 py-3">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-[hsl(var(--workbench-ink))]" style={{ fontFamily: 'var(--font-workbench-display)' }}>
                领域画布
              </div>
              <p className="text-xs leading-5 text-[hsl(var(--workbench-muted-foreground))]">
                中央区域只保留结构、异常和当前焦点。拖入 Cube 后，直接在右侧完成 Join 配置与发布前检查。
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Badge variant="outline" className="border-transparent bg-[hsl(var(--workbench-panel))] text-[hsl(var(--workbench-muted-foreground))]">
                {nodes.length} 个实体
              </Badge>
              <Badge variant="outline" className="border-transparent bg-[hsl(var(--workbench-panel))] text-[hsl(var(--workbench-muted-foreground))]">
                {edges.length} 条关系
              </Badge>
              <Badge
                variant="outline"
                className={
                  issueCount
                    ? 'border-transparent bg-[hsl(var(--semantic-warn))]/12 text-[hsl(var(--semantic-warn))]'
                    : 'border-transparent bg-[hsl(var(--workbench-accent-soft))] text-[hsl(var(--workbench-accent))]'
                }
              >
                {issueCount ? `${issueCount} 个待处理问题` : '当前无阻塞'}
              </Badge>
              <Button variant="outline" onClick={handleAutoLayout} className="h-9 rounded-full border-[hsl(var(--workbench-outline))] bg-white px-4">
                <Layout className="mr-1.5 h-4 w-4" />
                自动布局
              </Button>
            </div>
          </div>

          <DomainGraphLegend lens={canvasLens} onLensChange={setCanvasLens} />

          {!nodes.length ? (
            <div className="absolute inset-x-8 top-20 z-10 rounded-[var(--workbench-radius)] border border-dashed border-[hsl(var(--workbench-outline))] bg-white/92 px-5 py-5 text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">
              <div className="font-semibold text-[hsl(var(--workbench-ink))]">空画布引导</div>
              <div className="mt-2">1. 从左侧拖入 Cube</div>
              <div>2. 在画布上连接两个节点</div>
              <div>3. 在右侧补全 Join 字段并保存</div>
            </div>
          ) : null}

          <div className="flex-1">
            <ReactFlow
              nodes={displayNodes}
              edges={displayEdges}
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
              className="h-[calc(100vh-20rem)] min-h-[35rem]"
            >
              <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
              <MiniMap nodeStrokeWidth={3} zoomable pannable className="!rounded-lg !border !bg-card" />
              <Controls className="!rounded-lg !border !bg-card !shadow-sm" />
            </ReactFlow>
          </div>
        </section>

        <DomainInspectorPanel
          domain={data?.domain}
          summary={summary}
          selectedCube={selectedCube}
          selectedEdgeId={selectedEdgeId}
          joinForm={joinForm}
          cubeIndex={cubeIndex}
          nodesCount={nodes.length}
          edgesCount={edges.length}
          onJoinFormChange={setJoinForm}
          onJoinSave={handleJoinSave}
          onDeleteEdge={handleDeleteSelectedEdge}
        />
      </SemanticSurface>
    </SemanticPageShell>
  )
}
