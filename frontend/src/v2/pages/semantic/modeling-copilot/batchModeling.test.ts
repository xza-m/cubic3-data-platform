import { describe, expect, it } from 'vitest'
import {
  BATCH_MODELING_DEFAULT_SCOPE,
  batchModelingRiskLabel,
  batchModelingRiskTone,
  batchModelingStrategyLabel,
  batchQueueStatusLabel,
  batchQueueStatusTone,
  buildBatchModelingPlan,
  canOpenBatchQueueBuilder,
  getBatchQueuePrimaryAction,
  type BatchModelingPlan,
  type BatchModelingQueueItem,
} from './batchModeling'

describe('batch modeling plan', () => {
  it('生成面向语义中心的批量建设计划', () => {
    const plan: BatchModelingPlan = buildBatchModelingPlan(BATCH_MODELING_DEFAULT_SCOPE)

    expect(plan.title).toBe('学情分析批量语义建设')
    expect(plan.target).toBe('semantic_center')
    expect(plan.guardrails).toContain('批量模式只生成待审阅候选队列，不直接发布语义中心。')
    expect(plan.guardrails).toContain('Data Agent、BI、数据分析只消费语义中心已发布资产，不作为本模式发布目标。')
    expect(plan.queueItems.map((item) => item.primaryAction as string)).not.toContain('publish')
  })

  it('候选资产主动作进入资产建设画布', () => {
    const plan = buildBatchModelingPlan(BATCH_MODELING_DEFAULT_SCOPE)

    expect(getBatchQueuePrimaryAction(plan.queueItems[0])).toBe('进入资产建设画布')
  })

  it('generates reviewable queue items from business domain scope', () => {
    const plan = buildBatchModelingPlan({
      businessDomain: '学情分析',
      sourceCount: 24,
      strategy: 'balanced',
      includeExistingSemantics: true,
    })

    expect(plan.title).toBe('学情分析批量语义建设')
    expect(plan.queueItems.length).toBeGreaterThanOrEqual(3)
    expect(plan.queueItems.every((item) => item.target === 'semantic_center')).toBe(true)
    expect(findQueueItem(plan, 'fact-learning-activity')).toMatchObject({
      status: 'ready_for_review',
      primaryAction: 'open_builder',
    })
  })

  it('marks high volume exploratory scope as higher risk', () => {
    const plan = buildBatchModelingPlan({
      businessDomain: '跨域经营',
      sourceCount: 96,
      strategy: 'exploratory',
      includeExistingSemantics: false,
    })

    expect(plan.riskLevel).toBe('high')
    expect(plan.queueItems.some((item) => item.status === 'needs_scope')).toBe(true)
    expect(batchQueueStatusLabel('high_risk')).toBe('高风险待拆分')
    expect(getBatchQueuePrimaryAction(findQueueItem(plan, 'fact-learning-activity'))).toBe('进入资产建设画布')
  })

  it('marks high volume non exploratory scope as medium risk', () => {
    const plan = buildBatchModelingPlan({
      businessDomain: '经营分析',
      sourceCount: 32,
      strategy: 'balanced',
      includeExistingSemantics: true,
    })

    expect(plan.riskLevel).toBe('medium')
    expect(findQueueItem(plan, 'metric-active-student')).toMatchObject({
      risk: 'medium',
      status: 'ready_for_review',
    })
  })

  it('does not mention reuse references when existing semantics are excluded', () => {
    const plan = buildBatchModelingPlan({
      businessDomain: '排课分析',
      sourceCount: 16,
      strategy: 'conservative',
      includeExistingSemantics: false,
    })
    const scanCopy = plan.scanPlan.join('\n')
    const queueEvidenceCopy = plan.queueItems.flatMap((item) => item.evidence).join('\n')

    expect(scanCopy).toContain('不复用已有语义资产')
    expect(scanCopy).not.toContain('复用参考')
    expect(queueEvidenceCopy).not.toContain('复用参考')
    expect(findQueueItem(plan, 'dim-school').evidence).toContain('未纳入已有语义资产对齐，仅保留维度新建候选供人工审阅。')
  })

  it('falls back to the default business domain when scope domain is blank', () => {
    const plan = buildBatchModelingPlan({
      ...BATCH_MODELING_DEFAULT_SCOPE,
      businessDomain: '   ',
    })

    expect(plan.scope.businessDomain).toBe(BATCH_MODELING_DEFAULT_SCOPE.businessDomain)
    expect(plan.title).toBe(`${BATCH_MODELING_DEFAULT_SCOPE.businessDomain}批量语义建设`)
    expect(findQueueItem(plan, 'dim-school').title).toBe(`${BATCH_MODELING_DEFAULT_SCOPE.businessDomain}学校维度候选`)
  })

  it('raises risk for high volume or exploratory scope and exposes review actions only', () => {
    const highVolumePlan = buildBatchModelingPlan({
      businessDomain: '经营分析',
      sourceCount: 72,
      strategy: 'balanced',
      includeExistingSemantics: true,
    })
    const exploratoryPlan = buildBatchModelingPlan({
      businessDomain: '教学质量',
      sourceCount: 12,
      strategy: 'exploratory',
      includeExistingSemantics: true,
    })

    const highRiskPlans = [highVolumePlan, exploratoryPlan]

    highRiskPlans.forEach((plan) => {
      expect(plan.riskLevel).toBe('high')
      expect(plan.queueItems.some((item) => item.status === 'needs_scope' || item.status === 'high_risk')).toBe(true)
      expect(plan.queueItems.map((item) => item.primaryAction as string)).not.toContain('publish')
    })
  })

  it('maps every queue status and primary action to Chinese operation copy', () => {
    expect(batchQueueStatusLabel('ready_for_review')).toBe('可审阅')
    expect(batchQueueStatusLabel('needs_scope')).toBe('需补范围')
    expect(batchQueueStatusLabel('high_risk')).toBe('高风险待拆分')
    expect(batchQueueStatusLabel('deferred')).toBe('已暂缓')

    const item: BatchModelingQueueItem = {
      id: 'merge-candidate',
      title: '重复维度候选',
      target: 'semantic_center',
      source: 'dim_school_df',
      grain: '一所学校',
      confidence: 0.76,
      risk: 'medium',
      status: 'deferred',
      primaryAction: 'merge',
      evidence: ['与现有学校维度存在重叠，需要人工合并。'],
    }

    expect(getBatchQueuePrimaryAction(item)).toBe('合并建议')
    expect(getBatchQueuePrimaryAction({ ...item, primaryAction: 'open_builder' })).toBe('进入资产建设画布')
    expect(getBatchQueuePrimaryAction({ ...item, primaryAction: 'regenerate' })).toBe('退回重生成')
    expect(getBatchQueuePrimaryAction({ ...item, primaryAction: 'defer' })).toBe('暂缓')
  })

  it('maps every strategy, risk, and status tone from the shared helper', () => {
    expect(batchModelingStrategyLabel('conservative')).toBe('保守')
    expect(batchModelingStrategyLabel('balanced')).toBe('平衡')
    expect(batchModelingStrategyLabel('exploratory')).toBe('探索')

    expect(batchModelingRiskLabel('low')).toBe('低风险')
    expect(batchModelingRiskLabel('medium')).toBe('中风险')
    expect(batchModelingRiskLabel('high')).toBe('高风险')

    expect(batchModelingRiskTone('low')).toBe('success')
    expect(batchModelingRiskTone('medium')).toBe('warning')
    expect(batchModelingRiskTone('high')).toBe('danger')

    expect(batchQueueStatusTone('ready_for_review')).toBe('success')
    expect(batchQueueStatusTone('needs_scope')).toBe('warning')
    expect(batchQueueStatusTone('high_risk')).toBe('danger')
    expect(batchQueueStatusTone('deferred')).toBe('neutral')
  })

  it('only allows open_builder candidates to enter the asset builder canvas', () => {
    const item: BatchModelingQueueItem = {
      id: 'regenerate-candidate',
      title: '高风险指标候选',
      target: 'semantic_center',
      source: 'dws_learning_student_activity_di',
      grain: '按天、学生聚合',
      confidence: 0.68,
      risk: 'high',
      status: 'high_risk',
      primaryAction: 'regenerate',
      evidence: ['活跃口径存在冲突，需要先重生成候选。'],
    }

    expect(canOpenBatchQueueBuilder({ ...item, primaryAction: 'open_builder' })).toBe(true)
    expect(canOpenBatchQueueBuilder(item)).toBe(false)
    expect(canOpenBatchQueueBuilder({ ...item, primaryAction: 'defer' })).toBe(false)
    expect(canOpenBatchQueueBuilder({ ...item, primaryAction: 'merge' })).toBe(false)
  })
})

function findQueueItem(plan: BatchModelingPlan, id: string): BatchModelingQueueItem {
  const item = plan.queueItems.find((queueItem) => queueItem.id === id)

  expect(item).toBeDefined()

  return item as BatchModelingQueueItem
}
