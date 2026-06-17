export type BatchModelingStrategy = 'conservative' | 'balanced' | 'exploratory'
export type BatchModelingTarget = 'semantic_center'
export type BatchModelingRiskLevel = 'low' | 'medium' | 'high'
export type BatchQueueStatus = 'ready_for_review' | 'needs_scope' | 'high_risk' | 'deferred'
export type BatchQueuePrimaryAction = 'open_builder' | 'regenerate' | 'defer' | 'merge'
export type BatchModelingTone = 'accent' | 'success' | 'warning' | 'danger' | 'violet' | 'neutral'

export interface BatchModelingScope {
  businessDomain: string
  sourceCount: number
  strategy: BatchModelingStrategy
  includeExistingSemantics: boolean
  // 真实扫描坐标：选定数据源 + 库时，后端扫描器读真实表缓存出候选；
  // 未选定时降级为演示队列，保证向后兼容。
  sourceId?: number | null
  database?: string | null
  // 仅用于扫描计划/风险预览文案展示，不参与后端扫描参数下发。
  sourceLabel?: string | null
  tablePrefixes?: string[]
  maxTables?: number
}

export interface BatchModelingQueueItem {
  id: string
  title: string
  target: BatchModelingTarget
  source: string
  grain: string
  confidence: number
  risk: BatchModelingRiskLevel
  status: BatchQueueStatus
  primaryAction: BatchQueuePrimaryAction
  evidence: string[]
  modelingSource?: Record<string, unknown>
}

export interface BatchModelingPlan {
  title: string
  target: BatchModelingTarget
  riskLevel: BatchModelingRiskLevel
  scope: BatchModelingScope
  scanPlan: string[]
  guardrails: string[]
  queueItems: BatchModelingQueueItem[]
}

export const BATCH_MODELING_DEFAULT_SCOPE: BatchModelingScope = {
  businessDomain: '学情分析',
  sourceCount: 18,
  strategy: 'balanced',
  includeExistingSemantics: true,
  sourceId: null,
  database: null,
}

export function buildBatchModelingPlan(scope: BatchModelingScope): BatchModelingPlan {
  const domain = scope.businessDomain.trim() || BATCH_MODELING_DEFAULT_SCOPE.businessDomain
  const normalizedScope = { ...scope, businessDomain: domain }
  const riskLevel = resolveRiskLevel(normalizedScope)
  const needsScope = normalizedScope.sourceCount > 60 || normalizedScope.strategy === 'exploratory'

  return {
    title: `${domain}语义冷启动项目`,
    target: 'semantic_center',
    riskLevel,
    scope: normalizedScope,
    scanPlan: buildScanPlan(normalizedScope),
    guardrails: [
      '批量模式只生成待审阅候选队列，不直接发布语义中心。',
      '每个候选资产进入建设画布后，仍需完成字段证据、口径确认、语义编译和发布门禁。',
      'Data Agent、BI、数据分析只消费语义中心已发布资产，不作为本模式发布目标。',
    ],
    queueItems: buildQueueItems(normalizedScope, needsScope, riskLevel),
  }
}

export function batchQueueStatusLabel(status: BatchQueueStatus): string {
  return BATCH_QUEUE_STATUS_LABELS[status]
}

export function batchQueueStatusTone(status: BatchQueueStatus): BatchModelingTone {
  return BATCH_QUEUE_STATUS_TONES[status]
}

export function getBatchQueuePrimaryAction(item: BatchModelingQueueItem): string {
  return BATCH_QUEUE_PRIMARY_ACTION_LABELS[item.primaryAction]
}

export function canOpenBatchQueueBuilder(item: BatchModelingQueueItem): boolean {
  return item.primaryAction === 'open_builder'
}

export function batchModelingStrategyLabel(strategy: BatchModelingStrategy): string {
  return BATCH_MODELING_STRATEGY_LABELS[strategy]
}

// 分诊分桶：把候选包按审阅注意力归到三桶，缓解审核疲劳。
export type BatchTriageBucket = 'ready' | 'attention' | 'parked'

export const BATCH_TRIAGE_BUCKET_ORDER: BatchTriageBucket[] = ['ready', 'attention', 'parked']

export const BATCH_TRIAGE_BUCKET_LABELS: Record<BatchTriageBucket, string> = {
  ready: '自动就绪',
  attention: '待补口径 / 高风险',
  parked: '已暂缓 / 重复',
}

export function triageBucketForStatus(status: string): BatchTriageBucket {
  if (status === 'needs_scope' || status === 'high_risk') return 'attention'
  if (status === 'deferred' || status === 'duplicate_candidate') return 'parked'
  return 'ready'
}

export function batchModelingRiskLabel(risk: BatchModelingRiskLevel): string {
  return BATCH_MODELING_RISK_LABELS[risk]
}

export function batchModelingRiskTone(risk: BatchModelingRiskLevel): BatchModelingTone {
  return BATCH_MODELING_RISK_TONES[risk]
}

