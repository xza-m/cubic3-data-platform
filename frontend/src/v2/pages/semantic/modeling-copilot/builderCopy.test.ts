import { describe, expect, it } from 'vitest'
import * as builderCopy from './builderCopy'

const {
  BUILDER_ACTION_COPY,
  BUILDER_ARTIFACT_LABELS,
  BUILDER_EMPTY_STATE,
  BUILDER_EXAMPLES,
  CONSUMER_VALIDATION_COPY,
} = builderCopy

function collectContractSurface(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(collectContractSurface)
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => [key, ...collectContractSurface(item)])
  }
  return []
}

const allBuilderCopy = () => collectContractSurface(builderCopy)
const allBuilderCopyText = () => allBuilderCopy().join('\n')

describe('semantic cold start builder copy', () => {
  it('frames the goal as publishing to semantic center', () => {
    expect(BUILDER_EMPTY_STATE.title).toBe('从数仓数据建设可发布的语义资产')
    expect(BUILDER_EMPTY_STATE.subtitle).toContain('发布到语义中心')
    expect(BUILDER_EMPTY_STATE.subtitle).toContain('Data Agent、BI、数据分析')

    const publishToCopy = allBuilderCopy().filter((copy) => copy.includes('发布到'))
    expect(publishToCopy.length).toBeGreaterThan(0)
    publishToCopy.forEach((copy) => {
      expect(copy).toContain('发布到语义中心')
    })
  })

  it('不把 Copilot、冷启动或 Data Agent 表达成产品主心智', () => {
    const allCopy = JSON.stringify(builderCopy)

    expect(allCopy).not.toContain('发布给 Data Agent')
    expect(allCopy).not.toContain('正式 Data Agent runtime')
    expect(allCopy).not.toContain('正式 Data Agent 可消费')
    expect(allCopy).not.toContain('冷启动')
    expect(BUILDER_EMPTY_STATE.title).toBe('从数仓数据建设可发布的语义资产')
    expect(BUILDER_ACTION_COPY.publishButton).toBe('发布到语义中心')
    expect(BUILDER_ARTIFACT_LABELS.panel).toBe('资产审阅')
    expect(CONSUMER_VALIDATION_COPY.routeLabel).toContain('语义中心')
    expect(CONSUMER_VALIDATION_COPY.summaryFallback).toContain('Data Agent、BI、数据分析')
  })

  it('keeps the copy contract presentation-agnostic', () => {
    expect(builderCopy).not.toHaveProperty('BUILDER_ACTION_ICONS')

    BUILDER_EXAMPLES.forEach((item) => {
      expect(Object.keys(item).sort()).toEqual(['sub', 'title'])
    })
  })

  it('includes field candidates in the artifact review copy', () => {
    expect(BUILDER_ARTIFACT_LABELS.subtitle).toContain('字段候选')
    expect(BUILDER_ARTIFACT_LABELS.fields).toBe('字段候选')
  })

  it('keeps implementation terms out of the builder copy contract', () => {
    const allCopy = allBuilderCopyText()

    expect(allCopy).not.toContain('raw_spec')
    expect(allCopy).not.toContain('readiness')
    expect(allCopy).not.toContain('runtime')
    expect(allCopy).not.toContain('Proposal')
    expect(allCopy).not.toContain('Spec')
    expect(allCopy).not.toContain('spec')
    expect(allCopy).not.toContain('JSON')
    expect(allCopy).not.toContain('Ontology')
    expect(allCopy).not.toContain('Cube')
    expect(allCopy).not.toContain('Binding')
  })
})
