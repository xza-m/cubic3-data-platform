import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Database, GitBranch, Layers3, Save, Wand2 } from 'lucide-react'
import {
  activateCube,
  createCube,
  createCubeDraftFromTable,
  deprecateCube,
  describeCube,
  listDomains,
  updateCube,
  type CubeDetail,
  type CubeDraftPayload,
  type DimensionInfo,
  type MeasureInfo,
} from '@/api/semantic'
import { getDataSources } from '@/api/datasources'
import { SchemaBrowser, useToast } from '@/components/business'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { SyncStatusBadge } from '@/components/Semantic/SyncStatusBadge'
import {
  SemanticActionBar,
  SemanticInspectorPanel,
  SemanticPageHeader,
  SemanticPageShell,
  SemanticStatusBanner,
  type SemanticValidationSummary,
} from '@/components/Semantic/workbench'
import { useUnsavedChangesPrompt } from '@/hooks/useUnsavedChangesPrompt'
import { getSemanticStatusLabel } from '@/lib/semantic-status'
import { cn } from '@/lib/utils'
import type { TreeNode } from '@/components/business/SchemaBrowser/types'
import type { DataSource } from '@/types'

interface SelectedTable {
  database: string
  schema?: string
  table: string
  comment?: string
}

interface StepItem {
  key: string
  title: string
  description: string
  done: boolean
  current: boolean
}

interface DiffSummary {
  dimensionDelta: number
  measureDelta: number
  tableChanged: boolean
}

function summarizeDraftDiff(previousDraft: CubeDraftPayload | null, nextDraft: CubeDraftPayload): DiffSummary | null {
  if (!previousDraft) return null
  return {
    dimensionDelta: Object.keys(nextDraft.dimensions || {}).length - Object.keys(previousDraft.dimensions || {}).length,
    measureDelta: Object.keys(nextDraft.measures || {}).length - Object.keys(previousDraft.measures || {}).length,
    tableChanged: previousDraft.table !== nextDraft.table,
  }
}

function buildStepItems(isEditMode: boolean, selectedSource: string, selectedTable: SelectedTable | null, draft: CubeDraftPayload | null, cubeDetail?: CubeDetail): StepItem[] {
  if (isEditMode) {
    return [
      {
        key: 'binding',
        title: '上下文确认',
        description: '确认来源绑定、领域归属和当前生命周期。',
        done: Boolean(cubeDetail),
        current: !cubeDetail,
      },
      {
        key: 'model',
        title: '校对模型',
        description: '维护标题、说明、归属领域与基础状态。',
        done: Boolean(cubeDetail?.title),
        current: Boolean(cubeDetail),
      },
      {
        key: 'save',
        title: '保存修改',
        description: '保存编辑结果，必要时继续激活或弃用。',
        done: false,
        current: Boolean(cubeDetail),
      },
    ]
  }

  return [
    {
      key: 'source',
      title: '选择来源',
      description: '选择数据源并定位物理表。',
      done: Boolean(selectedSource && selectedTable),
      current: !selectedTable,
    },
    {
      key: 'draft',
      title: '生成草稿',
      description: '基于表结构自动生成初始 Cube 模型。',
      done: Boolean(draft),
      current: Boolean(selectedTable && !draft),
    },
    {
      key: 'review',
      title: '校对模型',
      description: '检查标题、维度、指标和领域归属。',
      done: Boolean(draft?.name && draft?.title),
      current: Boolean(draft),
    },
    {
      key: 'save',
      title: '保存草稿',
      description: '保存为 Draft Cube，后续再做生命周期流转。',
      done: false,
      current: Boolean(draft),
    },
  ]
}

