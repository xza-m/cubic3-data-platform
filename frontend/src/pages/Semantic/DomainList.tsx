import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Box,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  HelpCircle,
  Info,
  ListTree,
  Maximize2,
  Network,
  PanelLeftClose,
  PlusCircle,
  Search,
  Settings2,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import {
  deleteCatalog,
  getDomainCanvas,
  type DomainCanvasData,
  type DomainCanvasEdge,
  type DomainCanvasNode,
  type DomainSummary,
} from '@/api/semantic'
import { CatalogEditorDialog } from '@/components/Semantic/CatalogEditorDialog'
import { useToast } from '@/components/business'
import {
  SemanticPageHeader,
  SemanticPageShell,
  SemanticSurface,
} from '@/components/Semantic/workbench'
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
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useDomainGovernance } from '@/hooks/semantic-ia'
import { useUrlState } from '@/hooks/useUrlState'
import { getSemanticStatusLabel } from '@/lib/semantic-status'
import { cn } from '@/lib/utils'

// ── Tree types ──

interface TreeState {
  expandedCatalogs: Set<string>
  expandedDomains: Set<string>
}

// ── Canvas preview helpers ──

const NODE_W = 180
const NODE_HEADER_H = 34
const NODE_FIELD_H = 18
const NODE_FOOTER_H = 24
const NODE_PAD = 10
const NODE_GAP_X = 160
const NODE_GAP_Y = 40

function calcNodeHeight(node: DomainCanvasNode) {
  const fields = node.dimensions + node.measures
  return NODE_HEADER_H + NODE_PAD + fields * NODE_FIELD_H + NODE_PAD + NODE_FOOTER_H
}

function layoutNodes(nodes: DomainCanvasNode[]) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length)))
  return nodes.map((node, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    return {
      ...node,
      x: 80 + col * (NODE_W + NODE_GAP_X),
      y: 60 + row * (calcNodeHeight(node) + NODE_GAP_Y),
      w: NODE_W,
      h: calcNodeHeight(node),
    }
  })
}

function joinLinePath(
  positioned: Array<DomainCanvasNode & { x: number; y: number; w: number; h: number }>,
  edge: DomainCanvasEdge,
) {
  const src = positioned.find((n) => n.id === edge.source)
  const tgt = positioned.find((n) => n.id === edge.target)
  if (!src || !tgt) return null
  const x1 = src.x + src.w
  const y1 = src.y + src.h / 2
  const x2 = tgt.x
  const y2 = tgt.y + tgt.h / 2
  const cx = (x1 + x2) / 2
  return {
    d: `M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`,
    labelX: cx,
    labelY: (y1 + y2) / 2,
    label: edge.source_field || edge.target_field || '',
  }
}

// ── Skeleton ──

function DomainListSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-20 rounded-2xl" />
      <div className="grid gap-0 xl:grid-cols-[380px_8px_minmax(0,1fr)]">
        <Skeleton className="h-[42rem] rounded-l-2xl" />
        <div />
        <Skeleton className="h-[42rem] rounded-r-2xl" />
      </div>
    </div>
  )
}

// ── Cube Node Card (canvas preview) ──

