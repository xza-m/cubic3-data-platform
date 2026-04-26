// frontend/src/v2/pages/semantic/ontology/_shared/OntologyRelationGraph.tsx
//
// Ontology 关系图（受控 SVG 组件）
// - 节点 = 业务对象（去重于 source_object_name + target_object_name）
// - 边 = 业务关系（BusinessRelation）
// - 默认环形布局；节点拖拽 + 位置持久化到 localStorage
// - 受控 selected：null | { kind:'object', name } | { kind:'relation', name }
//
// 与 frontend/src/v2/pages/semantic/relations/RelationCanvas.tsx 风格保持一致，
// 但数据源、节点字段、视觉语言独立——故未直接复用。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { t } from '@v2/i18n'
import type { BusinessObject, BusinessRelation } from '@v2/api/ontology'

const DEFAULT_STORAGE_KEY = 'cubic3.ontology-relation-graph.positions'
const NODE_R = 18
const CANVAS_W = 720
const CANVAS_H = 480

export type OntologyGraphSelection =
  | { kind: 'object'; name: string }
  | { kind: 'relation'; name: string }
  | null

type Positions = Record<string, { x: number; y: number }>

interface OntologyRelationGraphProps {
  objects: BusinessObject[]
  relations: BusinessRelation[]
  selected: OntologyGraphSelection
  onSelectObject: (name: string | null) => void
  onSelectRelation: (name: string | null) => void
  storageKey?: string
}

function loadPositions(key: string): Positions {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as Positions) : {}
  } catch {
    return {}
  }
}

function savePositions(key: string, positions: Positions): void {
  try {
    localStorage.setItem(key, JSON.stringify(positions))
  } catch {
    // ignore
  }
}

function computeDefaultPositions(objectNames: string[]): Positions {
  const cx = CANVAS_W / 2
  const cy = CANVAS_H / 2
  const radius = Math.min(cx, cy) * 0.72
  return Object.fromEntries(
    objectNames.map((name, i) => {
      const angle = (i / Math.max(1, objectNames.length)) * Math.PI * 2 - Math.PI / 2
      return [name, { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) }]
    }),
  )
}

