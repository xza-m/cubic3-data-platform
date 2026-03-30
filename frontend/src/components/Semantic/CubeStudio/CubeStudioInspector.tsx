import { Database, GitBranch, Layers3 } from 'lucide-react'
import type { CubeDetail, CubeDraftPayload, DomainSummary } from '@/api/semantic'
import { SemanticIssueList } from '@/components/Semantic/SemanticIssueList'
import { SemanticObjectIdentity } from '@/components/Semantic/SemanticObjectIdentity'
import { SemanticStatusBlock } from '@/components/Semantic/SemanticStatusBlock'
import { SemanticStructureSummary } from '@/components/Semantic/SemanticStructureSummary'
import { SemanticInspectorPanel } from '@/components/Semantic/workbench'
import type { SemanticValidationSummary } from '@/components/Semantic/workbench'
import type { DataSource } from '@/types'

interface DiffSummary {
  dimensionDelta: number
  measureDelta: number
  tableChanged: boolean
}

interface CubeStudioInspectorProps {
  selectedDataSource?: DataSource
  selectedTable: {
    table: string
  } | null
  selectedDomain: string
  draft: CubeDraftPayload | null
  cubeDetail?: CubeDetail
  domains: DomainSummary[]
  draftDiff: DiffSummary | null
  summary: SemanticValidationSummary
}

export function CubeStudioInspector({
  selectedDataSource,
  selectedTable,
  selectedDomain,
  draft,
  cubeDetail,
  domains,
  draftDiff,
  summary,
}: CubeStudioInspectorProps) {
  const activeDomain = domains.find((item) => String(item.id || item.code) === selectedDomain)?.name
  const objectTitle = draft?.title || cubeDetail?.title || '待生成 Cube'
  const objectCode = draft?.name || cubeDetail?.name || 'draft_cube'
  const objectDescription = draft?.description || cubeDetail?.description || '显示当前来源、结构规模和阻塞摘要。'
  const dimensionCount = draft ? Object.keys(draft.dimensions || {}).length : cubeDetail ? Object.keys(cubeDetail.dimensions).length : 0
  const measureCount = draft ? Object.keys(draft.measures || {}).length : cubeDetail ? Object.keys(cubeDetail.measures).length : 0
  const primaryHint = summary.blockers?.[0] || summary.hints?.[0]

  return (
    <SemanticInspectorPanel
      title="建模摘要"
      description="显示当前上下文、结构规模、领域挂接和当前阻塞。"
      testId="domain-inspector-cube-studio"
    >
      <div className="grid gap-3">
        <div className="rounded-xl border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] p-3">
          <SemanticObjectIdentity
            title={objectTitle}
            code={objectCode}
            description={objectDescription}
            meta={[
              activeDomain || cubeDetail?.domain_name || '暂未归入领域',
              selectedTable?.table || cubeDetail?.table || '未选择物理表',
            ]}
          />
          <div className="mt-3">
            <SemanticStatusBlock
              status={summary.title}
              hint={primaryHint}
              warning={Boolean(summary.blockers?.length)}
            />
          </div>
        </div>

        <div className="rounded-xl border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] p-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-[hsl(var(--workbench-muted-foreground))]">
            <Database className="h-3.5 w-3.5" />
            来源上下文
          </div>
          <div className="mt-2 text-sm font-medium text-[hsl(var(--workbench-ink))]">
            {selectedDataSource?.name || cubeDetail?.source_binding_summary?.source_name || '未绑定'}
          </div>
          <div className="text-xs text-[hsl(var(--workbench-muted-foreground))]">
            {selectedTable?.table || cubeDetail?.table || '未选择物理表'}
          </div>
        </div>

        <div className="rounded-xl border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] p-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-[hsl(var(--workbench-muted-foreground))]">
            <GitBranch className="h-3.5 w-3.5" />
            领域挂接
          </div>
          <div className="mt-2 text-sm font-medium text-[hsl(var(--workbench-ink))]">
            {activeDomain || cubeDetail?.domain_name || '暂未归入领域'}
          </div>
          <div className="text-xs text-[hsl(var(--workbench-muted-foreground))]">
            领域关系编辑请在领域画布完成。
          </div>
        </div>

        <div className="rounded-xl border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] p-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-[hsl(var(--workbench-muted-foreground))]">
            <Layers3 className="h-3.5 w-3.5" />
            结构规模
          </div>
          <div className="mt-2">
            <SemanticStructureSummary
              items={[
                { label: '维度', value: dimensionCount },
                { label: '指标', value: measureCount },
                { label: '来源', value: selectedTable?.table || cubeDetail?.table || '未选择' },
              ]}
            />
          </div>
        </div>

        <div className="rounded-xl border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] p-3">
          <div className="text-xs uppercase tracking-[0.14em] text-[hsl(var(--workbench-muted-foreground))]">
            当前阻塞
          </div>
          <div className="mt-2">
            <SemanticIssueList
              blockers={summary.blockers}
              hints={summary.hints}
              emptyText="当前没有阻塞项。"
            />
          </div>
        </div>

        {draftDiff ? (
          <div className="rounded-xl border border-[hsl(var(--semantic-warn))]/30 bg-[hsl(var(--semantic-warn))]/10 p-3 text-sm text-[hsl(var(--workbench-ink))]">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[hsl(var(--semantic-warn))]">重生成差异</div>
            <div className="mt-2 leading-6">
              维度 {draftDiff.dimensionDelta >= 0 ? '+' : ''}{draftDiff.dimensionDelta}，指标 {draftDiff.measureDelta >= 0 ? '+' : ''}{draftDiff.measureDelta}
              {draftDiff.tableChanged ? '，并且物理表已变更。' : '。'}
            </div>
          </div>
        ) : null}

        <div className="rounded-xl border border-dashed border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] p-3 text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">
          领域关系和查询验证在对应模块维护。
        </div>
      </div>
    </SemanticInspectorPanel>
  )
}
