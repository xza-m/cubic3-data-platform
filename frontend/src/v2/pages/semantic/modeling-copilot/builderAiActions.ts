import type { BuilderStepId } from './builderSteps'

export interface BuilderAiAction {
  id: string
  label: string
  prompt: string
}

const ACTIONS_BY_STEP: Record<BuilderStepId, BuilderAiAction[]> = {
  scope: [
    {
      id: 'recommend-candidate-tables',
      label: '推荐候选表',
      prompt:
        '请基于当前建模目标推荐可用于语义资产建设的候选表，说明每张表能支撑的业务范围、主要字段线索，以及发布到语义中心后可被哪些消费者验证。',
    },
    {
      id: 'explain-build-scope',
      label: '解释建设范围',
      prompt:
        '请解释当前语义资产的建设范围：包含哪些业务对象、指标、维度和排除项，并说明发布到语义中心后 Data Agent、BI、数据分析等消费者应如何验证。',
    },
  ],
  source_evidence: [
    {
      id: 'summarize-source-evidence',
      label: '总结来源证据',
      prompt:
        '请总结当前来源证据：候选来源、字段线索、样本或元数据依据、证据强弱，以及还需要我确认的业务口径。请面向发布到语义中心后的消费者验证来组织结论。',
    },
    {
      id: 'compare-candidate-sources',
      label: '比较候选来源',
      prompt:
        '请比较当前候选来源的适用场景、粒度、字段覆盖、数据新鲜度和风险，推荐最适合生成语义资产草案的来源，并说明消费者验证时应重点问哪些问题。',
    },
  ],
  field_candidates: [
    {
      id: 'generate-field-candidates',
      label: '生成字段候选',
      prompt:
        '请基于当前来源证据生成字段候选，按指标、维度、时间字段和过滤字段分类，说明每个候选的证据、置信度、风险，以及发布到语义中心前需要我确认的口径。',
    },
    {
      id: 'explain-field-risks',
      label: '解释字段风险',
      prompt:
        '请解释当前字段候选的主要风险：粒度不一致、去重口径、时间字段、权限范围、空值或枚举异常，并给出面向语义中心发布和消费者验证的修复建议。',
    },
  ],
  semantic_draft: [
    {
      id: 'generate-semantic-draft',
      label: '生成语义草案',
      prompt:
        '请基于当前字段候选和来源证据生成语义草案，包含业务对象、指标、维度、时间字段、权限边界和待确认项，并说明发布到语义中心后的消费者验证路径。',
    },
    {
      id: 'complete-business-definitions',
      label: '补齐业务口径',
      prompt:
        '请补齐当前语义草案里的业务口径：指标定义、计算规则、时间范围、分组粒度、过滤条件、异常数据处理和消费者验证问题，保持适合发布到语义中心。',
    },
  ],
  publish_check: [
    {
      id: 'fix-publish-blockers',
      label: '修复发布阻塞',
      prompt:
        '请检查当前发布到语义中心前的阻塞项，按优先级说明需要我确认或修改的内容，给出可复制的修复建议；不要替我发布。',
    },
    {
      id: 'generate-consumer-validation-questions',
      label: '生成消费者验证问题',
      prompt:
        '请生成消费者验证问题，用来确认语义资产发布到语义中心后能被 Data Agent、BI 和数据分析正确使用；请覆盖指标、维度、时间范围、权限边界和异常数据，不要替我发布。',
    },
  ],
  publish_result: [
    {
      id: 'summarize-publish-result',
      label: '总结发布结果',
      prompt:
        '请总结本次语义资产发布结果：发布到语义中心的资产、已通过的检查、仍需关注的风险，以及 Data Agent、BI、数据分析等消费者的后续验证问题。',
    },
  ],
}

export function getBuilderAiActions(stepId: BuilderStepId): BuilderAiAction[] {
  return ACTIONS_BY_STEP[stepId]
}
