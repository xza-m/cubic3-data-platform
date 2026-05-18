// frontend/src/v2/pages/semantic/relations/RelationCanvas.tsx
//
// 语义关系画布页（P6）。
// 接口：GET /api/v1/semantic/graph（真实接口，返回 cube 节点 + join 关系边）
//
// 渲染：纯 SVG 自绘节点+连线（不依赖 react-flow）。
// 节点拖拽位置持久化到 localStorage。
// 点击节点 → Inspector 侧栏 peek。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Boxes, GitMerge, LayoutGrid, ZoomIn, ZoomOut } from 'lucide-react'
import { Button, Chip, Skeleton } from '@v2/components/ui'
import { RefreshButton } from '@v2/components/CommonControls'
import { useAppShell } from '@v2/layout/AppShell'
import { ContextRow, ContextSection } from '@v2/layout/Inspector'
import { t } from '@v2/i18n'
import { useSemanticGraph } from '@v2/hooks/semantic'
import type { SemanticGraphNode, SemanticGraphEdge } from '@v2/api/semantic'

// ─── 常量 ─────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'cubic3.relation-canvas.positions'
const NODE_R = 18
const CANVAS_W = 900
const CANVAS_H = 540

const TYPE_COLOR: Record<string, string> = {
  fact: 'var(--violet)',
  dimension: 'var(--accent)',
}

// ─── 位置持久化 ───────────────────────────────────────────────────────────────

type Positions = Record<string, { x: number; y: number }>

function loadPositions(): Positions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Positions) : {}
  } catch {
    return {}
  }
}

function savePositions(positions: Positions): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(positions))
  } catch {
    // ignore
  }
}

// ─── 默认布局：环形分布 ───────────────────────────────────────────────────────

function computeDefaultPositions(nodes: SemanticGraphNode[]): Positions {
  const cx = CANVAS_W / 2
  const cy = CANVAS_H / 2
  const radius = Math.min(cx, cy) * 0.72
  return Object.fromEntries(
    nodes.map((n, i) => {
      const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2 - Math.PI / 2
      return [n.id, { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) }]
    }),
  )
}

// ─── 主页面 ──────────────────────────────────────────────────────────────────

