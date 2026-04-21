import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save, Wand2 } from 'lucide-react'
import {
  activateCube,
  createCube,
  createCubeDraftFromSource,
  deprecateCube,
  updateCube,
  type CubeDetail,
  type CubeDraftPayload,
} from '@/api/semantic'
import { getDataSources } from '@/api/datasources'
import { useToast } from '@/components/business'
import { CubeStudioInspector } from '@/components/Semantic/CubeStudio/CubeStudioInspector'
import {
  CubeStudioStepRail,
  type CubeStudioStepItem,
  type CubeStudioStepKey,
} from '@/components/Semantic/CubeStudio/CubeStudioStepRail'
import { CubeStudioTaskPanel } from '@/components/Semantic/CubeStudio/CubeStudioTaskPanel'
import { SemanticWorkbenchContextBar } from '@/components/Semantic/SemanticWorkbenchContextBar'
import {
  SemanticPageHeader,
  SemanticPageShell,
  SemanticStatusBanner,
  type SemanticValidationSummary,
} from '@/components/Semantic/workbench'
import { Skeleton } from '@/components/ui/skeleton'
import { useCubeStudio } from '@/hooks/semantic-ia'
import { useUnsavedChangesPrompt } from '@/hooks/useUnsavedChangesPrompt'
import { getSemanticStatusLabel } from '@/lib/semantic-status'
import type { TreeNode } from '@/components/business/SchemaBrowser/types'
import type { DataSource } from '@/types'

