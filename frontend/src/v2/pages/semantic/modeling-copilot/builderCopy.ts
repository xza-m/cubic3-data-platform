export const BUILDER_EMPTY_STATE = {
  title: '从数仓数据建设可发布的语义资产',
  subtitle:
    '选择数据来源，审阅字段候选、轻本体锚定与语义草案；发布到语义中心后，Data Agent、BI、数据分析等消费者按同一快照验证。',
}

export const BUILDER_EXAMPLES: Array<{ title: string; sub: string }> = [
  {
    title: '基于学生评论事实表建设评论数语义资产',
    sub: '业务指标建设 · 从事实表到指标口径',
  },
  {
    title: '从 dwd_order_fact 建设订单退款率指标',
    sub: '已知数仓表 · 生成字段候选和语义草案',
  },
  {
    title: '补齐班级活跃度的业务对象与指标口径',
    sub: '消费者验证未通过 · 回流语义中心建设',
  },
]

export const BUILDER_ACTION_COPY = {
  sandboxTitle: '可先做可用性预演',
  saveTitle: '下一步：生成待发布语义资产',
  sandboxButton: '可用性预演',
  saveButton: '生成语义资产',
  publishButton: '发布到语义中心',
  saving: '生成语义资产',
  publishing: '发布到语义中心',
  updatingAdvancedSemanticConfig: '保存高级语义配置',
}

export const BUILDER_ARTIFACT_LABELS = {
  panel: '资产审阅',
  subtitle: '建设摘要 / 字段候选 / 语义草案 / 来源证据 / 可用性验证 / 审计记录',
  review: '建设摘要',
  fields: '字段候选',
  semanticDraft: '语义草案',
  source: '来源证据',
  preview: '可用性验证',
  trace: '审计记录',
  advancedSemanticConfigTitle: '高级语义配置',
  advancedSemanticConfigDescription: '高级语义配置用于精确审阅和故障定位，普通建设流程优先使用字段候选与语义草案。',
  fullSemanticDraftLabel: '完整语义草案',
  askAiEdit: '让 AI 调整语义配置',
  saveAdvancedSemanticConfig: '保存高级语义配置',
}

export const CONSUMER_VALIDATION_COPY = {
  sectionTitle: '发布后消费者验证',
  routeLabel: '语义中心路由',
  summaryFallback: '发布到语义中心后，可分别运行 Data Agent、BI、数据分析等消费者验收。',
  noQuestion: '发布后生成',
}
