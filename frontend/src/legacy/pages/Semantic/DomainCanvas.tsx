import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type Node,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react'
import ELK from 'elkjs/lib/elk.bundled.js'
import {
  Box,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  GripVertical,
  Link as LinkIcon,
  Maximize2,
  Network,
  PanelLeftClose,
  PanelRightClose,
  Plus,
  Save,
  Search,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import {
  publishDomain,
  type CubeSummary,
  type DomainCanvasData,
  type DomainCanvasEdge,
} from '@/api/semantic'
import { CubeNode } from '@/components/Semantic/CubeNode'
import { JoinEdge } from '@/components/Semantic/JoinEdge'
import { ResourcePagination } from '@/components/Semantic/ResourcePagination'
import type {
  JoinAggregationStrategy,
  JoinCardinality,
  JoinEdgeData,
  JoinEdgeStatus,
  JoinType,
} from '@/components/Semantic/joinEdgeTypes'
import { useToast } from '@/components/business'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useDomainCanvas, useDomainGovernance } from '@/hooks/semantic-ia'
import { useUnsavedChangesPrompt } from '@/hooks/useUnsavedChangesPrompt'
import { buildDomainValidationSummary, serializeDomainGraph } from './domainCanvasState'

import '@xyflow/react/dist/style.css'

const nodeTypes = { cube: CubeNode }
const edgeTypes = { join: JoinEdge }
const elk = new ELK()

type ResourcePanelMode = 'library' | 'catalog'

/* ── Types ── */

type JoinFormState = {
  source_cube: string
  target_cube: string
  source_field: string
  target_field: string
  join_type: JoinType
  cardinality: JoinCardinality
  aggregation_strategy: JoinAggregationStrategy
  description: string
}

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

/* ── Graph layout ── */

async function layoutGraph(graphNodes: Node[], graphEdges: Array<Edge<JoinEdgeData>>) {
  if (graphNodes.length === 0) {
    return { nodes: graphNodes, edges: graphEdges }
  }
  try {
    const validNodeIds = new Set(graphNodes.map((node) => String(node.id)))
    const normalizedEdges = graphEdges.filter(
      (edge) => validNodeIds.has(String(edge.source)) && validNodeIds.has(String(edge.target)),
    )
    const elkGraph = {
      id: 'root',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'RIGHT',
        'elk.spacing.nodeNode': '56',
        'elk.layered.spacing.nodeNodeBetweenLayers': '96',
      },
      children: graphNodes.map((node) => ({ id: node.id, width: 200, height: 180 })),
      edges: normalizedEdges.map((edge) => ({ id: edge.id, sources: [edge.source], targets: [edge.target] })),
    }
    const result = await elk.layout(elkGraph)
    return {
      nodes: graphNodes.map((node) => {
        const hit = result.children?.find((child) => child.id === node.id)
        return { ...node, position: { x: hit?.x ?? 0, y: hit?.y ?? 0 } }
      }),
      edges: normalizedEdges,
    }
  } catch {
    return { nodes: graphNodes, edges: graphEdges }
  }
}

/* ── Converters ── */

function toNode(
  cube: DomainCanvasData['nodes'][number],
  cubeIndex: Map<string, CubeSummary>,
): Node {
  const summary = cubeIndex.get(cube.id)
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
      dimensionFields: summary?.dimensions?.slice(0, 6) ?? [],
      measureFields: summary?.measures?.slice(0, 6) ?? [],
      status: cube.status,
      sourceBindingSummary: cube.source_binding_summary,
      stateSummary: cube.state_summary,
    },
  }
}

function getJoinEdgeStatus(edge: Pick<DomainCanvasEdge, 'source_field' | 'target_field' | 'relationship' | 'aggregation_strategy'>): JoinEdgeStatus {
  if (!edge.source_field || !edge.target_field) return 'missing'
  if (edge.relationship === '1:N' && (edge.aggregation_strategy || 'none') === 'none') return 'conflict'
  return 'normal'
}

