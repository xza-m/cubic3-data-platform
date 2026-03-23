import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, Database, FileCode, GitBranch, Layers3 } from 'lucide-react'
import { describeCube, type CubeDetail as CubeDetailType } from '@/api/semantic'
import { useUrlState } from '@/hooks/useUrlState'
import { fmtDate } from '@/lib/format'
import { getSemanticStatusLabel } from '@/lib/semantic-status'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SyncStatusBadge } from '@/components/Semantic/SyncStatusBadge'
import {
  SemanticActionBar,
  SemanticInspectorPanel,
  SemanticPageHeader,
  SemanticPageShell,
  SemanticStatusBanner,
  type SemanticValidationSummary,
} from '@/components/Semantic/workbench'

function DetailSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-28 rounded-3xl" />
      <Skeleton className="h-40 rounded-3xl" />
      <Skeleton className="h-[28rem] rounded-3xl" />
    </div>
  )
}

function DataTable({ columns, rows }: { columns: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-hidden rounded-[var(--workbench-radius)] border border-[hsl(var(--workbench-outline))]">
      <table className="w-full text-sm">
        <thead className="bg-[hsl(var(--workbench-panel))]">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-4 py-2.5 text-left font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-t border-[hsl(var(--workbench-outline))]">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-4 py-2.5 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function buildSummary(cube: CubeDetailType): SemanticValidationSummary {
  const blockers: string[] = []
  const hints: string[] = []

  if ((cube.state_summary?.last_drift_status || '').toLowerCase() === 'error') {
    blockers.push('最近一次漂移检测存在 error，请先检查物理表结构和 Join 引用。')
  }
  if (!cube.domain_id) {
    hints.push('当前模型尚未挂接领域，如要参与领域级查询，需要进入领域画布完成边界编排。')
  }
  if (cube.status !== 'active') {
    hints.push(`当前模型为 ${getSemanticStatusLabel(cube.status || 'draft')}，未必能进入默认查询链路。`)
  }

  return {
    status: blockers.length > 0 ? 'blocked' : cube.status === 'active' ? 'ready' : 'dirty',
    title: blockers.length > 0 ? '当前模型存在运行风险' : '当前模型状态稳定',
    description: blockers.length > 0
      ? '先处理漂移或同步问题，再继续使用该模型参与查询和领域发布。'
      : '从这里可以快速回到编辑、领域编排和 YAML/漂移工具，而不用在多个页面间来回猜路径。',
    blockers,
    hints,
    stats: [
      { label: '当前状态', value: getSemanticStatusLabel(cube.status || 'draft') },
      { label: '维度数', value: Object.keys(cube.dimensions).length },
      { label: '指标数', value: Object.keys(cube.measures).length },
      { label: 'Join 数', value: Object.keys(cube.joins).length },
    ],
  }
}

export default function CubeDetail() {
  const { name } = useParams<{ name: string }>()
  const [tab, setTab] = useUrlState('tab', 'dimensions')

  const { data: cube, isLoading, error } = useQuery({
    queryKey: ['semantic', 'cube', name],
    queryFn: async () => {
      const res = await describeCube(name!)
      return res.data as CubeDetailType
    },
    enabled: !!name,
  })

  const summary = useMemo(() => (cube ? buildSummary(cube) : null), [cube])

  if (isLoading) return <DetailSkeleton />

  if (error || !cube || ('error' in cube)) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">未找到 Cube: {name}</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/semantic/cubes">返回 Cube 管理</Link>
        </Button>
      </div>
    )
  }

  const dimCount = Object.keys(cube.dimensions).length
  const measureCount = Object.keys(cube.measures).length
  const segCount = Object.keys(cube.segments).length
  const joinCount = Object.keys(cube.joins).length

  return (
    <SemanticPageShell>
      <SemanticPageHeader
        backHref={`/semantic/cubes?kind=cube&name=${encodeURIComponent(cube.name)}`}
        backLabel="返回 Cube 管理"
        title={cube.title}
        description="详情页优先展示当前状态、运行风险和下一步动作；结构数据仍然保留，但不再占据首屏主导位置。"
        status={summary?.status}
        meta={
          <>
            {cube.status && <Badge variant="outline">{getSemanticStatusLabel(cube.status)}</Badge>}
            {cube.domain_name && <Badge variant="secondary">所属领域：{cube.domain_name}</Badge>}
            <SyncStatusBadge status={cube.state_summary?.sync_status as any} />
          </>
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to={`/semantic/cubes/${cube.name}/edit`}>继续编辑</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to={`/semantic/tools?tab=editor&kind=cube&resource=${encodeURIComponent(cube.name)}&file=${encodeURIComponent(cube.name)}`}>
                <FileCode className="mr-1.5 h-4 w-4" />
                查看 YAML
              </Link>
            </Button>
          </>
        }
      />

      {summary && (
        <SemanticStatusBanner
          summary={summary}
          secondaryActions={
            <>
              <Button variant="outline" asChild>
                <Link to={`/semantic/cubes/${cube.name}/edit`}>回到建模器</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/semantic/tools?tab=sync">查看同步 / 漂移</Link>
              </Button>
            </>
          }
        />
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-5">
          <section className="rounded-[var(--workbench-radius)] border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] p-5 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] p-4">
                <div className="text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--workbench-muted-foreground))]">模型标识</div>
                <div className="mt-2 font-mono text-sm text-[hsl(var(--workbench-ink))]">{cube.name}</div>
                <div className="mt-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">{cube.table}</div>
              </div>
              <div className="rounded-2xl border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] p-4">
                <div className="text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--workbench-muted-foreground))]">最近校验</div>
                <div className="mt-2 text-sm font-semibold text-[hsl(var(--workbench-ink))]">{fmtDate(cube.state_summary?.last_drift_checked_at)}</div>
                <div className="mt-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">{cube.state_summary?.last_drift_status || '尚未检测'}</div>
              </div>
              <div className="rounded-2xl border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] p-4">
                <div className="text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--workbench-muted-foreground))]">数据源绑定</div>
                <div className="mt-2 text-sm font-semibold text-[hsl(var(--workbench-ink))]">
                  {cube.source_binding_summary?.source_name || cube.source_binding_summary?.source_type || '未绑定'}
                </div>
                <div className="mt-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">
                  {cube.source_binding_summary?.database || '—'}
                  {cube.source_binding_summary?.schema ? ` / ${cube.source_binding_summary.schema}` : ''}
                </div>
              </div>
              <div className="rounded-2xl border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] p-4">
                <div className="text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--workbench-muted-foreground))]">结构规模</div>
                <div className="mt-2 text-sm font-semibold text-[hsl(var(--workbench-ink))]">{dimCount} 维度 · {measureCount} 指标</div>
                <div className="mt-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">{segCount} 分段 · {joinCount} Join</div>
              </div>
            </div>
          </section>

          <SemanticActionBar
            title="下一步动作"
            description="详情页优先回答当前能做什么：继续编辑、进入领域编排、查看同步漂移、查看 YAML。"
            status={summary?.status || 'ready'}
            primaryAction={{
              label: '继续编辑建模',
              href: `/semantic/cubes/${cube.name}/edit`,
              testId: 'semantic-primary-action',
            }}
            secondaryActions={
              <>
                <Button variant="outline" asChild>
                  <Link to={cube.domain_id ? `/semantic/domains/${cube.domain_id}` : '/semantic/domains'}>
                    <GitBranch className="mr-1.5 h-4 w-4" />
                    进入关联领域
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/semantic/tools?tab=sync">
                    <AlertTriangle className="mr-1.5 h-4 w-4" />
                    查看漂移状态
                  </Link>
                </Button>
              </>
            }
          />

          <section className="rounded-[var(--workbench-radius)] border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] p-5 shadow-sm">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="dimensions">维度 ({dimCount})</TabsTrigger>
                <TabsTrigger value="measures">指标 ({measureCount})</TabsTrigger>
                <TabsTrigger value="segments">分段 ({segCount})</TabsTrigger>
                <TabsTrigger value="joins">关联 ({joinCount})</TabsTrigger>
              </TabsList>
              <TabsContent value="dimensions" className="mt-4">
                <DataTable
                  columns={['字段', '标题', '类型', '键 / 枚举']}
                  rows={Object.entries(cube.dimensions).map(([key, dim]) => [
                    <span key={`${key}-field`} className="font-mono text-xs">{key}</span>,
                    dim.title,
                    dim.type,
                    <span key={`${key}-tag`} className="text-xs text-[hsl(var(--workbench-muted-foreground))]">
                      {dim.primary_key ? 'PK' : ''}
                      {dim.enum && Object.keys(dim.enum).length > 0 ? ` ${Object.keys(dim.enum).length} 个枚举值` : ''}
                    </span>,
                  ])}
                />
              </TabsContent>
              <TabsContent value="measures" className="mt-4">
                <DataTable
                  columns={['字段', '标题', '聚合类型', '说明']}
                  rows={Object.entries(cube.measures).map(([key, measure]) => [
                    <span key={`${key}-field`} className="font-mono text-xs">{key}</span>,
                    measure.title,
                    measure.type,
                    <span key={`${key}-desc`} className="text-xs text-[hsl(var(--workbench-muted-foreground))]">{measure.description || '—'}</span>,
                  ])}
                />
              </TabsContent>
              <TabsContent value="segments" className="mt-4">
                <DataTable
                  columns={['名称', '标题']}
                  rows={Object.entries(cube.segments).map(([key, segment]) => [
                    <span key={`${key}-field`} className="font-mono text-xs">{key}</span>,
                    segment.title,
                  ])}
                />
              </TabsContent>
              <TabsContent value="joins" className="mt-4">
                <DataTable
                  columns={['别名', '目标 Cube', 'Join 类型']}
                  rows={Object.entries(cube.joins).map(([key, join]) => [
                    <span key={`${key}-field`} className="font-mono text-xs">{key}</span>,
                    <Link key={`${key}-link`} to={`/semantic/cubes/${join.target_cube}`} className="font-mono text-xs text-primary hover:underline">
                      {join.target_cube}
                    </Link>,
                    join.type,
                  ])}
                />
              </TabsContent>
            </Tabs>
          </section>
        </section>

        <SemanticInspectorPanel
          title="运行态摘要"
          description="这里放当前模型最关键的运行态和治理信息，避免用户一上来就被结构表格淹没。"
        >
          <div className="space-y-3">
            {cube.state_summary?.definition_hash && (
              <div className="rounded-xl border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] p-3">
                <div className="text-xs uppercase tracking-[0.14em] text-[hsl(var(--workbench-muted-foreground))]">定义哈希</div>
                <div className="mt-2 break-all font-mono text-xs text-[hsl(var(--workbench-ink))]">{cube.state_summary.definition_hash}</div>
              </div>
            )}
            {cube.partition && (
              <div className="rounded-xl border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] p-3">
                <div className="text-xs uppercase tracking-[0.14em] text-[hsl(var(--workbench-muted-foreground))]">分区信息</div>
                <div className="mt-2 font-mono text-sm text-[hsl(var(--workbench-ink))]">{cube.partition.field}</div>
                <div className="mt-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">{cube.partition.format}</div>
              </div>
            )}
            {cube.default_filters && cube.default_filters.length > 0 && (
              <div className="rounded-xl border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] p-3">
                <div className="text-xs uppercase tracking-[0.14em] text-[hsl(var(--workbench-muted-foreground))]">默认过滤</div>
                <div className="mt-2 space-y-2">
                  {cube.default_filters.map((filter, index) => (
                    <div key={`${filter.sql}-${index}`} className="rounded-lg border border-dashed border-[hsl(var(--workbench-outline))] p-2 text-xs text-[hsl(var(--workbench-muted-foreground))]">
                      {filter.description || filter.sql}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="rounded-xl border border-dashed border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] p-3 text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">
              如果当前模型已经挂接领域，后续的跨 Cube 关系和发布边界都应回到领域画布统一维护，而不是在这里单点修补。
            </div>
          </div>
        </SemanticInspectorPanel>
      </div>
    </SemanticPageShell>
  )
}