function PreviewCubeNode({
  node,
  selected,
  onClick,
}: {
  node: DomainCanvasNode & { x: number; y: number; w: number; h: number }
  selected: boolean
  onClick: () => void
}) {
  return (
    <g
      transform={`translate(${node.x},${node.y})`}
      onClick={onClick}
      className="cursor-pointer"
    >
      {/* Shadow */}
      <rect
        width={node.w}
        height={node.h}
        rx={10}
        fill="white"
        stroke={selected ? 'hsl(var(--workbench-accent))' : 'hsl(var(--workbench-outline))'}
        strokeWidth={selected ? 2 : 1}
        filter="url(#nodeShadow)"
      />
      {/* Header */}
      <rect
        width={node.w}
        height={NODE_HEADER_H}
        rx={10}
        fill={selected ? 'hsl(var(--workbench-accent-soft))' : 'hsl(var(--workbench-surface-2))'}
      />
      {/* Cover bottom corners of header */}
      <rect
        y={NODE_HEADER_H - 10}
        width={node.w}
        height={10}
        fill={selected ? 'hsl(var(--workbench-accent-soft))' : 'hsl(var(--workbench-surface-2))'}
      />
      {/* Header text */}
      <text
        x={12}
        y={22}
        fontSize={12}
        fontWeight={600}
        fill={selected ? 'hsl(var(--workbench-accent))' : 'hsl(var(--workbench-ink))'}
      >
        {node.title || node.id}
      </text>
      {/* Fields placeholder */}
      {Array.from({ length: Math.min(node.dimensions, 6) }).map((_, i) => (
        <g key={`d${i}`} transform={`translate(12, ${NODE_HEADER_H + NODE_PAD + i * NODE_FIELD_H})`}>
          <circle cx={3} cy={6} r={3} fill="hsl(var(--workbench-accent))" />
          <text x={12} y={10} fontSize={10} fill="hsl(var(--workbench-muted-foreground))">
            dim_{i + 1}
          </text>
        </g>
      ))}
      {Array.from({ length: Math.min(node.measures, 4) }).map((_, i) => (
        <g key={`m${i}`} transform={`translate(12, ${NODE_HEADER_H + NODE_PAD + node.dimensions * NODE_FIELD_H + i * NODE_FIELD_H})`}>
          <circle cx={3} cy={6} r={3} fill="hsl(var(--semantic-info, 200 80% 60%))" />
          <text x={12} y={10} fontSize={10} fill="hsl(var(--workbench-muted-foreground))">
            msr_{i + 1}
          </text>
        </g>
      ))}
      {/* Footer */}
      <line
        x1={0}
        y1={node.h - NODE_FOOTER_H}
        x2={node.w}
        y2={node.h - NODE_FOOTER_H}
        stroke="hsl(var(--workbench-outline))"
        strokeWidth={0.5}
      />
      <text
        x={12}
        y={node.h - 8}
        fontSize={9}
        fill="hsl(var(--workbench-muted-foreground))"
      >
        {node.dimensions} 维度 · {node.measures} 指标
      </text>
    </g>
  )
}

// ── Main Component ──

