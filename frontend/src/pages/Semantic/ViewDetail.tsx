import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Database, Eye, FileCode, GitBranch, Loader2 } from 'lucide-react'
import {
  describeView,
  getMaterializeStatus,
  materializeView,
  type MaterializeStatus,
  type MaterializeResult,
} from '@/api/semantic'
import { fmtDate } from '@/lib/format'
import { useToast } from '@/hooks/use-toast'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  SemanticActionBar,
  SemanticInspectorPanel,
  SemanticPageHeader,
  SemanticPageShell,
  SemanticStatusBanner,
  type SemanticValidationSummary,
} from '@/components/Semantic/workbench'
import { useUrlState } from '@/hooks/useUrlState'

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

interface ViewCubeRef {
  join_path: string
  includes: string[] | '*'
  excludes: string[]
  prefix: boolean
}

interface ViewData {
  name: string
  title: string
  description?: string
  public: boolean
  cubes: ViewCubeRef[]
  diagnostics?: Array<{ level: string; kind?: string; field?: string; message: string }>
  publish_summary?: {
    definition_hash?: string | null
    publish_status?: string | null
    last_published_at?: string | null
  }
  drift_summary?: {
    last_drift_status?: string | null
    last_drift_checked_at?: string | null
  }
}

type ViewDetailTab = 'mapping' | 'cubes' | 'sql' | 'diagnostics'

function buildSummary(view: ViewData, matStatus?: MaterializeStatus | null): SemanticValidationSummary {
  const blockers: string[] = []
  const hints: string[] = []
  const hasErrorDiagnostic = (view.diagnostics ?? []).some((item) => item.level === 'error')
  const driftStatus = (view.drift_summary?.last_drift_status || matStatus?.state_summary?.last_drift_status || '').toLowerCase()

  if (hasErrorDiagnostic) {
    blockers.push('当前 View 诊断存在 error，建议先检查 Join 路径、字段映射或编译结果。')
  }
  if (driftStatus === 'error') {
    blockers.push('最近一次漂移检测显示 error，发布前应先确认底层物理结构是否已变化。')
  }
  if (!matStatus?.materialized) {
    hints.push('当前 View 尚未发布为数据集，下游看板和查询依赖不会自动更新。')
  }
  if ((view.diagnostics ?? []).length === 0) {
    hints.push('诊断列表为空时，建议仍然查看一次字段映射，确认发布内容符合预期。')
  }

  return {
    status: blockers.length > 0
      ? 'blocked'
      : matStatus?.materialized
        ? 'ready'
        : 'dirty',
    title: blockers.length > 0 ? '当前 View 存在发布风险' : '当前 View 可继续运营操作',
    description: blockers.length > 0
      ? '先处理阻塞项，再执行发布或重新发布，避免错误定义进入数据集。'
      : '详情页首屏直接给出当前状态、下一步动作和发布摘要，不再让结构表格占据主导。 ',
    blockers,
    hints,
    stats: [
      { label: '发布状态', value: matStatus?.materialized ? '已发布' : '未发布' },
      { label: '引用 Cube', value: view.cubes.length },
      { label: '诊断项', value: view.diagnostics?.length ?? 0 },
      { label: '最近发布', value: fmtDate(matStatus?.published_at || view.publish_summary?.last_published_at) || '—' },
    ],
  }
}

