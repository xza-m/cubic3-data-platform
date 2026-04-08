import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Database, Sparkles, Wand2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { createCube, createCubeDraftFromTable, type CubeDraftPayload, type CubeSummary } from '@/api/semantic'
import { getDataSources } from '@/api/datasources'
import { SchemaBrowser, useToast } from '@/components/business'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { TreeNode } from '@/components/business/SchemaBrowser/types'
import { buildSemanticWorkbenchHref } from '@/hooks/semantic-ia'
import {
  buildCreateCubeDraftRequest,
  buildCubeSummaryFromDraft,
  notifyCreateCubeFailure,
  type SelectedTable,
} from '@/lib/semantic-cube-draft'
import { getSemanticStatusLabel } from '@/lib/semantic-status'
import type { DataSource } from '@/types'

function upsertCubeDraftInCache(
  current:
    | {
      cubes?: CubeSummary[]
      total?: number
    }
    | undefined,
  payload: CubeDraftPayload,
) {
  const nextCube = buildCubeSummaryFromDraft(payload)
  const cubes = current?.cubes ?? []
  const withoutCurrent = cubes.filter((cube) => cube.name !== nextCube.name)
  return {
    ...(current || {}),
    cubes: [nextCube, ...withoutCurrent],
    total: typeof current?.total === 'number' ? Math.max(current.total, withoutCurrent.length + 1) : withoutCurrent.length + 1,
  }
}

