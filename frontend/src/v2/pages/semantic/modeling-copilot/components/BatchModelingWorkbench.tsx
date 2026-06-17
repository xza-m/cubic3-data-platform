import { useMemo, useState } from 'react'
import { ArrowRight, Layers3, RefreshCw, Search, ShieldCheck, SlidersHorizontal } from 'lucide-react'

import { Button, Chip, Input } from '@v2/components/ui'
import type { SemanticAssetPackage, SemanticBuildProject } from '@v2/api/semanticModelingWorkbench'
import {
  useApplySemanticAssetPackageAction,
  useCreateSemanticBuildProject,
  useSemanticAssetPackageProposalReadiness,
  useScanSemanticBuildProject,
} from '@v2/hooks/semanticModelingWorkbench'
import { useDatasources, useDatasourceDatabases } from '@v2/hooks/datasources'
import { t } from '@v2/i18n'

import {
  BATCH_MODELING_DEFAULT_SCOPE,
  BATCH_TRIAGE_BUCKET_LABELS,
  BATCH_TRIAGE_BUCKET_ORDER,
  batchModelingRiskLabel,
  batchModelingRiskTone,
  batchModelingStrategyLabel,
  batchQueueStatusLabel,
  batchQueueStatusTone,
  buildBatchModelingPlan,
  canOpenBatchQueueBuilder,
  getBatchQueuePrimaryAction,
  isRealSourceScope,
  summarizeRiskLevel,
  triageBucketForStatus,
  type BatchModelingQueueItem,
  type BatchModelingScope,
  type BatchModelingStrategy,
  type BatchQueuePrimaryAction,
  type BatchQueueStatus,
  type BatchTriageBucket,
} from '../batchModeling'

interface BatchModelingWorkbenchProps {
  onOpenBuilder: (item: SemanticAssetPackage) => void
}

const STRATEGIES: BatchModelingStrategy[] = ['conservative', 'balanced', 'exploratory']
type WorkbenchQueueStatus = BatchQueueStatus | 'duplicate_candidate'

