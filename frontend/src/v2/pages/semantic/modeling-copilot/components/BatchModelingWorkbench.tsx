import { useMemo, useState } from 'react'
import { ArrowRight, Layers3, RefreshCw, Search, ShieldCheck } from 'lucide-react'

import { Button, Chip, Input } from '@v2/components/ui'
import type { SemanticAssetPackage, SemanticBuildProject } from '@v2/api/semanticModelingWorkbench'
import {
  useApplySemanticAssetPackageAction,
  useCreateSemanticBuildProject,
  useScanSemanticBuildProject,
} from '@v2/hooks/semanticModelingWorkbench'

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
  type BatchModelingQueueItem,
  type BatchModelingScope,
  type BatchModelingStrategy,
  type BatchQueuePrimaryAction,
  type BatchQueueStatus,
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
  const [manualFallback, setManualFallback] = useState(false)
  const [manualSource, setManualSource] = useState('manual_selected_source')
  const createProject = useCreateSemanticBuildProject()
  const scanProject = useScanSemanticBuildProject()
  const applyPackageAction = useApplySemanticAssetPackageAction()
  const previewPlan = useMemo(() => buildBatchModelingPlan(scope), [scope])
  const plan = useMemo(() => (submittedScope ? buildBatchModelingPlan(submittedScope) : previewPlan), [previewPlan, submittedScope])
  const queueItems = project?.asset_packages ?? []
  const hasGenerated = submittedScope !== null && project !== null
  const isGenerating = createProject.isPending || scanProject.isPending

  async function handleGenerateQueue() {
    setSubmitError(null)
    setProject(null)
    try {
      const created = await createProject.mutateAsync({
        name: scope.businessDomain,
        business_domain: scope.businessDomain,
        scope: {
          source_count: scope.sourceCount,
          strategy: scope.strategy,
          include_existing_semantics: scope.includeExistingSemantics,
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
      },
    )
  }

  return (
    <div className="flex min-h-full flex-col bg-[var(--bg-app)] text-1">
      <header className="border-b px-6 py-5" style={{ borderColor: 'var(--border)' }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold uppercase text-3">AI 建模助手</p>
            <h1 className="m-0 mt-1 text-[22px] font-semibold leading-tight">批量语义建设</h1>
            <p className="m-0 mt-2 max-w-[760px] text-[13px] leading-6 text-2">
              按业务域生成待审阅候选队列，再逐个进入资产建设画布收敛字段证据、Cube 口径、本体锚定和发布门禁。
            </p>
          </div>
          <Chip tone="accent">目标：语义中心</Chip>
        </div>
      </header>

      <main className="grid flex-1 gap-4 p-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <section className="rounded-[8px] border bg-[var(--bg-surface)] p-4" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <Layers3 className="h-4 w-4 text-3" aria-hidden />
            <h2 className="m-0 text-[15px] font-semibold">建设范围</h2>
          </div>
          <div
            className="mt-3 rounded-[8px] border px-3 py-2"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)' }}
          >
            <div className="text-[12px] font-semibold text-1">推荐建设范围</div>
            <p className="m-0 mt-1 text-[12px] leading-5 text-3">
              若暂无自动推荐，可手动选择源表生成最小候选队列。
            </p>
            <label className="mt-2 flex items-center gap-2 text-[12px] text-2">
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

          <label className="mt-4 block text-[12px] font-medium text-2" htmlFor="batch-modeling-domain">
            业务域
          </label>
          <Input
            id="batch-modeling-domain"
            className="mt-2"
            value={scope.businessDomain}
            onChange={(event) => setScope((current) => ({ ...current, businessDomain: event.target.value }))}
          />

          <label className="mt-4 block text-[12px] font-medium text-2" htmlFor="batch-modeling-source-count">
            候选表数量
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

          <Button
            className="mt-5 w-full justify-center"
            variant="primary"
            disabled={isGenerating}
            onClick={() => void handleGenerateQueue()}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            {isGenerating ? '生成中...' : '生成批量建设队列'}
          </Button>
          {submitError ? <p className="m-0 mt-3 text-[12px] leading-5 text-danger">{submitError}</p> : null}
        </section>

        <section className="min-w-0 space-y-4">
          <section className="rounded-[8px] border bg-[var(--bg-surface)] p-4" style={{ borderColor: 'var(--border)' }}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-3" aria-hidden />
                  <h2 className="m-0 text-[15px] font-semibold">扫描计划</h2>
                </div>
                {hasGenerated ? <h3 className="m-0 mt-2 min-w-0 break-words text-[16px] font-semibold">{plan.title}</h3> : null}
                <p className="m-0 mt-1 text-[12px] leading-5 text-3">
                  {hasGenerated ? '已生成批量建设计划，等待逐项审阅。' : '先确认范围，再生成批量建设队列。'}
                </p>
              </div>
              <Chip tone={batchModelingRiskTone(plan.riskLevel)}>{batchModelingRiskLabel(plan.riskLevel)}</Chip>
            </div>
            <ul className="m-0 mt-4 space-y-2 pl-4 text-[13px] leading-5 text-2">
              {plan.scanPlan.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="rounded-[8px] border bg-[var(--bg-surface)] p-4" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="m-0 text-[16px] font-semibold">候选资产队列</h2>
              <span className="text-[12px] text-3">
                {hasGenerated ? `${project.asset_package_count || queueItems.length} 个候选资产包` : '等待生成'}
              </span>
            </div>

            {hasGenerated ? (
              <div className="mt-4 grid gap-3">
                {queueItems.map((item) => {
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
                          disabled={!canOpenBuilder}
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
            ) : (
              <div className="mt-4 rounded-[8px] border px-3 py-3 text-[12px] text-3" style={{ borderColor: 'var(--border)' }}>
                {isGenerating ? '正在创建 Build Project 并扫描候选资产...' : '尚未生成候选队列。'}
              </div>
            )}
          </section>

          <section className="rounded-[8px] border bg-[var(--bg-surface)] p-4" style={{ borderColor: 'var(--border)' }}>
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
  }
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