export default function DomainList() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [, setSearchParams] = useSearchParams()

  const [catalogDialogOpen, setCatalogDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [catalogEditingCode, setCatalogEditingCode] = useState<string | null>(null)
  const [activeCatalogCode, setActiveCatalogCode] = useUrlState<string>('catalog', '')
  const [selectedDomainKey] = useUrlState<string>('selected', '')
  const [treeSearch, setTreeSearch] = useState('')
  const [treeState, setTreeState] = useState<TreeState>({
    expandedCatalogs: new Set<string>(),
    expandedDomains: new Set<string>(),
  })
  const [previewSelectedNode, setPreviewSelectedNode] = useState<string | null>(null)

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

  const {
    catalogs,
    activeCatalog,
    domains,
    isLoading,
  } = useDomainGovernance({
    catalogCode: activeCatalogCode || undefined,
    page: 1,
    pageSize: 999,
    lens: 'all',
  })

  // Auto-expand first catalog
  useEffect(() => {
    if (catalogs.length > 0 && treeState.expandedCatalogs.size === 0) {
      setTreeState((prev) => ({
        ...prev,
        expandedCatalogs: new Set([catalogs[0].code]),
      }))
      if (!activeCatalogCode) {
        setActiveCatalogCode(catalogs[0].code)
      }
    }
  }, [catalogs, activeCatalogCode, setActiveCatalogCode, treeState.expandedCatalogs.size])

  // Fetch canvas data for selected domain
  const selectedDomain = useMemo(() => {
    if (!selectedDomainKey) return null
    for (const catalog of catalogs) {
      const found = catalog.domains?.find(
        (d) => (d.id || d.code) === selectedDomainKey,
      )
      if (found) return found
    }
    return domains.find((d) => (d.id || d.code) === selectedDomainKey) || null
  }, [catalogs, domains, selectedDomainKey])

  const canvasQuery = useQuery({
    queryKey: ['semantic', 'domain-canvas', selectedDomainKey],
    queryFn: async () => (await getDomainCanvas(selectedDomainKey)).data,
    enabled: Boolean(selectedDomainKey),
  })
  const canvasData: DomainCanvasData | undefined = canvasQuery.data

  // Layout canvas nodes
  const positionedNodes = useMemo(() => {
    if (!canvasData?.nodes.length) return []
    return layoutNodes(canvasData.nodes)
  }, [canvasData?.nodes])

  const joinPaths = useMemo(() => {
    if (!canvasData?.edges.length || !positionedNodes.length) return []
    return canvasData.edges
      .map((edge) => joinLinePath(positionedNodes, edge))
      .filter(Boolean) as Array<{ d: string; labelX: number; labelY: number; label: string }>
  }, [canvasData?.edges, positionedNodes])

  const canvasWidth = useMemo(() => {
    if (!positionedNodes.length) return 800
    return Math.max(800, ...positionedNodes.map((n) => n.x + n.w + 80))
  }, [positionedNodes])

  const canvasHeight = useMemo(() => {
    if (!positionedNodes.length) return 500
    return Math.max(500, ...positionedNodes.map((n) => n.y + n.h + 80))
  }, [positionedNodes])

  // Tree toggle helpers
  const toggleCatalog = (code: string) => {
    setTreeState((prev) => {
      const next = new Set(prev.expandedCatalogs)
      if (next.has(code)) {
        next.delete(code)
      } else {
        next.add(code)
      }
      return { ...prev, expandedCatalogs: next }
    })
  }

  const toggleDomain = (key: string) => {
    setTreeState((prev) => {
      const next = new Set(prev.expandedDomains)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return { ...prev, expandedDomains: next }
    })
  }

  const selectDomain = (domain: DomainSummary) => {
    const key = domain.id || domain.code
    updateQueryParams({ selected: key })
    setPreviewSelectedNode(null)
  }

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

  const canDeleteCatalog = Boolean(activeCatalog && activeCatalog.code !== 'default' && activeCatalog.domain_count === 0)

  // Filter tree by search
  const filteredCatalogs = useMemo(() => {
    const keyword = treeSearch.trim().toLowerCase()
    if (!keyword) return catalogs
    return catalogs
      .map((catalog) => ({
        ...catalog,
        domains: (catalog.domains || []).filter(
          (d) =>
            d.name.toLowerCase().includes(keyword)
            || d.code.toLowerCase().includes(keyword),
        ),
      }))
      .filter(
        (catalog) =>
          catalog.name.toLowerCase().includes(keyword)
          || catalog.domains.length > 0,
      )
  }, [catalogs, treeSearch])

  if (isLoading) {
    return <DomainListSkeleton />
  }

  return (
    <SemanticPageShell>
      <SemanticPageHeader
        title="领域目录"
        description="从目录和领域结构出发，查看关联资产及 Join 关系预览。"
        eyebrow={null}
        actions={
          <>
            <Button type="button" onClick={() => setCatalogDialogOpen(true)} className="h-10 rounded-full px-4" data-testid="catalog-create-trigger">
              <PlusCircle className="mr-1.5 h-4 w-4" />
              新建目录
            </Button>
            <Button asChild variant="outline" className="h-10 rounded-full border-[hsl(var(--workbench-outline))] bg-white/84 px-4">
              <Link to="/semantic/modeling" data-testid="domain-create-trigger">
                <HelpCircle className="mr-1.5 h-4 w-4" />
                帮助
              </Link>
            </Button>
          </>
        }
      />

      <SemanticSurface bodyClassName="p-0">
        <div className="grid min-h-[42rem] xl:grid-cols-[380px_8px_minmax(0,1fr)]">
          {/* ── Left Panel: Tree ── */}
          <aside className="flex flex-col overflow-hidden border-r-0 bg-[hsl(var(--workbench-surface))]" data-testid="domain-tree-panel">
            {/* Tree Header */}
            <div className="flex items-center justify-between gap-3 border-b border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface-2))] px-4 py-3.5">
              <div className="flex items-center gap-2">
                <ListTree className="h-4 w-4 text-[hsl(var(--workbench-accent))]" />
                <span className="text-[13px] font-semibold text-[hsl(var(--workbench-ink))]">目录结构</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 rounded-lg bg-[hsl(var(--workbench-surface))] px-2.5 py-1.5">
                  <Search className="h-3 w-3 text-[hsl(var(--workbench-muted-foreground))]" />
                  <input
                    type="text"
                    value={treeSearch}
                    onChange={(e) => setTreeSearch(e.target.value)}
                    placeholder="搜索..."
                    className="w-16 bg-transparent text-[11px] text-[hsl(var(--workbench-ink))] placeholder:text-[hsl(var(--workbench-muted-foreground))] focus:outline-none"
                    data-testid="domain-tree-search"
                  />
                </div>
                <button type="button" className="flex h-7 w-7 items-center justify-center rounded-lg">
                  <PanelLeftClose className="h-4 w-4 text-[hsl(var(--workbench-muted-foreground))]" />
                </button>
              </div>
            </div>

            {/* Tree Content */}
            <div className="flex-1 overflow-y-auto" data-testid="domain-tree-content">
              {filteredCatalogs.map((catalog) => {
                const isExpanded = treeState.expandedCatalogs.has(catalog.code)
                const isActive = activeCatalogCode === catalog.code

                return (
                  <div key={catalog.code}>
                    {/* Catalog Header */}
                    <button
                      type="button"
                      onClick={() => {
                        toggleCatalog(catalog.code)
                        setActiveCatalogCode(catalog.code)
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 px-4 py-3 text-left transition-colors',
                        isActive && isExpanded
                          ? 'bg-[hsl(var(--workbench-accent-soft))]'
                          : 'bg-[hsl(var(--workbench-surface-2))] hover:bg-[hsl(var(--workbench-panel))]',
                      )}
                      data-testid={`domain-catalog-${catalog.code}`}
                    >
                      {isExpanded
                        ? <ChevronDown className="h-3.5 w-3.5 text-[hsl(var(--workbench-muted-foreground))]" />
                        : <ChevronRight className="h-3.5 w-3.5 text-[hsl(var(--workbench-muted-foreground))]" />}
                      {isExpanded
                        ? <FolderOpen className="h-4 w-4 text-[hsl(var(--workbench-accent))]" />
                        : <Folder className="h-4 w-4 text-[hsl(var(--workbench-muted-foreground))]" />}
                      <span className="flex-1 truncate text-[13px] font-semibold text-[hsl(var(--workbench-ink))]">
                        {catalog.name}
                      </span>
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-medium',
                        isActive && isExpanded
                          ? 'bg-[hsl(var(--workbench-accent-soft))] text-[hsl(var(--workbench-accent))]'
                          : 'bg-[hsl(var(--workbench-surface))] text-[hsl(var(--workbench-muted-foreground))]',
                      )}>
                        {catalog.domain_count} 领域
                      </span>
                    </button>

                    {/* Catalog Actions (when active) */}
                    {isActive && isExpanded ? (
                      <div className="flex items-center gap-1 border-b border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-accent-soft))] px-4 py-1">
                        <button
                          type="button"
                          onClick={() => {
                            setCatalogEditingCode(catalog.code)
                            setCatalogDialogOpen(true)
                          }}
                          className="rounded p-1 text-[hsl(var(--workbench-muted-foreground))] hover:text-[hsl(var(--workbench-ink))]"
                          data-testid="catalog-edit-trigger"
                        >
                          <Settings2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={!canDeleteCatalog}
                          onClick={() => setDeleteDialogOpen(true)}
                          className="rounded p-1 text-[hsl(var(--workbench-muted-foreground))] hover:text-[hsl(var(--workbench-ink))] disabled:opacity-40"
                          data-testid="catalog-delete-trigger"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : null}

                    {/* Domain Rows */}
                    {isExpanded
                      ? (catalog.domains || []).map((domain) => {
                          const domainKey = domain.id || domain.code
                          const isDomainExpanded = treeState.expandedDomains.has(domainKey)
                          const isDomainSelected = selectedDomainKey === domainKey

                          return (
                            <div key={domainKey}>
                              <button
                                type="button"
                                onClick={() => {
                                  selectDomain(domain)
                                  toggleDomain(domainKey)
                                }}
                                className={cn(
                                  'flex w-full items-center gap-2 py-2.5 pl-9 pr-4 text-left transition-colors',
                                  isDomainSelected
                                    ? 'bg-[hsl(var(--workbench-accent-soft))]'
                                    : 'hover:bg-[hsl(var(--workbench-panel))]',
                                )}
                                data-testid={`domain-list-item-${domainKey}`}
                              >
                                {isDomainExpanded
                                  ? <ChevronDown className="h-3 w-3 text-[hsl(var(--workbench-muted-foreground))]" />
                                  : <ChevronRight className="h-3 w-3 text-[hsl(var(--workbench-muted-foreground))]" />}
                                <Network className={cn(
                                  'h-3.5 w-3.5',
                                  isDomainSelected ? 'text-[hsl(var(--workbench-accent))]' : 'text-[hsl(var(--workbench-muted-foreground))]',
                                )} />
                                <span className={cn(
                                  'flex-1 truncate text-[12px]',
                                  isDomainSelected ? 'font-medium text-[hsl(var(--workbench-accent))]' : 'text-[hsl(var(--workbench-ink))]',
                                )}>
                                  {domain.name}
                                </span>
                                <span className="rounded-lg bg-[hsl(var(--workbench-surface))] px-1.5 py-0.5 text-[10px] text-[hsl(var(--workbench-muted-foreground))]">
                                  {domain.cube_count} Cubes
                                </span>
                              </button>

                              {/* Cube Rows (from canvas data if this is the selected domain) */}
                              {isDomainExpanded && isDomainSelected && canvasData?.nodes
                                ? canvasData.nodes.map((cube) => (
                                    <button
                                      key={cube.id}
                                      type="button"
                                      onClick={() => setPreviewSelectedNode(cube.id)}
                                      className={cn(
                                        'flex w-full items-center gap-2 py-2 pl-14 pr-4 text-left transition-colors',
                                        previewSelectedNode === cube.id
                                          ? 'bg-[hsl(var(--workbench-accent-soft))]'
                                          : 'hover:bg-[hsl(var(--workbench-panel))]',
                                      )}
                                      data-testid={`domain-cube-${cube.id}`}
                                    >
                                      <Box className="h-3 w-3 text-[hsl(var(--workbench-muted-foreground))]" />
                                      <span className="flex-1 truncate text-[12px] text-[hsl(var(--workbench-ink))]">
                                        {cube.title || cube.id}
                                      </span>
                                      <span className="text-[10px] text-[hsl(var(--workbench-muted-foreground))]">
                                        {cube.dimensions}维 · {cube.measures}指
                                      </span>
                                    </button>
                                  ))
                                : null}

                              {/* Show cube count hint if domain expanded but not selected */}
                              {isDomainExpanded && !isDomainSelected && domain.cube_count > 0 ? (
                                <div className="py-2 pl-14 pr-4 text-[11px] text-[hsl(var(--workbench-muted-foreground))]">
                                  点击选中领域后查看 Cube 列表
                                </div>
                              ) : null}
                            </div>
                          )
                        })
                      : null}
                  </div>
                )
              })}

              {filteredCatalogs.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-[hsl(var(--workbench-muted-foreground))]">
                  {treeSearch ? '没有匹配的目录或领域' : '还没有创建目录'}
                </div>
              ) : null}
            </div>
          </aside>

          {/* ── Resize Handle ── */}
          <div className="flex cursor-col-resize items-center justify-center">
            <div className="h-10 w-[3px] rounded-sm bg-[hsl(var(--workbench-outline))]" />
          </div>

          {/* ── Right Panel: Canvas Preview ── */}
          <section className="flex flex-col bg-[hsl(var(--workbench-surface-2))]" data-testid="domain-canvas-preview">
            {/* Canvas Header */}
            <div className="flex items-center justify-between border-b border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] px-5 py-3">
              <div className="flex items-center gap-2">
                <Network className="h-4 w-4 text-[hsl(var(--workbench-accent))]" />
                <span className="text-[13px] font-semibold text-[hsl(var(--workbench-ink))]">
                  {selectedDomain
                    ? `${selectedDomain.name} · Join 关系预览`
                    : '选择一个领域查看关系预览'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <ZoomOut className="h-3.5 w-3.5 text-[hsl(var(--workbench-muted-foreground))]" />
                <span className="text-[11px] text-[hsl(var(--workbench-muted-foreground))]">100%</span>
                <ZoomIn className="h-3.5 w-3.5 text-[hsl(var(--workbench-muted-foreground))]" />
                <Maximize2 className="h-3.5 w-3.5 text-[hsl(var(--workbench-muted-foreground))]" />
              </div>
            </div>

            {/* Canvas Area */}
            <div className="relative flex-1 overflow-auto bg-[hsl(var(--workbench-surface-2))]">
              {selectedDomain && canvasData?.nodes.length ? (
                <svg
                  width={canvasWidth}
                  height={canvasHeight}
                  viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
                  className="min-h-full min-w-full"
                >
                  <defs>
                    <filter id="nodeShadow" x="-10%" y="-10%" width="120%" height="130%">
                      <feDropShadow dx="0" dy="2" stdDeviation="8" floodColor="#2563EB" floodOpacity="0.08" />
                    </filter>
                  </defs>

                  {/* Join Lines */}
                  {joinPaths.map((path, i) => (
                    <g key={i}>
                      <path
                        d={path.d}
                        fill="none"
                        stroke="hsl(var(--workbench-accent))"
                        strokeWidth={2}
                        strokeDasharray="none"
                      />
                      {path.label ? (
                        <g transform={`translate(${path.labelX - 30}, ${path.labelY - 8})`}>
                          <rect width={60} height={16} rx={8} fill="hsl(var(--workbench-accent-soft))" stroke="hsl(var(--workbench-accent))" strokeWidth={1} />
                          <text x={30} y={12} textAnchor="middle" fontSize={9} fontWeight={500} fill="hsl(var(--workbench-accent))">
                            {path.label}
                          </text>
                        </g>
                      ) : null}
                    </g>
                  ))}

                  {/* Cube Nodes */}
                  {positionedNodes.map((node) => (
                    <PreviewCubeNode
                      key={node.id}
                      node={node}
                      selected={previewSelectedNode === node.id}
                      onClick={() => setPreviewSelectedNode(node.id)}
                    />
                  ))}
                </svg>
              ) : selectedDomain ? (
                <div className="flex h-full items-center justify-center">
                  <div className="flex items-center gap-2 rounded-full bg-[hsl(var(--workbench-surface))] px-4 py-2 text-[11px] text-[hsl(var(--workbench-muted-foreground))]">
                    <Info className="h-3 w-3" />
                    当前领域还没有 Cube 或 Join 关系
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <div className="flex items-center gap-2 rounded-full bg-[hsl(var(--workbench-surface))] px-4 py-2 text-[11px] text-[hsl(var(--workbench-muted-foreground))]">
                    <Info className="h-3 w-3" />
                    点击左侧领域查看 Join 关系
                  </div>
                </div>
              )}

              {/* Info card overlay (bottom-right) */}
              {selectedDomain ? (
                <div className="absolute bottom-4 right-4 w-56 rounded-xl border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] p-4 shadow-sm">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--workbench-muted-foreground))]">
                    管理与治理
                  </div>
                  <div className="mt-2 text-[13px] font-semibold text-[hsl(var(--workbench-ink))]">
                    {selectedDomain.name}
                  </div>
                  <div className="mt-1 text-[11px] text-[hsl(var(--workbench-muted-foreground))]">
                    {getSemanticStatusLabel(selectedDomain.status)} · {selectedDomain.cube_count} Cube · {selectedDomain.join_count} Join
                  </div>
                  <Button asChild size="sm" className="mt-3 h-8 w-full rounded-lg text-xs" data-testid="domain-open-design">
                    <Link to={`/semantic/domains/${selectedDomain.id || selectedDomain.code}`}>
                      进入画布
                    </Link>
                  </Button>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </SemanticSurface>

      {/* ── Dialogs ── */}
      <CatalogEditorDialog
        open={catalogDialogOpen}
        catalog={catalogEditingCode ? catalogs.find((c) => c.code === catalogEditingCode) : undefined}
        onOpenChange={(open) => {
          setCatalogDialogOpen(open)
          if (!open) setCatalogEditingCode(null)
        }}
        onSuccess={(catalog) => {
          updateQueryParams({ catalog: catalog.code })
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