function buildNewModeSummary(selectedSource: string, selectedTable: SelectedTable | null, draft: CubeDraftPayload | null, draftDiff: DiffSummary | null, generating: boolean, saving: boolean): SemanticValidationSummary {
  const blockers: string[] = []
  const hints: string[] = []

  if (!selectedSource) blockers.push('请先选择数据源。')
  if (!selectedTable) blockers.push('请先在左侧选择物理表。')
  if (selectedTable && !draft) hints.push('选择完成后，先生成草稿再做模型校对。')
  if (draft && !draft.name.trim()) blockers.push('Cube 名称不能为空。')
  if (draft && !draft.title.trim()) blockers.push('显示名称不能为空。')
  if (draft && Object.keys(draft.measures || {}).length === 0) hints.push('当前草稿没有指标，建议确认生成结果是否符合预期。')
  if (draftDiff) {
    hints.push(
      `本次重生成对比上一次草稿：维度 ${draftDiff.dimensionDelta >= 0 ? '+' : ''}${draftDiff.dimensionDelta}，指标 ${draftDiff.measureDelta >= 0 ? '+' : ''}${draftDiff.measureDelta}${draftDiff.tableChanged ? '，物理表已变更。' : '。'}`,
    )
  }

  const status = generating
    ? 'validating'
    : saving
      ? 'publishing'
      : blockers.length > 0
        ? 'blocked'
        : draft
          ? 'dirty'
          : 'idle'

  return {
    status,
    title: status === 'blocked'
      ? '当前草稿还不能保存'
      : draft
        ? '草稿已就绪，等待保存'
        : '先完成来源绑定与草稿生成',
    description: draft
      ? '校对模型名称、说明和领域归属后，可保存为 Draft Cube。'
      : '新建模式采用固定流程：选来源、生成草稿、校对模型、保存。',
    blockers,
    hints,
    stats: [
      { label: '来源已选', value: selectedSource ? '是' : '否' },
      { label: '物理表', value: selectedTable?.table || '未选择' },
      { label: '维度数', value: draft ? Object.keys(draft.dimensions || {}).length : 0 },
      { label: '指标数', value: draft ? Object.keys(draft.measures || {}).length : 0 },
    ],
  }
}

function buildEditModeSummary(cubeDetail: CubeDetail | undefined, dirty: boolean, saving: boolean): SemanticValidationSummary {
  const blockers: string[] = []
  if (!cubeDetail?.title?.trim()) blockers.push('显示名称不能为空。')

  const status = saving ? 'publishing' : blockers.length > 0 ? 'blocked' : dirty ? 'dirty' : 'ready'
  return {
    status,
    title: status === 'dirty' ? '当前修改尚未保存' : '当前模型状态稳定',
    description: status === 'dirty'
      ? '保存后会同步更新模型摘要和后续详情页展示。'
      : '编辑模式下可维护基础属性、领域归属与生命周期状态。',
    blockers,
    hints: [
      cubeDetail?.status === 'active'
        ? '当前已激活模型，如修改建模内容，建议完成后再次检查领域关系。'
        : '草稿模型可以先完成属性维护，再在详情页中观察运行态摘要。',
    ],
    stats: [
      { label: '当前状态', value: getSemanticStatusLabel(cubeDetail?.status || 'draft') },
      { label: '所属领域', value: cubeDetail?.domain_name || cubeDetail?.domain_id || '未归属' },
      { label: '维度数', value: cubeDetail ? Object.keys(cubeDetail.dimensions).length : 0 },
      { label: '指标数', value: cubeDetail ? Object.keys(cubeDetail.measures).length : 0 },
    ],
  }
}