interface SelectedTable {
  database: string
  schema?: string
  table: string
  comment?: string
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

function buildNewModeSummary(
  selectedSource: string,
  selectedTable: SelectedTable | null,
  draft: CubeDraftPayload | null,
  draftDiff: DiffSummary | null,
  generating: boolean,
  saving: boolean,
): SemanticValidationSummary {
  const blockers: string[] = []
  const hints: string[] = []

  if (!selectedSource) blockers.push('请先选择数据源。')
  if (!selectedTable) blockers.push('请先在来源绑定步骤里选择物理表。')
  if (selectedTable && !draft) hints.push('来源已确认，下一步生成草稿。')
  if (draft && !draft.name.trim()) blockers.push('Cube 名称不能为空。')
  if (draft && !draft.title.trim()) blockers.push('显示名称不能为空。')
  if (draft && Object.keys(draft.measures || {}).length === 0) hints.push('当前草稿没有指标，建议确认自动识别结果是否符合预期。')
  if (draft && !draft.domain_id) hints.push('当前草稿还没有归属领域，建议在基础信息步骤补充。')
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
      ? '先确认自动生成的结构和必要规则，再决定保存为草稿。'
      : '新建模式优先自动生成草稿，再对名称、结构和规则做少量人工补充。',
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

function buildEditModeSummary(cubeDetail: CubeDetail | undefined, dirty: boolean, saving: boolean, editForm: {
  title: string
  domain_id: string
}): SemanticValidationSummary {
  const blockers: string[] = []
  const hints: string[] = []

  if (!editForm.title.trim()) blockers.push('显示名称不能为空。')
  if (!editForm.domain_id) hints.push('当前模型还没有归属领域，建议补充领域上下文。')

  const status = saving ? 'publishing' : blockers.length > 0 ? 'blocked' : dirty ? 'dirty' : 'ready'
  return {
    status,
    title: status === 'dirty' ? '当前修改尚未保存' : '当前模型状态稳定',
    description: status === 'dirty'
      ? '请确认当前属性、规则和阻塞项，再保存修改。'
      : '编辑模式下统一维护单 Cube 的属性、规则和生命周期动作。',
    blockers,
    hints: [
      ...(cubeDetail?.status === 'active'
        ? ['当前已激活模型，如修改建模内容，建议保存后再回到领域建模检查引用关系。']
        : ['草稿模型可以先完成属性维护，再在最后一步选择保存或继续激活。']),
      ...hints,
    ],
    stats: [
      { label: '当前状态', value: getSemanticStatusLabel(cubeDetail?.status || 'draft') },
      { label: '所属领域', value: cubeDetail?.domain_name || editForm.domain_id || '未归属' },
      { label: '维度数', value: cubeDetail ? Object.keys(cubeDetail.dimensions).length : 0 },
      { label: '指标数', value: cubeDetail ? Object.keys(cubeDetail.measures).length : 0 },
    ],
  }
}

function inferActiveStep(
  isEditMode: boolean,
  selectedSource: string,
  selectedTable: SelectedTable | null,
  draft: CubeDraftPayload | null,
  cubeDetail: CubeDetail | undefined,
  summary: SemanticValidationSummary,
  isEditDirty: boolean,
) {
  if (!isEditMode) {
    if (!selectedSource || !selectedTable || !draft) return 'source' satisfies CubeStudioStepKey
    if (!draft.name.trim() || !draft.title.trim()) return 'basic' satisfies CubeStudioStepKey
    if (summary.blockers?.length) return 'validation' satisfies CubeStudioStepKey
    return 'publish' satisfies CubeStudioStepKey
  }

  if (!cubeDetail) return 'basic' satisfies CubeStudioStepKey
  if (!cubeDetail.title.trim()) return 'basic' satisfies CubeStudioStepKey
  if (summary.blockers?.length || isEditDirty) return 'validation' satisfies CubeStudioStepKey
  return 'publish' satisfies CubeStudioStepKey
}

function buildStepItems(
  isEditMode: boolean,
  selectedSource: string,
  selectedTable: SelectedTable | null,
  draft: CubeDraftPayload | null,
  cubeDetail: CubeDetail | undefined,
  summary: SemanticValidationSummary,
) {
  if (isEditMode) {
    return [
      { key: 'basic', title: '基础信息', description: '修正名称、说明和领域归属。', done: Boolean(cubeDetail?.title?.trim()) },
      { key: 'source', title: '来源绑定', description: '查看当前来源上下文和绑定摘要。', done: Boolean(cubeDetail) },
      { key: 'structure', title: '维度 / 指标', description: '校对当前结构规模和识别结果。', done: Boolean(cubeDetail) },
      { key: 'rules', title: '语义规则', description: '维护粒度和实体主键等核心规则。', done: Boolean(cubeDetail) },
      { key: 'validation', title: '校验与预览', description: '集中查看阻塞项、提醒项和影响范围。', done: summary.blockers?.length === 0 },
      { key: 'publish', title: '保存与发布', description: '收敛保存、激活和弃用动作。', done: false },
    ] satisfies CubeStudioStepItem[]
  }

  return [
    { key: 'basic', title: '基础信息', description: '补充显示名称、领域和说明。', done: Boolean(draft?.name.trim() && draft?.title.trim()) },
    { key: 'source', title: '来源绑定', description: '确认来源后自动生成草稿。', done: Boolean(selectedSource && selectedTable && draft) },
    { key: 'structure', title: '维度 / 指标', description: '校对自动识别出的结构。', done: Boolean(draft && (Object.keys(draft.dimensions || {}).length > 0 || Object.keys(draft.measures || {}).length > 0)) },
    { key: 'rules', title: '语义规则', description: '只维护少量核心规则。', done: Boolean(draft && ((draft.grain || '').trim() || (draft.entity_key || '').trim())) },
    { key: 'validation', title: '校验与预览', description: '集中处理阻塞项和提醒项。', done: Boolean(draft && summary.blockers?.length === 0) },
    { key: 'publish', title: '保存与发布', description: '将当前草稿保存为 Draft Cube。', done: false },
  ] satisfies CubeStudioStepItem[]
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
  const [activeStep, setActiveStep] = useState<CubeStudioStepKey>('basic')
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    status: 'draft',
    domain_id: '',
    grain: '',
    entity_key: '',
  })
  const [initialEditForm, setInitialEditForm] = useState({
    title: '',
    description: '',
    status: 'draft',
    domain_id: '',
    grain: '',
    entity_key: '',
  })

  const { data: datasourceResp } = useQuery({
    queryKey: ['datasources', 'cube-studio'],
    queryFn: async () => (await getDataSources({ is_active: true, page_size: 200 })).data,
  })
  const datasources = datasourceResp?.items ?? []