export default function RelationCanvas() {
  const navigate = useNavigate()
  const { setBreadcrumbs, setTopBarActions, setContextPanel } = useAppShell()
  const graphQuery = useSemanticGraph()
  const nodes = useMemo<SemanticGraphNode[]>(() => graphQuery.data?.nodes ?? [], [graphQuery.data])
  const edges = useMemo<SemanticGraphEdge[]>(() => graphQuery.data?.edges ?? [], [graphQuery.data])

  const [positions, setPositions] = useState<Positions>(() => loadPositions())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [scale, setScale] = useState(1)

  // 合并持久化位置与新增节点的默认位置
  const effectivePositions = useMemo<Positions>(() => {
    const defaults = computeDefaultPositions(nodes)
    const merged: Positions = {}
    for (const n of nodes) {
      merged[n.id] = positions[n.id] ?? defaults[n.id]
    }
    return merged
  }, [nodes, positions])

  // ── 面包屑 & TopBar ──
  useEffect(() => {
    setBreadcrumbs([t('nav.semantic', '语义中心'), t('nav.relations', '关系画布')])
  }, [setBreadcrumbs])

  useEffect(() => {
    setTopBarActions(
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            const defaults = computeDefaultPositions(nodes)
            setPositions(defaults)
            savePositions(defaults)
          }}
          title={t('canvas.resetLayout', '重置布局')}
        >
          <LayoutGrid size={12} /> {t('canvas.resetLayout', '重置布局')}
        </Button>
        <RefreshButton
          onClick={() => graphQuery.refetch()}
          loading={graphQuery.isFetching}
          ariaLabel={t('canvas.action.refresh', '刷新关系画布')}
        />
        <Button size="sm" variant="ghost" onClick={() => setScale((s) => Math.min(s + 0.2, 2))}>
          <ZoomIn size={12} />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setScale((s) => Math.max(s - 0.2, 0.4))}>
          <ZoomOut size={12} />
        </Button>
      </div>,
    )
    return () => setTopBarActions(null)
  }, [setTopBarActions, graphQuery, nodes])

  // ── 侧栏 Context Panel ──
  useEffect(() => {
    const node = nodes.find((n) => n.id === selectedId) ?? null
    if (!node) {
      setContextPanel(null)
      return
    }
    setContextPanel({
      title: node.title,
      subtitle: `${node.type === 'fact' ? t('nodeType.fact', '事实表') : t('nodeType.dimension', '维度表')} · Cube`,
      body: (
        <>
          <ContextSection title={t('cube.contextBasic', '基础')}>
            <ContextRow label="Cube ID" value={<code>{node.id}</code>} />
            <ContextRow
              label={t('col.type', '类型')}
              value={<Chip tone={node.type === 'fact' ? 'accent' : 'neutral'}>{node.type}</Chip>}
            />
            <ContextRow label={t('cube.dimensions', '维度')} value={node.dimensions} />
            <ContextRow label={t('cube.measures', '度量')} value={node.measures} />
            {node.status && (
              <ContextRow label={t('col.status', '状态')} value={<Chip tone="neutral">{node.status}</Chip>} />
            )}
            {node.source_binding_summary && (
              <ContextRow
                label={t('cube.source', '数据源')}
                value={<code className="text-xs">{node.source_binding_summary}</code>}
              />
            )}
          </ContextSection>
          <ContextSection title={t('canvas.relations', '关联 Join')}>
            <RelatedEdges nodeId={node.id} edges={edges} nodes={nodes} />
          </ContextSection>
          <div className="px-4 py-2">
            <Button
              size="sm"
              variant="ghost"
              className="w-full justify-start"
              onClick={() => navigate(`/semantic/cubes/${node.id}`)}
            >
              <Boxes size={12} /> {t('action.viewDetail', '查看 Cube 详情')}
            </Button>
          </div>
        </>
      ),
    })
    return () => setContextPanel(null)
  }, [setContextPanel, selectedId, nodes, edges, navigate])

  // ── 节点拖拽 ──
  const dragging = useRef<{ id: string; ox: number; oy: number; px: number; py: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const onNodePointerDown = useCallback(
    (e: React.PointerEvent, id: string) => {
      e.stopPropagation()
      setSelectedId(id)
      const svg = svgRef.current
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      const px = (e.clientX - rect.left) / scale
      const py = (e.clientY - rect.top) / scale
      const pos = effectivePositions[id] ?? { x: CANVAS_W / 2, y: CANVAS_H / 2 }
      dragging.current = { id, ox: pos.x - px, oy: pos.y - py, px, py }
      ;(e.target as Element).setPointerCapture(e.pointerId)
    },
    [effectivePositions, scale],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!dragging.current) return
      const svg = svgRef.current
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      const px = (e.clientX - rect.left) / scale
      const py = (e.clientY - rect.top) / scale
      const { id, ox, oy } = dragging.current
      const newPos = { x: px + ox, y: py + oy }
      setPositions((prev) => {
        const next = { ...prev, [id]: newPos }
        savePositions(next)
        return next
      })
    },
    [scale],
  )

  const onPointerUp = useCallback(() => {
    dragging.current = null
  }, [])

  if (graphQuery.isLoading) {
    return (
      <div className="flex flex-1 flex-col gap-3 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[480px]" />
      </div>
    )
  }

  if (graphQuery.isError) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-danger">
        {t('error.loadFailed', '加载失败')}
      </div>
    )
  }

  if (nodes.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-3">
        {t('canvas.empty', '暂无 Cube 数据')}
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* 统计栏 */}
      <div
        className="shrink-0 border-b px-4 py-2 flex items-center gap-4 text-xs text-3"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        <span className="flex items-center gap-1">
          <Boxes size={12} />
          {nodes.length} Cubes
        </span>
        <span className="flex items-center gap-1">
          <GitMerge size={12} />
          {edges.length} {t('canvas.joins', 'Join 关系')}
        </span>
        <div className="ml-auto flex items-center gap-3">
          {(['fact', 'dimension'] as const).map((type) => (
            <span key={type} className="flex items-center gap-1">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: TYPE_COLOR[type] }}
              />
              {type === 'fact' ? t('nodeType.fact', '事实表') : t('nodeType.dimension', '维度表')}
            </span>
          ))}
        </div>
      </div>

      {/* 画布 */}
      <div
        className="flex-1 overflow-auto"
        style={{ background: 'var(--bg-app)' }}
        onClick={() => setSelectedId(null)}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
          style={{
            width: CANVAS_W * scale,
            height: CANVAS_H * scale,
            display: 'block',
            margin: 'auto',
          }}
          role="img"
          aria-label={t('canvas.ariaLabel', '语义关系图')}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <defs>
            <marker id="rc-arrow" markerWidth="8" markerHeight="8" refX="22" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="var(--border-strong)" />
            </marker>
            <marker id="rc-arrow-active" markerWidth="8" markerHeight="8" refX="22" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="var(--accent)" />
            </marker>
          </defs>

          {/* 连线 */}
          {edges.map((edge, i) => {
            const a = effectivePositions[edge.source]
            const b = effectivePositions[edge.target]
            if (!a || !b) return null
            const isActive = selectedId === edge.source || selectedId === edge.target
            return (
              <g key={i} opacity={selectedId && !isActive ? 0.2 : 1}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={isActive ? 'var(--accent)' : 'var(--border-strong)'}
                  strokeWidth={isActive ? 2 : 1}
                  markerEnd={isActive ? 'url(#rc-arrow-active)' : 'url(#rc-arrow)'}
                />
                {edge.relationship && (
                  <text
                    x={(a.x + b.x) / 2}
                    y={(a.y + b.y) / 2 - 6}
                    fontSize="10"
                    fill="var(--text-3)"
                    textAnchor="middle"
                    fontFamily="ui-monospace, monospace"
                  >
                    {edge.relationship}
                  </text>
                )}
              </g>
            )
          })}

          {/* 节点 */}
          {nodes.map((node) => {
            const pos = effectivePositions[node.id]
            if (!pos) return null
            const isActive = selectedId === node.id
            const isDimmed = selectedId !== null && !isActive
            const color = TYPE_COLOR[node.type] ?? 'var(--accent)'
            return (
              <g
                key={node.id}
                onPointerDown={(e) => onNodePointerDown(e, node.id)}
                style={{ cursor: 'grab', userSelect: 'none' }}
                opacity={isDimmed ? 0.3 : 1}
                role="button"
                aria-label={node.title}
                aria-pressed={isActive}
              >
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={isActive ? NODE_R + 6 : NODE_R + 2}
                  fill={color}
                  opacity={0.12}
                />
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={isActive ? NODE_R : NODE_R - 2}
                  fill={color}
                  stroke={isActive ? 'var(--bg-surface)' : 'transparent'}
                  strokeWidth={2}
                />
                <text
                  x={pos.x}
                  y={pos.y + NODE_R + 14}
                  fontSize="11"
                  fill="var(--text-1)"
                  textAnchor="middle"
                  fontWeight={isActive ? 600 : 400}
                >
                  {node.title.length > 14 ? `${node.title.slice(0, 14)}…` : node.title}
                </text>
                {/* 维度/度量数徽章 */}
                <text
                  x={pos.x}
                  y={pos.y + 4}
                  fontSize="9"
                  fill="white"
                  textAnchor="middle"
                  fontWeight={600}
                >
                  {node.dimensions}/{node.measures}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

// ─── 子组件 ──────────────────────────────────────────────────────────────────

function RelatedEdges({
  nodeId,
  edges,
  nodes,
}: {
  nodeId: string
  edges: SemanticGraphEdge[]
  nodes: SemanticGraphNode[]
}) {
  const related = edges.filter((e) => e.source === nodeId || e.target === nodeId)
  const nameOf = (id: string) => nodes.find((n) => n.id === id)?.title ?? id
  if (!related.length) {
    return <div className="px-4 py-2 text-xs text-3">{t('canvas.noRelations', '无 Join 关系')}</div>
  }
  return (
    <div className="px-4 py-2 space-y-1">
      {related.map((e, i) => (
        <div
          key={i}
          className="flex items-center gap-1.5 rounded border px-2 py-1 text-xs"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-hover)' }}
        >
          <span className="text-2">{nameOf(e.source)}</span>
          {e.relationship && <Chip tone="neutral">{e.relationship}</Chip>}
          <span className="text-3">→</span>
          <span className="text-2">{nameOf(e.target)}</span>
          {e.join_type && <Chip tone="neutral">{e.join_type}</Chip>}
        </div>
      ))}
    </div>
  )
}
