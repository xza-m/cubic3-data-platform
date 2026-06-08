import { Bot, Database } from 'lucide-react'
import { useLocation, useParams } from 'react-router-dom'

import { Chip } from '@v2/components/ui'
import { useSemanticBuildProject } from '@v2/hooks/semanticModelingWorkbench'
import { t } from '@v2/i18n'

import BatchModelingAgent from './BatchModelingAgent'
import ModelingAgent from './ModelingAgent'
import { batchModelingRiskTone } from './batchModeling'
import { readWorkbenchCandidateState, type WorkbenchCandidateState } from './workbenchContext'

type RouteParams = {
  projectId?: string
  candidateId?: string
}

export default function SemanticModelingWorkbench() {
  const location = useLocation()
  const params = useParams<RouteParams>()
  const candidateState = readWorkbenchCandidateState(location.state)
  const isQuickMode = location.pathname.endsWith('/quick')
  const hasCandidateRoute = Boolean(params.projectId && params.candidateId)
  const projectQuery = useSemanticBuildProject(params.projectId)
  const apiCandidate = projectQuery.data?.asset_packages?.find((item) => item.id === params.candidateId)
  const apiCandidateState = apiCandidate
    ? ({
        workbenchMode: 'batch',
        projectId: apiCandidate.project_id,
        candidateId: apiCandidate.id,
        candidateTitle: apiCandidate.title,
        target: apiCandidate.target,
        source: apiCandidate.source,
        grain: apiCandidate.grain,
        risk: apiCandidate.risk,
        evidence: apiCandidate.evidence,
        modelingSource: apiCandidate.modeling_source,
      } satisfies WorkbenchCandidateState)
    : null
  const context = candidateState ?? apiCandidateState ?? createFallbackCandidateState(params, isQuickMode)

  if (!isQuickMode && !hasCandidateRoute) {
    return (
      <div
        className="h-full min-h-0 overflow-y-auto bg-[var(--bg-app)] text-1 scroll-thin"
        data-testid="semantic-modeling-workbench"
      >
        <h1 className="sr-only">{t('semantic.modelingWorkbench.title', '语义建设工作台')}</h1>
        <BatchModelingAgent />
      </div>
    )
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-y-auto bg-[var(--bg-app)] text-1 scroll-thin"
      data-testid="semantic-modeling-workbench"
    >
      <header className="border-b bg-[var(--bg-surface)] px-6 py-4" style={{ borderColor: 'var(--border)' }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="m-0 text-[12px] font-semibold uppercase tracking-[0.08em] text-3">Semantic Modeling</p>
            <h1 className="m-0 mt-1 text-[22px] font-semibold text-1">{t('semantic.modelingWorkbench.title', '语义建设工作台')}</h1>
          </div>
          <Chip tone={isQuickMode ? 'accent' : batchModelingRiskTone(context.risk)}>
            {isQuickMode
              ? t('semantic.modelingWorkbench.mode.quick', '快速模式')
              : t('semantic.modelingWorkbench.mode.batchCandidateDetail', '批量候选详情')}
          </Chip>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <CandidateContextSummary context={context} isQuickMode={isQuickMode} />

        <section className="flex min-h-[680px] flex-1 flex-col overflow-hidden rounded-[8px] border bg-[var(--bg-surface)]" style={{ borderColor: 'var(--border)' }}>
          <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2 text-[13px] font-semibold text-1">
              <Database size={15} aria-hidden />
              {t('semantic.modelingWorkbench.canvas.title', '字段候选主画布')}
            </div>
            <p className="m-0 mt-1 text-[12px] leading-5 text-3">
              {t(
                'semantic.modelingWorkbench.canvas.subtitle',
                '审阅字段候选、Cube 口径和轻本体锚定；发布检查统一在右侧资产面板完成。',
              )}
            </p>
          </div>
          <ModelingAgent workbenchContext={!isQuickMode && hasCandidateRoute ? context : null} embeddedInWorkbench />
        </section>
      </main>
    </div>
  )
}

function CandidateContextSummary({
  context,
  isQuickMode,
}: {
  context: WorkbenchCandidateState
  isQuickMode: boolean
}) {
  const evidence = context.evidence.slice(0, 2)
  return (
    <section
      className="rounded-[8px] border bg-[var(--bg-surface)] px-4 py-3"
      style={{ borderColor: 'var(--border)' }}
      aria-label={t('semantic.modelingWorkbench.context.aria', '建设上下文')}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-3">
            <Bot size={14} aria-hidden />
            {isQuickMode
              ? t('semantic.modelingWorkbench.mode.quick', '快速模式')
              : t('semantic.modelingWorkbench.context.batchLabel', '批量候选上下文')}
          </div>
          <h2 className="m-0 mt-1 break-words text-[17px] font-semibold leading-tight text-1">
            {isQuickMode ? t('semantic.modelingWorkbench.mode.quickAsset', '快速单资产模式') : context.candidateTitle}
          </h2>
        </div>
        <div className="flex flex-wrap gap-2 text-[12px]">
          <Chip tone={isQuickMode ? 'accent' : batchModelingRiskTone(context.risk)}>
            {isQuickMode
              ? t('semantic.modelingWorkbench.chip.manualModeling', '手动建模')
              : t('semantic.modelingWorkbench.chip.pendingCandidate', '待确认候选')}
          </Chip>
          <Chip>{targetLabel(context.target)}</Chip>
        </div>
      </div>
      <dl className="mt-3 grid gap-2 text-[12.5px] md:grid-cols-4">
        <ContextRow label={t('semantic.modelingWorkbench.context.project', '项目')} value={context.projectId} />
        <ContextRow label={t('semantic.modelingWorkbench.context.source', '源表')} value={context.source} />
        <ContextRow label={t('semantic.modelingWorkbench.context.grain', '粒度')} value={context.grain} />
        <ContextRow label={t('semantic.modelingWorkbench.context.candidate', '候选')} value={context.candidateId} />
      </dl>
      {evidence.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2 text-[12px] text-2">
          {evidence.map((item) => (
            <span key={item} className="rounded bg-[var(--bg-surface-2)] px-2 py-1">
              {item}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function createFallbackCandidateState(params: RouteParams, isQuickMode: boolean): WorkbenchCandidateState {
  const candidateId = params.candidateId || 'quick-asset'
  return {
    workbenchMode: isQuickMode ? 'quick' : 'batch',
    projectId: params.projectId || 'quick-project',
    candidateId,
    candidateTitle: isQuickMode ? t('semantic.modelingWorkbench.mode.quickAsset', '快速单资产模式') : candidateId,
    target: 'semantic_center',
    source: isQuickMode
      ? t('semantic.modelingWorkbench.fallbackSourceQuick', '待选择源表')
      : t('semantic.modelingWorkbench.fallbackSourceUnknown', '未知源表'),
    grain: isQuickMode
      ? t('semantic.modelingWorkbench.fallbackGrainQuick', '待确认资产粒度')
      : t('semantic.modelingWorkbench.fallbackGrainUnknown', '待确认粒度'),
    risk: 'medium',
    evidence: [],
  }
}

function ContextRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[60px_minmax(0,1fr)] gap-2 rounded-[8px] bg-[var(--bg-surface-2)] px-3 py-2">
      <dt className="text-3">{label}</dt>
      <dd className="m-0 min-w-0 break-words font-medium text-1">{value}</dd>
    </div>
  )
}

function targetLabel(target: WorkbenchCandidateState['target']): string {
  return target === 'semantic_center' ? t('semantic.modelingWorkbench.target.semanticCenter', '语义中心') : target
}