function renderDimensionRows(dimensions: Record<string, DimensionInfo & { sql?: string }>) {
  const entries = Object.entries(dimensions || {})
  if (entries.length === 0) {
    return <div className="rounded-xl border border-dashed p-4 text-sm text-[hsl(var(--workbench-muted-foreground))]">当前还没有自动识别出的维度。</div>
  }
  return (
    <div className="overflow-hidden rounded-xl border border-[hsl(var(--workbench-outline))]">
      <table className="w-full text-sm">
        <thead className="bg-[hsl(var(--workbench-panel))]">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium">维度</th>
            <th className="px-4 py-2.5 text-left font-medium">类型</th>
            <th className="px-4 py-2.5 text-left font-medium">说明</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([key, dimension]) => (
            <tr key={key} className="border-t border-[hsl(var(--workbench-outline))]">
              <td className="px-4 py-2.5 font-mono text-xs">{key}</td>
              <td className="px-4 py-2.5">{dimension.type}</td>
              <td className="px-4 py-2.5 text-xs text-[hsl(var(--workbench-muted-foreground))]">
                {dimension.title || dimension.sql || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function renderMeasureRows(measures: Record<string, MeasureInfo & { sql?: string }>) {
  const entries = Object.entries(measures || {})
  if (entries.length === 0) {
    return <div className="rounded-xl border border-dashed p-4 text-sm text-[hsl(var(--workbench-muted-foreground))]">当前还没有自动识别出的指标。</div>
  }
  return (
    <div className="overflow-hidden rounded-xl border border-[hsl(var(--workbench-outline))]">
      <table className="w-full text-sm">
        <thead className="bg-[hsl(var(--workbench-panel))]">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium">指标</th>
            <th className="px-4 py-2.5 text-left font-medium">聚合类型</th>
            <th className="px-4 py-2.5 text-left font-medium">说明</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([key, measure]) => (
            <tr key={key} className="border-t border-[hsl(var(--workbench-outline))]">
              <td className="px-4 py-2.5 font-mono text-xs">{key}</td>
              <td className="px-4 py-2.5">{measure.type}</td>
              <td className="px-4 py-2.5 text-xs text-[hsl(var(--workbench-muted-foreground))]">
                {measure.title || measure.sql || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function CubeStudio() {
  const { name } = useParams<{ name: string }>()
  const isEditMode = Boolean(name)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const previousDraftRef = useRef<CubeDraftPayload | null>(null)

  const [selectedSource, setSelectedSource] = useState<string>('')
  const [selectedDomain, setSelectedDomain] = useState<string>('')
  const [selectedTable, setSelectedTable] = useState<SelectedTable | null>(null)
  const [draft, setDraft] = useState<CubeDraftPayload | null>(null)
  const [draftDiff, setDraftDiff] = useState<DiffSummary | null>(null)
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    status: 'draft',
    domain_id: '',
  })
  const [initialEditForm, setInitialEditForm] = useState({
    title: '',
    description: '',
    status: 'draft',
    domain_id: '',
  })

  const { data: datasourceResp } = useQuery({
    queryKey: ['datasources', 'cube-studio'],
    queryFn: async () => (await getDataSources({ is_active: true, page_size: 200 })).data,
  })
  const datasources = datasourceResp?.items ?? []

  const { data: domainsResp } = useQuery({
    queryKey: ['semantic', 'domains'],
    queryFn: async () => (await listDomains()).data,
  })
  const domains = domainsResp?.domains ?? []

  const { data: cubeDetail, isLoading } = useQuery({
    queryKey: ['semantic', 'cube', name],
    queryFn: async () => (await describeCube(name!)).data as CubeDetail,
    enabled: !!name,
  })

  useEffect(() => {
    if (!selectedSource && datasources.length > 0) {
      setSelectedSource(String(datasources[0].id))
    }
  }, [datasources, selectedSource])

  useEffect(() => {
    if (!cubeDetail) return
    const nextForm = {
      title: cubeDetail.title,
      description: cubeDetail.description || '',
      status: cubeDetail.status || 'draft',
      domain_id: cubeDetail.domain_id || '',
    }
    setSelectedSource(cubeDetail.source_id ? String(cubeDetail.source_id) : '')
    setSelectedDomain(cubeDetail.domain_id || '')
    setEditForm(nextForm)
    setInitialEditForm(nextForm)
  }, [cubeDetail])

  const selectedDataSource = useMemo(
    () => datasources.find((item: DataSource) => String(item.id) === selectedSource),
    [datasources, selectedSource],
  )

  const isDraftDirty = Boolean(selectedTable || draft)
  const isEditDirty = isEditMode && JSON.stringify(editForm) !== JSON.stringify(initialEditForm)
  const hasUnsavedChanges = isEditMode ? Boolean(isEditDirty) : isDraftDirty

  useUnsavedChangesPrompt(hasUnsavedChanges)

  const createDraftMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSource || !selectedTable) {
        throw new Error('请先选择数据源和物理表')
      }
      return (
        await createCubeDraftFromTable({
          source_id: Number(selectedSource),
          database: selectedTable.database,
          schema: selectedTable.schema,
          table: selectedTable.table,
        })
      ).data
    },
    onSuccess: (payload) => {
      const nextDraft = {
        ...payload,
        domain_id: selectedDomain || payload.domain_id || undefined,
      }
      const diff = summarizeDraftDiff(previousDraftRef.current, nextDraft)
      previousDraftRef.current = nextDraft
      setDraft(nextDraft)
      setDraftDiff(diff)
      toast({ title: 'Cube 草稿已生成' })
    },
    onError: (err) => {
      toast({ title: '生成草稿失败', description: (err as Error).message, variant: 'destructive' })
    },
  })

  const createCubeMutation = useMutation({
    mutationFn: async (payload: CubeDraftPayload) => (await createCube(payload)).data,
    onSuccess: async (payload) => {
      toast({ title: 'Cube 创建成功' })
      previousDraftRef.current = null
      setDraft(null)
      setDraftDiff(null)
      await queryClient.invalidateQueries({ queryKey: ['semantic'] })
      navigate(`/semantic/cubes/${payload.name}`)
    },
    onError: (err) => {
      toast({ title: '创建 Cube 失败', description: (err as Error).message, variant: 'destructive' })
    },
  })

  const updateCubeMutation = useMutation({
    mutationFn: async (payload: Partial<CubeDraftPayload>) => {
      if (!name) throw new Error('缺少 Cube 名称')
      return (await updateCube(name, payload)).data
    },
    onSuccess: async (payload) => {
      toast({ title: 'Cube 更新成功' })
      const nextForm = {
        title: payload.title,
        description: payload.description || '',
        status: payload.status || 'draft',
        domain_id: payload.domain_id || '',
      }
      setEditForm(nextForm)
      setInitialEditForm(nextForm)
      await queryClient.invalidateQueries({ queryKey: ['semantic'] })
      navigate(`/semantic/cubes/${payload.name}`)
    },
    onError: (err) => {
      toast({ title: '更新 Cube 失败', description: (err as Error).message, variant: 'destructive' })
    },
  })

  const activateMutation = useMutation({
    mutationFn: async () => {
      if (!name) throw new Error('缺少 Cube 名称')
      return (await activateCube(name)).data
    },
    onSuccess: async (payload) => {
      toast({ title: `Cube 已激活: ${payload.title}` })
      await queryClient.invalidateQueries({ queryKey: ['semantic'] })
      navigate(`/semantic/cubes/${payload.name}`)
    },
    onError: (err) => {
      toast({ title: '激活失败', description: (err as Error).message, variant: 'destructive' })
    },
  })

  const deprecateMutation = useMutation({
    mutationFn: async () => {
      if (!name) throw new Error('缺少 Cube 名称')
      return (await deprecateCube(name)).data
    },
    onSuccess: async (payload) => {
      toast({ title: `Cube 已弃用: ${payload.title}` })
      await queryClient.invalidateQueries({ queryKey: ['semantic'] })
      navigate(`/semantic/cubes/${payload.name}`)
    },
    onError: (err) => {
      toast({ title: '弃用失败', description: (err as Error).message, variant: 'destructive' })
    },
  })

  const updateDraftDomain = (value: string) => {
    setSelectedDomain(value)
    setDraft((prev) => (prev ? { ...prev, domain_id: value || undefined } : prev))
  }

  const handleSourceChange = (value: string) => {
    if (!isEditMode && hasUnsavedChanges && value !== selectedSource) {
      const allow = window.confirm('切换数据源会清空当前草稿和已选物理表，确认继续吗？')
      if (!allow) return
    }
    setSelectedSource(value)
    if (!isEditMode) {
      setSelectedTable(null)
      setDraft(null)
      setDraftDiff(null)
      previousDraftRef.current = null
    }
  }

  const handleSchemaSelect = useCallback((node: TreeNode) => {
    if (node.type !== 'table' && node.type !== 'view') return
    if (draft && !window.confirm('重新选择物理表会放弃当前草稿，确认继续吗？')) {
      return
    }
    setDraft(null)
    setDraftDiff(null)
    previousDraftRef.current = null
    setSelectedTable({
      database: node.metadata?.database || '',
      schema: node.metadata?.schema,
      table: node.metadata?.table || node.name,
      comment: node.metadata?.comment,
    })
  }, [draft])

  const handleCreate = () => {
    if (!draft) return
    createCubeMutation.mutate(draft)
  }

  const handleSave = () => {
    updateCubeMutation.mutate({
      title: editForm.title,
      description: editForm.description,
      status: editForm.status,
      domain_id: editForm.domain_id || undefined,
    })
  }

  const handleActivate = () => {
    if (!window.confirm('确认将当前 Cube 激活吗？激活后会进入默认查询链路。')) return
    activateMutation.mutate()
  }

  const handleDeprecate = () => {
    if (!window.confirm('确认将当前 Cube 弃用吗？弃用后不应继续用于默认查询链路。')) return
    deprecateMutation.mutate()
  }

  const stepItems = buildStepItems(isEditMode, selectedSource, selectedTable, draft, cubeDetail)
  const summary = isEditMode
    ? buildEditModeSummary(cubeDetail, Boolean(isEditDirty), updateCubeMutation.isPending)
    : buildNewModeSummary(
      selectedSource,
      selectedTable,
      draft,
      draftDiff,
      createDraftMutation.isPending,
      createCubeMutation.isPending,
    )

  if (isEditMode && isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 rounded-3xl" />
        <Skeleton className="h-40 rounded-3xl" />
        <Skeleton className="h-[calc(100vh-16rem)] rounded-3xl" />
      </div>
    )
  }

  const heading = isEditMode ? 'Cube 设计' : '新建 Cube'

  return (
    <SemanticPageShell>
      <SemanticPageHeader
        backHref="/semantic/cubes"
        backLabel="返回 Cube 管理"
        title={heading}
        description="这里只定义单个 Cube 的基础信息、维度、指标和生命周期。领域关系与 Join 不在当前页面处理。"
        status={summary.status}
        meta={
          <>
            {cubeDetail?.status && <Badge variant="outline">{getSemanticStatusLabel(cubeDetail.status)}</Badge>}
            {cubeDetail?.state_summary?.sync_status && <SyncStatusBadge status={cubeDetail.state_summary.sync_status as any} />}
          </>
        }
      />

      <SemanticStatusBanner
        summary={summary}
        primaryAction={
          isEditMode
            ? {
              label: '保存当前修改',
              onClick: handleSave,
              icon: <Save className="mr-1.5 h-4 w-4" />,
              disabled: !isEditDirty || updateCubeMutation.isPending,
              testId: 'semantic-primary-action',
            }
            : draft
              ? {
                label: '保存为 Draft Cube',
                onClick: handleCreate,
                icon: <Save className="mr-1.5 h-4 w-4" />,
                disabled: createCubeMutation.isPending || summary.status === 'blocked',
                testId: 'cube-save-draft',
              }
              : {
                label: '生成 Cube 草稿',
                onClick: () => createDraftMutation.mutate(),
                icon: <Wand2 className="mr-1.5 h-4 w-4" />,
                disabled: !selectedSource || !selectedTable || createDraftMutation.isPending,
                testId: 'cube-generate-draft',
              }
        }
      />

      <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)_320px]">
        <section className="rounded-[var(--workbench-radius)] border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] p-4 shadow-sm">
          <div className="space-y-4">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-[hsl(var(--workbench-ink))]" style={{ fontFamily: 'var(--font-workbench-display)' }}>
                设计步骤
              </div>
              <p className="text-xs leading-5 text-[hsl(var(--workbench-muted-foreground))]">
                当前页面只处理单 Cube 定义，不在这里维护跨 Cube 关系。
              </p>
            </div>
            <div className="space-y-2">
              {stepItems.map((step, index) => (
                <div
                  key={step.key}
                  data-testid={`cube-studio-step-${index + 1}`}
                  className={cn(
                    'rounded-[var(--workbench-radius-sm)] border px-3 py-3 transition-colors',
                    step.current
                      ? 'border-[hsl(var(--workbench-accent))] bg-[hsl(var(--workbench-accent-soft))]'
                      : step.done
                        ? 'border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))]'
                        : 'border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))]',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold',
                      step.current
                        ? 'border-[hsl(var(--workbench-accent))] bg-[hsl(var(--workbench-surface))] text-[hsl(var(--workbench-accent))]'
                        : step.done
                          ? 'border-[hsl(var(--semantic-ok))]/40 bg-[hsl(var(--semantic-ok))]/10 text-[hsl(var(--semantic-ok))]'
                          : 'border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] text-[hsl(var(--workbench-muted-foreground))]',
                    )}>
                      {index + 1}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-[hsl(var(--workbench-ink))]">{step.title}</div>
                      <div className="text-xs leading-5 text-[hsl(var(--workbench-muted-foreground))]">{step.description}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-3 rounded-[var(--workbench-radius-sm)] border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] p-3">
              <div className="text-sm font-semibold text-[hsl(var(--workbench-ink))]">来源绑定</div>
              {!isEditMode && (
                <>
                  <Select value={selectedDomain || undefined} onValueChange={updateDraftDomain}>
                    <SelectTrigger>
                      <SelectValue placeholder="先选择领域上下文（可选）" />
                    </SelectTrigger>
                    <SelectContent>
                      {domains.map((domain) => (
                        <SelectItem key={domain.id || domain.code} value={String(domain.id || domain.code)}>
                          {domain.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={selectedSource} onValueChange={handleSourceChange}>
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
                </>
              )}
              {isEditMode && cubeDetail && (
                <div className="rounded-xl border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] p-3 text-sm">
                  <div className="font-medium text-[hsl(var(--workbench-ink))]">
                    {cubeDetail.source_binding_summary?.source_name || cubeDetail.source_binding_summary?.source_type || '未绑定数据源'}
                  </div>
                  <div className="mt-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">
                    {cubeDetail.source_binding_summary?.database || cubeDetail.source_database || '—'}
                    {cubeDetail.source_binding_summary?.schema ? ` / ${cubeDetail.source_binding_summary.schema}` : ''}
                  </div>
                </div>
              )}
              {selectedTable && (
                <div className="rounded-xl border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] p-3">
                  <div className="text-xs uppercase tracking-[0.14em] text-[hsl(var(--workbench-muted-foreground))]">当前物理表</div>
                  <div className="mt-2 text-sm font-semibold text-[hsl(var(--workbench-ink))]">{selectedTable.table}</div>
                  <div className="text-xs text-[hsl(var(--workbench-muted-foreground))]">
                    {selectedTable.database}{selectedTable.schema ? ` / ${selectedTable.schema}` : ''}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-5">
          {!isEditMode && (
            <section className="rounded-[var(--workbench-radius)] border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] p-4 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[hsl(var(--workbench-ink))]" style={{ fontFamily: 'var(--font-workbench-display)' }}>
                    物理结构浏览器
                  </div>
                  <p className="text-xs leading-5 text-[hsl(var(--workbench-muted-foreground))]">
                    先选择物理表，再在当前页面内生成草稿并确认维度与指标。
                  </p>
                </div>
                <Badge variant="outline">{selectedDataSource?.name || '未选数据源'}</Badge>
              </div>
              <SchemaBrowser
                datasourceId={selectedSource ? Number(selectedSource) : undefined}
                sourceType={selectedDataSource?.source_type}
                collapsible={false}
                title="物理表结构"
                className="border-l-0"
                onSelect={handleSchemaSelect}
              />
            </section>
          )}

          <section className="rounded-[var(--workbench-radius)] border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] p-5 shadow-sm">
            {draft ? (
              <div className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-lg font-semibold text-[hsl(var(--workbench-ink))]" style={{ fontFamily: 'var(--font-workbench-display)' }}>
                      Cube 草稿
                    </div>
                    <p className="mt-1 text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">
                      先确认模型名称、归属领域和自动识别出的维度、指标，再保存为草稿。
                    </p>
                  </div>
                  <Badge variant="secondary">草稿模式</Badge>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="mb-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">Cube 名称</div>
                    <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">显示名称</div>
                    <Input data-testid="cube-draft-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="mb-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">所属领域</div>
                    <Select value={draft.domain_id || '__none__'} onValueChange={(value) => setDraft({ ...draft, domain_id: value === '__none__' ? undefined : value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="暂不归入领域" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">暂不归入领域</SelectItem>
                        {domains.map((domain) => (
                          <SelectItem key={domain.id || domain.code} value={String(domain.id || domain.code)}>
                            {domain.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">来源表</div>
                    <Input value={draft.table} disabled />
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">说明</div>
                  <Textarea value={draft.description || ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={4} />
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="space-y-3">
                    <div className="text-sm font-semibold text-[hsl(var(--workbench-ink))]">维度预览</div>
                    {renderDimensionRows(draft.dimensions || {})}
                  </div>
                  <div className="space-y-3">
                    <div className="text-sm font-semibold text-[hsl(var(--workbench-ink))]">指标预览</div>
                    {renderMeasureRows(draft.measures || {})}
                  </div>
                </div>

                <SemanticActionBar
                  title="草稿下一步"
                  description="如果自动识别结果不理想，可以返回重新选表生成；如果结构合理，直接保存为 Draft Cube。"
                  status={summary.status}
                  primaryAction={{
                    label: '保存为 Draft Cube',
                    onClick: handleCreate,
                    icon: <Save className="mr-1.5 h-4 w-4" />,
                    disabled: createCubeMutation.isPending || summary.status === 'blocked',
                    testId: 'cube-save-draft',
                  }}
                  secondaryActions={
                    <>
                      <Button variant="outline" onClick={() => createDraftMutation.mutate()} disabled={createDraftMutation.isPending}>
                        <Wand2 className="mr-1.5 h-4 w-4" />
                        重新生成
                      </Button>
                      <Button variant="outline" onClick={() => { setDraft(null); setDraftDiff(null) }}>
                        放弃草稿
                      </Button>
                    </>
                  }
                />
              </div>
            ) : cubeDetail ? (
              <div className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-lg font-semibold text-[hsl(var(--workbench-ink))]" style={{ fontFamily: 'var(--font-workbench-display)' }}>
                      当前 Cube
                    </div>
                    <p className="mt-1 text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">
                      编辑模式只维护单 Cube 的属性与生命周期。跨模型关系和领域 Join 统一在领域设计页处理。
                    </p>
                  </div>
                  <Badge variant="outline">{getSemanticStatusLabel(cubeDetail.status || 'draft')}</Badge>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="mb-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">Cube 名称</div>
                    <Input value={cubeDetail.name} disabled />
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">所属领域</div>
                    <Select value={editForm.domain_id || '__none__'} onValueChange={(value) => setEditForm((prev) => ({ ...prev, domain_id: value === '__none__' ? '' : value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="暂不归入领域" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">暂不归入领域</SelectItem>
                        {domains.map((domain) => (
                          <SelectItem key={domain.id || domain.code} value={String(domain.id || domain.code)}>
                            {domain.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">显示名称</div>
                    <Input value={editForm.title} onChange={(e) => setEditForm((prev) => ({ ...prev, title: e.target.value }))} />
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">状态</div>
                    <Select value={editForm.status} onValueChange={(value) => setEditForm((prev) => ({ ...prev, status: value }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">{getSemanticStatusLabel('draft')}</SelectItem>
                        <SelectItem value="active">{getSemanticStatusLabel('active')}</SelectItem>
                        <SelectItem value="deprecated">{getSemanticStatusLabel('deprecated')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">说明</div>
                  <Textarea value={editForm.description} onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))} rows={4} />
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="space-y-3">
                    <div className="text-sm font-semibold text-[hsl(var(--workbench-ink))]">维度预览</div>
                    {renderDimensionRows(cubeDetail.dimensions)}
                  </div>
                  <div className="space-y-3">
                    <div className="text-sm font-semibold text-[hsl(var(--workbench-ink))]">指标预览</div>
                    {renderMeasureRows(cubeDetail.measures)}
                  </div>
                </div>

                <SemanticActionBar
                  title="生命周期动作"
                  description="保存属性修改后，可按需要继续激活或弃用当前模型。"
                  status={summary.status}
                  primaryAction={{
                    label: '保存当前修改',
                    onClick: handleSave,
                    icon: <Save className="mr-1.5 h-4 w-4" />,
                    disabled: !isEditDirty || updateCubeMutation.isPending,
                    testId: 'semantic-primary-action',
                  }}
                  secondaryActions={
                    <>
                      <Button variant="outline" onClick={handleActivate} disabled={cubeDetail.status === 'active' || activateMutation.isPending}>
                        激活
                      </Button>
                      <Button variant="outline" onClick={handleDeprecate} disabled={cubeDetail.status === 'deprecated' || deprecateMutation.isPending}>
                        弃用
                      </Button>
                    </>
                  }
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-lg font-semibold text-[hsl(var(--workbench-ink))]" style={{ fontFamily: 'var(--font-workbench-display)' }}>
                  先完成来源绑定
                </div>
                <p className="text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">
                  当前还没有草稿。先从左侧选择数据源和物理表，再进入固定的草稿生成流程。
                </p>
              </div>
            )}
          </section>
        </section>

        <SemanticInspectorPanel
          title="建模摘要"
          description="这里显示当前上下文、领域挂接和生命周期建议。"
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
                {domains.find((item) => String(item.id || item.code) === (draft?.domain_id || editForm.domain_id || selectedDomain))?.name || cubeDetail?.domain_name || '暂未归入领域'}
              </div>
              <div className="text-xs text-[hsl(var(--workbench-muted-foreground))]">领域关系编辑请在领域画布完成。</div>
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

            {draftDiff && (
              <div className="rounded-xl border border-[hsl(var(--semantic-warn))]/30 bg-[hsl(var(--semantic-warn))]/10 p-3 text-sm text-[hsl(var(--workbench-ink))]">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[hsl(var(--semantic-warn))]">重生成差异</div>
                <div className="mt-2 leading-6">
                  维度 {draftDiff.dimensionDelta >= 0 ? '+' : ''}{draftDiff.dimensionDelta}，指标 {draftDiff.measureDelta >= 0 ? '+' : ''}{draftDiff.measureDelta}
                  {draftDiff.tableChanged ? '，并且物理表已变更。' : '。'}
                </div>
              </div>
            )}

            <div className="rounded-xl border border-dashed border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] p-3 text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">
              当前页只负责完成“来源确认、草稿生成、模型校对、保存/激活”这条链路，关系设计和查询验证都不在这里进行。
            </div>
          </div>
        </SemanticInspectorPanel>
      </div>
    </SemanticPageShell>
  )
}