export function OntologyRelationGraph({
  objects,
  relations,
  selected,
  onSelectObject,
  onSelectRelation,
  storageKey = DEFAULT_STORAGE_KEY,
}: OntologyRelationGraphProps) {
  // 节点集合：取所有对象名 ∪ relation 涉及的对象名（防止 ontology 对象列表
  // 与 relation 列表不一致时丢失节点）。
  const objectNames = useMemo<string[]>(() => {
    const set = new Set<string>()
    for (const o of objects) set.add(o.name)
    for (const r of relations) {
      if (r.source_object_name) set.add(r.source_object_name)
      if (r.target_object_name) set.add(r.target_object_name)
    }
    return Array.from(set)
  }, [objects, relations])

  const titleByName = useMemo<Record<string, string>>(
    () => Object.fromEntries(objects.map((o) => [o.name, o.title || o.name])),
    [objects],
  )

  const [positions, setPositions] = useState<Positions>(() => loadPositions(storageKey))

  const effectivePositions = useMemo<Positions>(() => {
    const defaults = computeDefaultPositions(objectNames)
    const merged: Positions = {}
    for (const name of objectNames) {
      merged[name] = positions[name] ?? defaults[name]
    }
    return merged
  }, [objectNames, positions])

  const dragging = useRef<{ name: string; ox: number; oy: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const onNodePointerDown = useCallback(
    (e: React.PointerEvent, name: string) => {
      e.stopPropagation()
      const svg = svgRef.current
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      const px = ((e.clientX - rect.left) / rect.width) * CANVAS_W
      const py = ((e.clientY - rect.top) / rect.height) * CANVAS_H
      const pos = effectivePositions[name] ?? { x: CANVAS_W / 2, y: CANVAS_H / 2 }
      dragging.current = { name, ox: pos.x - px, oy: pos.y - py }
      ;(e.target as Element).setPointerCapture(e.pointerId)
    },
    [effectivePositions],
  )

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging.current) return
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * CANVAS_W
    const py = ((e.clientY - rect.top) / rect.height) * CANVAS_H
    const { name, ox, oy } = dragging.current
    setPositions((prev) => {
      const next = { ...prev, [name]: { x: px + ox, y: py + oy } }
      savePositions(storageKey, next)
      return next
    })
  }, [storageKey])

  const onPointerUp = useCallback(() => {
    dragging.current = null
  }, [])

  // 高亮判定
  const isObjectActive = useCallback(
    (name: string): boolean => {
      if (!selected) return false
      if (selected.kind === 'object') return selected.name === name
      const rel = relations.find((r) => r.name === selected.name)
      if (!rel) return false
      return rel.source_object_name === name || rel.target_object_name === name
    },
    [selected, relations],
  )

  const isRelationActive = useCallback(
    (rel: BusinessRelation): boolean => {
      if (!selected) return false
      if (selected.kind === 'relation') return selected.name === rel.name
      return rel.source_object_name === selected.name || rel.target_object_name === selected.name
    },
    [selected],
  )

  // ESC 清除选中
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selected) {
        if (selected.kind === 'object') onSelectObject(null)
        else onSelectRelation(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, onSelectObject, onSelectRelation])

  if (objectNames.length === 0) {
    return (
      <div
        className="flex h-full min-h-[280px] flex-1 items-center justify-center text-sm text-3"
        data-testid="ontology-relation-graph-empty"
      >
        {t('ontology.relations.graphEmpty', '尚无对象关系可视化')}
      </div>
    )
  }

  return (
    <div
      className="flex flex-1 overflow-hidden"
      style={{ background: 'var(--bg-app)' }}
      onClick={() => {
        if (selected?.kind === 'object') onSelectObject(null)
        if (selected?.kind === 'relation') onSelectRelation(null)
      }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: '100%', display: 'block' }}
        role="img"
        aria-label={t('ontology.relations.aria.canvas', '本体关系图')}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        data-testid="ontology-relation-graph"
      >
        <defs>
          <marker id="orgr-arrow" markerWidth="8" markerHeight="8" refX="22" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="var(--border-strong)" />
          </marker>
          <marker
            id="orgr-arrow-active"
            markerWidth="8"
            markerHeight="8"
            refX="22"
            refY="4"
            orient="auto"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill="var(--accent)" />
          </marker>
        </defs>

        {/* 边 */}
        {relations.map((rel) => {
          const a = effectivePositions[rel.source_object_name]
          const b = effectivePositions[rel.target_object_name]
          if (!a || !b) return null
          const active = isRelationActive(rel)
          const dimmed = selected !== null && !active
          return (
            <g
              key={rel.name}
              opacity={dimmed ? 0.18 : 1}
              role="button"
              aria-label={t('ontology.relations.aria.edge', '关系：{name}', { name: rel.name })}
              aria-pressed={selected?.kind === 'relation' && selected.name === rel.name}
              onClick={(e) => {
                e.stopPropagation()
                onSelectRelation(rel.name)
              }}
              style={{ cursor: 'pointer' }}
              data-testid={`ontology-relation-edge-${rel.name}`}
            >
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={active ? 'var(--accent)' : 'var(--border-strong)'}
                strokeWidth={active ? 2 : 1}
                markerEnd={active ? 'url(#orgr-arrow-active)' : 'url(#orgr-arrow)'}
              />
              {/* 透明粗线扩大点击区 */}
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="transparent"
                strokeWidth={12}
              />
              <text
                x={(a.x + b.x) / 2}
                y={(a.y + b.y) / 2 - 6}
                fontSize="10"
                fill={active ? 'var(--accent)' : 'var(--text-3)'}
                textAnchor="middle"
                fontFamily="ui-monospace, monospace"
                style={{ pointerEvents: 'none' }}
              >
                {rel.relation_type ? `${rel.name} · ${rel.relation_type}` : rel.name}
              </text>
            </g>
          )
        })}

        {/* 节点 */}
        {objectNames.map((name) => {
          const pos = effectivePositions[name]
          if (!pos) return null
          const active = isObjectActive(name)
          const dimmed = selected !== null && !active
          const title = titleByName[name] ?? name
          return (
            <g
              key={name}
              onPointerDown={(e) => onNodePointerDown(e, name)}
              onClick={(e) => {
                e.stopPropagation()
                onSelectObject(name)
              }}
              style={{ cursor: 'grab', userSelect: 'none' }}
              opacity={dimmed ? 0.32 : 1}
              role="button"
              aria-label={t('ontology.relations.aria.node', '业务对象：{name}', { name: title })}
              aria-pressed={active}
              data-testid={`ontology-relation-node-${name}`}
            >
              <circle
                cx={pos.x}
                cy={pos.y}
                r={active ? NODE_R + 6 : NODE_R + 2}
                fill="var(--accent)"
                opacity={0.12}
              />
              <circle
                cx={pos.x}
                cy={pos.y}
                r={active ? NODE_R : NODE_R - 2}
                fill="var(--accent)"
                stroke={active ? 'var(--bg-surface)' : 'transparent'}
                strokeWidth={2}
              />
              <text
                x={pos.x}
                y={pos.y + NODE_R + 14}
                fontSize="11"
                fill="var(--text-1)"
                textAnchor="middle"
                fontWeight={active ? 600 : 400}
                style={{ pointerEvents: 'none' }}
              >
                {title.length > 12 ? `${title.slice(0, 12)}…` : title}
              </text>
              <text
                x={pos.x}
                y={pos.y + 3}
                fontSize="9"
                fill="white"
                textAnchor="middle"
                fontWeight={600}
                style={{ pointerEvents: 'none' }}
              >
                {name.length > 6 ? name.slice(0, 6) : name}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export default OntologyRelationGraph
