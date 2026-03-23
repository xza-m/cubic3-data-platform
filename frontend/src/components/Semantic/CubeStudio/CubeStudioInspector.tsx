import { Database, GitBranch, Layers3 } from 'lucide-react'
import type { CubeDetail, CubeDraftPayload, DomainSummary } from '@/api/semantic'
import { SemanticInspectorPanel } from '@/components/Semantic/workbench'
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
}

export function CubeStudioInspector({
  selectedDataSource,
  selectedTable,
  selectedDomain,
  draft,
  cubeDetail,
  domains,
  draftDiff,
}: CubeStudioInspectorProps) {
  const activeDomain = domains.find((item) => String(item.id || item.code) === selectedDomain)?.name

  return (
    <SemanticInspectorPanel
      title="建模摘要"
      description="右侧用于观察当前上下文、结构规模、领域挂接和差异变化，不承担主编辑任务。"
      testId="domain-inspector-cube-studio"
    >
      <div className="grid gap-3">
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
          <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-[11px] text-[hsl(var(--workbench-muted-foreground))]">维度</div>
              <div className="font-semibold text-[hsl(var(--workbench-ink))]">
                {draft ? Object.keys(draft.dimensions || {}).length : cubeDetail ? Object.keys(cubeDetail.dimensions).length : 0}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[hsl(var(--workbench-muted-foreground))]">指标</div>
              <div className="font-semibold text-[hsl(var(--workbench-ink))]">
                {draft ? Object.keys(draft.measures || {}).length : cubeDetail ? Object.keys(cubeDetail.measures).length : 0}
              </div>
            </div>
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
          当前页只负责完成“基础信息、来源确认、结构校对、规则确认、校验与保存”这条链路，关系设计和查询验证都不在这里进行。
        </div>
      </div>
    </SemanticInspectorPanel>
  )
}