function toEdge(edge: DomainCanvasEdge, index: number): Edge<JoinEdgeData> {
  const status = getJoinEdgeStatus(edge)
  return {
    id: edge.id || `edge-${index}-${edge.source}-${edge.target}`,
    source: edge.source,
    target: edge.target,
    type: 'join',
    data: {
      relationship: edge.relationship as JoinCardinality,
      join_type: edge.join_type as JoinType,
      aggregation_strategy: edge.aggregation_strategy as JoinAggregationStrategy,
      source_field: edge.source_field,
      target_field: edge.target_field,
      description: edge.description,
      status,
    },
  }
}

function toEdgePayload(edge: Edge<JoinEdgeData>, index: number) {
  return {
    name: String(edge.id || `join_${index}`),
    source_cube: edge.source,
    target_cube: edge.target,
    source_field: String(edge.data?.source_field || ''),
    target_field: String(edge.data?.target_field || ''),
    join_type: String(edge.data?.join_type || 'left') as JoinType,
    cardinality: String(edge.data?.relationship || 'N:1') as JoinCardinality,
    aggregation_strategy: String(edge.data?.aggregation_strategy || 'none') as JoinAggregationStrategy,
    description: edge.data?.description || '',
  }
}

/* ── Join Card (right panel) ── */

function JoinCard({
  edge,
  cubeIndex,
  selected,
  onClick,
}: {
  edge: Edge<JoinEdgeData>
  cubeIndex: Map<string, CubeSummary>
  selected: boolean
  onClick: () => void
}) {
  const sourceName = cubeIndex.get(edge.source)?.title || edge.source
  const targetName = cubeIndex.get(edge.target)?.title || edge.target
  const joinType = String(edge.data?.join_type || 'left').toUpperCase()
  const sourceField = edge.data?.source_field || ''
  const targetField = edge.data?.target_field || ''
  const conditionText = sourceField && targetField
    ? `${edge.source}.${sourceField} = ${edge.target}.${targetField}`
    : '未配置字段'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border p-3 text-left transition-colors ${
        selected
          ? 'border-blue-300 bg-blue-50/60'
          : 'border-border bg-slate-50 hover:border-blue-200'
      }`}
    >
      <div className="flex items-center gap-1.5">
        <LinkIcon className="h-3.5 w-3.5 shrink-0 text-blue-600" />
        <span className="text-xs font-medium text-foreground">
          {sourceName} ↔ {targetName}
        </span>
      </div>
      <div className="mt-2 flex flex-col gap-1">
        <div className="flex items-center gap-1 text-[11px]">
          <span className="text-muted-foreground">类型:</span>
          <span className="font-medium text-foreground">{joinType} JOIN</span>
        </div>
        <div className="flex items-center gap-1 text-[11px]">
          <span className="text-muted-foreground">条件:</span>
          <span className="font-medium text-foreground">{conditionText}</span>
        </div>
      </div>
    </button>
  )
}

/* ── Inner canvas with ReactFlow hooks ── */

function CanvasInner({
  nodes: displayNodes,
  edges: displayEdges,
  onNodesChange,
  onEdgesChange,
  onNodeClick,
  onEdgeClick,
  onConnect,
  onPaneClick,
  domainName,
  cubeCount,
  onPublish,
  publishing,
}: {
  nodes: Node[]
  edges: Array<Edge<JoinEdgeData>>
  onNodesChange: Parameters<typeof ReactFlow>[0]['onNodesChange']
  onEdgesChange: Parameters<typeof ReactFlow>[0]['onEdgesChange']
  onNodeClick: (event: React.MouseEvent, node: Node) => void
  onEdgeClick: (event: React.MouseEvent, edge: Edge<JoinEdgeData>) => void
  onConnect: (connection: Connection) => void
  onPaneClick: () => void
  domainName: string
  cubeCount: number
  onPublish: () => void
  publishing: boolean
}) {
  const { zoomIn, zoomOut, fitView } = useReactFlow()

  return (
    <>
      {/* Canvas header — matches design spec ICjXN */}
      <div className="flex items-center justify-between border-b border-border bg-white px-5 py-3">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-blue-500" />
          <span className="text-sm font-semibold text-foreground">{domainName}</span>
          <span className="text-xs text-muted-foreground">{cubeCount} Cubes</span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => zoomOut()} className="text-muted-foreground hover:text-foreground">
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="text-xs text-muted-foreground">100%</span>
          <button type="button" onClick={() => zoomIn()} className="text-muted-foreground hover:text-foreground">
            <ZoomIn className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => fitView()} className="text-muted-foreground hover:text-foreground">
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={onPublish}
          disabled={publishing}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" />
          保存
        </button>
      </div>

      {/* ReactFlow canvas */}
      <div className="flex-1">
        <ReactFlow
          nodes={displayNodes}
          edges={displayEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onConnect={onConnect}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          minZoom={0.3}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          className="h-full min-h-[35rem]"
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
          <Controls className="!rounded-lg !border !bg-white !shadow-sm" />
        </ReactFlow>
      </div>
    </>
  )
}

/* ── Main page ── */

export default function DomainCanvas() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const isCompactViewport = useCompactViewport()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const initialSnapshotRef = useRef<string>('')

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<JoinEdgeData>>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [joinForm, setJoinForm] = useState<JoinFormState | null>(null)
  const [cubeSearch, setCubeSearch] = useState('')
  const [treeSearch, setTreeSearch] = useState('')
  const [libraryPage, setLibraryPage] = useState(1)
  const [catalogPage, setCatalogPage] = useState(1)
  const [expandedCatalogs, setExpandedCatalogs] = useState<Set<string>>(new Set())
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set())
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false)
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false)

  const { data, isLoading } = useDomainCanvas(id)
  const resourcePanelMode: ResourcePanelMode = searchParams.get('panel') === 'catalog' ? 'catalog' : 'library'
  const {
    catalogs,
    isLoading: governanceLoading,
  } = useDomainGovernance({
    page: 1,
    pageSize: 999,
    lens: 'all',
  })

  const cubeIndex = useMemo(() => {
    const result = new Map<string, CubeSummary>()
    for (const cube of data?.library_cubes || []) {
      result.set(cube.name, cube)
    }
    return result
  }, [data?.library_cubes])

  useEffect(() => {
    if (!data) return
    const nextNodes = data.nodes.map((n) => toNode(n, cubeIndex))
    const nextEdges = data.edges.map(toEdge)
    layoutGraph(nextNodes, nextEdges).then(({ nodes: layoutNodes, edges: layoutEdges }) => {
      setNodes(layoutNodes)
      setEdges(layoutEdges)
      initialSnapshotRef.current = serializeDomainGraph(layoutNodes, layoutEdges)
    })
  }, [data, cubeIndex, setEdges, setNodes])

  useEffect(() => {
    if (!catalogs.length || expandedCatalogs.size > 0) return
    setExpandedCatalogs(new Set([catalogs[0].code]))
  }, [catalogs, expandedCatalogs.size])

  useEffect(() => {
    setLibraryPage(1)
  }, [cubeSearch, resourcePanelMode])

  useEffect(() => {
    setCatalogPage(1)
  }, [treeSearch, resourcePanelMode])

  useEffect(() => {
    if (isCompactViewport) {
      setLeftPanelCollapsed(true)
      setRightPanelCollapsed(true)
      return
    }

    setLeftPanelCollapsed(false)
    setRightPanelCollapsed(false)
  }, [isCompactViewport])

  const visibleLibrary = useMemo(() => {
    const keyword = cubeSearch.trim().toLowerCase()
    return (data?.library_cubes || []).filter((cube) => {
      if (cube.in_domain) return false
      if (!keyword) return true
      return cube.name.toLowerCase().includes(keyword) || cube.title.toLowerCase().includes(keyword)
    })
  }, [cubeSearch, data?.library_cubes])

  const filteredCatalogs = useMemo(() => {
    const keyword = treeSearch.trim().toLowerCase()
    if (!keyword) return catalogs
    return catalogs
      .map((catalog) => ({
        ...catalog,
        domains: (catalog.domains || []).filter(
          (domain) =>
            domain.name.toLowerCase().includes(keyword)
            || domain.code.toLowerCase().includes(keyword),
        ),
      }))
      .filter(
        (catalog) =>
          catalog.name.toLowerCase().includes(keyword)
          || (catalog.domains || []).length > 0,
      )
  }, [catalogs, treeSearch])

  const libraryPageSize = 8
  const catalogPageSize = 6
  const libraryPageCount = Math.max(1, Math.ceil(visibleLibrary.length / libraryPageSize))
  const catalogPageCount = Math.max(1, Math.ceil(filteredCatalogs.length / catalogPageSize))
  const pagedLibrary = visibleLibrary.slice((libraryPage - 1) * libraryPageSize, libraryPage * libraryPageSize)
  const pagedCatalogs = filteredCatalogs.slice((catalogPage - 1) * catalogPageSize, catalogPage * catalogPageSize)

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
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null

  /* ── Event handlers ── */

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id)
    setSelectedEdgeId(null)
    setJoinForm(null)
  }, [])

  const handleEdgeClick = useCallback((_: React.MouseEvent, edge: Edge<JoinEdgeData>) => {
    setSelectedEdgeId(String(edge.id))
    setSelectedNodeId(null)
    setJoinForm({
      source_cube: edge.source,
      target_cube: edge.target,
      source_field: String(edge.data?.source_field || ''),
      target_field: String(edge.data?.target_field || ''),
      join_type: String(edge.data?.join_type || 'left') as JoinType,
      cardinality: String(edge.data?.relationship || 'N:1') as JoinCardinality,
      aggregation_strategy: String(edge.data?.aggregation_strategy || 'none') as JoinAggregationStrategy,
      description: String(edge.data?.description || ''),
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
      if (prev.some((node) => node.id === cube.name)) return prev
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
            dimensionFields: cube.dimensions?.slice(0, 6) ?? [],
            measureFields: cube.measures?.slice(0, 6) ?? [],
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

    const nextEdge: Edge<JoinEdgeData> = {
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

  const handleSelectJoinCard = useCallback((edge: Edge<JoinEdgeData>) => {
    setSelectedEdgeId(String(edge.id))
    setSelectedNodeId(null)
    setJoinForm({
      source_cube: edge.source,
      target_cube: edge.target,
      source_field: String(edge.data?.source_field || ''),
      target_field: String(edge.data?.target_field || ''),
      join_type: String(edge.data?.join_type || 'left') as JoinType,
      cardinality: String(edge.data?.relationship || 'N:1') as JoinCardinality,
      aggregation_strategy: String(edge.data?.aggregation_strategy || 'none') as JoinAggregationStrategy,
      description: String(edge.data?.description || ''),
    })
  }, [])

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
    setJoinForm(null)
  }, [])

  const updatePanelMode = useCallback((mode: ResourcePanelMode) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('panel', mode)
      return next
    }, { replace: true })
  }, [setSearchParams])

  const toggleCatalog = useCallback((code: string) => {
    setExpandedCatalogs((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }, [])

  const toggleDomain = useCallback((domainKey: string) => {
    setExpandedDomains((prev) => {
      const next = new Set(prev)
      if (next.has(domainKey)) next.delete(domainKey)
      else next.add(domainKey)
      return next
    })
  }, [])

  const handleSelectDomain = useCallback((domainKey: string) => {
    navigate(`/semantic/domains/${domainKey}?panel=catalog`)
  }, [navigate])

  /* ── Loading skeleton ── */

  if (isLoading || governanceLoading) {
    return (
      <div className="flex h-full flex-col gap-2 p-4 xl:flex-row">
        <Skeleton className="h-24 rounded-lg xl:h-full xl:w-[240px]" />
        <Skeleton className="min-h-[32rem] flex-1 rounded-lg" />
        <Skeleton className="h-28 rounded-lg xl:h-full xl:w-[280px]" />
      </div>
    )
  }

  const inDomainSet = new Set(nodes.map((n) => n.id))

  return (
    <div
      className="flex h-[calc(100vh-3.5rem)] flex-col overflow-auto xl:flex-row xl:overflow-hidden"
      data-testid="domain-canvas-page"
    >
      <aside
        className={`order-2 flex shrink-0 flex-col border-t border-border bg-white xl:order-1 xl:h-full xl:border-t-0 xl:border-r-0 ${
          leftPanelCollapsed ? 'w-full xl:w-[56px]' : 'w-full xl:w-[240px]'
        }`}
        data-testid="domain-tree-panel"
      >
        {leftPanelCollapsed ? (
          <div className="flex h-11 items-center justify-between border-b border-border px-4 xl:h-full xl:flex-col xl:justify-center xl:px-0">
            <button
              type="button"
              onClick={() => setLeftPanelCollapsed(false)}
              aria-label="展开资源树"
              className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-muted"
            >
              <PanelLeftClose className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            <span className="text-[11px] tracking-[0.16em] text-slate-400 xl:[writing-mode:vertical-lr]">
              Cube 资源库
            </span>
          </div>
        ) : (
          <>
            <div className="border-b border-border px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="inline-flex min-w-0 items-center rounded-lg bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => updatePanelMode('library')}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      resourcePanelMode === 'library' ? 'bg-white text-slate-900 shadow-sm' : 'text-muted-foreground'
                    }`}
                  >
                    Cube 库
                  </button>
                  <button
                    type="button"
                    onClick={() => updatePanelMode('catalog')}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      resourcePanelMode === 'catalog' ? 'bg-white text-slate-900 shadow-sm' : 'text-muted-foreground'
                    }`}
                  >
                    领域目录
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setLeftPanelCollapsed(true)}
                  aria-label="折叠资源树"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md hover:bg-muted"
                >
                  <PanelLeftClose className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
            </div>

            <div className="px-4 py-3">
              <div className="flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1.5">
                <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder={resourcePanelMode === 'library' ? '搜索 Cube...' : '搜索目录、领域、Cube...'}
                  value={resourcePanelMode === 'library' ? cubeSearch : treeSearch}
                  onChange={(e) => {
                    if (resourcePanelMode === 'library') setCubeSearch(e.target.value)
                    else setTreeSearch(e.target.value)
                  }}
                  className="min-w-0 flex-1 border-0 bg-transparent p-0 text-xs shadow-none outline-none placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-2 pb-4">
              <div className="min-h-0 flex-1 overflow-y-auto">
                {resourcePanelMode === 'library' ? (
                  <>
                    {pagedLibrary.map((cube) => {
                      const isInCanvas = inDomainSet.has(cube.name)
                      return (
                        <button
                          key={cube.name}
                          type="button"
                          draggable
                          data-testid={`domain-library-cube-${cube.name}`}
                          onDragStart={handleDragStart(cube.name)}
                          className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors ${
                            isInCanvas ? 'bg-blue-50' : 'hover:bg-muted'
                          }`}
                        >
                          <Box className={`h-4 w-4 shrink-0 ${isInCanvas ? 'text-blue-500' : 'text-muted-foreground'}`} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[13px] font-medium text-foreground">{cube.title}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {cube.dimension_count} 维度 · {cube.measure_count} 指标
                            </div>
                          </div>
                          <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        </button>
                      )
                    })}
                    {visibleLibrary.length === 0 ? (
                      <div className="px-3 py-6 text-center text-xs text-muted-foreground">没有可加入的 Cube</div>
                    ) : null}
                  </>
                ) : (
                  <>
                    {pagedCatalogs.map((catalog) => {
                      const isCatalogExpanded = expandedCatalogs.has(catalog.code)
                      return (
                        <div key={catalog.code}>
                          <button
                            type="button"
                            onClick={() => toggleCatalog(catalog.code)}
                            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-50"
                          >
                            {isCatalogExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                            {isCatalogExpanded ? (
                              <FolderOpen className="h-4 w-4 text-blue-500" />
                            ) : (
                              <Folder className="h-4 w-4 text-muted-foreground" />
                            )}
                            <span className="flex-1 truncate text-xs font-medium text-foreground">{catalog.name}</span>
                          </button>
                          {isCatalogExpanded ? (
                            <div className="pb-1 pl-6">
                              {(catalog.domains || []).map((domain) => {
                                const domainKey = domain.id || domain.code
                                const isExpanded = expandedDomains.has(domainKey)
                                const isActive = domainKey === id
                                return (
                                  <div key={domainKey}>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        handleSelectDomain(domainKey)
                                        toggleDomain(domainKey)
                                      }}
                                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left ${
                                        isActive ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50'
                                      }`}
                                    >
                                      {isExpanded ? (
                                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                      ) : (
                                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                      )}
                                      <Network className={`h-3.5 w-3.5 ${isActive ? 'text-blue-600' : 'text-muted-foreground'}`} />
                                      <span className="flex-1 truncate text-xs font-medium">{domain.name}</span>
                                      <span className="text-[10px] text-muted-foreground">{domain.cube_count} Cubes</span>
                                    </button>
                                    {isExpanded && isActive ? (
                                      <div className="space-y-0.5 pl-6">
                                        {nodes.map((node) => (
                                          <button
                                            key={node.id}
                                            type="button"
                                            onClick={() => setSelectedNodeId(node.id)}
                                            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50"
                                          >
                                            <Box className="h-3 w-3 text-muted-foreground" />
                                            <span className="truncate text-[11px] text-foreground">
                                              {String(node.data?.title || node.id)}
                                            </span>
                                          </button>
                                        ))}
                                      </div>
                                    ) : null}
                                  </div>
                                )
                              })}
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                    {filteredCatalogs.length === 0 ? (
                      <div className="px-3 py-6 text-center text-xs text-muted-foreground">没有匹配的目录或领域</div>
                    ) : null}
                  </>
                )}
              </div>
              <div className="px-1 pt-2">
                {resourcePanelMode === 'library' ? (
                  <ResourcePagination page={libraryPage} pageCount={libraryPageCount} onChange={setLibraryPage} />
                ) : (
                  <ResourcePagination page={catalogPage} pageCount={catalogPageCount} onChange={setCatalogPage} />
                )}
              </div>
            </div>
          </>
        )}
      </aside>

      <div className="hidden w-2 shrink-0 items-center justify-center bg-slate-50 xl:flex">
        <div className="h-10 w-[3px] rounded-full bg-border" />
      </div>

      <section
        ref={wrapperRef}
        data-testid="domain-canvas-surface"
        className="order-1 relative flex min-w-0 flex-1 flex-col bg-slate-50 xl:order-2 xl:h-full"
        onDragOver={(e) => e.preventDefault()}
        onDragOverCapture={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        {!nodes.length ? (
          <div className="absolute inset-x-8 top-20 z-10 rounded-lg border border-dashed border-border bg-white/92 px-5 py-5 text-sm leading-6 text-muted-foreground">
            <div className="font-semibold text-foreground">空画布引导</div>
            <div className="mt-2">1. 从左侧拖入 Cube</div>
            <div>2. 在画布上连接两个节点</div>
            <div>3. 在右侧补全 Join 字段并保存</div>
          </div>
        ) : null}

        <ReactFlowProvider>
          <CanvasInner
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick}
            onEdgeClick={handleEdgeClick}
            onConnect={handleConnect}
            onPaneClick={handlePaneClick}
            domainName={data?.domain.name || '未命名领域'}
            cubeCount={nodes.length}
            onPublish={() => publishMutation.mutate()}
            publishing={publishMutation.isPending || summary.status === 'blocked'}
          />
        </ReactFlowProvider>
      </section>

      <div className="hidden w-2 shrink-0 items-center justify-center bg-slate-50 xl:flex">
        <div className="h-10 w-[3px] rounded-full bg-border" />
      </div>

      <aside
        className={`order-3 flex shrink-0 flex-col border-t border-border bg-white xl:order-3 xl:h-full xl:border-t-0 xl:border-l ${
          rightPanelCollapsed ? 'w-full xl:w-[56px]' : 'w-full xl:w-[280px]'
        }`}
        data-testid="domain-join-panel"
      >
        {rightPanelCollapsed ? (
          <div className="flex h-11 items-center justify-between border-b border-border px-4 xl:h-full xl:flex-col xl:justify-center xl:px-0">
            <button
              type="button"
              onClick={() => setRightPanelCollapsed(false)}
              aria-label="展开 Join 面板"
              className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-muted"
            >
              <PanelRightClose className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            <span className="text-[11px] tracking-[0.16em] text-slate-400 xl:[writing-mode:vertical-lr]">
              {resourcePanelMode === 'library' ? 'Join 配置' : '领域信息'}
            </span>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-border px-4 py-4">
              <span className="text-sm font-semibold text-foreground">
                {resourcePanelMode === 'library' ? 'Join 配置' : '领域信息'}
              </span>
              <button
                type="button"
                onClick={() => setRightPanelCollapsed(true)}
                aria-label="折叠 Join 面板"
                className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-muted"
              >
                <PanelRightClose className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {resourcePanelMode === 'library' && selectedEdgeId && joinForm ? (
                <div className="space-y-4">
                  <div className="space-y-3">
                    <div className="text-xs font-semibold text-foreground">编辑 Join</div>

                    <div>
                      <div className="mb-1 text-[11px] text-muted-foreground">源 Cube</div>
                      <Input value={joinForm.source_cube} disabled className="h-8 text-xs" />
                    </div>
                    <div>
                      <div className="mb-1 text-[11px] text-muted-foreground">目标 Cube</div>
                      <Input value={joinForm.target_cube} disabled className="h-8 text-xs" />
                    </div>

                    <div>
                      <div className="mb-1 text-[11px] text-muted-foreground">源字段</div>
                      <Select
                        value={joinForm.source_field}
                        onValueChange={(v) => setJoinForm({ ...joinForm, source_field: v })}
                      >
                        <SelectTrigger className="h-8 text-xs" data-testid="domain-inspector-source-field">
                          <SelectValue placeholder="选择字段" />
                        </SelectTrigger>
                        <SelectContent>
                          {(cubeIndex.get(joinForm.source_cube)?.dimensions || []).map((field) => (
                            <SelectItem key={field} value={field}>{field}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <div className="mb-1 text-[11px] text-muted-foreground">目标字段</div>
                      <Select
                        value={joinForm.target_field}
                        onValueChange={(v) => setJoinForm({ ...joinForm, target_field: v })}
                      >
                        <SelectTrigger className="h-8 text-xs" data-testid="domain-inspector-target-field">
                          <SelectValue placeholder="选择字段" />
                        </SelectTrigger>
                        <SelectContent>
                          {(cubeIndex.get(joinForm.target_cube)?.dimensions || []).map((field) => (
                            <SelectItem key={field} value={field}>{field}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="mb-1 text-[11px] text-muted-foreground">Join Type</div>
                        <Select
                          value={joinForm.join_type}
                          onValueChange={(v) => setJoinForm({ ...joinForm, join_type: v as JoinType })}
                        >
                          <SelectTrigger className="h-8 text-xs">
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
                        <div className="mb-1 text-[11px] text-muted-foreground">基数</div>
                        <Select
                          value={joinForm.cardinality}
                          onValueChange={(v) =>
                            setJoinForm({
                              ...joinForm,
                              cardinality: v as JoinCardinality,
                              aggregation_strategy: v === '1:N' ? joinForm.aggregation_strategy : 'none',
                            })
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1:1">1:1</SelectItem>
                            <SelectItem value="N:1">N:1</SelectItem>
                            <SelectItem value="1:N">1:N</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {joinForm.cardinality === '1:N' ? (
                      <div>
                        <div className="mb-1 text-[11px] text-muted-foreground">聚合策略</div>
                        <Select
                          value={joinForm.aggregation_strategy}
                          onValueChange={(v) => setJoinForm({ ...joinForm, aggregation_strategy: v as JoinAggregationStrategy })}
                        >
                          <SelectTrigger className="h-8 text-xs">
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
                    ) : null}

                    <div>
                      <div className="mb-1 text-[11px] text-muted-foreground">说明</div>
                      <Textarea
                        rows={2}
                        value={joinForm.description}
                        onChange={(e) => setJoinForm({ ...joinForm, description: e.target.value })}
                        className="text-xs"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleJoinSave}
                      data-testid="domain-inspector-save"
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 py-2 text-xs font-medium text-white hover:bg-blue-700"
                    >
                      <Save className="h-3.5 w-3.5" />
                      保存
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteSelectedEdge}
                      className="rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted"
                    >
                      删除
                    </button>
                  </div>
                </div>
              ) : resourcePanelMode === 'library' ? (
                <div className="flex flex-col gap-5">
                  <div className="flex flex-col gap-2.5">
                    <span className="text-xs font-semibold text-foreground">当前 Join 关系</span>
                    {edges.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                        还没有定义 Join 关系
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2.5">
                        {edges.map((edge) => (
                          <JoinCard
                            key={edge.id}
                            edge={edge}
                            cubeIndex={cubeIndex}
                            selected={String(edge.id) === selectedEdgeId}
                            onClick={() => handleSelectJoinCard(edge)}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-100 py-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-slate-200/80"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    新建 Join 关系
                  </button>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">领域说明</div>
                    <div className="mt-3 text-sm font-semibold text-slate-900">{data?.domain.name || '未命名领域'}</div>
                    <p className="mt-2 text-xs leading-6 text-slate-600">
                      {data?.domain.description || '当前领域还没有补充业务说明。'}
                    </p>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">当前资源</div>
                      <span className="text-[11px] text-slate-500">{nodes.length} Cubes</span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {selectedNode ? (
                        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                          <div className="text-xs font-semibold text-blue-700">
                            {String(selectedNode.data?.title || selectedNode.id)}
                          </div>
                          <div className="mt-1 text-[11px] text-blue-700/80">
                            {String(selectedNode.data?.dimensions || 0)} 维度 · {String(selectedNode.data?.measures || 0)} 指标
                          </div>
                        </div>
                      ) : null}
                      {nodes.slice(0, 6).map((node) => (
                        <button
                          key={node.id}
                          type="button"
                          onClick={() => setSelectedNodeId(node.id)}
                          className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left ${
                            selectedNodeId === node.id ? 'bg-blue-50 text-blue-700' : 'bg-slate-50 hover:bg-slate-100'
                          }`}
                        >
                          <span className="truncate text-xs font-medium">{String(node.data?.title || node.id)}</span>
                          <span className="shrink-0 text-[11px] text-slate-500">
                            {String(node.data?.dimensions || 0)} / {String(node.data?.measures || 0)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Cube 关系</div>
                    {edges.length ? (
                      edges.map((edge) => (
                        <JoinCard
                          key={String(edge.id)}
                          edge={edge}
                          cubeIndex={cubeIndex}
                          selected={selectedEdgeId === String(edge.id)}
                          onClick={() => handleSelectJoinCard(edge)}
                        />
                      ))
                    ) : (
                      <div className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-500">
                        当前领域还没有可展示的 Cube 关系
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  )
}
