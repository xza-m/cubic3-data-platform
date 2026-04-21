import type {
  BusinessAction,
  BusinessMetric,
  BusinessProperty,
  BusinessRelation,
  OntologyHistoryEvent,
  OntologyWorkbenchGovernanceSummaryResponse,
  OntologyWorkbenchObjectListResponse,
  OntologyWorkbenchObjectOverviewResponse,
  PolicyMetadata,
} from '@/api/ontology'

export type WorkbenchView = 'overview' | 'objects' | 'metrics' | 'relations' | 'policies'

export interface ObjectWorkbenchSummary {
  name: string
  title: string
  description: string
  status: string
  aliases: string[]
  propertyCount: number
  metricCount: number
  relationCount: number
  actionCount: number
  ruleCount: number
  riskCount: number
  lastActivitySummary: string
  lastActivityAt: string
}

export interface ObjectWorkbenchOverview {
  object: OntologyWorkbenchObjectOverviewResponse['object']
  definition: {
    aliasesText: string
  }
  stats: OntologyWorkbenchObjectOverviewResponse['stats']
  capabilities: {
    properties: BusinessProperty[]
    actions: BusinessAction[]
  }
  associations: {
    metrics: Array<BusinessMetric & { bindingStatus: string }>
    relations: BusinessRelation[]
    rules: PolicyMetadata[]
  }
  governance: {
    staleItems: Array<Record<string, unknown>>
    consistencyItems: Array<Record<string, unknown>>
    riskCount: number
    auditTotal: number
    recentAudits: OntologyWorkbenchObjectOverviewResponse['governance']['recent_audits']
  }
  lifecycle: {
    historyItems: OntologyHistoryEvent[]
    historyTotal: number
    lastActivity: OntologyHistoryEvent | null
    lastActivitySummary: string
  }
}

export interface GovernanceWorkbenchSummary {
  summary: {
    totalPolicies: number
    totalRiskCount: number
    staleCount: number
    consistencyCount: number
    auditTotal: number
  }
  items: Array<
    OntologyWorkbenchGovernanceSummaryResponse['items'][number] & {
      targetLabel: string
      riskCount: number
      auditTotal: number
      lastAuditDecision: string
    }
  >
  staleItems: Array<Record<string, unknown>>
  consistencyItems: Array<Record<string, unknown>>
  recentAudits: OntologyWorkbenchGovernanceSummaryResponse['recent_audits']
}

function safeText(value?: string | null, fallback = '暂无记录') {
  const text = String(value || '').trim()
  return text || fallback
}

export function normalizeWorkbenchTab(value: string | null): WorkbenchView {
  if (value === 'overview') return 'overview'
  if (value === 'objects') return 'objects'
  if (value === 'metrics') return 'metrics'
  if (value === 'relations') return 'relations'
  if (value === 'policies') return 'policies'
  // legacy tab 映射：'properties' / 'actions' → 对象态
  if (value === 'properties' || value === 'actions') return 'objects'
  return 'overview'
}

export function getMetricBindingStatus(metric: BusinessMetric) {
  return metric.measure_refs.length > 0 ? '已绑定' : '未绑定'
}

export function getMetricBindingTone(status: string) {
  if (status === '已绑定') return 'bg-emerald-100 text-emerald-700'
  if (status === '绑定异常') return 'bg-rose-100 text-rose-700'
  return 'bg-amber-100 text-amber-700'
}

export function getRelationBadgeTone(relationType: string) {
  const map: Record<string, string> = {
    belongs_to: 'bg-indigo-50 text-indigo-600',
    contains: 'bg-cyan-50 text-cyan-600',
    triggers: 'bg-amber-50 text-amber-600',
    owns: 'bg-violet-50 text-violet-600',
    submits: 'bg-sky-50 text-sky-600',
    linked_to: 'bg-slate-100 text-slate-600',
    custom: 'bg-slate-100 text-slate-600',
  }
  return map[relationType] || 'bg-slate-100 text-slate-600'
}

export function adaptObjectSummaryList(payload: OntologyWorkbenchObjectListResponse): {
  items: ObjectWorkbenchSummary[]
  total: number
} {
  return {
    total: payload.total,
    items: payload.items.map((item) => ({
      name: item.name,
      title: item.title,
      description: safeText(item.description, '暂无业务描述'),
      status: item.status,
      aliases: item.aliases,
      propertyCount: item.stats.property_count,
      metricCount: item.stats.metric_count,
      relationCount: item.stats.relation_count,
      actionCount: item.stats.action_count,
      ruleCount: item.stats.rule_count,
      riskCount: item.risk_summary.stale_count + item.risk_summary.consistency_count,
      lastActivitySummary: safeText(item.last_activity?.summary),
      lastActivityAt: safeText(item.last_activity?.timestamp),
    })),
  }
}

export function adaptObjectOverview(payload: OntologyWorkbenchObjectOverviewResponse): ObjectWorkbenchOverview {
  return {
    object: payload.object,
    definition: {
      aliasesText: payload.object.aliases.join('，'),
    },
    stats: payload.stats,
    capabilities: {
      properties: payload.capabilities.properties,
      actions: payload.capabilities.actions,
    },
    associations: {
      metrics: payload.associations.metrics.map((metric) => ({
        ...metric,
        bindingStatus: getMetricBindingStatus(metric),
      })),
      relations: payload.associations.relations,
      rules: payload.associations.rules,
    },
    governance: {
      staleItems: payload.governance.stale_items,
      consistencyItems: payload.governance.consistency_items,
      riskCount: payload.governance.stale_items.length + payload.governance.consistency_items.length,
      auditTotal: payload.governance.audit_total,
      recentAudits: payload.governance.recent_audits,
    },
    lifecycle: {
      historyItems: payload.lifecycle.history_items,
      historyTotal: payload.lifecycle.history_total,
      lastActivity: payload.lifecycle.last_activity,
      lastActivitySummary: safeText(payload.lifecycle.last_activity?.summary),
    },
  }
}

export function adaptGovernanceSummary(
  payload: OntologyWorkbenchGovernanceSummaryResponse,
): GovernanceWorkbenchSummary {
  return {
    summary: {
      totalPolicies: payload.summary.policy_total,
      totalRiskCount: payload.items.reduce((sum, item) => sum + item.issue_count, 0),
      staleCount: payload.summary.stale_count,
      consistencyCount: payload.summary.consistency_count,
      auditTotal: payload.summary.audit_total,
    },
    items: payload.items.map((item) => ({
      ...item,
      targetLabel: `${item.target_type === 'metric' ? '指标' : item.target_type === 'object' ? '对象' : item.target_type} · ${item.target_name}`,
      riskCount: item.issue_count,
      auditTotal: item.audit_total,
      lastAuditDecision: safeText(item.last_audit?.decision, '暂无审计'),
    })),
    staleItems: payload.stale_items,
    consistencyItems: payload.consistency_items,
    recentAudits: payload.recent_audits,
  }
}
