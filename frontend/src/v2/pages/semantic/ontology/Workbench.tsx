// frontend/src/v2/pages/semantic/ontology/Workbench.tsx
//
// 本体工作台总览页。
// 接口：GET /api/v1/ontology/workbench/objects
//
// B-back-6: 全局搜索上线前，用本地 filter（标 TODO）

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Bot, Boxes, FileCode2, GitMerge, Play, Plus, Search, ShieldCheck, TrendingUp } from 'lucide-react'
// 等待 X-Crosscut：@v2/components/ui
import { Button, Card, CardBody, CardHead, Chip, Input, Textarea } from '@v2/components/ui'
// 等待 X-Crosscut：@v2/i18n
import { t } from '@v2/i18n'
import { fmtRelative } from '@v2/lib/format'
import { useAgentSemanticPlan } from '@v2/hooks/agent'
import { useWorkbenchObjects } from '@v2/hooks/ontology'
import type { AgentSemanticPlanResponse } from '@v2/api/agent'
import type { OntologyWorkbenchObjectSummary } from '@v2/api/ontology'

export default function OntologyWorkbench() {
  const navigate = useNavigate()
  const objectsQuery = useWorkbenchObjects()
  const items = useMemo(() => objectsQuery.data?.items ?? [], [objectsQuery.data])

  // TODO(B-back-6): 全局搜索上线前用本地 filter
  const [keyword, setKeyword] = useState('')
  const [agentQuestion, setAgentQuestion] = useState('解释GMV口径并查看趋势')
  const agentPlan = useAgentSemanticPlan()

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

  const runAgentPreview = () => {
    const question = agentQuestion.trim()
    if (!question) return
    agentPlan.mutate({ question })
  }

  return (
    <div className="flex flex-1 flex-col overflow-auto scroll-thin p-5">
      {/* 顶部统计 */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={Boxes} label={t('ontology.stat.objects', '业务对象')} value={items.length} color="var(--accent)" />
        <StatCard icon={TrendingUp} label={t('ontology.stat.metrics', '指标')} value={stats.totalMetrics} color="var(--violet)" />
        <StatCard icon={GitMerge} label={t('ontology.stat.relations', '关系')} value={stats.totalRelations} color="var(--success)" />
        <StatCard icon={AlertTriangle} label={t('ontology.stat.risk', '有风险')} value={stats.riskCount} color="var(--warning)" />
      </div>

      <AgentPreviewPanel
        question={agentQuestion}
        onQuestionChange={setAgentQuestion}
        onRun={runAgentPreview}
        isPending={agentPlan.isPending}
        result={agentPlan.data}
        error={agentPlan.error}
      />

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

function AgentPreviewPanel({
  question,
  onQuestionChange,
  onRun,
  isPending,
  result,
  error,
}: {
  question: string
  onQuestionChange: (value: string) => void
  onRun: () => void
  isPending: boolean
  result?: AgentSemanticPlanResponse
  error: unknown
}) {
  const firstCompiled = result?.compiled_targets?.[0]
  const runtimeMode = textValue(result, 'runtime_mode')
  const routeType = textValue(result?.route, 'route_type')
  const bindingStatus = textValue(result?.projection_result, 'binding_status')
  const decision = textValue(result?.policy_decision, 'decision')
  const dataLevel = textValue(result?.policy_decision, 'effective_data_level')
  const enforcement = textValue(result?.ticket_preview, 'enforcement')
  const logicalSql = textValue(firstCompiled, 'logical_sql') || textValue(firstCompiled, 'pseudo_sql')
  const errorMessage = error instanceof Error ? error.message : ''

  return (
    <Card className="mb-5">
      <CardHead
        title={
          <span className="flex items-center gap-2">
            <Bot size={16} /> {t('ontology.agentPreview.title', 'Runtime 诊断')}
          </span>
        }
        actions={
          <Button size="sm" variant="primary" onClick={onRun} disabled={isPending || !question.trim()}>
            <Play size={12} /> {isPending ? t('loading', '加载中…') : t('ontology.agentPreview.run', '预演')}
          </Button>
        }
      />
      <CardBody>
        <div className="grid gap-4 lg:grid-cols-[minmax(260px,360px)_1fr]">
          <div className="space-y-2">
            <Textarea
              value={question}
              onChange={(event) => onQuestionChange(event.target.value)}
              rows={4}
              aria-label={t('ontology.agentPreview.question', '业务问题')}
              placeholder={t('ontology.agentPreview.placeholder', '输入业务问题')}
            />
            {errorMessage ? <div className="text-xs text-danger">{errorMessage}</div> : null}
          </div>
          <div className="min-w-0 space-y-3">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
              <PreviewMetric icon={Bot} label={t('ontology.agentPreview.mode', 'Mode')} value={runtimeMode || '-'} />
              <PreviewMetric icon={Bot} label={t('ontology.agentPreview.route', 'Route')} value={routeType || '-'} />
              <PreviewMetric icon={FileCode2} label={t('ontology.agentPreview.binding', 'Binding')} value={bindingStatus || '-'} />
              <PreviewMetric icon={ShieldCheck} label={t('ontology.agentPreview.decision', 'Decision')} value={decision || '-'} />
              <PreviewMetric icon={AlertTriangle} label={t('ontology.agentPreview.level', 'Level')} value={dataLevel || '-'} />
              <PreviewMetric icon={FileCode2} label={t('ontology.agentPreview.ticket', 'Ticket')} value={enforcement || '-'} />
            </div>
            {logicalSql ? (
              <pre
                className="max-h-44 overflow-auto rounded-md border p-3 text-xs leading-5 text-2"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)' }}
              >
                {logicalSql}
              </pre>
            ) : (
              <div
                className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-3"
                style={{ borderColor: 'var(--border)' }}
              >
                {t('ontology.agentPreview.empty', '暂无预演结果')}
              </div>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  )
}

function PreviewMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Bot
  label: string
  value: string
}) {
  return (
    <div
      className="flex min-w-0 items-center gap-2 rounded-md border px-3 py-2"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
    >
      <Icon size={14} className="shrink-0 text-3" />
      <div className="min-w-0">
        <div className="text-[11px] text-3">{label}</div>
        <div className="truncate text-xs font-medium text-1">{value}</div>
      </div>
    </div>
  )
}

function textValue(source: unknown, key: string): string {
  if (!source || typeof source !== 'object') return ''
  const value = (source as Record<string, unknown>)[key]
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
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