export function BatchModelingWorkbench({ onOpenBuilder }: BatchModelingWorkbenchProps) {
  const [scope, setScope] = useState<BatchModelingScope>(BATCH_MODELING_DEFAULT_SCOPE)
  const [submittedScope, setSubmittedScope] = useState<BatchModelingScope | null>(null)
  const [project, setProject] = useState<SemanticBuildProject | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [manualFallback, setManualFallback] = useState(false)
  const [manualSource, setManualSource] = useState('manual_selected_source')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const createProject = useCreateSemanticBuildProject()
  const scanProject = useScanSemanticBuildProject()
  const applyPackageAction = useApplySemanticAssetPackageAction()
  const datasourcesQuery = useDatasources()
  const databasesQuery = useDatasourceDatabases(scope.sourceId ?? 0)
  const datasourceOptions = datasourcesQuery.data?.items ?? []
  const databaseOptions = databasesQuery.data ?? []
  const previewPlan = useMemo(() => buildBatchModelingPlan(scope), [scope])
  const plan = useMemo(() => (submittedScope ? buildBatchModelingPlan(submittedScope) : previewPlan), [previewPlan, submittedScope])
  const queueItems = useMemo(() => project?.asset_packages ?? [], [project])
  const triageBuckets = useMemo(() => groupByTriage(queueItems), [queueItems])
  const hasGenerated = submittedScope !== null && project !== null
  const isGenerating = createProject.isPending || scanProject.isPending
  // 扫描计划头部的风险标签：已生成时按真实风险桶汇总，否则用范围预览启发式。
  const headerRiskLevel = hasGenerated && project ? summarizeRiskLevel(project.risk_summary) : plan.riskLevel
  // 真实源回退识别：选了真实数据源但队列里没有真实扫描快照（snapshot_id 以 scan: 开头）。
  const requestedRealSource = submittedScope ? isRealSourceScope(submittedScope) : false
  const usedRealScan = queueItems.some(isRealScanPackage)
  const fellBackFromRealSource = hasGenerated && requestedRealSource && !usedRealScan

  async function handleGenerateQueue() {
    setSubmitError(null)
    setProject(null)
    try {
      const batchRunId = createBatchRunId()
      const hasRealSource = Boolean(scope.sourceId) && Boolean((scope.database ?? '').trim())
      const created = await createProject.mutateAsync({
        name: scope.businessDomain,
        business_domain: scope.businessDomain,
        scope: {
          batch_run_id: batchRunId,
          source_count: scope.sourceCount,
          strategy: scope.strategy,
          include_existing_semantics: scope.includeExistingSemantics,
          // 选定真实数据源 + 库时下发坐标，后端扫描器读真实表缓存出候选；
          // 否则保持原有演示/手动降级路径。
          ...(hasRealSource
            ? {
                source_id: scope.sourceId,
                database: (scope.database ?? '').trim(),
                max_tables: scope.maxTables ?? scope.sourceCount,
              }
            : {}),
          ...(manualFallback
            ? {
                recommendation_empty: true,
                selected_sources: [manualSource.trim() || 'manual_selected_source'],
              }
            : {}),
        },
      })
      const scanned = await scanProject.mutateAsync({ projectId: created.id, body: { strategy: scope.strategy } })
      setProject(scanned)
      setSubmittedScope(scope)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '生成候选资产队列失败')
    }
  }

  function handlePackageAction(item: SemanticAssetPackage, action: 'defer' | 'mark_duplicate') {
    setActionError(null)
    applyPackageAction.mutate(
      {
        projectId: item.project_id,
        packageId: item.id,
        body: {
          action,
          reason: action === 'defer' ? '用户在候选队列暂缓' : '用户在候选队列标记重复',
        },
      },
      {
        onSuccess: (result) => {
          if (isSemanticAssetPackageResult(result)) {
            setProject((current) => replaceProjectAssetPackage(current, result))
          }
        },
        onError: (error) => {
          setActionError(error instanceof Error ? error.message : '候选资产操作失败')
        },
      },
    )
  }

  return (
    <div className="flex min-h-full flex-col bg-[var(--bg-app)] text-1">
      <header className="border-b px-6 py-5" style={{ borderColor: 'var(--border)' }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold uppercase text-3">语义建设工作台</p>
            <h2 className="m-0 mt-1 text-[22px] font-semibold leading-tight">语义冷启动项目</h2>
            <p className="m-0 mt-2 max-w-[760px] text-[13px] leading-6 text-2">
              以业务主题和推荐范围生成待审阅候选队列，再逐个进入资产建设画布收敛字段证据、Cube 口径、本体锚定和发布门禁。
            </p>
          </div>
          <Chip tone="accent">目标：语义中心</Chip>
        </div>
      </header>

      <main className="grid flex-1 gap-4 p-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <section className="rounded-[8px] border bg-[var(--bg-surface)] p-4" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <Layers3 className="h-4 w-4 text-3" aria-hidden />
            <h2 className="m-0 text-[15px] font-semibold">冷启动范围</h2>
          </div>
          <label className="mt-4 block text-[12px] font-medium text-2" htmlFor="batch-modeling-domain">
            业务主题
          </label>
          <Input
            id="batch-modeling-domain"
            className="mt-2"
            value={scope.businessDomain}
            onChange={(event) => setScope((current) => ({ ...current, businessDomain: event.target.value }))}
          />

          <label className="mt-4 block text-[12px] font-medium text-2" htmlFor="batch-modeling-source">
            数据源
          </label>
          <select
            id="batch-modeling-source"
            className="mt-2 h-9 w-full rounded-[6px] border bg-[var(--bg-surface)] px-2 text-[13px] text-1"
            style={{ borderColor: 'var(--border)' }}
            value={scope.sourceId ?? ''}
            onChange={(event) => {
              const nextId = event.target.value ? Number(event.target.value) : null
              const nextLabel = nextId
                ? datasourceOptions.find((datasource) => datasource.id === nextId)?.name ?? null
                : null
              setScope((current) => ({ ...current, sourceId: nextId, sourceLabel: nextLabel, database: null }))
            }}
          >
            <option value="">演示数据（不选真实源）</option>
            {datasourceOptions.map((datasource) => (
              <option key={datasource.id} value={datasource.id}>
                {datasource.name}
              </option>
            ))}
          </select>

          {scope.sourceId ? (
            <>
              <label className="mt-3 block text-[12px] font-medium text-2" htmlFor="batch-modeling-database">
                数据库 / 项目
              </label>
              <select
                id="batch-modeling-database"
                className="mt-2 h-9 w-full rounded-[6px] border bg-[var(--bg-surface)] px-2 text-[13px] text-1"
                style={{ borderColor: 'var(--border)' }}
                value={scope.database ?? ''}
                disabled={databasesQuery.isLoading}
                onChange={(event) =>
                  setScope((current) => ({ ...current, database: event.target.value || null }))
                }
              >
                <option value="">{databasesQuery.isLoading ? '加载中...' : '请选择库'}</option>
                {databaseOptions.map((database) => (
                  <option key={database} value={database}>
                    {database}
                  </option>
                ))}
              </select>
            </>
          ) : null}

          <div
            className="mt-3 rounded-[8px] border px-3 py-2"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)' }}
          >
            <div className="text-[12px] font-semibold text-1">
              {scope.sourceId && scope.database ? '真实表扫描' : '推荐范围'}
            </div>
            <p className="m-0 mt-1 text-[12px] leading-5 text-3">
              {scope.sourceId && scope.database
                ? '从所选数据源的真实表缓存按命名分层扫描出候选资产，并做置信度 / 风险分诊。'
                : '未选真实数据源，使用演示数据生成候选队列；选定数据源与库后可扫描真实表。'}
            </p>
          </div>

          <div className="mt-4 rounded-[8px] border" style={{ borderColor: 'var(--border)' }}>
            <button
              type="button"
              aria-expanded={advancedOpen}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-[12px] font-medium text-2"
              onClick={() => setAdvancedOpen((current) => !current)}
            >
              <span className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-3" aria-hidden />
                高级设置
              </span>
              <span className="text-[11px] text-3">{advancedOpen ? '收起' : '展开'}</span>
            </button>

            {advancedOpen ? (
              <div className="border-t px-3 pb-3 pt-2" style={{ borderColor: 'var(--border)' }}>
                <label className="block text-[12px] font-medium text-2" htmlFor="batch-modeling-source-count">
                  {isRealSourceScope(scope) ? '最多扫描表数' : '候选表数量'}
                </label>
                <Input
                  id="batch-modeling-source-count"
                  className="mt-2"
                  min={1}
                  type="number"
                  value={scope.sourceCount}
                  onChange={(event) =>
                    setScope((current) => ({ ...current, sourceCount: Math.max(1, Number(event.target.value) || 1) }))
                  }
                />
                <p className="m-0 mt-1.5 text-[11px] leading-4 text-3">
                  {isRealSourceScope(scope)
                    ? '真实扫描时作为本次最多读取的表数上限（按命名分层取前 N 张）。'
                    : '演示模式下用于估算候选物理表规模。'}
                </p>

                <div className="mt-4">
                  <p className="m-0 text-[12px] font-medium text-2">策略选择</p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {STRATEGIES.map((strategy) => (
                      <button
                        key={strategy}
                        type="button"
                        aria-pressed={scope.strategy === strategy}
                        className={[
                          'h-8 rounded-[6px] border px-2 text-[12px] transition-colors',
                          scope.strategy === strategy ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-2',
                        ].join(' ')}
                        style={{ borderColor: scope.strategy === strategy ? undefined : 'var(--border)' }}
                        onClick={() => setScope((current) => ({ ...current, strategy }))}
                      >
                        {batchModelingStrategyLabel(strategy)}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="mt-4 flex items-center gap-2 text-[12px] text-2">
                  <input
                    checked={scope.includeExistingSemantics}
                    type="checkbox"
                    onChange={(event) =>
                      setScope((current) => ({ ...current, includeExistingSemantics: event.target.checked }))
                    }
                  />
                  对齐已有语义资产
                </label>

                <label className="mt-3 flex items-center gap-2 text-[12px] text-2">
                  <input
                    aria-label="推荐为空，使用手动选表模式"
                    type="checkbox"
                    checked={manualFallback}
                    onChange={(event) => setManualFallback(event.target.checked)}
                  />
                  推荐为空时使用手动选表降级
                </label>
                {manualFallback ? (
                  <>
                    <label className="mt-2 block text-[12px] font-medium text-2" htmlFor="batch-modeling-manual-source">
                      手动源表名
                    </label>
                    <Input
                      id="batch-modeling-manual-source"
                      className="mt-2"
                      value={manualSource}
                      onChange={(event) => setManualSource(event.target.value)}
                      placeholder="ods_manual_fact_df"
                    />
                  </>
                ) : null}
              </div>
            ) : null}
          </div>

          <Button
            className="mt-5 w-full justify-center"
            variant="primary"
            disabled={isGenerating}
            onClick={() => void handleGenerateQueue()}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            {isGenerating ? '生成中...' : '生成候选队列'}
          </Button>
          {submitError ? <p className="m-0 mt-3 text-[12px] leading-5 text-danger">{submitError}</p> : null}
        </section>

        <section className="flex min-w-0 flex-col gap-4">
          <section
            className={['rounded-[8px] border bg-[var(--bg-surface)] p-4', hasGenerated ? 'order-2' : 'order-1'].join(' ')}
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-3" aria-hidden />
                  <h2 className="m-0 text-[15px] font-semibold">扫描计划</h2>
                </div>
                {hasGenerated ? <h3 className="m-0 mt-2 min-w-0 break-words text-[16px] font-semibold">{plan.title}</h3> : null}
                <p className="m-0 mt-1 text-[12px] leading-5 text-3">
                  {hasGenerated ? '已生成冷启动计划，等待逐项审阅。' : '确认冷启动范围后生成候选队列。'}
                </p>
              </div>
              <Chip tone={batchModelingRiskTone(headerRiskLevel)}>{batchModelingRiskLabel(headerRiskLevel)}</Chip>
            </div>
            <ul className="m-0 mt-4 space-y-2 pl-4 text-[13px] leading-5 text-2">
              {plan.scanPlan.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section
            className={['rounded-[8px] border bg-[var(--bg-surface)] p-4', hasGenerated ? 'order-1' : 'order-2'].join(' ')}
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="m-0 text-[16px] font-semibold">候选资产队列</h2>
              <span className="text-[12px] text-3">
                {hasGenerated
                  ? t('semantic.batch.queue.count', '{count} 个候选资产包', { count: project.asset_package_count || queueItems.length })
                  : t('semantic.batch.queue.waiting', '等待生成')}
              </span>
            </div>

            {hasGenerated ? (
              <div className="mt-4 grid gap-4">
                {actionError ? (
                  <div className="rounded-[8px] border px-3 py-2 text-[12px] text-danger" style={{ borderColor: 'var(--danger)' }}>
                    {actionError}
                  </div>
                ) : null}
                {fellBackFromRealSource ? (
                  <div
                    className="rounded-[8px] border px-3 py-2 text-[12px] leading-5 text-2"
                    style={{ borderColor: 'var(--warning)', background: 'var(--bg-surface-2)' }}
                  >
                    已选择真实数据源，但未从表缓存扫描到候选（可能尚未同步目录或命名不匹配），当前展示的是降级候选。请到数据源详情触发目录同步后重试。
                  </div>
                ) : null}
                {queueItems.length === 0 ? (
                  <div className="rounded-[8px] border px-3 py-3 text-[12px] text-3" style={{ borderColor: 'var(--border)' }}>
                    本次未生成候选资产，请调整范围或确认数据源已同步表缓存后重试。
                  </div>
                ) : null}
                {BATCH_TRIAGE_BUCKET_ORDER.filter((bucket) => triageBuckets[bucket].length > 0).map((bucket) => (
                  <div key={bucket} className="grid gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-1">{BATCH_TRIAGE_BUCKET_LABELS[bucket]}</span>
                      <span className="text-[11px] text-3">{triageBuckets[bucket].length}</span>
                    </div>
                    {triageBuckets[bucket].map((item) => {
                      const queueStatus = toBatchQueueStatus(item.status)
                      const queueItem = toBatchQueueItem(item)
                      const canOpenBuilder = canOpenBatchQueueBuilder(queueItem)
                      const isDeferred = item.status === 'deferred'
                      const isDuplicate = item.status === 'duplicate_candidate'

                      return (
                        <article key={item.id} className="rounded-[8px] border p-3" style={{ borderColor: 'var(--border)' }}>
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <h3 className="m-0 min-w-0 break-words text-[14px] font-semibold">{item.title}</h3>
                              <p className="m-0 mt-1 break-all text-[12px] text-3">
                                {item.source} · {item.grain}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              <Chip tone={workbenchQueueStatusTone(queueStatus)}>{workbenchQueueStatusLabel(queueStatus)}</Chip>
                              <Chip tone={batchModelingRiskTone(item.risk)}>{batchModelingRiskLabel(item.risk)}</Chip>
                            </div>
                          </div>
                          <p className="m-0 mt-3 text-[12px] text-2">置信度 {(item.confidence * 100).toFixed(0)}%</p>
                          <ul className="m-0 mt-2 space-y-1 pl-4 text-[12px] leading-5 text-2">
                            {item.evidence.map((evidence) => (
                              <li key={evidence}>{evidence}</li>
                            ))}
                          </ul>
                          <ProposalReadinessPanel item={item} />
                          <div className="mt-3 flex flex-wrap justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={applyPackageAction.isPending || isDeferred}
                              onClick={() => handlePackageAction(item, 'defer')}
                            >
                              暂缓
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={applyPackageAction.isPending || isDuplicate}
                              onClick={() => handlePackageAction(item, 'mark_duplicate')}
                            >
                              标记重复
                            </Button>
                            <Button
                              size="sm"
                              variant="default"
                              disabled={!canOpenBuilder || isDeferred || isDuplicate}
                              onClick={() => {
                                if (canOpenBuilder) onOpenBuilder(item)
                              }}
                            >
                              {getBatchQueuePrimaryAction(queueItem)}
                              {canOpenBuilder ? <ArrowRight className="h-4 w-4" aria-hidden /> : null}
                            </Button>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-[8px] border px-3 py-3 text-[12px] text-3" style={{ borderColor: 'var(--border)' }}>
                {isGenerating ? '正在创建 Build Project 并扫描候选资产...' : '尚未生成候选队列。'}
              </div>
            )}
          </section>

          <section className="order-3 rounded-[8px] border bg-[var(--bg-surface)] p-4" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-3" aria-hidden />
              <h2 className="m-0 text-[15px] font-semibold">批量模式边界</h2>
            </div>
            <ul className="m-0 mt-3 space-y-2 pl-4 text-[12px] leading-5 text-2">
              {plan.guardrails.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        </section>
      </main>
    </div>
  )
}

// 真实扫描的候选包带 snapshot_id 形如 scan:<source>:<db>:<table>；演示/降级包用 workbench: 前缀。
function isRealScanPackage(item: SemanticAssetPackage): boolean {
  const source = item.modeling_source as Record<string, unknown> | undefined
  const evidence = source?.evidence_bundle as Record<string, unknown> | undefined
  const snapshot = evidence?.schema_snapshot as Record<string, unknown> | undefined
  const snapshotId = typeof snapshot?.snapshot_id === 'string' ? snapshot.snapshot_id : ''
  return snapshotId.startsWith('scan:')
}

function groupByTriage(items: SemanticAssetPackage[]): Record<BatchTriageBucket, SemanticAssetPackage[]> {
  const buckets: Record<BatchTriageBucket, SemanticAssetPackage[]> = {
    ready: [],
    attention: [],
    parked: [],
  }
  for (const item of items) {
    buckets[triageBucketForStatus(item.status)].push(item)
  }
  return buckets
}

function toBatchQueueItem(item: SemanticAssetPackage): BatchModelingQueueItem {
  const status = toBatchQueueStatus(item.status)
  return {
    id: item.id,
    title: item.title,
    target: item.target,
    source: item.source,
    grain: item.grain,
    confidence: item.confidence,
    risk: item.risk,
    status: toSharedBatchQueueStatus(status),
    primaryAction: toBatchQueuePrimaryAction(item.primary_action),
    evidence: item.evidence,
    modelingSource: item.modeling_source,
  }
}

function ProposalReadinessPanel({ item }: { item: SemanticAssetPackage }) {
  const readinessQuery = useSemanticAssetPackageProposalReadiness(item.project_id, item.id)
  const readiness = readinessQuery.data ?? item.proposal_readiness
  if (!readiness) {
    return (
      <div
        className="mt-3 rounded-[8px] border px-3 py-2 text-[12px] leading-5 text-3"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)' }}
      >
        {t('semantic.batch.readiness.pending', '发布准备状态待计算')}
      </div>
    )
  }

  const blocked = readiness.status === 'blocked'
  const blockers = readiness.blocking_reasons ?? []
  const bindings = readiness.required_bindings ?? []
  const nextActions = readiness.next_actions ?? []

  return (
    <div
      className="mt-3 rounded-[8px] border px-3 py-2 text-[12px] leading-5"
      style={{ borderColor: blocked ? 'var(--warning)' : 'var(--border)', background: 'var(--bg-surface-2)' }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={blocked ? 'warning' : 'success'}>
          {readinessQuery.isFetching
            ? t('semantic.batch.readiness.checking', '检查中')
            : blocked
              ? t('semantic.batch.readiness.blocked', '发布准备受阻')
              : t('semantic.batch.readiness.ready', '可生成 Proposal')}
        </Chip>
        {bindings.length > 0 ? (
          <span className="text-3">{t('semantic.batch.readiness.bindings', '需绑定：{items}', { items: bindings.join(' / ') })}</span>
        ) : null}
      </div>
      {blockers.length > 0 ? (
        <p className="m-0 mt-2 text-2">{t('semantic.batch.readiness.blockers', '阻断原因：{items}', { items: blockers.join('；') })}</p>
      ) : null}
      {nextActions.length > 0 ? (
        <p className="m-0 mt-1 text-3">{t('semantic.batch.readiness.nextActions', '下一步：{items}', { items: nextActions.join('；') })}</p>
      ) : null}
    </div>
  )
}

function createBatchRunId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 8) || '000000'
  return `run-${timestamp}-${random}`
}

function toBatchQueueStatus(status: SemanticAssetPackage['status']): WorkbenchQueueStatus {
  if (status === 'needs_scope' || status === 'high_risk' || status === 'deferred' || status === 'duplicate_candidate') return status
  return 'ready_for_review'
}

function toSharedBatchQueueStatus(status: WorkbenchQueueStatus): BatchQueueStatus {
  return status === 'duplicate_candidate' ? 'ready_for_review' : status
}

function workbenchQueueStatusLabel(status: WorkbenchQueueStatus): string {
  if (status === 'duplicate_candidate') return '重复候选'
  return batchQueueStatusLabel(status)
}

function workbenchQueueStatusTone(status: WorkbenchQueueStatus): ReturnType<typeof batchQueueStatusTone> {
  if (status === 'duplicate_candidate') return 'warning'
  return batchQueueStatusTone(status)
}

function toBatchQueuePrimaryAction(action: string): BatchQueuePrimaryAction {
  if (action === 'regenerate' || action === 'defer' || action === 'merge') return action
  return 'open_builder'
}

function isSemanticAssetPackageResult(result: unknown): result is SemanticAssetPackage {
  return Boolean(result && typeof result === 'object' && 'id' in result && 'project_id' in result)
}

function replaceProjectAssetPackage(
  current: SemanticBuildProject | null,
  updatedPackage: SemanticAssetPackage,
): SemanticBuildProject | null {
  if (!current?.asset_packages) return current

  let matched = false
  const assetPackages = current.asset_packages.map((item) => {
    if (item.id !== updatedPackage.id) return item
    matched = true
    return { ...item, ...updatedPackage }
  })

  if (!matched) return current

  return {
    ...current,
    asset_packages: assetPackages,
    asset_package_count: assetPackages.length,
    risk_summary: countRiskSummary(assetPackages),
  }
}

function countRiskSummary(assetPackages: SemanticAssetPackage[]): Record<string, number> {
  const summary = { low: 0, medium: 0, high: 0 }
  for (const item of assetPackages) {
    summary[item.risk] += 1
  }
  return summary
}
