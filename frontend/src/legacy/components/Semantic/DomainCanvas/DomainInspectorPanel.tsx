import { Save, Trash2 } from 'lucide-react'
import type { CubeSummary, DomainCanvasData } from '@/api/semantic'
import type { JoinAggregationStrategy, JoinCardinality, JoinType } from '@/components/Semantic/joinEdgeTypes'
import { SemanticIssueList } from '@/components/Semantic/SemanticIssueList'
import { SyncStatusBadge, type SyncStatus } from '@/components/Semantic/SyncStatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { SemanticValidationSummary } from '@/components/Semantic/workbench'
import { getSemanticStatusLabel } from '@/lib/semantic-status'

type JoinFormState = {
  source_cube: string
  target_cube: string
  source_field: string
  target_field: string
  join_type: JoinType
  cardinality: JoinCardinality
  aggregation_strategy: JoinAggregationStrategy
  description: string
}

export function DomainInspectorPanel({
  domain,
  summary,
  selectedCube,
  selectedEdgeId,
  joinForm,
  cubeIndex,
  nodesCount,
  edgesCount,
  onJoinFormChange,
  onJoinSave,
  onDeleteEdge,
}: {
  domain?: DomainCanvasData['domain']
  summary: SemanticValidationSummary
  selectedCube: CubeSummary | null
  selectedEdgeId: string | null
  joinForm: JoinFormState | null
  cubeIndex: Map<string, CubeSummary>
  nodesCount: number
  edgesCount: number
  onJoinFormChange: (next: JoinFormState) => void
  onJoinSave: () => void
  onDeleteEdge: () => void
}) {
  const joinStatus = !joinForm
    ? 'normal'
    : !joinForm.source_field || !joinForm.target_field
      ? 'missing'
      : joinForm.cardinality === '1:N' && joinForm.aggregation_strategy === 'none'
        ? 'conflict'
        : 'normal'
  const joinStatusLabel = joinStatus === 'missing' ? '缺失' : joinStatus === 'conflict' ? '冲突' : '正常'

  return (
    <aside className="space-y-4 bg-[rgba(249,251,254,0.84)] p-4" data-testid="domain-inspector-panel">
      <div className="space-y-1">
        <div className="text-sm font-semibold text-[hsl(var(--workbench-ink))]" style={{ fontFamily: 'var(--font-workbench-display)' }}>
          {selectedEdgeId ? 'Join 设置' : selectedCube ? 'Cube 摘要' : '领域摘要'}
        </div>
        <p className="text-xs leading-5 text-[hsl(var(--workbench-muted-foreground))]">
          {selectedEdgeId
            ? '维护字段映射、Join 类型、基数和聚合策略。'
            : selectedCube
              ? '显示当前节点的模型摘要、来源和同步状态。'
              : '显示领域规模、阻塞项和发布前摘要。'}
        </p>
      </div>

      {selectedEdgeId && joinForm ? (
        <div data-testid="domain-inspector-join" className="space-y-4">
          <div className="rounded-xl border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] p-3">
            <div className="text-xs text-[hsl(var(--workbench-muted-foreground))]">当前 Join 状态</div>
            <div className="mt-2 flex items-center gap-2">
              <Badge
                variant="outline"
                className={
                  joinStatus === 'missing'
                    ? 'border-[hsl(var(--semantic-warn))]/20 bg-[hsl(var(--semantic-warn))]/10 text-[hsl(var(--semantic-warn))]'
                    : joinStatus === 'conflict'
                      ? 'border-[hsl(var(--semantic-error))]/20 bg-[hsl(var(--semantic-error))]/10 text-[hsl(var(--semantic-error))]'
                      : 'border-[hsl(var(--semantic-ok))]/20 bg-[hsl(var(--semantic-ok))]/10 text-[hsl(var(--semantic-ok))]'
                }
              >
                {joinStatusLabel}
              </Badge>
              <span className="text-xs text-[hsl(var(--workbench-muted-foreground))]">
                {joinStatus === 'missing'
                  ? '补齐源字段和目标字段后即可保存。'
                  : joinStatus === 'conflict'
                    ? '当前基数需要搭配聚合策略。'
                    : '当前 Join 已具备可发布的基础配置。'}
              </span>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="mb-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">源 Cube</div>
              <Input value={joinForm.source_cube} disabled className="border-[hsl(var(--workbench-outline))] bg-white" />
            </div>
            <div>
              <div className="mb-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">目标 Cube</div>
              <Input value={joinForm.target_cube} disabled className="border-[hsl(var(--workbench-outline))] bg-white" />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="mb-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">源字段</div>
              <Select value={joinForm.source_field} onValueChange={(value) => onJoinFormChange({ ...joinForm, source_field: value })}>
                <SelectTrigger data-testid="domain-inspector-source-field">
                  <SelectValue placeholder="选择字段" />
                </SelectTrigger>
                <SelectContent>
                  {(cubeIndex.get(joinForm.source_cube)?.dimensions || []).map((field) => (
                    <SelectItem key={field} value={field}>
                      {field}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="mb-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">目标字段</div>
              <Select value={joinForm.target_field} onValueChange={(value) => onJoinFormChange({ ...joinForm, target_field: value })}>
                <SelectTrigger data-testid="domain-inspector-target-field">
                  <SelectValue placeholder="选择字段" />
                </SelectTrigger>
                <SelectContent>
                  {(cubeIndex.get(joinForm.target_cube)?.dimensions || []).map((field) => (
                    <SelectItem key={field} value={field}>
                      {field}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <div className="mb-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">Join Type</div>
              <Select value={joinForm.join_type} onValueChange={(value) => onJoinFormChange({ ...joinForm, join_type: value as JoinType })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">left</SelectItem>
                  <SelectItem value="inner">inner</SelectItem>
                  <SelectItem value="right">right</SelectItem>
                  <SelectItem value="full">full</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="mb-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">Cardinality</div>
              <Select
                value={joinForm.cardinality}
                onValueChange={(value) => onJoinFormChange({
                  ...joinForm,
                  cardinality: value as JoinCardinality,
                  aggregation_strategy: value === '1:N' ? joinForm.aggregation_strategy : 'none',
                })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1:1">1:1</SelectItem>
                  <SelectItem value="N:1">N:1</SelectItem>
                  <SelectItem value="1:N">1:N</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="mb-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">聚合策略</div>
              <Select value={joinForm.aggregation_strategy} onValueChange={(value) => onJoinFormChange({ ...joinForm, aggregation_strategy: value as JoinAggregationStrategy })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">none</SelectItem>
                  <SelectItem value="aggregate_before_join">aggregate_before_join</SelectItem>
                  <SelectItem value="latest_snapshot">latest_snapshot</SelectItem>
                  <SelectItem value="distinct_on_target">distinct_on_target</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">说明</div>
            <Textarea rows={3} value={joinForm.description} onChange={(event) => onJoinFormChange({ ...joinForm, description: event.target.value })} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={onJoinSave} data-testid="domain-inspector-save" className="rounded-full px-4">
              <Save className="mr-1.5 h-4 w-4" />
              保存当前 Join
            </Button>
            <Button variant="outline" onClick={onDeleteEdge} className="rounded-full border-[hsl(var(--workbench-outline))] bg-white/88 px-4">
              <Trash2 className="mr-1.5 h-4 w-4" />
              删除 Join
            </Button>
          </div>
        </div>
      ) : selectedCube ? (
        <div data-testid="domain-inspector-cube" className="space-y-3">
          <div className="rounded-xl border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] p-4">
            <div className="flex items-center gap-2">
              <div className="font-semibold text-[hsl(var(--workbench-ink))]">{selectedCube.title}</div>
              <Badge variant="outline">{getSemanticStatusLabel(selectedCube.status || 'draft')}</Badge>
            </div>
            <div className="mt-1 font-mono text-xs text-[hsl(var(--workbench-muted-foreground))]">{selectedCube.name}</div>
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm text-[hsl(var(--workbench-muted-foreground))]" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <span>{selectedCube.dimension_count} 维度</span>
              <span>{selectedCube.measure_count} 指标</span>
              <span>{selectedCube.join_count ?? 0} 条 Join</span>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] p-3">
              <div className="text-xs text-[hsl(var(--workbench-muted-foreground))]">数据源</div>
              <div className="mt-2 text-sm font-medium text-[hsl(var(--workbench-ink))]">
                {selectedCube.state_summary?.source_binding_summary?.source_name || '未绑定'}
              </div>
            </div>
            <div className="rounded-xl border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] p-3">
              <div className="text-xs text-[hsl(var(--workbench-muted-foreground))]">同步状态</div>
              <div className="mt-2">
                <SyncStatusBadge status={selectedCube.state_summary?.sync_status as SyncStatus} />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] p-4">
            <div className="flex items-center gap-2">
              <div className="font-semibold text-[hsl(var(--workbench-ink))]">{domain?.name}</div>
              <Badge variant={domain?.status === 'active' ? 'default' : 'secondary'}>
                {getSemanticStatusLabel(domain?.status)}
              </Badge>
            </div>
            <div className="mt-1 font-mono text-xs text-[hsl(var(--workbench-muted-foreground))]">{domain?.code}</div>
            <p className="mt-3 text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">
              {domain?.description || '当前领域尚未补充说明。'}
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] p-3">
              <div className="text-xs text-[hsl(var(--workbench-muted-foreground))]">当前规模</div>
              <div className="mt-2 text-lg font-semibold text-[hsl(var(--workbench-ink))]">{nodesCount}</div>
              <div className="text-xs text-[hsl(var(--workbench-muted-foreground))]">已入域 Cube</div>
            </div>
            <div className="rounded-xl border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] p-3">
              <div className="text-xs text-[hsl(var(--workbench-muted-foreground))]">关系数</div>
              <div className="mt-2 text-lg font-semibold text-[hsl(var(--workbench-ink))]">{edgesCount}</div>
              <div className="text-xs text-[hsl(var(--workbench-muted-foreground))]">领域 Join</div>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] px-4 py-4">
            <div className="text-sm font-semibold text-[hsl(var(--workbench-ink))]">发布前检查</div>
            <div className="text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">{summary.description}</div>
            <SemanticIssueList blockers={summary.blockers} hints={summary.hints} emptyText="当前没有额外风险。" />
          </div>
        </>
      )}
    </aside>
  )
}
