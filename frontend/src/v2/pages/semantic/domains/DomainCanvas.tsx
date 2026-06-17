// frontend/src/v2/pages/semantic/domains/DomainCanvas.tsx
//
// 业务上下文资产画布页。展示域内 Cube 资产组织，不承载 Join / 关系语义。
// 接口：GET /api/v1/semantic/domains/:id       (详情)
//       GET /api/v1/semantic/domains/:id/canvas (节点/边)
//       POST /api/v1/semantic/domains/:id/publish
//
// 画布渲染：纯 SVG 圆形资产布局（Placeholder，不依赖 react-flow）

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Boxes, CheckCircle2, Clock, History, Save, Search, XCircle } from 'lucide-react'
// 等待 X-Crosscut：@v2/components/ui
import { Button, Card, CardBody, CardHead, Chip, Input, Sheet, Skeleton, useConfirm, useToast } from '@v2/components/ui'
// 等待 X-Crosscut：@v2/layout/AppShell
import { useAppShell } from '@v2/layout/AppShell'
import { Can } from '@v2/components/Can'
// 等待 X-Crosscut：@v2/i18n
import { t } from '@v2/i18n'
import { useDomainDetail, useDomainCanvas, useDomainList, usePublishDomain, useDomainPublishHistory } from '@v2/hooks/semantic'
import type { DomainCanvasNode, DomainPublishRecord, DomainSummary } from '@v2/api/semantic'

// ---- 类型常量 ----

type NodeType = 'fact' | 'dimension' | 'cube'

const TYPE_COLOR: Record<string, string> = {
  fact: 'var(--accent)',
  dimension: 'var(--violet)',
  cube: 'var(--warning)',
}

const TYPE_ICON: Record<string, typeof Boxes> = {
  fact: Boxes,
  dimension: Boxes,
  cube: Boxes,
}

const TYPE_LABEL: Record<string, string> = {
  fact: t('nodeType.factCube', '事实 Cube'),
  dimension: t('nodeType.dimensionCube', '维度 Cube'),
  cube: t('nodeType.cube', 'Cube'),
}

type Filter = 'all' | NodeType