export default function ViewDetail() {
  const { name } = useParams<{ name: string }>()
  const [tab, setTab] = useUrlState<ViewDetailTab>('tab', 'mapping')
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const { data: view, isLoading, error } = useQuery({
    queryKey: ['semantic', 'view', name],
    queryFn: async () => {
      const res = await describeView(name!)
      return res.data as ViewData
    },
    enabled: !!name,
  })

  const { data: matStatus } = useQuery({
    queryKey: ['semantic', 'view-mat-status', name],
    queryFn: async () => {
      const res = await getMaterializeStatus(name!)
      return res.data as MaterializeStatus
    },
    enabled: !!name,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  })

  const publishMutation = useMutation({
    mutationFn: async () => {
      const res = await materializeView(name!)
      return res.data as MaterializeResult
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['semantic', 'view-mat-status', name] }),
        queryClient.invalidateQueries({ queryKey: ['semantic', 'materialize-status'] }),
        queryClient.invalidateQueries({ queryKey: ['semantic', 'view', name] }),
      ])
      toast({
        title: matStatus?.materialized ? '重新发布成功' : '发布成功',
        description: '数据集状态已刷新，可在字段映射和发布摘要中查看最新结果。',
      })
    },
    onError: (err: unknown) => {
      const errorMessage = err instanceof Error ? err.message : '未知错误'
      toast({
        title: '发布失败',
        description: errorMessage,
        variant: 'destructive',
      })
    },
  })

  const summary = useMemo(
    () => (view ? buildSummary(view, matStatus) : null),
    [view, matStatus],
  )

  if (isLoading) return <DetailSkeleton />

  if (error || !view) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">未找到 View: {name}</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/semantic/cubes?kind=view">返回 Cube 模块</Link>
        </Button>
      </div>
    )
  }

  const isMaterialized = matStatus?.materialized === true
  const fieldMappings = matStatus?.field_mappings ?? []
  const relatedCubeNames = Array.from(
    new Set(
      view.cubes
        .map((cube) => cube.join_path.split('.', 1)[0]?.trim())
        .filter((cubeName): cubeName is string => Boolean(cubeName)),
    ),
  )
  const publishLabel = publishMutation.isPending
    ? '发布中…'
    : isMaterialized
      ? '重新发布'
      : '发布为数据集'

  const handlePublish = () => {
    const confirmed = window.confirm(
      isMaterialized
        ? '重新发布将覆盖当前数据集定义，确认继续？'
        : '将当前 View 发布为数据集，确认继续？',
    )
    if (!confirmed) return
    publishMutation.mutate()
  }

  return (
    <SemanticPageShell>
      <SemanticPageHeader
        backHref={`/semantic/cubes?kind=view&name=${encodeURIComponent(view.name)}`}
        backLabel="返回 Cube 模块"
        title={view.title}
        description="运营态详情优先回答当前状态、发布风险和下一步动作；字段映射、SQL 与诊断保留为二级结构信息。"
        status={summary?.status}
        meta={
          <>
            <Badge variant="outline">{view.public ? '公开 View' : '私有 View'}</Badge>
            <Badge variant="secondary">{isMaterialized ? '已发布' : '未发布'}</Badge>
            {matStatus?.publish_status && <Badge variant="outline">{matStatus.publish_status}</Badge>}
          </>
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/semantic/workbench?tab=compiler">
                <AlertTriangle className="mr-1.5 h-4 w-4" />
                查看诊断
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to={`/semantic/workbench?tab=editor&kind=view&resource=${encodeURIComponent(view.name)}&file=${encodeURIComponent(view.name)}`}>
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
                <Link to="/semantic/workbench?tab=sync">查看发布状态</Link>
              </Button>
              <Button variant="outline" onClick={() => setTab('mapping')}>
                查看字段映射
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
                <div className="text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--workbench-muted-foreground))]">View 标识</div>
                <div className="mt-2 font-mono text-sm text-[hsl(var(--workbench-ink))]">{view.name}</div>
                <div className="mt-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">{view.cubes.length} 条引用路径</div>
              </div>
              <div className="rounded-2xl border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] p-4">
                <div className="text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--workbench-muted-foreground))]">数据集状态</div>
                <div className="mt-2 text-sm font-semibold text-[hsl(var(--workbench-ink))]">{isMaterialized ? '已发布' : '未发布'}</div>
                <div className="mt-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">{matStatus?.dataset_code || '尚未生成数据集编码'}</div>
              </div>
              <div className="rounded-2xl border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] p-4">
                <div className="text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--workbench-muted-foreground))]">最近发布</div>
                <div className="mt-2 text-sm font-semibold text-[hsl(var(--workbench-ink))]">{fmtDate(matStatus?.published_at || view.publish_summary?.last_published_at) || '尚未发布'}</div>
                <div className="mt-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">{matStatus?.publish_status || view.publish_summary?.publish_status || '未进入发布链路'}</div>
              </div>
              <div className="rounded-2xl border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] p-4">
                <div className="text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--workbench-muted-foreground))]">发布规模</div>
                <div className="mt-2 text-sm font-semibold text-[hsl(var(--workbench-ink))]">
                  {matStatus?.definition_summary?.field_count ?? fieldMappings.length} 字段
                </div>
                <div className="mt-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">
                  {matStatus?.definition_summary?.dimension_count ?? 0} 维度 · {matStatus?.definition_summary?.measure_count ?? 0} 指标
                </div>
              </div>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div
                className="rounded-2xl border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] p-4"
                data-testid="view-related-cubes"
              >
                <div className="text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--workbench-muted-foreground))]">相关 Cube</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {relatedCubeNames.map((cubeName) => (
                    <Button key={cubeName} asChild variant="outline" size="sm" className="h-8 rounded-full px-3">
                      <Link to={`/semantic/cubes/${cubeName}`}>
                        {cubeName}
                      </Link>
                    </Button>
                  ))}
                </div>
              </div>
              <div
                className="rounded-2xl border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] p-4"
                data-testid="view-publish-status"
              >
                <div className="text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--workbench-muted-foreground))]">发布状态</div>
                <div className="mt-2 text-sm font-semibold text-[hsl(var(--workbench-ink))]">
                  {matStatus?.publish_status || view.publish_summary?.publish_status || 'unpublished'}
                </div>
                <div className="mt-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">
                  漂移状态：{view.drift_summary?.last_drift_status || matStatus?.state_summary?.last_drift_status || 'unknown'}
                </div>
              </div>
            </div>
          </section>

          <SemanticActionBar
            title="下一步动作"
            description="从这里直接处理发布、字段映射、诊断和 YAML，不再需要先在卡片页猜入口。"
            status={summary?.status || 'ready'}
            primaryAction={{
              label: publishLabel,
              onClick: handlePublish,
              disabled: publishMutation.isPending,
              icon: publishMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Database className="mr-1.5 h-4 w-4" />,
              testId: 'semantic-primary-action',
            }}
            secondaryActions={
              <>
                <Button variant="outline" onClick={() => setTab('mapping')}>
                  <GitBranch className="mr-1.5 h-4 w-4" />
                  查看字段映射
                </Button>
                <Button variant="outline" onClick={() => setTab('diagnostics')}>
                  <AlertTriangle className="mr-1.5 h-4 w-4" />
                  查看诊断
                </Button>
              </>
            }
          />

          <section className="rounded-[var(--workbench-radius)] border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] p-5 shadow-sm">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="mapping">字段映射</TabsTrigger>
                <TabsTrigger value="cubes">引用路径</TabsTrigger>
                <TabsTrigger value="sql">编译 SQL</TabsTrigger>
                <TabsTrigger value="diagnostics">诊断</TabsTrigger>
              </TabsList>

              <TabsContent value="mapping" className="mt-4">
                {fieldMappings.length > 0 ? (
                  <DataTable
                    columns={['发布字段', '来源字段', '来源 Cube', '类型']}
                    rows={fieldMappings.map((item) => [
                      <span key={`${item.physical_name}-field`} className="font-mono text-xs">{item.physical_name}</span>,
                      <span key={`${item.physical_name}-source`} className="font-mono text-xs">{item.source_ref}</span>,
                      item.source_cube,
                      item.business_type,
                    ])}
                  />
                ) : (
                  <div className="rounded-2xl border border-dashed border-[hsl(var(--workbench-outline))] px-6 py-12 text-center text-sm text-[hsl(var(--workbench-muted-foreground))]">
                    当前还没有可展示的字段映射。请先发布 View，或在发布后刷新状态。
                  </div>
                )}
              </TabsContent>

              <TabsContent value="cubes" className="mt-4">
                <DataTable
                  columns={['Join 路径', '包含字段', '排除字段', '命名前缀']}
                  rows={view.cubes.map((cube) => [
                    <span key={`${cube.join_path}-path`} className="font-mono text-xs">{cube.join_path}</span>,
                    <span key={`${cube.join_path}-includes`} className="text-xs">{cube.includes === '*' ? '全部字段' : cube.includes.join(', ') || '—'}</span>,
                    <span key={`${cube.join_path}-excludes`} className="text-xs">{cube.excludes.join(', ') || '—'}</span>,
                    cube.prefix ? '启用' : '关闭',
                  ])}
                />
              </TabsContent>

              <TabsContent value="sql" className="mt-4">
                <div className="rounded-[var(--workbench-radius-sm)] border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] p-4">
                  <div className="mb-2 text-sm font-medium text-[hsl(var(--workbench-ink))]">最近编译 SQL</div>
                  <pre className="max-h-[26rem] overflow-auto whitespace-pre-wrap break-all rounded-2xl bg-[hsl(var(--workbench-surface))] p-4 font-mono text-xs leading-6 text-[hsl(var(--workbench-ink))]">
                    {matStatus?.sql_query || '当前暂无编译 SQL。请先发布或重新发布 View 后查看。'}
                  </pre>
                </div>
              </TabsContent>

              <TabsContent value="diagnostics" className="mt-4">
                {(view.diagnostics ?? []).length > 0 ? (
                  <div className="space-y-3">
                    {(view.diagnostics ?? []).map((item, index) => {
                      const isError = item.level === 'error'
                      return (
                        <div
                          key={`${item.kind || 'diag'}-${item.field || index}`}
                          className="rounded-2xl border px-4 py-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={isError ? 'destructive' : 'outline'}>{item.level}</Badge>
                            {item.kind && <span className="text-xs text-[hsl(var(--workbench-muted-foreground))]">{item.kind}</span>}
                            {item.field && <span className="font-mono text-xs text-[hsl(var(--workbench-muted-foreground))]">{item.field}</span>}
                          </div>
                          <p className="mt-2 text-sm leading-6 text-[hsl(var(--workbench-ink))]">{item.message}</p>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-[hsl(var(--workbench-outline))] px-6 py-12 text-center text-sm text-[hsl(var(--workbench-muted-foreground))]">
                    当前没有诊断项，可继续检查字段映射或发布状态。
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </section>
        </section>

        <SemanticInspectorPanel
          title="运营摘要"
          description="固定展示数据集状态、定义哈希和风险摘要，让 View 详情页保持面向运营动作而不是纯结构浏览。"
          testId="domain-inspector-panel"
        >
          <div className="space-y-4 text-sm">
            <div className="rounded-2xl border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] p-3">
              <div className="flex items-center gap-2 font-medium text-[hsl(var(--workbench-ink))]">
                <Eye className="h-4 w-4 text-[hsl(var(--workbench-muted-foreground))]" />
                数据集摘要
              </div>
              <dl className="mt-3 space-y-2 text-xs">
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-[hsl(var(--workbench-muted-foreground))]">数据集 ID</dt>
                  <dd className="font-mono text-[hsl(var(--workbench-ink))]">{matStatus?.dataset_id || '—'}</dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-[hsl(var(--workbench-muted-foreground))]">数据集编码</dt>
                  <dd className="font-mono text-[hsl(var(--workbench-ink))]">{matStatus?.dataset_code || '—'}</dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-[hsl(var(--workbench-muted-foreground))]">定义哈希</dt>
                  <dd className="max-w-[12rem] break-all font-mono text-[hsl(var(--workbench-ink))]">{matStatus?.definition_hash || view.publish_summary?.definition_hash || '—'}</dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-[hsl(var(--workbench-muted-foreground))]">漂移状态</dt>
                  <dd className="text-[hsl(var(--workbench-ink))]">{view.drift_summary?.last_drift_status || matStatus?.state_summary?.last_drift_status || '尚未检测'}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-2xl border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] p-3">
              <div className="text-sm font-medium text-[hsl(var(--workbench-ink))]">建议动作</div>
              <ul className="mt-3 space-y-2 text-xs leading-5 text-[hsl(var(--workbench-muted-foreground))]">
                <li>发布前先确认字段映射与数据集编码是否符合下游约定。</li>
                <li>若漂移状态异常，优先去开发工具查看同步报告，再决定是否重新发布。</li>
                <li>如需调整 View 定义，直接跳转 YAML 编辑器，不必回到列表页寻找入口。</li>
              </ul>
            </div>
          </div>
        </SemanticInspectorPanel>
      </div>
    </SemanticPageShell>
  )
}
