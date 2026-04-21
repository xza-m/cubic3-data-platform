// frontend/src/v2/pages/semantic/_shared/ontology-object-content.tsx
//
// 本体对象详情内容组件——ObjectDetail 全屏页与 Workbench Peek 共用。

import type { ReactNode } from 'react'
import { Boxes, TrendingUp, GitMerge, Shield, Clock } from 'lucide-react'
// 等待 X-Crosscut：@v2/components/ui（Button, Card, CardBody, Chip）
import { Button, Card, Chip } from '@v2/components/ui'
import { fmtRelative } from '@v2/lib/format'
// 等待 X-Crosscut：@v2/i18n（t()）
import { t } from '@v2/i18n'
import type {
  OntologyWorkbenchObjectOverview,
  BusinessProperty,
  BusinessMetric,
  BusinessRelation,
  OntologyHistoryEvent,
} from '@v2/api/ontology'

export function OntologyObjectContent({
  overview,
  onPublish,
  publishing,
}: {
  overview: OntologyWorkbenchObjectOverview
  onPublish?: () => void
  publishing?: boolean
}) {
  const { object, stats, capabilities, associations, lifecycle } = overview

  return (
    <div className="px-4 py-3 space-y-4">
      {/* 操作栏 */}
      {onPublish ? (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="primary"
            onClick={onPublish}
            disabled={publishing}
            aria-label={t('ontology.object.publish', '发布对象')}
          >
            {publishing ? t('ontology.object.publishing', '发布中…') : t('ontology.object.publish', '发布对象')}
          </Button>
          <span className="text-xs text-3">
            {object.status === 'active'
              ? t('ontology.status.active', '已发布')
              : t('ontology.status.draft', '草稿')}
          </span>
        </div>
      ) : null}

      {/* 基础信息 */}
      <Section title={t('ontology.basicInfo', '基础信息')}>
        <dl className="divide-y rounded-md border text-xs" style={{ borderColor: 'var(--border)' }}>
          <Row label={t('ontology.title', '名称')} value={object.title} />
          <Row label={t('ontology.name', '标识')} value={<code className="font-mono text-xs">{object.name}</code>} />
          {object.description ? (
            <Row label={t('ontology.description', '描述')} value={<span className="line-clamp-2">{object.description}</span>} />
          ) : null}
          {object.aliases && object.aliases.length > 0 ? (
            <Row
              label={t('ontology.aliases', '别名')}
              value={
                <div className="flex flex-wrap gap-1">
                  {object.aliases.map((a) => (
                    <Chip key={a} tone="neutral">{a}</Chip>
                  ))}
                </div>
              }
            />
          ) : null}
        </dl>
      </Section>

      {/* 能力统计 */}
      <Section title={t('ontology.stats', '能力概览')}>
        <div className="grid grid-cols-4 gap-2">
          <StatCard icon={Boxes} label={t('ontology.stats.properties', '字段')} value={stats.property_count} color="var(--accent)" />
          <StatCard icon={TrendingUp} label={t('ontology.stats.metrics', '指标')} value={stats.metric_count} color="var(--violet)" />
          <StatCard icon={GitMerge} label={t('ontology.stats.relations', '关系')} value={stats.relation_count} color="var(--success)" />
          <StatCard icon={Shield} label={t('ontology.stats.rules', '规则')} value={stats.rule_count} color="var(--warning)" />
        </div>
      </Section>

      {/* 属性列表 */}
      {capabilities.properties.length > 0 ? (
        <Section title={t('ontology.properties', '业务属性')}>
          <Card className="overflow-hidden">
            <table className="wb-table">
              <thead>
                <tr>
                  <th>{t('ontology.property.name', '名称')}</th>
                  <th>{t('ontology.property.type', '类型')}</th>
                </tr>
              </thead>
              <tbody>
                {capabilities.properties.map((p: BusinessProperty) => (
                  <tr key={p.name}>
                    <td>
                      <div className="font-medium text-1">{p.title}</div>
                      <div className="font-mono text-xs text-3">{p.name}</div>
                    </td>
                    <td>
                      <Chip tone="neutral">{p.property_type}</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </Section>
      ) : null}

      {/* 指标列表 */}
      {associations.metrics.length > 0 ? (
        <Section title={t('ontology.metrics', '业务指标')}>
          <div className="space-y-1.5">
            {associations.metrics.map((m: BusinessMetric) => (
              <MetricRow key={m.name} metric={m} />
            ))}
          </div>
        </Section>
      ) : null}

      {/* 关系列表 */}
      {associations.relations.length > 0 ? (
        <Section title={t('ontology.relations', '业务关系')}>
          <div className="space-y-1.5">
            {associations.relations.map((r: BusinessRelation) => (
              <RelationRow key={r.name} relation={r} currentObject={object.name} />
            ))}
          </div>
        </Section>
      ) : null}

      {/* 最近活动 */}
      {lifecycle.history_items.length > 0 ? (
        <Section title={t('ontology.history', '变更历史')}>
          <ol
            className="relative ml-3 space-y-2.5 border-l pl-4 text-xs"
            style={{ borderColor: 'var(--border)' }}
          >
            {lifecycle.history_items.slice(0, 5).map((e: OntologyHistoryEvent, i) => (
              <HistoryItem key={e.id ?? i} event={e} isFirst={i === 0} />
            ))}
          </ol>
        </Section>
      ) : null}
    </div>
  )
}

function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-1.5 text-xs uppercase tracking-wide text-3 font-medium">{title}</div>
      {children}
    </section>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-2.5 py-1.5">
      <dt className="shrink-0 text-3 text-xs">{label}</dt>
      <dd className="min-w-0 text-right text-1 text-xs">{value ?? '—'}</dd>
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
    <div
      className="rounded-md border px-2 py-2 text-center"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)' }}
    >
      <Icon size={12} style={{ color }} className="mx-auto mb-1" />
      <div className="text-sm font-semibold text-1">{value}</div>
      <div className="text-xs text-3">{label}</div>
    </div>
  )
}

