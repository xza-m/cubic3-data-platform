import { describe, expect, it } from 'vitest'
import {
  buildEntityList,
  buildSummaryEntries,
  getDecisionLabel,
  getExecutionStatusLabel,
  getPlanningModeLabel,
  getRouteTypeLabel,
  isOntologyTab,
  mapEntityTypeToTab,
  mapTabToEntityType,
  normalizeTraceabilitySections,
  splitCommaText,
  summarizeValue,
} from './OntologyWorkbench'

describe('OntologyWorkbench helpers', () => {
  it('识别 tab 与实体类型映射', () => {
    expect(isOntologyTab('objects')).toBe(true)
    expect(isOntologyTab('unknown')).toBe(false)

    expect(mapEntityTypeToTab('object')).toBe('objects')
    expect(mapEntityTypeToTab('property')).toBe('properties')
    expect(mapEntityTypeToTab('metric')).toBe('metrics')
    expect(mapEntityTypeToTab('relation')).toBe('relations')
    expect(mapEntityTypeToTab('action')).toBe('actions')
    expect(mapEntityTypeToTab('glossary')).toBe('glossary')
    expect(mapEntityTypeToTab('policy')).toBe('policies')
    expect(mapEntityTypeToTab('unexpected')).toBeNull()

    expect(mapTabToEntityType('objects')).toBe('objects')
    expect(mapTabToEntityType('properties')).toBe('properties')
    expect(mapTabToEntityType('metrics')).toBe('metrics')
    expect(mapTabToEntityType('relations')).toBe('relations')
    expect(mapTabToEntityType('actions')).toBe('actions')
    expect(mapTabToEntityType('glossary')).toBe('glossary')
    expect(mapTabToEntityType('policies')).toBe('policies')
  })

  it('构造不同语义资产列表摘要', () => {
    const payload = {
      objects: [{ name: 'order', title: '订单', status: 'active' }],
      properties: [{ name: 'amount', title: '支付金额', object_name: 'order', property_type: 'number', status: 'draft' }],
      metrics: [{ name: 'gmv', title: 'GMV', object_name: 'order', status: 'active' }],
      relations: [{ name: 'customer_submits_order', title: '客户下单', source_object_name: 'customer', target_object_name: 'order', status: 'active' }],
      actions: [{ name: 'pay', title: '支付', object_name: 'order', status: 'active' }],
      glossary: [{ term: '成交额', canonical_name: 'gmv', entry_type: 'metric' }],
      policies: [{ name: 'gmv_policy', target_type: 'metric', target_name: 'gmv' }],
    }

    expect(buildEntityList('objects', payload as any)[0]).toMatchObject({ key: 'order', subtitle: 'order' })
    expect(buildEntityList('properties', payload as any)[0]).toMatchObject({ subtitle: 'order · number' })
    expect(buildEntityList('metrics', payload as any)[0]).toMatchObject({ subtitle: 'order · gmv' })
    expect(buildEntityList('relations', payload as any)[0]).toMatchObject({ subtitle: 'customer → order' })
    expect(buildEntityList('actions', payload as any)[0]).toMatchObject({ subtitle: 'order · pay' })
    expect(buildEntityList('glossary', payload as any)[0]).toMatchObject({ key: 'gmv', subtitle: 'metric · gmv' })
    expect(buildEntityList('policies', payload as any)[0]).toMatchObject({ key: 'gmv_policy', subtitle: 'metric · gmv' })
  })

  it('规范化标签、状态和值摘要', () => {
    expect(splitCommaText('finance, admin，ops')).toEqual(['finance', 'admin', 'ops'])

    expect(getRouteTypeLabel('cube')).toBe('分析查询')
    expect(getRouteTypeLabel('custom-route')).toBe('custom-route')
    expect(getPlanningModeLabel('multi_step')).toBe('多步规划')
    expect(getPlanningModeLabel('custom-plan')).toBe('custom-plan')
    expect(getDecisionLabel('allow')).toBe('已放行')
    expect(getDecisionLabel('custom-decision')).toBe('custom-decision')
    expect(getExecutionStatusLabel('executed')).toBe('已执行')
    expect(getExecutionStatusLabel('custom-status')).toBe('custom-status')

    expect(summarizeValue(undefined)).toBe('未提供')
    expect(summarizeValue(['finance', 'admin'])).toBe('finance、admin')
    expect(summarizeValue({ title: '订单分析' })).toBe('订单分析')
    expect(summarizeValue({ foo: 1, bar: 2 })).toBe('2 个字段')
    expect(summarizeValue('gmv')).toBe('gmv')
  })

  it('生成摘要字段并规整回溯结构', () => {
    const entries = buildSummaryEntries(
      {
        business_metric: 'gmv',
        target_type: 'sql',
        empty_value: '',
        viewer_roles: ['finance'],
        nested: { foo: 1, bar: 2 },
      },
      ['business_metric', 'target_type'],
    )

    expect(entries).toEqual([
      { key: 'business_metric', label: '业务指标', value: 'gmv' },
      { key: 'target_type', label: '目标类型', value: 'sql' },
      { key: 'viewer_roles', label: 'viewer_roles', value: 'finance' },
      { key: 'nested', label: 'nested', value: '2 个字段' },
    ])

    expect(
      normalizeTraceabilitySections({
        ontology: { business_metric: 'gmv' },
        analysis: { analysis_cube: 'orders' },
      }),
    ).toEqual({
      ontology: { business_metric: 'gmv' },
      analysis: { analysis_cube: 'orders' },
      execution: {},
      sources: {},
    })
  })
})