export default function DomainCanvas() {
  const { id } = useParams<{ id: string }>()
  const domainId = id
  const navigate = useNavigate()
  const { setBreadcrumbs, setTopBarActions, setContextPanel } = useAppShell()
  const toast = useToast()
  const confirm = useConfirm()

  const [activeNodeId, setActiveNodeId] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [keyword, setKeyword] = useState('')
  const [showHistory, setShowHistory] = useState(false)

  const domainQuery = useDomainDetail(domainId)
  const canvasQuery = useDomainCanvas(domainId)
  const domainListQuery = useDomainList({ page_size: 200 })
  const publishDomain = usePublishDomain()
  const historyQuery = useDomainPublishHistory(showHistory ? domainId : undefined)

  const domain = domainQuery.data
  const canvas = canvasQuery.data
  const nodes = useMemo<DomainCanvasNode[]>(() => canvas?.nodes ?? [], [canvas])
  const domainDisplayName = domain?.title || domain?.name || domain?.code || domain?.id || domainId || ''
  const canonicalDomain = useMemo(() => {
    if (!domainId) return null
    return (domainListQuery.data?.domains ?? []).find((item) => domainMatchesRouteId(item, domainId)) ?? null
  }, [domainId, domainListQuery.data?.domains])

  // ---- 面包屑 & TopBar ----
  useEffect(() => {
    setBreadcrumbs([
      t('nav.semantic', '语义中心'),
      t('nav.domains', '业务上下文'),
      domainDisplayName,
    ])
  }, [setBreadcrumbs, domainDisplayName])

  useEffect(() => {
    if (!domainId || !domainQuery.isError || !canonicalDomain) return
    const canonicalId = domainStableId(canonicalDomain)
    if (canonicalId && canonicalId !== domainId) {
      navigate(`/semantic/domains/${encodeURIComponent(canonicalId)}`, { replace: true })
    }
  }, [canonicalDomain, domainId, domainQuery.isError, navigate])

  const handlePublish = useCallback(async () => {
    if (!domainId) return
    const ok = await confirm({
      title: t('domain.publishConfirm', '发布域「{name}」？', { name: domainDisplayName }),
      description: t('domain.publishConfirmDesc', '发布后该域的最新语义资产将对消费方可见。'),
    })
    if (!ok) return
    try {
      await publishDomain.mutateAsync({ id: domainId })
      toast.show({ tone: 'success', title: t('domain.publishSuccess', '发布成功') })
    } catch (err) {
      toast.show({
        tone: 'danger',
        title: t('domain.publishFailed', '发布失败'),
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }, [confirm, domainDisplayName, domainId, publishDomain, toast])

  useEffect(() => {
    setTopBarActions(
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => navigate('/semantic/domains')}>
          <ArrowLeft size={12} /> {t('action.back', '返回列表')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowHistory(true)}
        >
          <History size={12} /> {t('domain.publishHistory', '发布历史')}
        </Button>
        <Can action="semantic.write">
          <Button
            size="sm"
            variant="primary"
            loading={publishDomain.isPending}
            onClick={handlePublish}
          >
            <Save size={12} /> {t('action.publish', '发布域')}
          </Button>
        </Can>
      </div>,
    )
    return () => setTopBarActions(null)
  }, [setTopBarActions, navigate, handlePublish, publishDomain.isPending])

  // ---- 侧栏 Context Panel ----
  useEffect(() => {
    const nodeCounts: Record<string, number> = {}
    for (const n of nodes) {
      nodeCounts[n.type] = (nodeCounts[n.type] ?? 0) + 1
    }

    const activeNode = nodes.find((n) => n.id === activeNodeId) ?? null

    if (activeNode) {
      setContextPanel({
        title: activeNode.title,
        subtitle: TYPE_LABEL[activeNode.type] ?? activeNode.type,
        body: (
          <div className="flex flex-col gap-3 px-4 py-3 text-xs">
            <CtxRow label={t('col.type', '类型')} value={<Chip tone="neutral">{TYPE_LABEL[activeNode.type]}</Chip>} />
            <CtxRow label="ID" value={<code>{activeNode.id}</code>} />
            {activeNode.source_binding_summary ? (
              <CtxRow label={t('cubeCreate.factTable', '来源')} value={<code className="text-xs">{activeNode.source_binding_summary}</code>} />
            ) : null}
            <div className="mt-2 border-t pt-2" style={{ borderColor: 'var(--border)' }}>
              <div className="mb-1 font-medium text-2">{t('canvas.domainPeers', '同域资产')}</div>
              <NodeDomainPeers nodeId={activeNode.id} nodes={nodes} />
            </div>
            <div className="mt-2 border-t pt-2" style={{ borderColor: 'var(--border)' }}>
              <Button
                size="sm"
                variant="ghost"
                className="w-full justify-start"
                onClick={() => {
                  // drop-frontend: backend DomainCanvasNode has no node_type — only fact/dimension cube nodes are routable.
                  if (activeNode.type === 'fact' || activeNode.type === 'dimension') {
                    navigate(`/semantic/cubes/${activeNode.id}/edit`)
                  }
                }}
              >
                {t('action.viewDetail', '查看详情')}
              </Button>
            </div>
          </div>
        ),
      })
    } else if (domain) {
      setContextPanel({
        title: domainDisplayName,
        subtitle: `${t('nav.domain', '业务上下文')} · ${domainDisplayName}`,
        body: (
          <div className="flex flex-col gap-3 px-4 py-3 text-xs">
            <CtxRow label={t('col.status', '状态')} value={<Chip tone={domain.status === 'published' ? 'success' : 'neutral'}>{domain.status}</Chip>} />
            <CtxRow label={t('col.owner', '负责人')} value={domain.owner ?? '—'} />
            {domain.description ? (
              <p className="text-3 leading-4">{domain.description}</p>
            ) : null}
            <div className="mt-2 border-t pt-2" style={{ borderColor: 'var(--border)' }}>
              <div className="font-medium text-2">{t('canvas.scale', '规模')}</div>
              <div className="mt-1 grid grid-cols-3 gap-1">
                {Object.entries(nodeCounts).map(([type, count]) => (
                  <div key={type} className="rounded border px-2 py-1 text-center" style={{ borderColor: 'var(--border)' }}>
                    <div className="text-sm font-semibold text-1">{count}</div>
                    <div className="text-3">{TYPE_LABEL[type] ?? type}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="text-3">{t('canvas.hint', '点击左侧节点或画布查看详情')}</div>
          </div>
        ),
      })
    } else {
      setContextPanel(null)
    }
    return () => setContextPanel(null)
  }, [setContextPanel, domain, domainDisplayName, nodes, activeNodeId, navigate])

  // ---- 过滤 ----
  const filteredNodes = useMemo(() => {
    return nodes.filter((n) => {
      if (filter !== 'all' && n.type !== filter) return false
      const q = keyword.trim().toLowerCase()
      if (q && !n.title.toLowerCase().includes(q)) return false
      return true
    })
  }, [nodes, filter, keyword])

  if (
    domainQuery.isLoading ||
    canvasQuery.isLoading ||
    (domainQuery.isError && domainListQuery.isLoading)
  ) {
    return <div className="py-8 text-center text-sm text-3">{t('common.loading', '加载中…')}</div>
  }
  if (domainQuery.isError && canonicalDomain) {
    return <div className="py-8 text-center text-sm text-3">{t('common.loading', '加载中…')}</div>
  }
  if (domainQuery.isError) {
    return <div className="py-8 text-center text-sm text-danger">{t('error.loadFailed', '加载失败')}</div>
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden" data-testid="domain-canvas-page">
      {/* P7: 发布历史 Sheet */}
      <Sheet
        open={showHistory}
        onClose={() => setShowHistory(false)}
        title={t('domain.publishHistory', '发布历史')}
        width={400}
      >
        <PublishHistoryList
          records={historyQuery.data?.records ?? []}
          loading={historyQuery.isLoading}
        />
      </Sheet>
      {/* 域头部 */}
      {domain && (
        <div
          className="shrink-0 border-b px-5 py-3"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-2">
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold text-white"
              style={{ background: 'var(--accent)' }}
              aria-hidden
            >
              {domainDisplayName[0]?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-1">{domainDisplayName}</span>
                <Chip tone={domain.status === 'published' ? 'success' : 'neutral'}>
                  {domain.status}
                </Chip>
              </div>
              {domain.description && (
                <div className="truncate text-xs text-3">{domain.description}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 主体 */}
      <div className="grid flex-1 grid-cols-[260px_1fr] gap-4 overflow-hidden p-4">
        {/* 左侧：节点列表 */}
        <Card className="flex flex-col overflow-hidden">
          <CardHead>
            <span>
              {t('canvas.nodes', '节点')} · {filteredNodes.length}
            </span>
          </CardHead>
          <div className="shrink-0 border-b px-3 py-2" style={{ borderColor: 'var(--border)' }}>
            <div className="mb-2 flex flex-wrap gap-1">
              {(['all', 'fact', 'dimension', 'cube'] as Filter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  className="rounded px-2 py-0.5 text-xs transition"
                  style={{
                    background: filter === f ? 'var(--accent)' : 'var(--bg-hover)',
                    color: filter === f ? 'white' : 'var(--text-2)',
                  }}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? t('filter.all', '全部') : (TYPE_LABEL[f] ?? f)}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search
                size={12}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-3"
                aria-hidden
              />
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder={t('canvas.searchNodes', '搜索节点…')}
                className="pl-7"
                aria-label={t('canvas.searchNodesLabel', '搜索节点')}
              />
            </div>
          </div>
          <CardBody className="overflow-auto scroll-thin !p-0">
            {filteredNodes.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-3">{t('canvas.noNodes', '没有匹配的节点')}</div>
            ) : (
              <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {filteredNodes.map((n) => {
                  const Icon = TYPE_ICON[n.type] ?? Boxes
                  const isActive = activeNodeId === n.id
                  return (
                    <li
                      key={n.id}
                      className="cursor-pointer px-3 py-2 text-xs transition"
                      style={{ background: isActive ? 'var(--bg-hover)' : undefined }}
                      onClick={() => setActiveNodeId(n.id === activeNodeId ? null : n.id)}
                    >
                      <div className="flex items-center gap-2">
                        <Icon size={12} style={{ color: TYPE_COLOR[n.type] ?? 'var(--accent)' }} />
                        <span className="flex-1 truncate text-1">{n.title}</span>
                        <Chip tone="neutral">{TYPE_LABEL[n.type] ?? n.type}</Chip>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        {/* 右侧：SVG 画布 */}
        <Card className="flex flex-col overflow-hidden">
          <CardHead>
            <span>{t('canvas.title', '资产画布')}</span>
            <div className="ml-auto flex items-center gap-3 text-xs text-3">
              {['fact', 'dimension', 'cube'].map((type) => (
                <span key={type} className="flex items-center gap-1">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: TYPE_COLOR[type] }}
                  />
                  {TYPE_LABEL[type]}
                </span>
              ))}
            </div>
          </CardHead>
          <CardBody className="relative overflow-hidden !p-0" style={{ minHeight: 380 }}>
            <DomainCanvasSvg
              nodes={nodes}
              activeNode={activeNodeId}
              onPick={(id) => setActiveNodeId(id === activeNodeId ? null : id)}
            />
          </CardBody>
        </Card>
      </div>
    </div>
  )
}

function domainStableId(domain: DomainSummary): string {
  return domain.id || domain.code || domain.name
}

function domainMatchesRouteId(domain: DomainSummary, routeId: string): boolean {
  return [domain.id, domain.code, domain.name, domain.title]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .some((value) => value === routeId)
}

// ---- SVG 画布 ----

function DomainCanvasSvg({
  nodes,
  activeNode,
  onPick,
}: {
  nodes: DomainCanvasNode[]
  activeNode: string | null
  onPick: (id: string) => void
}) {
  const positions = useMemo(() => {
    const radius = 160
    const cx = 320
    const cy = 200
    return Object.fromEntries(
      nodes.map((n, i) => {
        const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2 - Math.PI / 2
        return [n.id, { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) }]
      }),
    )
  }, [nodes])

  if (nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-3">
        {t('canvas.empty', '此域暂无节点')}
      </div>
    )
  }

  return (
    <svg viewBox="0 0 640 400" className="h-full w-full" role="img" aria-label={t('canvas.ariaLabel', '业务上下文资产图')}>
      {/* 节点 */}
      {nodes.map((n) => {
        const p = positions[n.id]
        if (!p) return null
        const isActive = activeNode === n.id
        const isDimmed = activeNode && !isActive
        const color = TYPE_COLOR[n.type] ?? 'var(--accent)'
        return (
          <g
            key={n.id}
            onClick={() => onPick(n.id)}
            className="cursor-pointer"
            opacity={isDimmed ? 0.35 : 1}
            role="button"
            aria-label={n.title}
          >
            <circle cx={p.x} cy={p.y} r={isActive ? 26 : 22} fill={color} opacity={0.15} />
            <circle cx={p.x} cy={p.y} r={isActive ? 18 : 14} fill={color} />
            <text
              x={p.x}
              y={p.y + (isActive ? 38 : 34)}
              fontSize="11"
              fill="var(--text-1)"
              textAnchor="middle"
              fontWeight={isActive ? 600 : 400}
            >
              {n.title.length > 12 ? `${n.title.slice(0, 12)}…` : n.title}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ---- Context Panel 子组件 ----

function CtxRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-3">{label}</span>
      <span className="text-right text-2">{value}</span>
    </div>
  )
}

function NodeDomainPeers({
  nodeId,
  nodes,
}: {
  nodeId: string
  nodes: DomainCanvasNode[]
}) {
  const peers = nodes.filter((node) => node.id !== nodeId)
  if (!peers.length) {
    return <div className="text-3">{t('canvas.noDomainPeers', '暂无其他同域资产')}</div>
  }
  return (
    <div className="flex flex-col gap-1">
      {peers.map((node) => (
        <div
          key={node.id}
          className="flex items-center gap-1.5 rounded border px-2 py-1 text-xs"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-hover)' }}
        >
          <span className="text-2">{node.title}</span>
          <Chip tone="neutral">{TYPE_LABEL[node.type] ?? node.type}</Chip>
        </div>
      ))}
    </div>
  )
}

// ─── P7: 发布历史列表 ─────────────────────────────────────────────────────────

function PublishHistoryList({
  records,
  loading,
}: {
  records: DomainPublishRecord[]
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}
      </div>
    )
  }
  if (records.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-3">{t('domain.publishHistory.empty', '暂无发布记录')}</div>
    )
  }
  return (
    <div className="space-y-2">
      {records.map((r, i) => {
        const StatusIcon = r.status === 'success' ? CheckCircle2 : r.status === 'failed' ? XCircle : Clock
        const statusColor = r.status === 'success' ? 'var(--success)' : r.status === 'failed' ? 'var(--danger)' : 'var(--warning)'
        return (
          <div
            key={i}
            className="rounded border px-3 py-2.5"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)' }}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 text-xs font-medium text-1">
                <StatusIcon size={12} style={{ color: statusColor }} />
                <span>{r.version}</span>
                <Chip tone={r.status === 'success' ? 'success' : r.status === 'failed' ? 'danger' : 'warning'}>
                  {r.status}
                </Chip>
              </div>
            </div>
            <div className="text-[11px] text-3 space-y-0.5">
              <div>{new Date(r.published_at).toLocaleString('zh-CN')}</div>
              <div className="flex items-center gap-2">
                <span>{t('domain.publishHistory.by', '操作人')}：{r.published_by}</span>
                {r.diff_summary && <span className="text-accent">{r.diff_summary}</span>}
              </div>
              {r.note && <div className="italic">{r.note}</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
