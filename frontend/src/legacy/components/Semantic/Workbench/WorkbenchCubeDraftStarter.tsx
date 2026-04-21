import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Wand2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { createCube, createCubeDraftFromSource, type CubeDraftPayload, type CubeSummary } from '@/api/semantic'
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
      await createCubeDraftFromSource(buildCreateCubeDraftRequest(selectedSource, selectedTable))
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
    <section className="rounded-md border border-slate-200">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-medium text-slate-900">从物理表创建 Cube</h2>
          <p className="mt-0.5 text-xs text-slate-500">选择数据源和物理表，AI 辅助生成草稿。</p>
        </div>
      </div>

      <div className="grid gap-0 xl:grid-cols-[minmax(280px,0.45fr)_minmax(0,0.55fr)]">
        <div className="border-r border-slate-200 p-4">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-slate-500">数据源</label>
              <Select value={selectedSource} onValueChange={setSelectedSource}>
                <SelectTrigger className="h-8 text-xs">
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
              <div className="rounded-md border border-slate-200 px-3 py-2">
                <div className="text-xs text-slate-500">物理表</div>
                <div className="text-sm font-medium text-slate-900">{selectedTable.table}</div>
                <div className="text-xs text-slate-400">
                  {selectedTable.database}{selectedTable.schema ? ` / ${selectedTable.schema}` : ''}
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-400">
                在右侧选择物理表
              </div>
            )}

            <Button
              className="w-full"
              size="sm"
              data-testid="cube-generate-draft"
              disabled={!selectedSource || !selectedTable || createDraftMutation.isPending}
              onClick={() => createDraftMutation.mutate()}
            >
              <Wand2 className="mr-1.5 h-3.5 w-3.5" />
              生成草稿
            </Button>
          </div>

          {draft ? (
            <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
              <div>
                <label className="mb-1 block text-xs text-slate-500">名称</label>
                <Input
                  value={draft.name}
                  data-testid="cube-draft-name"
                  className="h-8 text-xs"
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">标题</label>
                <Input
                  value={draft.title}
                  data-testid="cube-draft-title"
                  className="h-8 text-xs"
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                />
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span>维度 <strong className="text-slate-900">{dimensionCount}</strong></span>
                <span>指标 <strong className="text-slate-900">{measureCount}</strong></span>
                <Badge variant="outline" className="text-[10px]">{draft.status || 'draft'}</Badge>
              </div>

              <Button
                className="w-full"
                size="sm"
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
            <div className="mt-4 border-t border-slate-200 px-0 pt-4 text-xs text-slate-400">
              生成草稿后可编辑名称和标题。
            </div>
          )}
        </div>

        <div className="min-h-[24rem]">
          <SchemaBrowser
            datasourceId={selectedSource ? Number(selectedSource) : undefined}
            sourceType={selectedDataSource?.source_type}
            collapsible={false}
            title="物理表结构"
            className="h-full border-0"
            onSelect={handleSchemaSelect}
          />
        </div>
      </div>
    </section>
  )
}
