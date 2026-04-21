import { describe, expect, it } from 'vitest'
import {
  adaptGovernanceSummary,
  adaptObjectOverview,
  adaptObjectSummaryList,
  normalizeWorkbenchTab,
} from './model'

describe('ontology workbench v2 model adapters', () => {
  it('归一 legacy tab 到 OWV2 视图（默认进入壳层总览）', () => {
    expect(normalizeWorkbenchTab(null)).toBe('overview')
    expect(normalizeWorkbenchTab('overview')).toBe('overview')
    expect(normalizeWorkbenchTab('objects')).toBe('objects')
    expect(normalizeWorkbenchTab('properties')).toBe('objects')
    expect(normalizeWorkbenchTab('actions')).toBe('objects')
    expect(normalizeWorkbenchTab('metrics')).toBe('metrics')
    expect(normalizeWorkbenchTab('relations')).toBe('relations')
    expect(normalizeWorkbenchTab('policies')).toBe('policies')
  })

  it('将对象列表 DTO 转成 OWV2 对象摘要视图模型', () => {
    const payload = adaptObjectSummaryList({
      items: [
        {
          name: 'order',
          title: '订单',
          description: '订单对象',
          aliases: [],
          status: 'active',
          stats: {
            property_count: 2,
            metric_count: 1,
            relation_count: 3,
            action_count: 1,
            rule_count: 2,
          },
          risk_summary: {
            stale_count: 1,
            consistency_count: 2,
          },
          last_activity: {
            id: 'h-1',
            entity_type: 'object',
            entity_name: 'order',
            action: 'saved',
            status: 'active',
            summary: '保存业务对象 订单',
            timestamp: '2026-04-16T09:00:00',
          },
        },
      ],
      total: 1,
    })

    expect(payload.total).toBe(1)
    expect(payload.items[0]).toMatchObject({
      name: 'order',
      title: '订单',
      propertyCount: 2,
      metricCount: 1,
      relationCount: 3,
      actionCount: 1,
      ruleCount: 2,
      riskCount: 3,
      lastActivitySummary: '保存业务对象 订单',
    })
  })

  it('将对象详情 DTO 转成 OWV2 详情视图模型并规整空值', () => {
    const payload = adaptObjectOverview({
      object: {
        name: 'order',
        title: '订单',
        description: '订单对象',
        aliases: ['交易订单'],
        status: 'active',
      },
      stats: {
        property_count: 1,
        metric_count: 1,
        relation_count: 1,
        action_count: 1,
        rule_count: 1,
      },
      capabilities: {
        properties: [
          {
            name: 'order_amount',
            title: '订单金额',
            object_name: 'order',
            property_type: 'number',
            description: '订单金额',
            aliases: [],
            status: 'active',
          },
        ],
        actions: [],
      },
      associations: {
        metrics: [
          {
            name: 'gmv',
            title: 'GMV',
            object_name: 'order',
            semantic_formula: '已支付订单金额之和',
            description: '核心成交指标',
            semantic_labels: ['经营分析'],
            measure_refs: ['orders.gmv'],
            aliases: [],
            status: 'active',
          },
        ],
        relations: [],
        rules: [],
      },
      governance: {
        stale_items: [],
        consistency_items: [{ entity_name: 'order', reason: '对象口径不一致' }],
        audit_total: 0,
        recent_audits: [],
      },
      lifecycle: {
        history_items: [],
        history_total: 0,
        last_activity: null,
      },
    })

    expect(payload.definition.aliasesText).toBe('交易订单')
    expect(payload.capabilities.properties[0].name).toBe('order_amount')
    expect(payload.associations.metrics[0].bindingStatus).toBe('已绑定')
    expect(payload.governance.riskCount).toBe(1)
    expect(payload.lifecycle.lastActivitySummary).toBe('暂无记录')
  })

  it('归一关系 badge tone 与指标绑定 tone', async () => {
    const { getRelationBadgeTone, getMetricBindingTone } = await import('./model')
    expect(getRelationBadgeTone('belongs_to')).toContain('indigo')
    expect(getRelationBadgeTone('contains')).toContain('cyan')
    expect(getRelationBadgeTone('triggers')).toContain('amber')
    expect(getRelationBadgeTone('unknown')).toContain('slate')
    expect(getMetricBindingTone('已绑定')).toContain('emerald')
    expect(getMetricBindingTone('绑定异常')).toContain('rose')
    expect(getMetricBindingTone('未绑定')).toContain('amber')
  })

  it('将治理摘要 DTO 转成 OWV2 规则与治理视图模型', () => {
    const payload = adaptGovernanceSummary({
      summary: {
        policy_total: 2,
        stale_count: 1,
        consistency_count: 1,
        audit_total: 3,
      },
      items: [
        {
          name: 'gmv_policy',
          target_type: 'metric',
          target_name: 'gmv',
          visibility: 'restricted',
          allowed_roles: ['finance'],
          description: 'GMV 受限',
          status: 'active',
          issue_count: 2,
          issues: ['投影未完全命中'],
          projection_status: 'warning',
          audit_total: 3,
          last_audit: {
            id: 'audit-1',
            target_type: 'metric',
            target_name: 'gmv',
            viewer_roles: ['finance'],
            route_type: 'cube',
            execution_target: 'orders',
            decision: 'allow',
            timestamp: '2026-04-16T10:00:00',
          },
        },
      ],
      stale_items: [],
      consistency_items: [],
      recent_audits: [],
    })

    expect(payload.summary.totalPolicies).toBe(2)
    expect(payload.summary.totalRiskCount).toBe(2)
    expect(payload.items[0]).toMatchObject({
      name: 'gmv_policy',
      targetLabel: '指标 · gmv',
      riskCount: 2,
      auditTotal: 3,
      lastAuditDecision: 'allow',
    })
  })
})