function MetricRow({ metric }: { metric: BusinessMetric }) {
  return (
    <div
      className="rounded-md border px-3 py-2"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)' }}
    >
      <div className="flex items-center gap-2">
        <TrendingUp size={12} style={{ color: 'var(--violet)' }} />
        <span className="font-medium text-1 text-xs">{metric.title}</span>
        <span className="font-mono text-xs text-3">{metric.name}</span>
        {metric.status === 'active' ? <Chip tone="success">{t('status.active', '已发布')}</Chip> : <Chip tone="neutral">{t('status.draft', '草稿')}</Chip>}
      </div>
      {metric.semantic_formula ? (
        <div className="mt-1 font-mono text-xs text-3">{metric.semantic_formula}</div>
      ) : null}
    </div>
  )
}

function RelationRow({ relation, currentObject }: { relation: BusinessRelation; currentObject: string }) {
  const isSource = relation.source_object_name === currentObject
  return (
    <div
      className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)' }}
    >
      <span className="text-2">{relation.source_object_name}</span>
      <Chip tone="accent">{relation.relation_type ?? t('ontology.relation.to', '关联')}</Chip>
      <span className="text-2">{relation.target_object_name}</span>
      {!isSource ? <Chip tone="neutral">{t('ontology.relation.incoming', '入向')}</Chip> : null}
    </div>
  )
}

function HistoryItem({ event, isFirst }: { event: OntologyHistoryEvent; isFirst: boolean }) {
  return (
    <li className="relative">
      <span
        className="absolute -left-[19px] top-1 h-2.5 w-2.5 rounded-full"
        style={{ background: isFirst ? 'var(--accent)' : 'var(--border-strong)' }}
      />
      <div className="text-1">{event.action}</div>
      {event.summary ? <div className="text-3">{event.summary}</div> : null}
      <div className="flex items-center gap-1 text-xs text-3">
        <Clock size={10} />
        {fmtRelative(event.timestamp)}
      </div>
    </li>
  )
}

export default OntologyObjectContent