function resolveRiskLevel(scope: BatchModelingScope): BatchModelingRiskLevel {
  if (scope.sourceCount > 60 || scope.strategy === 'exploratory') return 'high'
  if (scope.sourceCount > 24 || !scope.includeExistingSemantics) return 'medium'
  return 'low'
}

// 选定真实数据源 + 库时，扫描计划反映真实坐标与表上限；否则保持演示口径。
export function isRealSourceScope(scope: BatchModelingScope): boolean {
  return Boolean(scope.sourceId) && Boolean((scope.database ?? '').trim())
}

function buildScanPlan(scope: BatchModelingScope): string[] {
  const alignLine = scope.includeExistingSemantics
    ? '对齐已有语义对象、指标和 Cube，避免重复建设。'
    : '不复用已有语义资产，仅生成待审阅候选建议。'

  if (isRealSourceScope(scope)) {
    const sourceLabel = scope.sourceLabel?.trim() || `数据源 #${scope.sourceId}`
    const maxTables = scope.maxTables ?? scope.sourceCount
    return [
      `从 ${sourceLabel} 的库 ${scope.database} 读取真实表缓存，最多扫描 ${maxTables} 张表。`,
      alignLine,
      '按命名分层（事实 / 维度 / 指标）取列推断字段角色，生成带列快照的待审阅候选。',
    ]
  }

  return [
    `扫描 ${scope.sourceCount} 张候选物理表画像、字段画像与血缘使用。`,
    alignLine,
    '按业务主题聚类出事实主题、维度主题、指标候选与高风险缺口。',
  ]
}

// 扫描完成后按真实风险桶汇总，替代仅基于 sourceCount 的启发式预览。
export function summarizeRiskLevel(summary?: Record<string, number> | null): BatchModelingRiskLevel {
  if (!summary) return 'low'
  if ((summary.high ?? 0) > 0) return 'high'
  if ((summary.medium ?? 0) > 0) return 'medium'
  return 'low'
}

function buildQueueItems(
  scope: BatchModelingScope,
  needsScope: boolean,
  riskLevel: BatchModelingRiskLevel,
): BatchModelingQueueItem[] {
  const domain = scope.businessDomain
  const schoolEvidence = scope.includeExistingSemantics
    ? '已有语义中心对象可作为复用参考。'
    : '未纳入已有语义资产对齐，仅保留维度新建候选供人工审阅。'

  return [
    {
      id: 'fact-learning-activity',
      title: `${domain}事实主题候选`,
      target: 'semantic_center',
      source: 'dwd_learning_activity_df',
      grain: '一条学习行为事件',
      confidence: riskLevel === 'high' ? 0.72 : 0.88,
      risk: riskLevel,
      status: needsScope ? 'needs_scope' : 'ready_for_review',
      primaryAction: 'open_builder',
      evidence: ['表画像显示行为时间、学生、课程和学校字段完整。', '血缘使用中已被学情报表消费。'],
    },
    {
      id: 'dim-school',
      title: `${domain}学校维度候选`,
      target: 'semantic_center',
      source: 'dim_school_df',
      grain: '一所学校',
      confidence: 0.91,
      risk: 'low',
      status: 'ready_for_review',
      primaryAction: 'open_builder',
      evidence: ['维表主键稳定，字段中文名与业务术语一致。', schoolEvidence],
    },
    {
      id: 'metric-active-student',
      title: `${domain}活跃学生指标候选`,
      target: 'semantic_center',
      source: 'dws_learning_student_activity_di',
      grain: '按天、学生聚合',
      confidence: 0.79,
      risk: riskLevel === 'low' ? 'medium' : riskLevel,
      status: riskLevel === 'high' ? 'high_risk' : 'ready_for_review',
      primaryAction: riskLevel === 'high' ? 'regenerate' : 'open_builder',
      evidence: ['存在多种活跃口径，需要业务 owner 确认。', '可从最近 7 天查询需求回推时间过滤口径。'],
    },
  ]
}

const BATCH_MODELING_STRATEGY_LABELS: Record<BatchModelingStrategy, string> = {
  conservative: '保守',
  balanced: '平衡',
  exploratory: '探索',
}

const BATCH_MODELING_RISK_LABELS: Record<BatchModelingRiskLevel, string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
}

const BATCH_MODELING_RISK_TONES: Record<BatchModelingRiskLevel, BatchModelingTone> = {
  low: 'success',
  medium: 'warning',
  high: 'danger',
}

const BATCH_QUEUE_STATUS_LABELS: Record<BatchQueueStatus, string> = {
  ready_for_review: '可审阅',
  needs_scope: '需补范围',
  high_risk: '高风险待拆分',
  deferred: '已暂缓',
}

const BATCH_QUEUE_STATUS_TONES: Record<BatchQueueStatus, BatchModelingTone> = {
  ready_for_review: 'success',
  needs_scope: 'warning',
  high_risk: 'danger',
  deferred: 'neutral',
}

const BATCH_QUEUE_PRIMARY_ACTION_LABELS: Record<BatchQueuePrimaryAction, string> = {
  open_builder: '进入资产建设画布',
  regenerate: '退回重生成',
  defer: '暂缓',
  merge: '合并建议',
}