  const { domains, detail: cubeDetail, detailQuery } = useCubeStudio({ cubeName: name })
  const isLoading = detailQuery.isLoading

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
      grain: cubeDetail.grain || '',
      entity_key: cubeDetail.entity_key || '',
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
        await createCubeDraftFromSource({
          source_kind: 'physical_table',
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
        grain: payload.grain || '',
        entity_key: payload.entity_key || '',
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
      grain: editForm.grain || undefined,
      entity_key: editForm.entity_key || undefined,
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

  const summary = isEditMode
    ? buildEditModeSummary(cubeDetail, Boolean(isEditDirty), updateCubeMutation.isPending, editForm)
    : buildNewModeSummary(
      selectedSource,
      selectedTable,
      draft,
      draftDiff,
      createDraftMutation.isPending,
      createCubeMutation.isPending,
    )

  const inferredStep = inferActiveStep(isEditMode, selectedSource, selectedTable, draft, cubeDetail, summary, Boolean(isEditDirty))

  useEffect(() => {
    setActiveStep(inferredStep)
  }, [inferredStep])

  const stepItems = buildStepItems(isEditMode, selectedSource, selectedTable, draft, cubeDetail, summary)
  const hasMultiDomainProjection = Boolean(
    cubeDetail && (
      (cubeDetail.domain_count || 0) > 1
      || (cubeDetail.domain_ids?.length || 0) > 1
    ),
  )

  if (isEditMode && isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
        <Skeleton className="h-[calc(100vh-16rem)] rounded-lg" />
      </div>
    )
  }

  const heading = isEditMode ? '编辑 Cube' : '新建 Cube'

  return (
    <SemanticPageShell>
      <SemanticPageHeader
        backHref="/semantic/cubes"
        backLabel="返回 Cube 管理"
        title={heading}
        description="维护单个 Cube 的基础定义、来源绑定和语义规则。"
        status={summary.status}
        eyebrow={null}
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
              testId: 'cube-banner-save-current',
            }
            : draft
              ? {
                label: '保存为 Draft Cube',
                onClick: handleCreate,
                icon: <Save className="mr-1.5 h-4 w-4" />,
                disabled: createCubeMutation.isPending || summary.status === 'blocked',
                testId: 'cube-banner-save-draft',
              }
              : {
                label: '生成 Cube 草稿',
                onClick: () => createDraftMutation.mutate(),
                icon: <Wand2 className="mr-1.5 h-4 w-4" />,
                disabled: !selectedSource || !selectedTable || createDraftMutation.isPending,
                testId: 'cube-banner-generate-draft',
              }
        }
      />

      {isEditMode && hasMultiDomainProjection ? (
        <div className="rounded-[var(--workbench-radius)] border border-[hsl(var(--semantic-warn))]/20 bg-[hsl(var(--semantic-warn))]/8 px-4 py-3 text-sm text-[hsl(var(--workbench-ink))]">
          该 Cube 已被多个领域引用，当前编辑仅维护投影领域字段。
        </div>
      ) : null}

      <SemanticWorkbenchContextBar
        items={[
          { label: '当前模式', value: isEditMode ? '编辑现有 Cube' : '新建草稿', tone: 'default' },
          { label: '当前状态', value: getSemanticStatusLabel(cubeDetail?.status || draft?.status || 'draft'), tone: summary.status === 'blocked' ? 'warning' : summary.status === 'ready' ? 'accent' : 'default' },
          { label: '来源绑定', value: selectedTable ? `${selectedTable.database}.${selectedTable.table}` : selectedDataSource?.name || '未选择', tone: selectedTable ? 'accent' : 'default' },
          { label: '维度 / 指标', value: `${draft ? Object.keys(draft.dimensions || {}).length : cubeDetail ? Object.keys(cubeDetail.dimensions).length : 0} / ${draft ? Object.keys(draft.measures || {}).length : cubeDetail ? Object.keys(cubeDetail.measures).length : 0}`, tone: 'default' },
        ]}
        testId="cube-studio-context-bar"
      />

      <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)_320px]">
        <CubeStudioStepRail activeStep={activeStep} steps={stepItems} onSelect={setActiveStep} />

        <CubeStudioTaskPanel
          activeStep={activeStep}
          isEditMode={isEditMode}
          datasources={datasources}
          domains={domains}
          selectedSource={selectedSource}
          selectedDomain={selectedDomain}
          selectedTable={selectedTable}
          draft={draft}
          cubeDetail={cubeDetail}
          editForm={editForm}
          selectedDataSource={selectedDataSource}
          summary={summary}
          isEditDirty={Boolean(isEditDirty)}
          createDraftPending={createDraftMutation.isPending}
          createCubePending={createCubeMutation.isPending}
          updateCubePending={updateCubeMutation.isPending}
          activatePending={activateMutation.isPending}
          deprecatePending={deprecateMutation.isPending}
          onSourceChange={handleSourceChange}
          onDomainChange={setSelectedDomain}
          onSchemaSelect={handleSchemaSelect}
          onDraftChange={setDraft}
          onEditFormChange={(patch) => setEditForm((prev) => ({ ...prev, ...patch }))}
          onGenerateDraft={() => createDraftMutation.mutate()}
          onCreateCube={handleCreate}
          onSaveCube={handleSave}
          onActivate={handleActivate}
          onDeprecate={handleDeprecate}
        />

        <CubeStudioInspector
          selectedDataSource={selectedDataSource}
          selectedTable={selectedTable}
          selectedDomain={draft?.domain_id || editForm.domain_id || selectedDomain}
          draft={draft}
          cubeDetail={cubeDetail}
          domains={domains}
          draftDiff={draftDiff}
          summary={summary}
        />
      </div>
    </SemanticPageShell>
  )
}