export function WorkbenchCubeDraftStarter() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [selectedSource, setSelectedSource] = useState('')
  const [selectedTable, setSelectedTable] = useState<SelectedTable | null>(null)
  const [draft, setDraft] = useState<CubeDraftPayload | null>(null)

  const { data: datasourceResp } = useQuery({
    queryKey: ['datasources', 'semantic-workbench-starter'],
    queryFn: async () => (await getDataSources({ is_active: true, page_size: 200 })).data,
  })

  const datasources = datasourceResp?.items ?? []

  useEffect(() => {
    if (!selectedSource && datasources.length > 0) {
      setSelectedSource(String(datasources[0].id))
    }
  }, [datasources, selectedSource])

  useEffect(() => {
    setSelectedTable(null)
    setDraft(null)
  }, [selectedSource])

  const selectedDataSource = useMemo(
    () => datasources.find((item) => String(item.id) === selectedSource),
    [datasources, selectedSource],
  )

  const createDraftMutation = useMutation({
    mutationFn: async () => (
      await createCubeDraftFromTable(buildCreateCubeDraftRequest(selectedSource, selectedTable))
    ).data,
    onSuccess: (payload) => {
      setDraft(payload)
      toast({ title: 'Cube 草稿已生成' })
    },
    onError: (error) => {
      toast({ title: '生成草稿失败', description: (error as Error).message, variant: 'destructive' })
    },
  })

  const createCubeMutation = useMutation({
    mutationFn: async (payload: CubeDraftPayload) => (await createCube(payload)).data,
    onSuccess: async (payload) => {
      queryClient.setQueryData(['semantic', 'cubes'], (current: { cubes?: CubeSummary[]; total?: number } | undefined) =>
        upsertCubeDraftInCache(current, payload))
      await queryClient.invalidateQueries({ queryKey: ['semantic'] })
      toast({ title: 'Cube 创建成功' })
      setDraft(null)
      navigate(buildSemanticWorkbenchHref(payload.name, 'modeling'))
    },
    onError: (error) => {
      notifyCreateCubeFailure({ toast, error })
    },
  })

  const handleSchemaSelect = (node: TreeNode) => {
    if (node.type !== 'table' && node.type !== 'view') {
      return
    }

    setDraft(null)
    setSelectedTable({
      database: node.metadata?.database || '',
      schema: node.metadata?.schema,
      table: node.metadata?.table || node.name,
      comment: node.metadata?.comment,
    })
  }

  const canSaveDraft = Boolean(draft?.name.trim() && draft?.title.trim())
  const dimensionCount = Object.keys(draft?.dimensions || {}).length
  const measureCount = Object.keys(draft?.measures || {}).length

  return (
    <section className="rounded-[24px] border border-[hsl(var(--workbench-outline))] bg-white/92 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--workbench-muted-foreground))]">
            <Sparkles className="h-3.5 w-3.5" />
            最小创建链路
          </div>
          <div>
            <h2 className="text-xl font-semibold text-[hsl(var(--workbench-ink))]">从物理表创建最小 Cube 草稿</h2>
            <p className="mt-1 text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">
              先绑定数据源和物理表，生成一版 Cube 草稿，再补名称和标题后直接保存为 Draft Cube。
            </p>
          </div>
        </div>

        <div className="grid gap-2 text-xs text-[hsl(var(--workbench-muted-foreground))] sm:grid-cols-3">
          {[
            { label: '步骤 1', value: '选择数据源' },
            { label: '步骤 2', value: '选择物理表' },
            { label: '步骤 3', value: '保存 Draft Cube' },
          ].map((item) => (
            <div key={item.label} className="rounded-[18px] border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] px-3 py-2.5">
              <div className="font-semibold text-[hsl(var(--workbench-ink))]">{item.label}</div>
              <div className="mt-1">{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-4">
          <div className="rounded-[22px] border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--workbench-ink))]">
              <Database className="h-4 w-4" />
              选择数据源与物理表
            </div>
            <div className="mt-3 space-y-3">
              <div>
                <div className="mb-1.5 text-xs text-[hsl(var(--workbench-muted-foreground))]">数据源</div>
                <Select value={selectedSource} onValueChange={setSelectedSource}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择数据源" />
                  </SelectTrigger>
                  <SelectContent>
                    {datasources.map((ds: DataSource) => (
                      <SelectItem key={ds.id} value={String(ds.id)}>
                        {ds.name} · {ds.source_type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedTable ? (
                <div className="rounded-[18px] border border-[hsl(var(--workbench-outline))] bg-white px-4 py-3">
                  <div className="text-xs text-[hsl(var(--workbench-muted-foreground))]">当前物理表</div>
                  <div className="mt-1 text-sm font-semibold text-[hsl(var(--workbench-ink))]">{selectedTable.table}</div>
                  <div className="mt-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">
                    {selectedTable.database}{selectedTable.schema ? ` / ${selectedTable.schema}` : ''}
                  </div>
                </div>
              ) : (
                <div className="rounded-[18px] border border-dashed border-[hsl(var(--workbench-outline))] bg-white/78 px-4 py-4 text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">
                  先在右侧 Schema Browser 中选择一个物理表，再生成 Cube 草稿。
                </div>
              )}

              <Button
                className="w-full"
                data-testid="cube-generate-draft"
                disabled={!selectedSource || !selectedTable || createDraftMutation.isPending}
                onClick={() => createDraftMutation.mutate()}
              >
                <Wand2 className="mr-1.5 h-4 w-4" />
                生成 Cube 草稿
              </Button>
            </div>
          </div>

          <div className="rounded-[22px] border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--workbench-ink))]">
              <CheckCircle2 className="h-4 w-4" />
              草稿编辑
            </div>
            {draft ? (
              <div className="mt-3 space-y-4">
                <div className="grid gap-3">
                  <div>
                    <div className="mb-1.5 text-xs text-[hsl(var(--workbench-muted-foreground))]">草稿名称</div>
                    <Input
                      value={draft.name}
                      data-testid="cube-draft-name"
                      onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    />
                  </div>
                  <div>
                    <div className="mb-1.5 text-xs text-[hsl(var(--workbench-muted-foreground))]">草稿标题</div>
                    <Input
                      value={draft.title}
                      data-testid="cube-draft-title"
                      onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[18px] border border-[hsl(var(--workbench-outline))] bg-white px-3 py-3">
                    <div className="text-xs text-[hsl(var(--workbench-muted-foreground))]">数据源</div>
                    <div className="mt-1 text-sm font-semibold text-[hsl(var(--workbench-ink))]">
                      {selectedDataSource?.name || draft.data_source || '未绑定'}
                    </div>
                  </div>
                  <div className="rounded-[18px] border border-[hsl(var(--workbench-outline))] bg-white px-3 py-3">
                    <div className="text-xs text-[hsl(var(--workbench-muted-foreground))]">维度</div>
                    <div className="mt-1 text-sm font-semibold text-[hsl(var(--workbench-ink))]">{dimensionCount}</div>
                  </div>
                  <div className="rounded-[18px] border border-[hsl(var(--workbench-outline))] bg-white px-3 py-3">
                    <div className="text-xs text-[hsl(var(--workbench-muted-foreground))]">指标</div>
                    <div className="mt-1 text-sm font-semibold text-[hsl(var(--workbench-ink))]">{measureCount}</div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{getSemanticStatusLabel(draft.status || 'draft')}</Badge>
                  <span className="font-mono text-xs text-[hsl(var(--workbench-muted-foreground))]">{draft.table}</span>
                </div>

                <Button
                  className="w-full"
                  data-testid="cube-banner-save-draft"
                  disabled={!canSaveDraft || createCubeMutation.isPending}
                  onClick={() => draft && createCubeMutation.mutate({
                    ...draft,
                    name: draft.name.trim(),
                    title: draft.title.trim(),
                  })}
                >
                  保存为 Draft Cube
                </Button>
              </div>
            ) : (
              <div className="mt-3 rounded-[18px] border border-dashed border-[hsl(var(--workbench-outline))] bg-white/78 px-4 py-4 text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">
                生成草稿后，这里会展示 `cube-draft-name`、`cube-draft-title` 和保存按钮，方便在首屏直接完成最小建模闭环。
              </div>
            )}
          </div>
        </div>

        <div className="min-h-[32rem] overflow-hidden rounded-[22px] border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))]">
          <SchemaBrowser
            datasourceId={selectedSource ? Number(selectedSource) : undefined}
            sourceType={selectedDataSource?.source_type}
            collapsible={false}
            title="物理表结构"
            className="h-full border-l-0"
            onSelect={handleSchemaSelect}
          />
        </div>
      </div>
    </section>
  )
}
