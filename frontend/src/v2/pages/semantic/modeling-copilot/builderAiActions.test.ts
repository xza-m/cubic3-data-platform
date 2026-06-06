import { describe, expect, it } from 'vitest'
import { getBuilderAiActions } from './builderAiActions'
import type { BuilderStepId } from './builderSteps'

describe('builderAiActions', () => {
  it('覆盖每个 Builder step 的动作 label', () => {
    const expectedLabels: Record<BuilderStepId, string[]> = {
      scope: ['推荐候选表', '解释建设范围'],
      source_evidence: ['总结来源证据', '比较候选来源'],
      field_candidates: ['生成字段候选', '解释字段风险'],
      semantic_draft: ['生成语义草案', '补齐业务口径'],
      publish_check: ['修复发布阻塞', '生成消费者验证问题'],
      publish_result: ['总结发布结果'],
    }

    Object.entries(expectedLabels).forEach(([stepId, labels]) => {
      expect(getBuilderAiActions(stepId as BuilderStepId).map((action) => action.label)).toEqual(labels)
    })
  })

  it('AI 是助手不是发布器', () => {
    const publishCheckPrompts = getBuilderAiActions('publish_check')
      .map((action) => `${action.label}\n${action.prompt}`)
      .join('\n')

    expect(publishCheckPrompts).toContain('不要替我发布')
    expect(publishCheckPrompts).toContain('生成消费者验证问题')
    expect(publishCheckPrompts).not.toMatch(/直接发布|自动发布/)
  })
})
