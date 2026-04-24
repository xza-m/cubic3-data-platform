// frontend/src/v2/pages/semantic/ontology/Workbench.tsx
//
// 本体工作台总览页。
// 接口：GET /api/v1/ontology/workbench/objects
//
// B-back-6: 全局搜索上线前，用本地 filter（标 TODO）

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Boxes, Plus, Search, TrendingUp, GitMerge, AlertTriangle } from 'lucide-react'
// 等待 X-Crosscut：@v2/components/ui
import { Button, Card, CardBody, Chip, Input } from '@v2/components/ui'
// 等待 X-Crosscut：@v2/i18n
import { t } from '@v2/i18n'
import { fmtRelative } from '@v2/lib/format'
import { useWorkbenchObjects } from '@v2/hooks/ontology'
import type { OntologyWorkbenchObjectSummary } from '@v2/api/ontology'

export default function OntologyWorkbench() {
  const navigate = useNavigate()
  const objectsQuery = useWorkbenchObjects()
  const items = useMemo(() => objectsQuery.data?.items ?? [], [objectsQuery.data])

  // TODO(B-back-6): 全局搜索上线前用本地 filter
  const [keyword, setKeyword] = useState('')

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    if (!q) return items
    return items.filter((o) =>
      `${o.name} ${o.title} ${o.description ?? ''}`.toLowerCase().includes(q),
    )
  }, [items, keyword])

  const stats = useMemo(() => {
    let totalProps = 0
    let totalMetrics = 0
    let totalRelations = 0
    let riskCount = 0
    for (const o of items) {
      totalProps += o.stats.property_count
      totalMetrics += o.stats.metric_count
      totalRelations += o.stats.relation_count
      const risk = o.risk_summary.stale_count + o.risk_summary.consistency_count
      if (risk > 0) riskCount++
    }
    return { totalProps, totalMetrics, totalRelations, riskCount }
  }, [items])

  return (
    <div className="flex flex-1 flex-col overflow-auto scroll-thin p-5">
      {/* 顶部统计 */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={Boxes} label={t('ontology.stat.objects', '业务对象')} value={items.length} color="var(--accent)" />
        <StatCard icon={TrendingUp} label={t('ontology.stat.metrics', '指标')} value={stats.totalMetrics} color="var(--violet)" />
        <StatCard icon={GitMerge} label={t('ontology.stat.relations', '关系')} value={stats.totalRelations} color="var(--success)" />
        <StatCard icon={AlertTriangle} label={t('ontology.stat.risk', '有风险')} value={stats.riskCount} color="var(--warning)" />
      </div>

      {/* 搜索栏 */}
      {/* TODO(B-back-6): 后端全局搜索上线后替换为 API 搜索，移除本地过滤 */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search
            size={12}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-3"
            aria-hidden
          />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={t('ontology.searchPlaceholder', '搜索对象名称、描述… (本地过滤)')}
            className="pl-7"
            aria-label={t('ontology.searchLabel', '搜索业务对象')}
          />
        </div>
        <Button size="sm" variant="primary" onClick={() => navigate('/semantic/ontology/objects/new')}>
          <Plus size={12} /> {t('ontology.createObject', '新建对象')}
        </Button>
      </div>

      {/* 对象列表 */}
      {objectsQuery.isLoading ? (
        <div className="py-8 text-center text-sm text-3">{t('loading', '加载中…')}</div>
      ) : objectsQuery.isError ? (
        <Card>
          <CardBody className="py-8 text-center text-sm text-danger">{t('error.loadFailed', '加载失败')}</CardBody>
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState onCreate={() => navigate('/semantic/ontology/objects/new')} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((o) => (
            <ObjectCard key={o.name} object={o} onOpen={() => navigate(`/semantic/ontology/objects/${o.name}`)} />
          ))}
        </div>
      )}
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Boxes
  label: string
  value: number
  color: string
}) {
  return (
    <Card>
      <CardBody>
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-md"
            style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
          >
            <Icon size={16} />
          </div>
          <div>
            <div className="text-lg font-semibold text-1">{value}</div>
            <div className="text-xs text-3">{label}</div>
          </div>
        </div>
      </CardBody>
    </Card>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center rounded-md border border-dashed py-16 text-center"
      style={{ borderColor: 'var(--border)' }}
    >
      <div
        className="flex h-10 w-10 items-center justify-center rounded-md"
        style={{ background: 'var(--bg-hover)', color: 'var(--text-3)' }}
      >
        <Boxes size={18} />
      </div>
      <div className="mt-3 text-sm text-1">{t('ontology.emptyTitle', '本体尚未初始化')}</div>
      <div className="mt-1 text-xs text-3">{t('ontology.emptyDesc', '创建第一个业务对象，开始描述业务语义')}</div>
      <Button size="sm" variant="primary" className="mt-3" onClick={onCreate}>
        <Plus size={12} /> {t('ontology.createObject', '新建对象')}
      </Button>
    </div>
  )
}

function ObjectCard({
  object: o,
  onOpen,
}: {
  object: OntologyWorkbenchObjectSummary
  onOpen: () => void
}) {
  const riskTotal = o.risk_summary.stale_count + o.risk_summary.consistency_count
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col rounded-md border p-3.5 text-left transition hover:shadow-sm focus-visible:ring-2"
      style={{
        background: 'var(--bg-surface)',
        borderColor: 'var(--border)',
        outlineColor: 'var(--accent)',
      }}
    >
      <div className="flex items-start gap-3">
        <ObjDot name={o.title || o.name} size={32} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="truncate text-sm font-semibold text-1">{o.title || o.name}</span>
            {o.status === 'active' ? <Chip tone="success">{t('status.active', '已发布')}</Chip> : <Chip tone="neutral">{t('status.draft', '草稿')}</Chip>}
            {riskTotal > 0 ? <Chip tone="danger">{riskTotal} {t('ontology.risk', '风险')}</Chip> : null}
          </div>
          <div className="mt-0.5 truncate font-mono text-xs text-3">{o.name}</div>
        </div>
      </div>
      {o.description ? (
        <div className="mt-3 text-xs leading-5 text-2 line-clamp-2">{o.description}</div>
      ) : (
        <div className="mt-3 text-xs text-3">{t('ontology.noDesc', '尚未提供描述')}</div>
      )}
      <div className="mt-3 grid grid-cols-4 gap-2">
        <MiniStat label={t('ontology.stats.properties', '字段')} value={o.stats.property_count} />
        <MiniStat label={t('ontology.stats.metrics', '指标')} value={o.stats.metric_count} />
        <MiniStat label={t('ontology.stats.relations', '关系')} value={o.stats.relation_count} />
        <MiniStat label={t('ontology.stats.rules', '规则')} value={o.stats.rule_count} />
      </div>
      <div
        className="mt-3 border-t pt-2 text-xs text-3"
        style={{ borderColor: 'var(--border)' }}
      >
        {o.last_activity ? (
          `${o.last_activity.action} · ${fmtRelative(o.last_activity.timestamp)}`
        ) : (
          t('ontology.noActivity', '暂无活动')
        )}
      </div>
    </button>
  )
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <div className="text-sm font-semibold text-1">{value}</div>
      <div className="text-xs text-3">{label}</div>
    </div>
  )
}

export function ObjDot({ name, size = 28 }: { name: string; size?: number }) {
  const initial = (name[0] ?? '?').toUpperCase()
  const colors = ['var(--accent)', 'var(--violet)', 'var(--success)', 'var(--warning)']
  const color = colors[name.charCodeAt(0) % colors.length]
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-md font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: color,
      }}
      aria-hidden
    >
      {initial}
    </div>
  )
}
