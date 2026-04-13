/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  FormButton,
  FormInput,
  FormTextarea,
  PageDrawer,
  PreviewPanel,
  useToast,
} from '@/components/business'
import {
  Box,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Database,
  FileCode2,
  FolderGit2,
  GitCompareArrows,
  Loader2,
  PanelRight,
  Shapes,
  Sparkles,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  type BusinessAction,
  type BusinessMetric,
  type BusinessObject,
  type BusinessProperty,
  type BusinessRelation,
  type GlossaryEntry,
  type OntologyEntityImpactResponse,
  type OntologyHistoryEvent,
  type OntologyPublishResponse,
  type OntologyTemplateResponse,
  type PolicyMetadata,
  applyOntologyTemplate,
  getOntologyTemplate,
  listBusinessActions,
  getPolicyAudit,
  getBusinessMetricLinks,
  getExecutionCompilePreview,
  getExecutionExecute,
  getExecutionPlanPreview,
  getOntologyEntityHistory,
  getOntologyEntityImpact,
  getPolicyImpact,
  getSemanticPlanPreview,
  getSemanticRoutePreview,
  getSemanticExecutePlan,
  getMeasureBacklinks,
  getSemanticConsistencyReport,
  getSemanticStaleCheck,
  listBusinessRelations,
  listBusinessMetrics,
  listBusinessObjects,
  listBusinessProperties,
  listGlossaryEntries,
  listPolicyMetadata,
  publishOntologyEntity,
  previewSemanticMapping,
  saveBusinessAction,
  saveBusinessRelation,
  saveBusinessMetric,
  saveBusinessObject,
  saveBusinessProperty,
  saveGlossaryEntry,
  savePolicyMetadata,
} from '@/api/ontology'
import { buildSemanticWorkbenchHref } from '@/hooks/semantic-ia'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type OntologyTab = 'objects' | 'properties' | 'metrics' | 'relations' | 'actions' | 'glossary' | 'policies'

interface EntityListItem {
  key: string
  title: string
  subtitle: string
  status?: string
}

const TAB_LABELS: Record<OntologyTab, string> = {
  objects: '对象',
  properties: '属性',
  metrics: '业务指标',
  relations: '关系',
  actions: '动作',
  glossary: '术语',
  policies: '权限',
}

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  active: '已确认',
  deprecated: '已废弃',
}

const ROUTE_TYPE_LABELS: Record<string, string> = {
  cube: '分析查询',
  knowledge: '知识解释',
  hybrid: '混合路径',
  tool: '工具调用',
  blocked: '已阻断',
  pending: '待生成',
  direct: '直接执行',
}

const PLANNING_MODE_LABELS: Record<string, string> = {
  single_step: '单步规划',
  multi_step: '多步规划',
}

const DECISION_LABELS: Record<string, string> = {
  allow: '已放行',
  blocked: '已阻断',
  not_configured: '未接入执行',
}

const EXECUTION_STATUS_LABELS: Record<string, string> = {
  executed: '已执行',
  blocked: '已阻断',
  not_configured: '未接入执行',
  ready: '已就绪',
  pending: '待生成',
  linked: '已关联',
  active: '生效中',
  warning: '需处理',
  ok: '正常',
}

const ONTOLOGY_TABS: OntologyTab[] = ['objects', 'properties', 'metrics', 'relations', 'actions', 'glossary', 'policies']

function isOntologyTab(value: string | null): value is OntologyTab {
  return value != null && ONTOLOGY_TABS.includes(value as OntologyTab)
}

function mapEntityTypeToTab(value?: string | null): OntologyTab | null {
  if (value === 'object') return 'objects'
  if (value === 'property') return 'properties'
  if (value === 'metric') return 'metrics'
  if (value === 'relation') return 'relations'
  if (value === 'action') return 'actions'
  if (value === 'glossary') return 'glossary'
  if (value === 'policy') return 'policies'
  return null
}

function mapTabToEntityType(tab: OntologyTab): string {
  if (tab === 'objects') return 'objects'
  if (tab === 'properties') return 'properties'
  if (tab === 'metrics') return 'metrics'
  if (tab === 'relations') return 'relations'
  if (tab === 'actions') return 'actions'
  if (tab === 'glossary') return 'glossary'
  return 'policies'
}

function buildEntityList(tab: OntologyTab, payload: {
  objects: BusinessObject[]
  properties: BusinessProperty[]
  metrics: BusinessMetric[]
  relations: BusinessRelation[]
  actions: BusinessAction[]
  glossary: GlossaryEntry[]
  policies: PolicyMetadata[]
}): EntityListItem[] {
  if (tab === 'objects') {
    return payload.objects.map((item) => ({
      key: item.name,
      title: item.title,
      subtitle: item.name,
      status: item.status,
    }))
  }
  if (tab === 'properties') {
    return payload.properties.map((item) => ({
      key: item.name,
      title: item.title,
      subtitle: `${item.object_name} · ${item.property_type}`,
      status: item.status,
    }))
  }
  if (tab === 'metrics') {
    return payload.metrics.map((item) => ({
      key: item.name,
      title: item.title,
      subtitle: `${item.object_name} · ${item.name}`,
      status: item.status,
    }))
  }
  if (tab === 'relations') {
    return payload.relations.map((item) => ({
      key: item.name,
      title: item.title,
      subtitle: `${item.source_object_name} → ${item.target_object_name}`,
      status: item.status,
    }))
  }
  if (tab === 'actions') {
    return payload.actions.map((item) => ({
      key: item.name,
      title: item.title,
      subtitle: `${item.object_name} · ${item.name}`,
      status: item.status,
    }))
  }
  if (tab === 'policies') {
    return payload.policies.map((item) => ({
      key: item.name,
      title: item.name,
      subtitle: `${item.target_type} · ${item.target_name}`,
    }))
  }
  return payload.glossary.map((item) => ({
    key: item.canonical_name,
    title: item.term,
    subtitle: `${item.entry_type} · ${item.canonical_name}`,
  }))
}

function emptyObjectForm(): Partial<BusinessObject> {
  return { name: '', title: '', description: '', aliases: [], status: 'draft' }
}

function emptyPropertyForm(): Partial<BusinessProperty> {
  return { name: '', title: '', object_name: '', property_type: 'unknown', description: '', aliases: [], status: 'draft' }
}

function emptyMetricForm(): Partial<BusinessMetric> {
  return {
    name: '',
    title: '',
    object_name: '',
    semantic_formula: '',
    description: '',
    semantic_labels: [],
    measure_refs: [],
    aliases: [],
    status: 'draft',
  }
}

function emptyRelationForm(): Partial<BusinessRelation> {
  return {
    name: '',
    title: '',
    source_object_name: '',
    target_object_name: '',
    relation_type: '',
    description: '',
    aliases: [],
    status: 'draft',
  }
}

function emptyActionForm(): Partial<BusinessAction> {
  return {
    name: '',
    title: '',
    object_name: '',
    trigger_time_property: '',
    description: '',
    event_cube_refs: [],
    aliases: [],
    status: 'draft',
  }
}

function emptyGlossaryForm(): Partial<GlossaryEntry> {
  return { term: '', canonical_name: '', entry_type: 'term', aliases: [], description: '' }
}

function emptyPolicyForm(): Partial<PolicyMetadata> {
  return {
    name: '',
    target_type: 'object',
    target_name: '',
    visibility: 'restricted',
    allowed_roles: [],
    description: '',
  }
}

function splitCommaText(value: string): string[] {
  return value
    .split(/[，,]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function getRouteTypeLabel(value?: string | null): string {
  return ROUTE_TYPE_LABELS[String(value || 'pending')] || String(value || '待生成')
}

function getPlanningModeLabel(value?: string | null): string {
  return PLANNING_MODE_LABELS[String(value || 'single_step')] || String(value || '单步规划')
}

function getDecisionLabel(value?: string | null): string {
  return DECISION_LABELS[String(value || 'blocked')] || String(value || '未定义')
}

function getExecutionStatusLabel(value?: string | null): string {
  return EXECUTION_STATUS_LABELS[String(value || 'pending')] || String(value || '待生成')
}

const SUMMARY_LABELS: Record<string, string> = {
  business_object: '业务对象',
  business_metric: '业务指标',
  analysis_cube: '分析实体',
  analysis_measure: '分析指标',
  execution: '执行目标',
  sources: '数据来源',
  source_id: '数据源',
  sql_query: 'SQL',
  query: '检索语句',
  name: '工具名',
  cube_name: 'Cube',
  measure_name: 'Measure',
  metric_name: '指标编码',
  target_type: '目标类型',
  target_name: '目标名称',
  route_type: '路由类型',
  visibility: '可见性',
}

function summarizeValue(value: unknown): string {
  if (value == null || value === '') return '未提供'
  if (Array.isArray(value)) return value.length > 0 ? value.map((item) => String(item)).join('、') : '未提供'
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const preferred = record.title || record.name || record.cube_name || record.measure_name || record.metric_name
    if (preferred) return String(preferred)
    const keys = Object.keys(record)
    return keys.length > 0 ? `${keys.length} 个字段` : '未提供'
  }
  return String(value)
}

function buildSummaryEntries(
  payload: Record<string, unknown>,
  preferredKeys: string[] = [],
): Array<{ key: string; label: string; value: string }> {
  const seen = new Set<string>()
  const orderedKeys = [...preferredKeys, ...Object.keys(payload)]
  return orderedKeys
    .filter((key) => {
      if (!key || seen.has(key) || !(key in payload)) return false
      seen.add(key)
      const value = payload[key]
      return value != null && value !== '' && (!Array.isArray(value) || value.length > 0)
    })
    .map((key) => ({
      key,
      label: SUMMARY_LABELS[key] || key,
      value: summarizeValue(payload[key]),
    }))
}

function normalizeTraceabilitySections(traceability: Record<string, unknown>) {
  return {
    ontology: (traceability.ontology as Record<string, unknown> | undefined) || {},
    analysis: (traceability.analysis as Record<string, unknown> | undefined) || {},
    execution: (traceability.execution as Record<string, unknown> | undefined) || {},
    sources: (traceability.sources as Record<string, unknown> | undefined) || {},
  }
}

export default function OntologyWorkbench() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const requestedEntity = searchParams.get('entity')
  const [activeTab, setActiveTab] = useState<OntologyTab>(isOntologyTab(requestedTab) ? requestedTab : 'objects')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [isCreatingNew, setIsCreatingNew] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewState, setPreviewState] = useState<'empty' | 'loading' | 'ready' | 'error'>('empty')
  const [previewTitle, setPreviewTitle] = useState('语义投影预览')
  const [previewDescription, setPreviewDescription] = useState('查看当前定义投影到分析语义层后的结果、一致性与执行预览。')
  const [previewContent, setPreviewContent] = useState<Record<string, unknown> | null>(null)
  const [lastPublishResult, setLastPublishResult] = useState<OntologyPublishResponse | null>(null)
  const [lastPublishError, setLastPublishError] = useState<string | null>(null)

  const [objectForm, setObjectForm] = useState<Partial<BusinessObject>>(emptyObjectForm())
  const [propertyForm, setPropertyForm] = useState<Partial<BusinessProperty>>(emptyPropertyForm())
  const [metricForm, setMetricForm] = useState<Partial<BusinessMetric>>(emptyMetricForm())
  const [relationForm, setRelationForm] = useState<Partial<BusinessRelation>>(emptyRelationForm())
  const [actionForm, setActionForm] = useState<Partial<BusinessAction>>(emptyActionForm())
  const [glossaryForm, setGlossaryForm] = useState<Partial<GlossaryEntry>>(emptyGlossaryForm())
  const [policyForm, setPolicyForm] = useState<Partial<PolicyMetadata>>(emptyPolicyForm())

  const objectsQuery = useQuery({
    queryKey: ['ontology', 'objects'],
    queryFn: listBusinessObjects,
  })
  const propertiesQuery = useQuery({
    queryKey: ['ontology', 'properties'],
    queryFn: listBusinessProperties,
  })
  const metricsQuery = useQuery({
    queryKey: ['ontology', 'metrics'],
    queryFn: listBusinessMetrics,
  })
  const relationsQuery = useQuery({
    queryKey: ['ontology', 'relations'],
    queryFn: listBusinessRelations,
  })
  const actionsQuery = useQuery({
    queryKey: ['ontology', 'actions'],
    queryFn: listBusinessActions,
  })
  const glossaryQuery = useQuery({
    queryKey: ['ontology', 'glossary'],
    queryFn: listGlossaryEntries,
  })
  const policiesQuery = useQuery({
    queryKey: ['ontology', 'policies'],
    queryFn: listPolicyMetadata,
  })
  const orderTemplateQuery = useQuery({
    queryKey: ['ontology', 'template', 'order-domain'],
    queryFn: () => getOntologyTemplate('order-domain'),
  })
  const metricLinksQuery = useQuery({
    queryKey: ['ontology', 'metric-links', metricForm.name],
    enabled: activeTab === 'metrics' && !isCreatingNew && Boolean(metricForm.name),
    queryFn: () => getBusinessMetricLinks(metricForm.name || ''),
  })
  const metricCompileQuery = useQuery({
    queryKey: ['ontology', 'metric-compile-preview', metricForm.name],
    enabled: activeTab === 'metrics' && !isCreatingNew && Boolean(metricForm.name),
    queryFn: () => getExecutionCompilePreview(metricForm.name || ''),
  })
  const metricPlanQuery = useQuery({
    queryKey: ['ontology', 'metric-plan-preview', metricForm.name],
    enabled: activeTab === 'metrics' && !isCreatingNew && Boolean(metricForm.name),
    queryFn: () => getExecutionPlanPreview(metricForm.name || ''),
  })
  const objectPreviewQuery = useQuery({
    queryKey: ['ontology', 'object-preview', objectForm.name],
    enabled: activeTab === 'objects' && !isCreatingNew && Boolean(objectForm.name),
    queryFn: () => previewSemanticMapping({ entity_type: 'object', entity_name: objectForm.name || '' }),
  })
  const relationPreviewQuery = useQuery({
    queryKey: ['ontology', 'relation-preview', relationForm.name],
    enabled: activeTab === 'relations' && !isCreatingNew && Boolean(relationForm.name),
    queryFn: () => previewSemanticMapping({ entity_type: 'relation', entity_name: relationForm.name || '' }),
  })
  const actionPreviewQuery = useQuery({
    queryKey: ['ontology', 'action-preview', actionForm.name],
    enabled: activeTab === 'actions' && !isCreatingNew && Boolean(actionForm.name),
    queryFn: () => previewSemanticMapping({ entity_type: 'action', entity_name: actionForm.name || '' }),
  })
  const runtimeQuestion = useMemo(() => {
    if (isCreatingNew) return ''
    if (activeTab === 'metrics' && metricForm.title) return `解释 ${metricForm.title} 口径并查看趋势`
    if (activeTab === 'objects' && objectForm.title) return `查看 ${objectForm.title} 趋势`
    if (activeTab === 'relations' && relationForm.title) return `分析 ${relationForm.title} 关系`
    if (activeTab === 'actions' && actionForm.title) return `触发 ${actionForm.title} 通知`
    return ''
  }, [actionForm.title, activeTab, isCreatingNew, metricForm.title, objectForm.title, relationForm.title])
  const routePreviewQuery = useQuery({
    queryKey: ['ontology', 'runtime-route-preview', activeTab, runtimeQuestion],
    enabled: Boolean(runtimeQuestion),
    queryFn: () => getSemanticRoutePreview(runtimeQuestion, []),
  })
  const planPreviewQuery = useQuery({
    queryKey: ['ontology', 'runtime-plan-preview', activeTab, runtimeQuestion],
    enabled: Boolean(runtimeQuestion),
    queryFn: () => getSemanticPlanPreview(runtimeQuestion, []),
  })
  const metricBacklinksQuery = useQuery({
    queryKey: ['ontology', 'metric-backlinks', metricForm.measure_refs?.join('|') || 'none'],
    enabled: activeTab === 'metrics' && !isCreatingNew && Boolean(metricForm.measure_refs?.length),
    queryFn: async () => {
      const measureRefs = metricForm.measure_refs || []
      const responses = await Promise.all(measureRefs.map((measureRef) => getMeasureBacklinks(measureRef)))
      return {
        data: responses.map((response) => response.data),
      }
    },
  })
  const staleQuery = useQuery({
    queryKey: ['ontology', 'stale-check'],
    queryFn: getSemanticStaleCheck,
  })
  const consistencyQuery = useQuery({
    queryKey: ['ontology', 'consistency-report'],
    queryFn: getSemanticConsistencyReport,
  })

  useEffect(() => {
    if (isOntologyTab(requestedTab) && requestedTab !== activeTab) {
      setActiveTab(requestedTab)
      setIsCreatingNew(false)
    }
  }, [activeTab, requestedTab])

  const payload = useMemo(
    () => ({
      objects: objectsQuery.data?.data.items ?? [],
      properties: propertiesQuery.data?.data.items ?? [],
      metrics: metricsQuery.data?.data.items ?? [],
      relations: relationsQuery.data?.data.items ?? [],
      actions: actionsQuery.data?.data.items ?? [],
      glossary: glossaryQuery.data?.data.items ?? [],
      policies: policiesQuery.data?.data.items ?? [],
    }),
    [objectsQuery.data, propertiesQuery.data, metricsQuery.data, relationsQuery.data, actionsQuery.data, glossaryQuery.data, policiesQuery.data],
  )

  const currentList = useMemo(() => buildEntityList(activeTab, payload), [activeTab, payload])
  const currentEntityType = useMemo(() => mapTabToEntityType(activeTab), [activeTab])
  const currentEntityName = !isCreatingNew ? selectedKey : null
  const currentEntityStatus = currentList.find((item) => item.key === selectedKey)?.status || 'draft'

  const entityImpactQuery = useQuery({
    queryKey: ['ontology', 'entity-impact', currentEntityType, currentEntityName],
    enabled: Boolean(currentEntityName),
    queryFn: () => getOntologyEntityImpact(currentEntityType, currentEntityName || ''),
  })
  const entityHistoryQuery = useQuery({
    queryKey: ['ontology', 'entity-history', currentEntityType, currentEntityName],
    enabled: Boolean(currentEntityName),
    queryFn: () => getOntologyEntityHistory(currentEntityType, currentEntityName || ''),
  })

  useEffect(() => {
    if (currentList.length === 0) {
      setSelectedKey(null)
      setIsCreatingNew(false)
      return
    }
    if (isCreatingNew) {
      return
    }
    if (!selectedKey || !currentList.some((item) => item.key === selectedKey)) {
      setSelectedKey(currentList[0].key)
    }
  }, [activeTab, currentList, isCreatingNew, selectedKey])

  useEffect(() => {
    if (isCreatingNew || !requestedEntity) return
    if (!currentList.some((item) => item.key === requestedEntity)) return
    if (selectedKey !== requestedEntity) {
      setSelectedKey(requestedEntity)
    }
  }, [currentList, isCreatingNew, requestedEntity, selectedKey])

  useEffect(() => {
    if (isCreatingNew) {
      if (activeTab === 'objects') setObjectForm(emptyObjectForm())
      if (activeTab === 'properties') setPropertyForm(emptyPropertyForm())
      if (activeTab === 'metrics') setMetricForm(emptyMetricForm())
      if (activeTab === 'relations') setRelationForm(emptyRelationForm())
      if (activeTab === 'actions') setActionForm(emptyActionForm())
      if (activeTab === 'glossary') setGlossaryForm(emptyGlossaryForm())
      if (activeTab === 'policies') setPolicyForm(emptyPolicyForm())
      return
    }
    if (activeTab === 'objects') {
      const current = payload.objects.find((item) => item.name === selectedKey)
      setObjectForm(current ? { ...current } : emptyObjectForm())
      return
    }
    if (activeTab === 'properties') {
      const current = payload.properties.find((item) => item.name === selectedKey)
      setPropertyForm(current ? { ...current } : emptyPropertyForm())
      return
    }
    if (activeTab === 'metrics') {
      const current = payload.metrics.find((item) => item.name === selectedKey)
      setMetricForm(current ? { ...current } : emptyMetricForm())
      return
    }
    if (activeTab === 'relations') {
      const current = payload.relations.find((item) => item.name === selectedKey)
      setRelationForm(current ? { ...current } : emptyRelationForm())
      return
    }
    if (activeTab === 'actions') {
      const current = payload.actions.find((item) => item.name === selectedKey)
      setActionForm(current ? { ...current } : emptyActionForm())
      return
    }
    if (activeTab === 'policies') {
      const current = payload.policies.find((item) => item.name === selectedKey)
      setPolicyForm(current ? { ...current } : emptyPolicyForm())
      return
    }
    const current = payload.glossary.find((item) => item.canonical_name === selectedKey)
    setGlossaryForm(current ? { ...current } : emptyGlossaryForm())
  }, [activeTab, isCreatingNew, payload, selectedKey])

  useEffect(() => {
    setLastPublishResult(null)
  }, [activeTab, selectedKey, isCreatingNew])

  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    let changed = false

    if (next.get('tab') !== activeTab) {
      next.set('tab', activeTab)
      changed = true
    }

    if (isCreatingNew || !selectedKey) {
      if (next.has('entity')) {
        next.delete('entity')
        changed = true
      }
    } else if (next.get('entity') !== selectedKey) {
      next.set('entity', selectedKey)
      changed = true
    }

    if (changed) {
      setSearchParams(next, { replace: true })
    }
  }, [activeTab, isCreatingNew, searchParams, selectedKey, setSearchParams])

  const saveObjectMutation = useMutation({
    mutationFn: saveBusinessObject,
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ['ontology', 'objects'] })
      setIsCreatingNew(false)
      setSelectedKey(response.data.name)
      toast({ title: '业务对象已保存', description: '对象定义已经更新到业务语义工作台。' })
    },
    onError: (error: unknown) => {
      toast({ title: '保存业务对象失败', description: error instanceof Error ? error.message : '未知错误', variant: 'destructive' })
    },
  })

  const savePropertyMutation = useMutation({
    mutationFn: saveBusinessProperty,
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ['ontology', 'properties'] })
      setIsCreatingNew(false)
      setSelectedKey(response.data.name)
      toast({ title: '业务属性已保存', description: '属性字典已经更新。' })
    },
    onError: (error: unknown) => {
      toast({ title: '保存业务属性失败', description: error instanceof Error ? error.message : '未知错误', variant: 'destructive' })
    },
  })

  const saveMetricMutation = useMutation({
    mutationFn: saveBusinessMetric,
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ['ontology', 'metrics'] })
      await queryClient.invalidateQueries({ queryKey: ['ontology', 'consistency-report'] })
      setIsCreatingNew(false)
      setSelectedKey(response.data.name)
      toast({ title: '业务指标已保存', description: '业务指标定义已经更新，并可用于联邦追踪。' })
    },
    onError: (error: unknown) => {
      toast({ title: '保存业务指标失败', description: error instanceof Error ? error.message : '未知错误', variant: 'destructive' })
    },
  })

  const saveRelationMutation = useMutation({
    mutationFn: saveBusinessRelation,
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ['ontology', 'relations'] })
      await queryClient.invalidateQueries({ queryKey: ['ontology', 'consistency-report'] })
      setIsCreatingNew(false)
      setSelectedKey(response.data.name)
      toast({ title: '业务关系已保存', description: '关系定义已经更新，并进入投影一致性检查。' })
    },
    onError: (error: unknown) => {
      toast({ title: '保存业务关系失败', description: error instanceof Error ? error.message : '未知错误', variant: 'destructive' })
    },
  })

  const saveActionMutation = useMutation({
    mutationFn: saveBusinessAction,
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ['ontology', 'actions'] })
      await queryClient.invalidateQueries({ queryKey: ['ontology', 'stale-check'] })
      setIsCreatingNew(false)
      setSelectedKey(response.data.name)
      toast({ title: '业务动作已保存', description: '动作定义已经更新，并可用于事件事实投影预览。' })
    },
    onError: (error: unknown) => {
      toast({ title: '保存业务动作失败', description: error instanceof Error ? error.message : '未知错误', variant: 'destructive' })
    },
  })

  const saveGlossaryMutation = useMutation({
    mutationFn: saveGlossaryEntry,
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ['ontology', 'glossary'] })
      setIsCreatingNew(false)
      setSelectedKey(response.data.canonical_name)
      toast({ title: '术语已保存', description: '术语和别名词典已经更新。' })
    },
    onError: (error: unknown) => {
      toast({ title: '保存术语失败', description: error instanceof Error ? error.message : '未知错误', variant: 'destructive' })
    },
  })

  const savePolicyMutation = useMutation({
    mutationFn: savePolicyMetadata,
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ['ontology', 'policies'] })
      setIsCreatingNew(false)
      setSelectedKey(response.data.name)
      toast({ title: '语义权限已保存', description: '权限定义已经更新，并会参与语义执行层的最小权限判定。' })
    },
    onError: (error: unknown) => {
      toast({ title: '保存语义权限失败', description: error instanceof Error ? error.message : '未知错误', variant: 'destructive' })
    },
  })

  const applyOrderTemplateMutation = useMutation({
    mutationFn: () => applyOntologyTemplate('order-domain'),
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ontology', 'objects'] }),
        queryClient.invalidateQueries({ queryKey: ['ontology', 'properties'] }),
        queryClient.invalidateQueries({ queryKey: ['ontology', 'metrics'] }),
        queryClient.invalidateQueries({ queryKey: ['ontology', 'relations'] }),
        queryClient.invalidateQueries({ queryKey: ['ontology', 'actions'] }),
        queryClient.invalidateQueries({ queryKey: ['ontology', 'glossary'] }),
        queryClient.invalidateQueries({ queryKey: ['ontology', 'policies'] }),
        queryClient.invalidateQueries({ queryKey: ['ontology', 'stale-check'] }),
        queryClient.invalidateQueries({ queryKey: ['ontology', 'consistency-report'] }),
      ])
      setActiveTab('objects')
      setIsCreatingNew(false)
      toast({
        title: '订单域模板已应用',
        description: `新增 ${response.data.summary.created} 项，跳过 ${response.data.summary.skipped} 项已有资产。`,
      })
    },
    onError: (error: unknown) => {
      toast({
        title: '应用订单域模板失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      })
    },
  })

  const publishEntityMutation = useMutation({
    mutationFn: ({ entityType, entityName }: { entityType: string; entityName: string }) =>
      publishOntologyEntity(entityType, entityName),
    onSuccess: async (response) => {
      setLastPublishError(null)
      setLastPublishResult(response.data)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ontology', currentEntityType] }),
        queryClient.invalidateQueries({ queryKey: ['ontology', 'entity-impact', currentEntityType, currentEntityName] }),
        queryClient.invalidateQueries({ queryKey: ['ontology', 'entity-history', currentEntityType, currentEntityName] }),
        queryClient.invalidateQueries({ queryKey: ['ontology', 'consistency-report'] }),
        queryClient.invalidateQueries({ queryKey: ['ontology', 'stale-check'] }),
      ])
      toast({
        title: '业务语义资产已发布',
        description: '已完成发布校验，并同步刷新影响分析与历史记录。',
      })
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      setLastPublishResult(null)
      setLastPublishError(errorMessage)
      toast({ title: '发布业务语义资产失败', description: errorMessage, variant: 'destructive' })
    },
  })
  const executeSemanticPlanMutation = useMutation({
    mutationFn: ({ question, viewerRoles }: { question: string; viewerRoles?: string[] }) =>
      getSemanticExecutePlan(question, viewerRoles || []),
    onError: (error: unknown) => {
      toast({ title: '执行语义计划失败', description: error instanceof Error ? error.message : '未知错误', variant: 'destructive' })
    },
  })
  const resetSemanticExecution = executeSemanticPlanMutation.reset

  const isSaving =
    saveObjectMutation.isPending ||
    savePropertyMutation.isPending ||
    saveMetricMutation.isPending ||
    saveRelationMutation.isPending ||
    saveActionMutation.isPending ||
    saveGlossaryMutation.isPending ||
    savePolicyMutation.isPending
  const isApplyingTemplate = applyOrderTemplateMutation.isPending
  const isPublishing = publishEntityMutation.isPending
  const isExecutingSemanticPlan = executeSemanticPlanMutation.isPending

  useEffect(() => {
    resetSemanticExecution()
  }, [activeTab, resetSemanticExecution, runtimeQuestion])

  useEffect(() => {
    setLastPublishResult(null)
    setLastPublishError(null)
  }, [activeTab, currentEntityName, isCreatingNew])

  const selectedTitle = currentList.find((item) => item.key === selectedKey)?.title ?? TAB_LABELS[activeTab]

  const handleCreateNew = () => {
    setIsCreatingNew(true)
    setSelectedKey(null)
    if (activeTab === 'objects') setObjectForm(emptyObjectForm())
    if (activeTab === 'properties') setPropertyForm(emptyPropertyForm())
    if (activeTab === 'metrics') setMetricForm(emptyMetricForm())
    if (activeTab === 'relations') setRelationForm(emptyRelationForm())
    if (activeTab === 'actions') setActionForm(emptyActionForm())
    if (activeTab === 'glossary') setGlossaryForm(emptyGlossaryForm())
    if (activeTab === 'policies') setPolicyForm(emptyPolicyForm())
  }

  const handleSave = async () => {
    if (activeTab === 'objects') {
      await saveObjectMutation.mutateAsync(objectForm)
      return
    }
    if (activeTab === 'properties') {
      await savePropertyMutation.mutateAsync(propertyForm)
      return
    }
    if (activeTab === 'metrics') {
      await saveMetricMutation.mutateAsync(metricForm)
      return
    }
    if (activeTab === 'relations') {
      await saveRelationMutation.mutateAsync(relationForm)
      return
    }
    if (activeTab === 'actions') {
      await saveActionMutation.mutateAsync(actionForm)
      return
    }
    if (activeTab === 'glossary') {
      await saveGlossaryMutation.mutateAsync(glossaryForm)
      return
    }
    await savePolicyMutation.mutateAsync(policyForm)
  }

  const handlePublish = async () => {
    if (!currentEntityName || isCreatingNew) return
    try {
      await publishEntityMutation.mutateAsync({
        entityType: currentEntityType,
        entityName: currentEntityName,
      })
    } catch {
      // 发布失败会通过内联反馈和 toast 告知，这里避免按钮事件产生未处理 Promise。
    }
  }

  const openPreview = async () => {
    setPreviewOpen(true)
    setPreviewState('loading')
    setPreviewContent(null)
    setPreviewTitle(`${selectedTitle} · 投影预览`)
    try {
      if (activeTab === 'objects' && objectForm.name) {
        const [projection, consistency] = await Promise.all([
          previewSemanticMapping({ entity_type: 'object', entity_name: objectForm.name }),
          getSemanticConsistencyReport(),
        ])
        setPreviewContent({
          projection: projection.data,
          consistency: consistency.data,
        })
      } else if (activeTab === 'metrics' && metricForm.name) {
        const [projection, links, compilePreview, planPreview] = await Promise.all([
          previewSemanticMapping({ entity_type: 'metric', entity_name: metricForm.name }),
          getBusinessMetricLinks(metricForm.name),
          getExecutionCompilePreview(metricForm.name),
          getExecutionPlanPreview(metricForm.name),
        ])
        setPreviewContent({
          projection: projection.data,
          links: links.data,
          compiler: compilePreview.data,
          plan: planPreview.data,
        })
      } else if (activeTab === 'relations' && relationForm.name) {
        const projection = await previewSemanticMapping({ entity_type: 'relation', entity_name: relationForm.name })
        setPreviewContent({ projection: projection.data })
      } else if (activeTab === 'actions' && actionForm.name) {
        const projection = await previewSemanticMapping({ entity_type: 'action', entity_name: actionForm.name })
        setPreviewContent({ projection: projection.data })
      } else if (activeTab === 'policies' && policyForm.name) {
        setPreviewContent({
          policy: policyForm,
          governance: {
            target_type: policyForm.target_type,
            target_name: policyForm.target_name,
            visibility: policyForm.visibility,
            allowed_roles: policyForm.allowed_roles || [],
            mode: 'router-compiler-guard-preview',
          },
        })
      } else if (activeTab === 'glossary' && glossaryForm.canonical_name) {
        const projection = await previewSemanticMapping({ entity_type: 'glossary', entity_name: glossaryForm.canonical_name })
        setPreviewContent({ projection: projection.data })
      } else {
        setPreviewContent({
          consistency: consistencyQuery.data?.data,
          stale: staleQuery.data?.data,
        })
      }
      setPreviewState('ready')
    } catch (error) {
      setPreviewState('error')
      setPreviewDescription(error instanceof Error ? error.message : '预览加载失败')
    }
  }

  const summaryCards = [
    { label: '对象', value: payload.objects.length, icon: Box },
    { label: '属性', value: payload.properties.length, icon: Shapes },
    { label: '业务指标', value: payload.metrics.length, icon: Sparkles },
    { label: '关系', value: payload.relations.length, icon: GitCompareArrows },
    { label: '动作', value: payload.actions.length, icon: Database },
    { label: '术语', value: payload.glossary.length, icon: BookOpen },
    { label: '权限', value: payload.policies.length, icon: CheckCircle2 },
  ]

  const staleCount = Number(staleQuery.data?.data.summary?.stale_count ?? 0)
  const issueCount = Number(consistencyQuery.data?.data.summary?.issue_count ?? 0)
  const staleItems = Array.isArray(staleQuery.data?.data.items) ? staleQuery.data?.data.items : []
  const consistencyItems = Array.isArray(consistencyQuery.data?.data.items) ? consistencyQuery.data?.data.items : []
  const impactItems = useMemo(() => {
    const merged = new Map<string, Record<string, unknown>>()
    ;[...staleItems, ...consistencyItems].forEach((item) => {
      const entityType = String(item.entity_type || 'unknown')
      const entityName = String(item.entity_name || 'unknown')
      const key = `${entityType}:${entityName}`
      if (!merged.has(key)) {
        merged.set(key, item)
      }
    })
    return Array.from(merged.values())
  }, [consistencyItems, staleItems])
  const orderTemplateSummary = orderTemplateQuery.data?.data as OntologyTemplateResponse | undefined

  const focusEntity = useCallback((entityType?: string | null, entityName?: string | null) => {
    const nextTab = mapEntityTypeToTab(entityType)
    if (!nextTab || !entityName) return
    setIsCreatingNew(false)
    setActiveTab(nextTab)
    setSelectedKey(entityName)
  }, [])

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[280px] min-h-0 flex-col border-r border-slate-200 bg-white">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as OntologyTab)}>
            <div className="border-b border-slate-200 px-3 py-3">
              <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
                {ONTOLOGY_TABS.map((tab) => (
                  <TabsTrigger key={tab} value={tab} className="px-2 py-1 text-xs data-[state=active]:bg-sky-50 data-[state=active]:text-sky-700">
                    {TAB_LABELS[tab]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              {ONTOLOGY_TABS.map((tab) => (
                <TabsContent key={tab} value={tab} className="mt-0">
                  <EntityList
                    items={buildEntityList(tab, payload)}
                    selectedKey={selectedKey}
                    onSelect={(key) => {
                      setIsCreatingNew(false)
                      setSelectedKey(key)
                    }}
                  />
                </TabsContent>
              ))}
            </div>
          </Tabs>
          <div className="border-t border-slate-200 px-3 py-3 space-y-1.5">
            <button
              type="button"
              onClick={() => focusEntity(impactItems[0]?.entity_type as string | undefined, impactItems[0]?.entity_name as string | undefined)}
              disabled={impactItems.length === 0}
              className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-amber-800 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span>待处理告警</span>
              <Badge variant="outline" className="border-amber-200 text-amber-700">{staleCount}</Badge>
            </button>
            <button
              type="button"
              onClick={() => focusEntity(impactItems[0]?.entity_type as string | undefined, impactItems[0]?.entity_name as string | undefined)}
              disabled={impactItems.length === 0}
              className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span>一致性问题</span>
              <Badge variant="outline">{issueCount}</Badge>
            </button>
          </div>
        </aside>

        <main className="flex min-h-0 flex-1 flex-col">
          <div className="flex h-14 items-center border-b border-slate-200 px-5">
            <div className="flex flex-1 items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                  <FolderGit2 className="h-3.5 w-3.5" />
                  <span>业务语义工作台</span>
                  <ChevronRight className="h-3 w-3" />
                  <span>{TAB_LABELS[activeTab]}</span>
                </div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-semibold text-slate-950">{selectedTitle}</h1>
                  {selectedKey && !isCreatingNew ? (
                    <Badge variant="outline">{STATUS_LABELS[(currentList.find((item) => item.key === selectedKey)?.status || 'draft')] || '草稿'}</Badge>
                  ) : (
                    <Badge variant="secondary">新建</Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <FormButton variant="outline" size="sm" onClick={() => applyOrderTemplateMutation.mutate()} disabled={isApplyingTemplate}>
                  {isApplyingTemplate ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FolderGit2 className="mr-1.5 h-3.5 w-3.5" />}
                  应用订单域模板
                </FormButton>
                <FormButton variant="secondary" size="sm" onClick={handleCreateNew}>新建 {TAB_LABELS[activeTab]}</FormButton>
                <FormButton variant="outline" size="sm" onClick={openPreview}>
                  <PanelRight className="mr-1.5 h-3.5 w-3.5" />
                  查看投影预览
                </FormButton>
                <FormButton variant="outline" size="sm" onClick={handlePublish} disabled={isPublishing || isCreatingNew || !currentEntityName}>
                  {isPublishing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileCode2 className="mr-1.5 h-3.5 w-3.5" />}
                  发布资产
                </FormButton>
                <FormButton size="sm" onClick={handleSave} disabled={isSaving}>
                  {isSaving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                  保存定义
                </FormButton>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {orderTemplateSummary ? (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
                <div className="font-medium">{orderTemplateSummary.title}</div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-amber-800">
                  <span>对象 {orderTemplateSummary.summary.objects}</span>
                  <span>属性 {orderTemplateSummary.summary.properties}</span>
                  <span>指标 {orderTemplateSummary.summary.metrics}</span>
                  <span>关系 {orderTemplateSummary.summary.relations}</span>
                  <span>动作 {orderTemplateSummary.summary.actions}</span>
                  <span>术语 {orderTemplateSummary.summary.glossary}</span>
                  <span>权限 {orderTemplateSummary.summary.policies}</span>
                </div>
              </div>
            ) : null}

            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-white p-5">
              {activeTab === 'objects' ? (
                <ObjectForm form={objectForm} onChange={setObjectForm} />
              ) : activeTab === 'properties' ? (
                <PropertyForm form={propertyForm} objectOptions={payload.objects} onChange={setPropertyForm} />
              ) : activeTab === 'metrics' ? (
                <MetricForm form={metricForm} objectOptions={payload.objects} onChange={setMetricForm} />
              ) : activeTab === 'relations' ? (
                <RelationForm form={relationForm} objectOptions={payload.objects} onChange={setRelationForm} />
              ) : activeTab === 'actions' ? (
                <ActionForm form={actionForm} objectOptions={payload.objects} onChange={setActionForm} />
              ) : activeTab === 'glossary' ? (
                <GlossaryForm form={glossaryForm} onChange={setGlossaryForm} />
              ) : (
                <PolicyForm
                  form={policyForm}
                  objectOptions={payload.objects}
                  propertyOptions={payload.properties}
                  metricOptions={payload.metrics}
                  actionOptions={payload.actions}
                  onChange={setPolicyForm}
                />
              )}
            </div>

            <AdvancedSection
              title="平台告警与影响"
              description="统一查看当前语义资产与分析层之间的失效告警和影响范围，需要处理时再展开定位。"
              summary={`${impactItems.length} 项待处理`}
            >
              <StaleImpactPanel items={impactItems} onSelect={focusEntity} />
            </AdvancedSection>

            {activeTab === 'objects' ? (
              <>
                <AdvancedSection
                  title="对象投影与运行验证"
                  description="需要确认对象会落到哪些分析实体、以及运行时会走哪条链路时，再展开查看。"
                  summary={`投影 ${Array.isArray(objectPreviewQuery.data?.data?.projection?.targets) ? objectPreviewQuery.data?.data?.projection?.targets.length : 0} 项`}
                >
                  <div className="space-y-5">
                    <ObjectProjectionPanel
                      objectEntity={objectForm}
                      preview={objectPreviewQuery.data?.data}
                      isLoading={objectPreviewQuery.isLoading}
                    />
                    <SemanticRouteRuntimePanel
                      title={objectForm.title || objectForm.name || '当前对象'}
                      question={runtimeQuestion}
                      route={routePreviewQuery.data?.data}
                      plan={planPreviewQuery.data?.data}
                      execution={executeSemanticPlanMutation.data?.data}
                      isLoading={routePreviewQuery.isLoading || planPreviewQuery.isLoading}
                      isExecuting={isExecutingSemanticPlan}
                      onExecute={() => executeSemanticPlanMutation.mutate({ question: runtimeQuestion, viewerRoles: [] })}
                    />
                  </div>
                </AdvancedSection>
              </>
            ) : null}

            {activeTab === 'metrics' ? (
              <>
                <AdvancedSection
                  title="指标验证与联动"
                  description="需要确认指标落到哪些 Measure、运行时怎么走、执行是否可用时，再展开查看。"
                  summary={`Measure ${Array.isArray(metricLinksQuery.data?.data?.linked_measures) ? metricLinksQuery.data?.data?.linked_measures.length : 0} 个`}
                >
                  <div className="space-y-5">
                    <MetricFederationPanel
                      metric={metricForm}
                      links={metricLinksQuery.data?.data}
                      backlinks={metricBacklinksQuery.data?.data ?? []}
                      isLoading={metricLinksQuery.isLoading || metricBacklinksQuery.isLoading}
                    />
                    <ExecutionCompilePanel
                      title="执行验证"
                      description="统一查看当前业务指标在执行层中的执行预览结果、约束状态和执行计划。"
                      entries={[
                        {
                          key: metricForm.name || 'current-metric',
                          label: metricForm.title || metricForm.name || '当前业务指标',
                          compiler: metricCompileQuery.data?.data,
                          plan: metricPlanQuery.data?.data,
                          loading: metricCompileQuery.isLoading || metricPlanQuery.isLoading,
                        },
                      ]}
                      emptyMessage="当前业务指标还没有可展示的执行验证结果。"
                    />
                    <SemanticRouteRuntimePanel
                      title={metricForm.title || metricForm.name || '当前业务指标'}
                      question={runtimeQuestion}
                      route={routePreviewQuery.data?.data}
                      plan={planPreviewQuery.data?.data}
                      execution={executeSemanticPlanMutation.data?.data}
                      isLoading={routePreviewQuery.isLoading || planPreviewQuery.isLoading}
                      isExecuting={isExecutingSemanticPlan}
                      onExecute={() => executeSemanticPlanMutation.mutate({ question: runtimeQuestion, viewerRoles: [] })}
                    />
                  </div>
                </AdvancedSection>
              </>
            ) : activeTab === 'relations' ? (
              <>
                <AdvancedSection
                  title="关系投影与运行验证"
                  description="需要确认关系是否能稳定映射到 Join Path，以及运行时如何解释时，再展开查看。"
                  summary={`Join Path ${Array.isArray(relationPreviewQuery.data?.data?.projection?.targets) ? relationPreviewQuery.data?.data?.projection?.targets.length : 0} 条`}
                >
                  <div className="space-y-5">
                    <RelationProjectionPanel
                      relation={relationForm}
                      preview={relationPreviewQuery.data?.data}
                      isLoading={relationPreviewQuery.isLoading}
                    />
                    <SemanticRouteRuntimePanel
                      title={relationForm.title || relationForm.name || '当前关系'}
                      question={runtimeQuestion}
                      route={routePreviewQuery.data?.data}
                      plan={planPreviewQuery.data?.data}
                      execution={executeSemanticPlanMutation.data?.data}
                      isLoading={routePreviewQuery.isLoading || planPreviewQuery.isLoading}
                      isExecuting={isExecutingSemanticPlan}
                      onExecute={() => executeSemanticPlanMutation.mutate({ question: runtimeQuestion, viewerRoles: [] })}
                    />
                  </div>
                </AdvancedSection>
              </>
            ) : activeTab === 'actions' ? (
              <>
                <AdvancedSection
                  title="动作投影与运行验证"
                  description="需要确认动作是否能形成事件事实语义，以及运行时是否会进入工具或分析链路时，再展开查看。"
                  summary={`事件投影 ${Array.isArray(actionPreviewQuery.data?.data?.projection?.targets) ? actionPreviewQuery.data?.data?.projection?.targets.length : 0} 项`}
                >
                  <div className="space-y-5">
                    <ActionProjectionPanel
                      action={actionForm}
                      preview={actionPreviewQuery.data?.data}
                      isLoading={actionPreviewQuery.isLoading}
                    />
                    <SemanticRouteRuntimePanel
                      title={actionForm.title || actionForm.name || '当前动作'}
                      question={runtimeQuestion}
                      route={routePreviewQuery.data?.data}
                      plan={planPreviewQuery.data?.data}
                      execution={executeSemanticPlanMutation.data?.data}
                      isLoading={routePreviewQuery.isLoading || planPreviewQuery.isLoading}
                      isExecuting={isExecutingSemanticPlan}
                      onExecute={() => executeSemanticPlanMutation.mutate({ question: runtimeQuestion, viewerRoles: [] })}
                    />
                  </div>
                </AdvancedSection>
              </>
            ) : activeTab === 'policies' ? (
              <AdvancedSection
                title="治理验证与审计"
                description="需要确认权限影响范围、治理挂点和最近审计记录时，再展开查看。"
                summary={`${policyForm.visibility || 'restricted'} · ${policyForm.target_name || '未绑定目标'}`}
              >
                <PolicyGovernancePanel
                  policy={policyForm}
                  objects={payload.objects}
                  properties={payload.properties}
                  metrics={payload.metrics}
                  actions={payload.actions}
                  canRunRuntimePreview={!isCreatingNew && Boolean(selectedKey)}
                />
              </AdvancedSection>
            ) : null}
            </div>
          </div>
        </main>

        <aside className="flex w-[300px] min-h-0 flex-col border-l border-slate-200 bg-slate-50/70" data-testid="ontology-inspector-pane">
          <div className="border-b border-slate-200 px-5 py-4">
            <div className="text-sm font-semibold text-slate-900">属性检查器</div>
            {currentEntityName && (
              <div className="mt-1 text-xs text-slate-500">
                {TAB_LABELS[activeTab]} · {currentEntityName}
              </div>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {currentEntityName ? (
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wider text-slate-400">标识</div>
                  <div className="mt-1 font-mono text-sm text-slate-900">{currentEntityName}</div>
                </div>
                <div className="h-px bg-slate-200" />
                <div>
                  <div className="text-xs font-medium uppercase tracking-wider text-slate-400">状态</div>
                  <div className="mt-1"><Badge variant="outline">{STATUS_LABELS[currentEntityStatus] || currentEntityStatus}</Badge></div>
                </div>
                <div className="h-px bg-slate-200" />
                <EntityLifecyclePanel
                  entityType={currentEntityType}
                  entityName={currentEntityName}
                  entityStatus={currentEntityStatus}
                  impact={entityImpactQuery.data?.data}
                  historyItems={entityHistoryQuery.data?.data.items ?? []}
                  lastPublishResult={lastPublishResult}
                  lastPublishError={lastPublishError}
                  isImpactLoading={entityImpactQuery.isLoading}
                  isHistoryLoading={entityHistoryQuery.isLoading}
                />
                <div className="h-px bg-slate-200" />
                <div>
                  <div className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">语义资产概览</div>
                  <div className="space-y-1.5">
                    {summaryCards.map(({ label, value, icon: Icon }) => (
                      <div key={label} className="flex items-center justify-between py-1">
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Icon className="h-3.5 w-3.5" />
                          {label}
                        </div>
                        <span className="text-sm font-semibold tabular-nums text-slate-900">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
                  选择一个实体开始编辑，属性和生命周期信息会显示在这里。
                </div>
                <div>
                  <div className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">语义资产概览</div>
                  <div className="space-y-1.5">
                    {summaryCards.map(({ label, value, icon: Icon }) => (
                      <div key={label} className="flex items-center justify-between py-1">
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Icon className="h-3.5 w-3.5" />
                          {label}
                        </div>
                        <span className="text-sm font-semibold tabular-nums text-slate-900">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      <PageDrawer
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title={previewTitle}
        description={previewDescription}
        width={560}
      >
        {previewState === 'ready' ? (
          <PreviewPanel
            title="执行预览与一致性"
            description="预览投影目标、联邦追踪与执行预览，确保业务语义定义不会演变成第三真相源。"
            state="ready"
            bodyClassName="space-y-5"
          >
            {previewContent ? <PreviewContent payload={previewContent} /> : null}
          </PreviewPanel>
        ) : previewState === 'loading' ? (
          <PreviewPanel
            title="执行预览与一致性"
            description="预览投影目标、联邦追踪与执行预览，确保业务语义定义不会演变成第三真相源。"
            state="loading"
            bodyClassName="space-y-5"
          />
        ) : previewState === 'error' ? (
          <PreviewPanel
            title="执行预览与一致性"
            description="预览投影目标、联邦追踪与执行预览，确保业务语义定义不会演变成第三真相源。"
            state="error"
            errorDescription={previewDescription}
            bodyClassName="space-y-5"
          />
        ) : (
          <PreviewPanel
            title="执行预览与一致性"
            description="预览投影目标、联邦追踪与执行预览，确保业务语义定义不会演变成第三真相源。"
            state="empty"
            emptyDescription="请选择对象、属性、业务指标或术语后查看语义投影预览。"
            bodyClassName="space-y-5"
          />
        )}
      </PageDrawer>
    </div>
  )
}

function EntityList({
  items,
  selectedKey,
  onSelect,
}: {
  items: EntityListItem[]
  selectedKey: string | null
  onSelect: (key: string) => void
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
        当前还没有定义，先在右侧创建第一条语义资产。
      </div>
    )
  }

  return (
    <div className="space-y-0.5">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onSelect(item.key)}
          className={cn(
            'w-full rounded-md px-3 py-2 text-left transition-colors cursor-pointer',
            selectedKey === item.key
              ? 'border-l-2 border-sky-600 bg-sky-50 font-medium text-sky-700'
              : 'text-slate-700 hover:bg-slate-50',
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{item.title}</div>
              <div className="truncate text-xs text-slate-500">{item.subtitle}</div>
            </div>
            {item.status ? <Badge variant="outline" className="shrink-0 text-[10px]">{STATUS_LABELS[item.status] || item.status}</Badge> : null}
          </div>
        </button>
      ))}
    </div>
  )
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <p className="text-xs leading-5 text-slate-500">{description}</p>
      </div>
      {children}
    </section>
  )
}

function AdvancedSection({
  title,
  description,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string
  description: string
  summary: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  return (
    <details
      open={defaultOpen}
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>
        </div>
        <Badge variant="outline">{summary}</Badge>
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  )
}

function ObjectForm({
  form,
  onChange,
}: {
  form: Partial<BusinessObject>
  onChange: (value: Partial<BusinessObject>) => void
}) {
  return (
    <div className="space-y-8">
      <FormSection title="业务对象定义" description="定义企业业务主语，后续可被投影为 Cube、View 或其他分析实体。">
        <div className="grid gap-4 md:grid-cols-2">
          <FormInput value={form.title || ''} onChange={(e) => onChange({ ...form, title: e.target.value })} placeholder="对象标题，例如 订单" />
          <FormInput value={form.name || ''} onChange={(e) => onChange({ ...form, name: e.target.value })} placeholder="对象标识，例如 order" />
        </div>
        <FormTextarea value={form.description || ''} onChange={(e) => onChange({ ...form, description: e.target.value })} placeholder="描述这个对象在业务世界中的含义。" rows={4} />
        <FormInput
          value={(form.aliases || []).join(', ')}
          onChange={(e) => onChange({ ...form, aliases: splitCommaText(e.target.value) })}
          placeholder="别名，多个用逗号分隔"
        />
      </FormSection>
    </div>
  )
}

function PropertyForm({
  form,
  objectOptions,
  onChange,
}: {
  form: Partial<BusinessProperty>
  objectOptions: BusinessObject[]
  onChange: (value: Partial<BusinessProperty>) => void
}) {
  return (
    <div className="space-y-8">
      <FormSection title="业务属性字典" description="维护跨对象可复用的标准属性，并标明其归属对象与属性类型。">
        <div className="grid gap-4 md:grid-cols-2">
          <FormInput value={form.title || ''} onChange={(e) => onChange({ ...form, title: e.target.value })} placeholder="属性标题，例如 支付金额" />
          <FormInput value={form.name || ''} onChange={(e) => onChange({ ...form, name: e.target.value })} placeholder="属性标识，例如 payment_amount" />
          <Input
            list="ontology-object-options"
            value={form.object_name || ''}
            onChange={(e) => onChange({ ...form, object_name: e.target.value })}
            placeholder="归属对象，例如 order"
          />
          <FormInput
            value={form.property_type || 'unknown'}
            onChange={(e) => onChange({ ...form, property_type: e.target.value as BusinessProperty['property_type'] })}
            placeholder="属性类型，例如 number / time"
          />
        </div>
        <datalist id="ontology-object-options">
          {objectOptions.map((item) => (
            <option key={item.name} value={item.name}>
              {item.title}
            </option>
          ))}
        </datalist>
        <FormTextarea value={form.description || ''} onChange={(e) => onChange({ ...form, description: e.target.value })} placeholder="补充属性定义、取值含义和展示约束。" rows={4} />
        <FormInput
          value={(form.aliases || []).join(', ')}
          onChange={(e) => onChange({ ...form, aliases: splitCommaText(e.target.value) })}
          placeholder="属性别名，多个用逗号分隔"
        />
      </FormSection>
    </div>
  )
}

function MetricForm({
  form,
  objectOptions,
  onChange,
}: {
  form: Partial<BusinessMetric>
  objectOptions: BusinessObject[]
  onChange: (value: Partial<BusinessMetric>) => void
}) {
  return (
    <div className="space-y-8">
      <FormSection title="业务指标定义" description="指标在业务语义层承载语义公式和业务口径，不直接承载 SQL 或执行表达式。">
        <div className="grid gap-4 md:grid-cols-2">
          <FormInput value={form.title || ''} onChange={(e) => onChange({ ...form, title: e.target.value })} placeholder="指标标题，例如 GMV" />
          <FormInput value={form.name || ''} onChange={(e) => onChange({ ...form, name: e.target.value })} placeholder="指标标识，例如 gmv" />
          <Input
            list="ontology-metric-object-options"
            value={form.object_name || ''}
            onChange={(e) => onChange({ ...form, object_name: e.target.value })}
            placeholder="归属对象，例如 order"
          />
          <FormInput
            value={(form.semantic_labels || []).join(', ')}
            onChange={(e) => onChange({ ...form, semantic_labels: splitCommaText(e.target.value) })}
            placeholder="语义标签，例如 经营分析, 成交"
          />
        </div>
        <datalist id="ontology-metric-object-options">
          {objectOptions.map((item) => (
            <option key={item.name} value={item.name}>
              {item.title}
            </option>
          ))}
        </datalist>
        <FormTextarea
          value={form.semantic_formula || ''}
          onChange={(e) => onChange({ ...form, semantic_formula: e.target.value })}
          placeholder="语义公式，例如 已支付订单金额之和，不含退款。"
          rows={4}
        />
        <FormTextarea
          value={form.description || ''}
          onChange={(e) => onChange({ ...form, description: e.target.value })}
          placeholder="补充业务口径、时间语义和边界条件。"
          rows={4}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <FormInput
            value={(form.measure_refs || []).join(', ')}
            onChange={(e) => onChange({ ...form, measure_refs: splitCommaText(e.target.value) })}
            placeholder="关联 Measure，例如 orders.gmv"
          />
          <FormInput
            value={(form.aliases || []).join(', ')}
            onChange={(e) => onChange({ ...form, aliases: splitCommaText(e.target.value) })}
            placeholder="业务别名，多个用逗号分隔"
          />
        </div>
      </FormSection>
    </div>
  )
}

function RelationForm({
  form,
  objectOptions,
  onChange,
}: {
  form: Partial<BusinessRelation>
  objectOptions: BusinessObject[]
  onChange: (value: Partial<BusinessRelation>) => void
}) {
  return (
    <div className="space-y-8">
      <FormSection title="业务关系定义" description="描述对象之间的业务语义关系，并预览它如何投影到分析 Join Path。">
        <div className="grid gap-4 md:grid-cols-2">
          <FormInput value={form.title || ''} onChange={(e) => onChange({ ...form, title: e.target.value })} placeholder="关系标题，例如 客户下单" />
          <FormInput value={form.name || ''} onChange={(e) => onChange({ ...form, name: e.target.value })} placeholder="关系标识，例如 customer_submits_order" />
          <Input
            list="ontology-relation-source-options"
            value={form.source_object_name || ''}
            onChange={(e) => onChange({ ...form, source_object_name: e.target.value })}
            placeholder="起始对象，例如 customer"
          />
          <Input
            list="ontology-relation-target-options"
            value={form.target_object_name || ''}
            onChange={(e) => onChange({ ...form, target_object_name: e.target.value })}
            placeholder="目标对象，例如 order"
          />
          <FormInput
            value={form.relation_type ?? ''}
            onChange={(e) => onChange({ ...form, relation_type: e.target.value as BusinessRelation['relation_type'] })}
            placeholder="关系类型，例如 submits / belongs_to"
          />
          <FormInput
            value={(form.aliases || []).join(', ')}
            onChange={(e) => onChange({ ...form, aliases: splitCommaText(e.target.value) })}
            placeholder="关系别名，多个用逗号分隔"
          />
        </div>
        <datalist id="ontology-relation-source-options">
          {objectOptions.map((item) => (
            <option key={item.name} value={item.name}>
              {item.title}
            </option>
          ))}
        </datalist>
        <datalist id="ontology-relation-target-options">
          {objectOptions.map((item) => (
            <option key={item.name} value={item.name}>
              {item.title}
            </option>
          ))}
        </datalist>
        <FormTextarea
          value={form.description || ''}
          onChange={(e) => onChange({ ...form, description: e.target.value })}
          placeholder="说明该关系在业务上的成立条件和方向。"
          rows={4}
        />
      </FormSection>
    </div>
  )
}

function ActionForm({
  form,
  objectOptions,
  onChange,
}: {
  form: Partial<BusinessAction>
  objectOptions: BusinessObject[]
  onChange: (value: Partial<BusinessAction>) => void
}) {
  return (
    <div className="space-y-8">
      <FormSection title="业务动作定义" description="定义业务行为或事件，并查看它是否能投影为事件事实语义。">
        <div className="grid gap-4 md:grid-cols-2">
          <FormInput value={form.title || ''} onChange={(e) => onChange({ ...form, title: e.target.value })} placeholder="动作标题，例如 支付" />
          <FormInput value={form.name || ''} onChange={(e) => onChange({ ...form, name: e.target.value })} placeholder="动作标识，例如 pay" />
          <Input
            list="ontology-action-object-options"
            value={form.object_name || ''}
            onChange={(e) => onChange({ ...form, object_name: e.target.value })}
            placeholder="归属对象，例如 order"
          />
          <FormInput
            value={form.trigger_time_property || ''}
            onChange={(e) => onChange({ ...form, trigger_time_property: e.target.value })}
            placeholder="触发时间属性，例如 pay_time"
          />
        </div>
        <datalist id="ontology-action-object-options">
          {objectOptions.map((item) => (
            <option key={item.name} value={item.name}>
              {item.title}
            </option>
          ))}
        </datalist>
        <FormTextarea
          value={form.description || ''}
          onChange={(e) => onChange({ ...form, description: e.target.value })}
          placeholder="说明该动作何时发生、作用于什么对象。"
          rows={4}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <FormInput
            value={(form.event_cube_refs || []).join(', ')}
            onChange={(e) => onChange({ ...form, event_cube_refs: splitCommaText(e.target.value) })}
            placeholder="关联事件 Cube，例如 refund_orders"
          />
          <FormInput
            value={(form.aliases || []).join(', ')}
            onChange={(e) => onChange({ ...form, aliases: splitCommaText(e.target.value) })}
            placeholder="动作别名，多个用逗号分隔"
          />
        </div>
      </FormSection>
    </div>
  )
}

function GlossaryForm({
  form,
  onChange,
}: {
  form: Partial<GlossaryEntry>
  onChange: (value: Partial<GlossaryEntry>) => void
}) {
  return (
    <div className="space-y-8">
      <FormSection title="术语与别名" description="维护术语、别名与规范名，让 Agent、问数和业务人员优先围绕标准语义理解问题。">
        <div className="grid gap-4 md:grid-cols-2">
          <FormInput value={form.term || ''} onChange={(e) => onChange({ ...form, term: e.target.value })} placeholder="术语，例如 成交额" />
          <FormInput
            value={form.canonical_name || ''}
            onChange={(e) => onChange({ ...form, canonical_name: e.target.value })}
            placeholder="规范名，例如 gmv"
          />
          <FormInput
            value={form.entry_type || 'term'}
            onChange={(e) => onChange({ ...form, entry_type: e.target.value as GlossaryEntry['entry_type'] })}
            placeholder="类型，例如 metric / object"
          />
          <FormInput
            value={(form.aliases || []).join(', ')}
            onChange={(e) => onChange({ ...form, aliases: splitCommaText(e.target.value) })}
            placeholder="别名，多个用逗号分隔"
          />
        </div>
        <FormTextarea value={form.description || ''} onChange={(e) => onChange({ ...form, description: e.target.value })} placeholder="说明术语的业务含义和适用语境。" rows={4} />
      </FormSection>
    </div>
  )
}

function PolicyForm({
  form,
  objectOptions,
  propertyOptions,
  metricOptions,
  actionOptions,
  onChange,
}: {
  form: Partial<PolicyMetadata>
  objectOptions: BusinessObject[]
  propertyOptions: BusinessProperty[]
  metricOptions: BusinessMetric[]
  actionOptions: BusinessAction[]
  onChange: (value: Partial<PolicyMetadata>) => void
}) {
  const targetOptions =
    form.target_type === 'property'
      ? propertyOptions.map((item) => ({ name: item.name, title: item.title }))
      : form.target_type === 'metric'
        ? metricOptions.map((item) => ({ name: item.name, title: item.title }))
        : form.target_type === 'action'
          ? actionOptions.map((item) => ({ name: item.name, title: item.title }))
          : objectOptions.map((item) => ({ name: item.name, title: item.title }))

  return (
    <div className="space-y-8">
      <FormSection title="语义权限" description="定义对象、属性、业务指标或动作的最小可见性，供语义执行层做访问阻断。">
        <div className="grid gap-4 md:grid-cols-2">
          <FormInput value={form.name || ''} onChange={(e) => onChange({ ...form, name: e.target.value })} placeholder="权限标识，例如 gmv_policy" />
          <FormInput
            value={form.visibility || 'restricted'}
            onChange={(e) => onChange({ ...form, visibility: e.target.value as PolicyMetadata['visibility'] })}
            placeholder="可见性，例如 public / restricted / private"
          />
          <FormInput
            value={form.target_type || 'object'}
            onChange={(e) => onChange({ ...form, target_type: e.target.value as PolicyMetadata['target_type'], target_name: '' })}
            placeholder="目标类型，例如 object / metric"
          />
          <Input
            list="ontology-policy-target-options"
            value={form.target_name || ''}
            onChange={(e) => onChange({ ...form, target_name: e.target.value })}
            placeholder="目标名称，例如 gmv / order"
          />
        </div>
        <datalist id="ontology-policy-target-options">
          {targetOptions.map((item) => (
            <option key={item.name} value={item.name}>
              {item.title}
            </option>
          ))}
        </datalist>
        <FormInput
          value={(form.allowed_roles || []).join(', ')}
          onChange={(e) => onChange({ ...form, allowed_roles: splitCommaText(e.target.value) })}
          placeholder="授权角色，多个用逗号分隔，例如 finance, admin"
        />
        <FormTextarea
          value={form.description || ''}
          onChange={(e) => onChange({ ...form, description: e.target.value })}
          placeholder="说明该语义权限影响的范围和业务原因。"
          rows={4}
        />
      </FormSection>
    </div>
  )
}

function PreviewContent({ payload }: { payload: Record<string, unknown> }) {
  const projection = payload.projection as Record<string, any> | undefined
  const links = payload.links as Record<string, any> | undefined
  const compiler = payload.compiler as Record<string, any> | undefined
  const consistency = payload.consistency as Record<string, any> | undefined
  const stale = payload.stale as Record<string, any> | undefined
  const governance = payload.governance as Record<string, any> | undefined

  return (
    <div className="space-y-5">
      {governance ? (
        <section className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
            <CheckCircle2 className="h-4 w-4 text-sky-600" />
            权限挂点预览
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
              <div className="font-medium text-slate-950">{String(governance.target_name || '未绑定目标')}</div>
              <div className="mt-1 text-xs text-slate-500">
                {String(governance.target_type || 'object')} · {String(governance.visibility || 'restricted')}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
              <div className="font-medium text-slate-950">允许角色</div>
              <div className="mt-1 text-xs text-slate-500">
                {Array.isArray(governance.allowed_roles) && governance.allowed_roles.length > 0
                  ? governance.allowed_roles.join(', ')
                  : '未指定，默认仅 public 可匿名访问'}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {projection ? (
        <section className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
            <GitCompareArrows className="h-4 w-4 text-sky-600" />
            只读投影
          </div>
          <div className="mt-3 space-y-2">
            {(projection.projection?.targets || []).length > 0 ? (
              (projection.projection?.targets || []).map((target: Record<string, unknown>) => (
                <div key={String(target.target_name)} className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
                  <div className="font-medium text-slate-950">{String(target.target_name)}</div>
                  <div className="mt-1 text-xs text-slate-500">{String(target.match_reason || target.target_type || '')}</div>
                  {'join_path' in target && target.join_path ? (
                    <div className="mt-1 text-xs text-slate-500">Join Path：{String(target.join_path)}</div>
                  ) : null}
                  {'source_cube' in target && 'target_cube' in target && target.source_cube && target.target_cube ? (
                    <div className="mt-1 text-xs text-slate-500">
                      {String(target.source_cube)} → {String(target.target_cube)}
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">
                当前定义还没有找到明确的分析语义投影目标。
              </div>
            )}
          </div>
        </section>
      ) : null}

      {links ? (
        <section className="rounded-lg border border-slate-200 bg-white px-3 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
            <Database className="h-4 w-4 text-sky-600" />
            指标联邦追踪
          </div>
          <div className="mt-3 space-y-2 text-sm text-slate-600">
            {Array.isArray(links.linked_measures) && links.linked_measures.length > 0 ? (
              links.linked_measures.map((item: Record<string, unknown>) => (
                <div key={String(item.measure_ref)} className="rounded-xl bg-slate-50 px-3 py-3">
                  <div className="font-medium text-slate-950">{String(item.measure_ref)}</div>
                  <div className="mt-1 text-xs text-slate-500">{String(item.cube_title || item.status || '')}</div>
                </div>
              ))
            ) : (
              <div className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-500">当前业务指标尚未绑定分析 Measure。</div>
            )}
          </div>
        </section>
      ) : null}

      {compiler ? (
        <section className="rounded-lg border border-slate-200 bg-white px-3 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
            <FileCode2 className="h-4 w-4 text-sky-600" />
            最小执行预览
          </div>
          <div className="mt-3 rounded-xl bg-[#0F172A] p-4 text-xs leading-6 text-slate-100">
            <pre className="whitespace-pre-wrap font-mono">{String(compiler.pseudo_sql || compiler.reason || '暂无执行预览')}</pre>
          </div>
        </section>
      ) : null}

      {consistency ? (
        <section className="rounded-lg border border-slate-200 bg-white px-3 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
            <CheckCircle2 className="h-4 w-4 text-sky-600" />
            一致性摘要
          </div>
          <div className="mt-3 text-sm text-slate-600">
            issue count：{String(consistency.summary?.issue_count ?? stale?.summary?.stale_count ?? 0)}
          </div>
        </section>
      ) : null}
    </div>
  )
}

function StaleImpactPanel({
  items,
  onSelect,
}: {
  items: Array<Record<string, unknown>>
  onSelect: (entityType?: string | null, entityName?: string | null) => void
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-slate-950">stale / impact</div>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            统一查看当前业务语义定义对分析层的失效告警和影响范围，并可直接定位到对应定义。
          </p>
        </div>
        <Badge variant="outline">共 {items.length} 项</Badge>
      </div>

      <div className="mt-5 space-y-3">
        {items.length > 0 ? (
          items.map((item) => {
            const entityType = String(item.entity_type || 'unknown')
            const entityName = String(item.entity_name || 'unknown')
            const missingRefs = Array.isArray(item.missing_refs) ? item.missing_refs : []
            return (
              <div key={`${entityType}:${entityName}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium text-slate-950">{entityName}</div>
                      <Badge variant="secondary">{entityType}</Badge>
                      <Badge variant="outline">{String(item.status || 'warning')}</Badge>
                    </div>
                    <div className="mt-2 text-sm text-slate-600">{String(item.reason || '存在需要关注的投影影响')}</div>
                    {missingRefs.length > 0 ? (
                      <div className="mt-2 text-xs text-slate-500">缺失引用：{missingRefs.join(', ')}</div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelect(entityType, entityName)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                  >
                    定位定义
                  </button>
                </div>
              </div>
            )
          })
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-sm text-slate-500">
            当前没有 stale 或 impact 告警，业务语义与分析层的一致性状态良好。
          </div>
        )}
      </div>
    </section>
  )
}

function EntityLifecyclePanel({
  entityType,
  entityName,
  entityStatus,
  impact,
  historyItems,
  lastPublishResult,
  lastPublishError,
  isImpactLoading,
  isHistoryLoading,
}: {
  entityType: string
  entityName: string | null
  entityStatus: string
  impact?: OntologyEntityImpactResponse
  historyItems: OntologyHistoryEvent[]
  lastPublishResult: OntologyPublishResponse | null
  lastPublishError: string | null
  isImpactLoading: boolean
  isHistoryLoading: boolean
}) {
  const validation = (lastPublishResult?.validation || {}) as Record<string, unknown>
  const validationIssues = Array.isArray(validation.issues) ? validation.issues : []
  const projectionTargets = Array.isArray((impact?.projection as Record<string, unknown> | undefined)?.targets)
    ? (((impact?.projection as Record<string, unknown> | undefined)?.targets as Array<unknown>).length)
    : Number(impact?.linked_entity_count || 0)
  const consistencyStatus = impact?.consistency?.status || impact?.projection_status || 'pending'
  const consistencyIssues = Array.isArray(impact?.consistency?.issues) ? impact?.consistency?.issues : impact?.issues || []

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-slate-950">发布 / 影响 / 历史</div>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            用统一面板查看当前业务语义资产的发布状态、影响分析和最近变更，确保工作台不只是静态编辑器。
          </p>
        </div>
        <Badge variant={entityStatus === 'active' ? 'secondary' : 'outline'}>{STATUS_LABELS[entityStatus] || entityStatus}</Badge>
      </div>

      {!entityName ? (
        <div className="mt-5 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-sm text-slate-500">
          当前处于新建状态，保存后即可查看发布链、影响范围和历史记录。
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <FederationStat label="资产类型" value={entityType} />
            <FederationStat label="资产标识" value={entityName} />
            <FederationStat label="投影命中" value={String(projectionTargets)} />
            <FederationStat label="问题数" value={String(consistencyIssues.length)} />
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <div className="space-y-3">
              <div className="text-sm font-semibold text-slate-950">影响分析</div>
              {isImpactLoading ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-sm text-slate-500">
                  正在加载当前资产的影响分析...
                </div>
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                  <div>一致性状态：{String(consistencyStatus)}</div>
                  <div className="mt-2">投影命中：{projectionTargets}</div>
                  <div className="mt-2">Traceability：{impact?.traceability ? '已生成' : '待生成'}</div>
                  {consistencyIssues.length > 0 ? (
                    <ul className="mt-3 list-disc pl-5 text-xs leading-5 text-amber-800">
                      {consistencyIssues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mt-2 text-xs text-slate-500">当前没有额外的一致性问题。</div>
                  )}
                </div>
              )}

              {lastPublishError ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-900">
                  <div className="font-medium">最近一次发布失败</div>
                  <div className="mt-2 text-xs leading-5">
                    当前资产还未通过发布校验，请先处理阻断问题后再重新发布。
                  </div>
                  <div className="mt-3 rounded-xl border border-rose-200 bg-white/60 px-3 py-3 text-xs leading-5 text-rose-800">
                    {lastPublishError}
                  </div>
                </div>
              ) : null}

              {lastPublishResult ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
                  <div className="font-medium">最近一次发布校验</div>
                  <div className="mt-2 text-xs leading-5">
                    校验状态：{String(validation.preview_status || validation.status || 'ready')}
                    {validationIssues.length > 0 ? ` · 问题数 ${validationIssues.length}` : ' · 当前未发现阻断问题'}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-3">
              <div className="text-sm font-semibold text-slate-950">最近变更</div>
              {isHistoryLoading ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-sm text-slate-500">
                  正在加载历史记录...
                </div>
              ) : historyItems.length > 0 ? (
                <div className="space-y-2">
                  {historyItems.slice(0, 5).map((item) => (
                    <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium text-slate-950">{item.action}</div>
                        <Badge variant={item.status === 'active' ? 'secondary' : 'outline'}>{STATUS_LABELS[item.status] || item.status}</Badge>
                      </div>
                      <div className="mt-2 text-xs leading-5 text-slate-500">{item.summary}</div>
                      <div className="mt-2 text-xs text-slate-400">{item.timestamp}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-sm text-slate-500">
                  当前资产还没有历史记录。
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  )
}

function ObjectProjectionPanel({
  objectEntity,
  preview,
  isLoading,
}: {
  objectEntity: Partial<BusinessObject>
  preview?: Record<string, any>
  isLoading: boolean
}) {
  const targets = Array.isArray(preview?.projection?.targets) ? preview.projection.targets : []
  const issues = Array.isArray(preview?.consistency?.issues) ? preview.consistency.issues : []
  const traceability = (preview?.traceability || {}) as Record<string, any>
  const status = String(preview?.consistency?.status || 'pending')

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-slate-950">对象投影视图</div>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            查看业务对象命中了哪些分析实体，并直接跳到语义工作台或 Cube 管理继续处理。
          </p>
        </div>
        <Badge variant="outline">状态：{status}</Badge>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <FederationStat label="对象标识" value={objectEntity.name || '未定义'} />
        <FederationStat label="对象标题" value={objectEntity.title || '未命名'} />
        <FederationStat label="投影命中" value={String(targets.length)} />
        <FederationStat label="问题数" value={String(issues.length)} />
      </div>

      {isLoading ? (
        <div className="mt-5 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-sm text-slate-500">
          正在加载对象投影信息...
        </div>
      ) : (
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <div className="space-y-3">
            <div className="text-sm font-semibold text-slate-950">命中的分析实体</div>
            {targets.length > 0 ? (
              targets.map((target: Record<string, unknown>) => {
                const cubeName = String(target.target_name || '')
                return (
                  <div key={cubeName} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-slate-950">{String(target.title || cubeName)}</div>
                        <div className="mt-1 text-xs text-slate-500">{cubeName}</div>
                        <div className="mt-2 text-xs text-slate-500">{String(target.match_reason || '对象名称匹配')}</div>
                      </div>
                      <Badge variant="secondary">score {String(target.score || 0)}</Badge>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        to={buildSemanticWorkbenchHref(cubeName, 'modeling')}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                      >
                        在语义工作台打开
                      </Link>
                      <Link
                        to={`/semantic/cubes?name=${encodeURIComponent(cubeName)}`}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                      >
                        在 Cube 管理查看
                      </Link>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-sm text-slate-500">
                当前对象还没有命中明确的 Cube / View 候选。
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="text-sm font-semibold text-slate-950">来源与一致性</div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
              <div>对象：{String(traceability.object_title || objectEntity.title || objectEntity.name || '未定义')}</div>
              <div className="mt-2">别名数：{Array.isArray(traceability.aliases) ? traceability.aliases.length : 0}</div>
              <div className="mt-2">候选数：{Array.isArray(traceability.cube_candidates) ? traceability.cube_candidates.length : 0}</div>
            </div>
            {issues.length > 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                <div className="font-medium">一致性提醒</div>
                <ul className="mt-2 space-y-1">
                  {issues.map((issue: string) => (
                    <li key={issue}>- {issue}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
                当前对象已经找到稳定的分析语义投影候选。
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function MetricFederationPanel({
  metric,
  links,
  backlinks,
  isLoading,
}: {
  metric: Partial<BusinessMetric>
  links?: Record<string, any>
  backlinks: Array<Record<string, any>>
  isLoading: boolean
}) {
  const linkedMeasures = Array.isArray(links?.linked_measures) ? links?.linked_measures : []
  const linkedCubes = Array.isArray(links?.linked_cubes) ? links?.linked_cubes : []
  const consistencyStatus = String(links?.consistency?.status || 'pending')
  const consistencyIssues = Array.isArray(links?.consistency?.issues) ? links?.consistency?.issues : []

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-slate-950">联邦追踪</div>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            直接查看当前业务指标投影到哪些 Measure / Cube，以及这些 Measure 被哪些业务指标反向引用。
          </p>
        </div>
        <Badge variant="outline">状态：{consistencyStatus}</Badge>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <FederationStat label="归属对象" value={metric.object_name || '未绑定'} />
        <FederationStat label="关联 Measure" value={String(linkedMeasures.length)} />
        <FederationStat label="关联 Cube" value={String(linkedCubes.length)} />
        <FederationStat label="反向引用" value={String(backlinks.reduce((count, item) => count + Number(item.linked_metrics?.length || 0), 0))} />
      </div>

      {isLoading ? (
        <div className="mt-5 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-sm text-slate-500">
          正在加载指标联邦追踪信息...
        </div>
      ) : (
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <div className="space-y-3">
            <div className="text-sm font-semibold text-slate-950">下游 Measure / Cube</div>
            {linkedMeasures.length > 0 ? (
              linkedMeasures.map((item: Record<string, unknown>) => (
                <div key={String(item.measure_ref)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-slate-950">{String(item.measure_ref)}</div>
                    <Badge variant="secondary">{String(item.status || 'linked')}</Badge>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    Cube：{String(item.cube_title || item.cube_name || '未命名分析实体')}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                当前业务指标还没有绑定 Measure，可先在定义里补充 `measure_refs`。
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="text-sm font-semibold text-slate-950">反向引用与一致性</div>
            {backlinks.length > 0 ? (
              backlinks.map((item) => {
                const linkedMetrics = Array.isArray(item.linked_metrics) ? item.linked_metrics : []
                return (
                  <div key={String(item.measure_ref)} className="rounded-lg border border-slate-200 bg-white px-3 py-3">
                    <div className="text-sm font-medium text-slate-950">{String(item.measure_ref)}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      来自 {String(item.cube_title || item.cube_name || '未命名 Cube')} · 被 {linkedMetrics.length} 个业务指标引用
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {linkedMetrics.length > 0 ? (
                        linkedMetrics.map((linkedMetric: Record<string, unknown>) => (
                          <Badge key={String(linkedMetric.metric_name || linkedMetric.name)} variant="outline">
                            {String(linkedMetric.metric_title || linkedMetric.metric_name || linkedMetric.name)}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-slate-500">暂无反向引用。</span>
                      )}
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                还没有可显示的反向引用信息。
              </div>
            )}

            {consistencyIssues.length > 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                <div className="font-medium">一致性提醒</div>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {consistencyIssues.map((issue: string) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  )
}

function RelationProjectionPanel({
  relation,
  preview,
  isLoading,
}: {
  relation: Partial<BusinessRelation>
  preview?: Record<string, any>
  isLoading: boolean
}) {
  const targets = Array.isArray(preview?.projection?.targets) ? preview?.projection?.targets : []
  const traceability = (preview?.traceability || {}) as Record<string, any>
  const issues = Array.isArray(preview?.consistency?.issues) ? preview?.consistency?.issues : []
  const status = String(preview?.consistency?.status || 'pending')

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-slate-950">关系投影视图</div>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            查看当前业务关系如何映射为分析 Join Path，并确认源对象、目标对象和可达 Cube 是否一致。
          </p>
        </div>
        <Badge variant="outline">状态：{status}</Badge>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <FederationStat label="源对象" value={relation.source_object_name || '未绑定'} />
        <FederationStat label="目标对象" value={relation.target_object_name || '未绑定'} />
        <FederationStat label="Join Path" value={String(targets.length)} />
        <FederationStat label="问题数" value={String(issues.length)} />
      </div>

      {isLoading ? (
        <div className="mt-5 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-sm text-slate-500">
          正在加载关系投影信息...
        </div>
      ) : (
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <div className="space-y-3">
            <div className="text-sm font-semibold text-slate-950">可投影 Join Path</div>
            {targets.length > 0 ? (
              targets.map((item: Record<string, unknown>) => (
                <div key={String(item.join_path || item.target_name)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-slate-950">{String(item.join_path || item.target_name)}</div>
                    <Badge variant="secondary">{String(item.relationship || 'join')}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {String(item.source_cube || '')} → {String(item.target_cube || item.target_name || '')}
                  </div>
                  <div className="mt-2 text-xs text-slate-500">{String(item.match_reason || '')}</div>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-sm text-slate-500">
                当前关系尚未找到可执行的 Join Path。
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="text-sm font-semibold text-slate-950">投影来源与一致性</div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
              <div>源对象候选：{Array.isArray(traceability.source_candidates) ? traceability.source_candidates.length : 0}</div>
              <div className="mt-2">目标对象候选：{Array.isArray(traceability.target_candidates) ? traceability.target_candidates.length : 0}</div>
            </div>
            {issues.length > 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                <div className="font-medium">一致性提醒</div>
                <ul className="mt-2 space-y-1">
                  {issues.map((issue: string) => (
                    <li key={issue}>- {issue}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
                当前关系已找到稳定的分析投影路径。
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function ActionProjectionPanel({
  action,
  preview,
  isLoading,
}: {
  action: Partial<BusinessAction>
  preview?: Record<string, any>
  isLoading: boolean
}) {
  const targets = Array.isArray(preview?.projection?.targets) ? preview?.projection?.targets : []
  const traceability = (preview?.traceability || {}) as Record<string, any>
  const issues = Array.isArray(preview?.consistency?.issues) ? preview?.consistency?.issues : []
  const status = String(preview?.consistency?.status || 'pending')

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-slate-950">动作投影视图</div>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            查看当前业务动作如何映射为事件事实语义，并确认对象归属、触发时间和事件 Cube 引用是否一致。
          </p>
        </div>
        <Badge variant="outline">状态：{status}</Badge>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <FederationStat label="归属对象" value={action.object_name || '未绑定'} />
        <FederationStat label="时间属性" value={action.trigger_time_property || '未指定'} />
        <FederationStat label="事件 Cube" value={String(targets.length)} />
        <FederationStat label="问题数" value={String(issues.length)} />
      </div>

      {isLoading ? (
        <div className="mt-5 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-sm text-slate-500">
          正在加载动作投影信息...
        </div>
      ) : (
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <div className="space-y-3">
            <div className="text-sm font-semibold text-slate-950">事件事实投影</div>
            {targets.length > 0 ? (
              targets.map((item: Record<string, unknown>) => (
                <div key={String(item.target_name)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-slate-950">{String(item.target_name)}</div>
                    <Badge variant="secondary">{String(item.target_type || 'event')}</Badge>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">{String(item.match_reason || '')}</div>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-sm text-slate-500">
                当前动作尚未找到可投影的事件事实语义。
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="text-sm font-semibold text-slate-950">投影来源与一致性</div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
              <div>对象候选：{Array.isArray(traceability.object_candidates) ? traceability.object_candidates.length : 0}</div>
              <div className="mt-2">事件引用：{Array.isArray(traceability.event_cube_refs) ? traceability.event_cube_refs.length : 0}</div>
            </div>
            {issues.length > 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                <div className="font-medium">一致性提醒</div>
                <ul className="mt-2 space-y-1">
                  {issues.map((issue: string) => (
                    <li key={issue}>- {issue}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
                当前动作已找到稳定的事件事实投影。
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function SemanticRouteRuntimePanel({
  title,
  question,
  route,
  plan,
  execution,
  isLoading,
  isExecuting,
  onExecute,
}: {
  title: string
  question: string
  route?: Record<string, any>
  plan?: Record<string, any>
  execution?: Record<string, any>
  isLoading: boolean
  isExecuting: boolean
  onExecute: () => void
}) {
  const steps = Array.isArray(plan?.steps) ? plan.steps : []
  const planDependencies = Array.isArray(plan?.dependencies) ? plan.dependencies : []
  const expectedOutputs = Array.isArray(plan?.expected_outputs) ? plan.expected_outputs : []
  const resolvedRoute = (plan?.route || route || {}) as Record<string, any>
  const traceability = (plan?.traceability || resolvedRoute?.traceability || route?.traceability || {}) as Record<string, any>
  const routeType = String(resolvedRoute?.route_type || 'pending')
  const planningMode = String(plan?.planning_mode || resolvedRoute?.planning_mode || 'single_step')
  const targets = Array.isArray(resolvedRoute?.targets) ? resolvedRoute.targets : Array.isArray(route?.targets) ? route.targets : []
  const matchedEntities = Array.isArray(resolvedRoute?.matched_entities) ? resolvedRoute.matched_entities : []
  const primaryMatch = (resolvedRoute?.primary_match || {}) as Record<string, unknown>
  const executionResults = Array.isArray(execution?.execution_results) ? execution.execution_results : []
  const executionSummary = (execution?.execution_summary || {}) as Record<string, unknown>
  const executeTraceability = (execution?.traceability || {}) as Record<string, unknown>
  const routeTraceability = normalizeTraceabilitySections(traceability)
  const executeTraceabilitySections = normalizeTraceabilitySections(executeTraceability)
  const routeTraceabilityEntries = [
    ...buildSummaryEntries(routeTraceability.ontology, ['business_metric', 'business_object']),
    ...buildSummaryEntries(routeTraceability.analysis, ['analysis_measure', 'analysis_cube']),
  ]
  const executeTraceabilityEntries = [
    ...buildSummaryEntries(executeTraceabilitySections.execution, ['target_type']),
    ...buildSummaryEntries(executeTraceabilitySections.sources),
  ]

  const routeSummary = useMemo(() => {
    if (routeType === 'hybrid') return '当前问题会先补充业务语义解释，再进入分析执行链。'
    if (routeType === 'cube') return '当前问题会直接路由到分析语义层，进入 Cube 查询链路。'
    if (routeType === 'tool') return '当前问题会优先规划工具调用路径，而不是直接进入分析查询。'
    if (routeType === 'knowledge') return '当前问题会先走知识语义解释，不直接触发分析执行。'
    if (routeType === 'blocked') {
      return String(resolvedRoute?.reason || resolvedRoute?.policy?.reason || route?.reason || route?.policy?.reason || '当前问题在语义路由阶段被阻断。')
    }
    return '当前问题尚未生成稳定的语义路由结果。'
  }, [resolvedRoute?.policy?.reason, resolvedRoute?.reason, route?.policy?.reason, route?.reason, routeType])

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-slate-950">运行路径验证</div>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            基于当前语义资产验证运行时会走向分析、知识还是工具链，帮助判断这条定义是否真的可用。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">路径：{getRouteTypeLabel(routeType)}</Badge>
          <FormButton variant="outline" onClick={onExecute} disabled={!question || isExecuting}>
            {isExecuting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            运行验证
          </FormButton>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <FederationStat label="当前语义资产" value={title || '未命名'} />
        <FederationStat label="问题模板" value={question || '未生成'} />
        <FederationStat label="执行目标" value={targets.length > 0 ? targets.map((target) => getRouteTypeLabel(String(target))).join(' / ') : '未命中'} />
        <FederationStat label="计划模式" value={getPlanningModeLabel(planningMode)} />
      </div>

      {isLoading ? (
        <div className="mt-5 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-sm text-slate-500">
          正在生成运行时语义路由与规划预演...
        </div>
      ) : (
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <div className="space-y-3">
            <div className="text-sm font-semibold text-slate-950">验证结果</div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
              <div className="font-medium text-slate-950">问题模板：{question || '未生成'}</div>
              <div className="mt-2">运行路径：{getRouteTypeLabel(routeType)}</div>
              <div className="mt-2">规划方式：{getPlanningModeLabel(planningMode)}</div>
              <div className="mt-2">命中语义实体：{matchedEntities.length}</div>
              {primaryMatch?.entity_type ? <div className="mt-2">主命中：{String(primaryMatch.entity_type)}</div> : null}
              <div className="mt-2">{routeSummary}</div>
              {resolvedRoute?.policy?.reason ? <div className="mt-2 text-amber-700">阻断原因：{String(resolvedRoute.policy.reason)}</div> : null}
            </div>

            <div className="text-sm font-semibold text-slate-950">执行步骤</div>
            {steps.length > 0 ? (
              <div className="space-y-2">
                {steps.map((step: Record<string, unknown>) => (
                  <div key={String(step.step_type)} className="rounded-lg border border-slate-200 bg-white px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-slate-950">{String(step.title || step.step_type)}</div>
                      <Badge variant="secondary">{String(step.status || 'ready')}</Badge>
                    </div>
                    <div className="mt-2 text-xs text-slate-500">{String(step.step_type || '')}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                当前还没有生成可展示的 planning steps。
              </div>
            )}
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
              <div>依赖关系：{planDependencies.length}</div>
              <div className="mt-2">预期产出：{expectedOutputs.length}</div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-sm font-semibold text-slate-950">来源回溯</div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
              <SummaryFieldList
                entries={routeTraceabilityEntries}
                emptyText="当前还没有生成可读的业务/分析回溯。"
                rawPayload={Object.keys(traceability).length > 0 ? traceability : undefined}
                detailsLabel="查看完整路由回溯"
              />
            </div>
            <div className="text-sm font-semibold text-slate-950">最近执行结果</div>
            {executionResults.length > 0 ? (
              <div className="space-y-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                  <div>总目标：{String(executionSummary.total || executionResults.length)}</div>
                  <div className="mt-2">执行成功：{String(executionSummary.executed || 0)}</div>
                  <div className="mt-2">阻断：{String(executionSummary.blocked || 0)}</div>
                </div>
                {executionResults.map((item: Record<string, unknown>, index: number) => (
                  <div key={`${String(item.target_type)}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                    <div className="font-medium text-slate-950">目标 {index + 1}：{String(item.status || 'pending')}</div>
                    <div className="mt-2">类型：{String(item.target_type || 'unknown')}</div>
                    {'reason' in item && item.reason ? <div className="mt-2 text-amber-700">原因：{String(item.reason)}</div> : null}
                    {'audit_trace_id' in item && item.audit_trace_id ? <div className="mt-2">审计记录：{String(item.audit_trace_id)}</div> : null}
                  </div>
                ))}
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                  <div className="font-medium text-slate-950">执行回溯</div>
                  <SummaryFieldList
                    className="mt-2"
                    entries={executeTraceabilityEntries}
                    emptyText="当前还没有生成执行侧回溯。"
                    rawPayload={Object.keys(executeTraceability).length > 0 ? executeTraceability : undefined}
                    detailsLabel="查看完整执行回溯"
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                当前还没有真实执行结果，点击“执行语义计划”后会在这里展示统一执行返回。
              </div>
            )}
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
              <div className="font-medium text-slate-950">运行时说明</div>
              <div className="mt-2">
                这里会先展示语义路由的计划结果，再按需触发统一执行链；它用于验证双层语义主链，不替代查询中心里的完整分析体验。
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function ExecutionCompilePanel({
  title,
  description,
  entries,
  emptyMessage,
}: {
  title: string
  description: string
  entries: Array<{
    key: string
    label: string
    compiler?: Record<string, any>
    plan?: Record<string, any>
    loading: boolean
  }>
  emptyMessage: string
}) {
  const visibleEntries = entries.filter((entry) => entry.loading || entry.compiler || entry.plan)

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-slate-950">{title}</div>
          <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
        </div>
        <Badge variant="outline">执行预览</Badge>
      </div>

      {visibleEntries.length === 0 ? (
        <div className="mt-5 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-sm text-slate-500">
          {emptyMessage}
        </div>
      ) : (
        <div className={cn('mt-5 grid gap-4', visibleEntries.length > 1 ? 'xl:grid-cols-2' : '')}>
          {visibleEntries.map((entry) => (
            <ExecutionCompileCard
              key={entry.key}
              label={entry.label}
              compiler={entry.compiler}
              plan={entry.plan}
              loading={entry.loading}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function ExecutionCompileCard({
  label,
  compiler,
  plan,
  loading,
}: {
  label: string
  compiler?: Record<string, any>
  plan?: Record<string, any>
  loading: boolean
}) {
  const compilerStatus = String(compiler?.status || compiler?.policy?.status || (loading ? 'loading' : 'pending'))
  const targetType = String(compiler?.target_type || plan?.target_type || 'pending')
  const bindings = compiler?.bindings as Record<string, unknown> | undefined
  const traceability = (plan?.traceability || compiler?.traceability || {}) as Record<string, unknown>
  const policy = compiler?.policy as Record<string, unknown> | undefined
  const steps = Array.isArray(plan?.steps) ? plan.steps : []
  const bindingEntries = bindings ? buildSummaryEntries(bindings, ['metric_name', 'cube_name', 'measure_name', 'source_id', 'target_type']) : []
  const traceabilitySections = normalizeTraceabilitySections(traceability)
  const traceabilityEntries = [
    ...buildSummaryEntries(traceabilitySections.ontology, ['business_metric', 'business_object']),
    ...buildSummaryEntries(traceabilitySections.analysis, ['analysis_measure', 'analysis_cube']),
    ...buildSummaryEntries(traceabilitySections.execution, ['target_type']),
    ...buildSummaryEntries(traceabilitySections.sources),
  ]

  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50/80 px-5 py-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-950">{label}</div>
          <div className="mt-1 text-xs text-slate-500">target_type：{targetType}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={compilerStatus === 'ready' || compilerStatus === 'allow' ? 'secondary' : 'outline'}>
            {compilerStatus}
          </Badge>
          {policy?.visibility ? <Badge variant="outline">{String(policy.visibility)}</Badge> : null}
        </div>
      </div>

      {loading ? (
        <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">
          正在生成统一执行预览...
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
            <div className="text-xs font-medium text-slate-500">执行产物</div>
            {compiler?.pseudo_sql ? (
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-xl bg-slate-950 px-3 py-3 text-xs leading-6 text-slate-100">
                {String(compiler.pseudo_sql)}
              </pre>
            ) : (
              <div className="mt-2 text-sm text-slate-600">
                {String(compiler?.reason || '当前目标暂无可展示的 SQL / Retrieval / Tool Call 执行产物。')}
              </div>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
              <div className="text-xs font-medium text-slate-500">Bindings</div>
              <SummaryFieldList
                className="mt-2"
                entries={bindingEntries}
                emptyText="暂无绑定信息"
                rawPayload={bindings}
                detailsLabel="查看原始绑定"
              />
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
              <div className="text-xs font-medium text-slate-500">Traceability</div>
              <SummaryFieldList
                className="mt-2"
                entries={traceabilityEntries}
                emptyText="暂无回溯信息"
                rawPayload={Object.keys(traceability).length > 0 ? traceability : undefined}
                detailsLabel="查看完整回溯"
              />
            </div>
          </div>

          {steps.length > 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
              <div className="text-sm font-semibold text-slate-950">执行计划</div>
              <div className="mt-3 space-y-2">
                {steps.map((step: Record<string, unknown>) => (
                  <div
                    key={String(step.step_type || step.title)}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3"
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-950">{String(step.title || step.step_type)}</div>
                      <div className="mt-1 text-xs text-slate-500">{String(step.step_type || '')}</div>
                    </div>
                    <Badge variant="outline">{String(step.status || 'ready')}</Badge>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

function PolicyGovernancePanel({
  policy,
  objects,
  properties,
  metrics,
  actions,
  canRunRuntimePreview,
}: {
  policy: Partial<PolicyMetadata>
  objects: BusinessObject[]
  properties: BusinessProperty[]
  metrics: BusinessMetric[]
  actions: BusinessAction[]
  canRunRuntimePreview: boolean
}) {
  const [auditDecisionFilter, setAuditDecisionFilter] = useState<'all' | 'allow' | 'blocked' | 'not_configured'>('all')
  const [auditRouteFilter, setAuditRouteFilter] = useState<'all' | 'direct' | 'cube' | 'knowledge' | 'hybrid' | 'tool'>('all')
  const targetLabel = useMemo(() => {
    if (!policy.target_name) return '未绑定'
    if (policy.target_type === 'property') {
      return properties.find((item) => item.name === policy.target_name)?.title || policy.target_name
    }
    if (policy.target_type === 'metric') {
      return metrics.find((item) => item.name === policy.target_name)?.title || policy.target_name
    }
    if (policy.target_type === 'action') {
      return actions.find((item) => item.name === policy.target_name)?.title || policy.target_name
    }
    return objects.find((item) => item.name === policy.target_name)?.title || policy.target_name
  }, [actions, metrics, objects, policy.target_name, policy.target_type, properties])

  const targetExists = useMemo(() => {
    if (!policy.target_name) return false
    if (policy.target_type === 'property') {
      return properties.some((item) => item.name === policy.target_name)
    }
    if (policy.target_type === 'metric') {
      return metrics.some((item) => item.name === policy.target_name)
    }
    if (policy.target_type === 'action') {
      return actions.some((item) => item.name === policy.target_name)
    }
    return objects.some((item) => item.name === policy.target_name)
  }, [actions, metrics, objects, policy.target_name, policy.target_type, properties])

  const previewRoles = (policy.allowed_roles || []).filter(Boolean)
  const policyImpactQuery = useQuery({
    queryKey: ['ontology', 'policy-impact', policy.name],
    enabled: Boolean(policy.name),
    queryFn: () => getPolicyImpact(policy.name || ''),
  })
  const policyAuditQuery = useQuery({
    queryKey: ['ontology', 'policy-audit', policy.name, auditDecisionFilter, auditRouteFilter],
    enabled: Boolean(policy.name),
    queryFn: () =>
      getPolicyAudit(policy.name || '', {
        decision: auditDecisionFilter === 'all' ? undefined : auditDecisionFilter,
        route_type: auditRouteFilter === 'all' ? undefined : auditRouteFilter,
      }),
  })
  const previewQuestion = useMemo(() => {
    if (policy.target_type === 'metric') return `查看 ${targetLabel}`
    if (policy.target_type === 'action') return `分析 ${targetLabel}`
    if (policy.target_type === 'object') return `分析 ${targetLabel}`
    return ''
  }, [policy.target_type, targetLabel])

  const impactSummary = useMemo(() => {
    if (!policy.target_name) {
      return '当前权限尚未绑定目标，保存后才能参与语义路由与执行阻断。'
    }
    if (policy.target_type === 'metric') {
      return `该权限会影响 业务指标 ${targetLabel} 的语义路由、执行预览和下游分析查询。`
    }
    if (policy.target_type === 'action') {
      return `该权限会影响 动作 ${targetLabel} 的语义路由与事件事实分析入口。`
    }
    if (policy.target_type === 'property') {
      return `该权限会影响 属性 ${targetLabel} 的字段暴露与后续执行层字段可见性。`
    }
    return `该权限会影响 业务对象 ${targetLabel} 的语义路由、分析入口与对象级访问范围。`
  }, [policy.target_name, policy.target_type, targetLabel])

  const runtimePreviewEnabled =
    canRunRuntimePreview &&
    targetExists &&
    Boolean(policy.target_name) &&
    (policy.target_type === 'metric' || policy.target_type === 'object' || policy.target_type === 'action')

  const allowedRoles = previewRoles.length > 0 ? previewRoles : policy.visibility === 'public' ? [] : ['authorized']
  const unauthorizedRoles = policy.visibility === 'public' ? [] : ['guest']

  const allowedRouteQuery = useQuery({
    queryKey: ['ontology', 'policy-route-preview', policy.name, 'allowed', allowedRoles.join('|')],
    enabled: runtimePreviewEnabled && Boolean(previewQuestion),
    queryFn: () => getSemanticRoutePreview(previewQuestion, allowedRoles),
  })
  const blockedRouteQuery = useQuery({
    queryKey: ['ontology', 'policy-route-preview', policy.name, 'blocked', unauthorizedRoles.join('|')],
    enabled: runtimePreviewEnabled && Boolean(previewQuestion) && policy.visibility !== 'public',
    queryFn: () => getSemanticRoutePreview(previewQuestion, unauthorizedRoles),
  })
  const allowedCompileQuery = useQuery({
    queryKey: ['ontology', 'policy-compile-preview', policy.name, 'allowed', allowedRoles.join('|')],
    enabled: runtimePreviewEnabled && policy.target_type === 'metric' && Boolean(policy.target_name),
    queryFn: () => getExecutionCompilePreview(policy.target_name || '', allowedRoles),
  })
  const blockedCompileQuery = useQuery({
    queryKey: ['ontology', 'policy-compile-preview', policy.name, 'blocked', unauthorizedRoles.join('|')],
    enabled:
      runtimePreviewEnabled &&
      policy.target_type === 'metric' &&
      Boolean(policy.target_name) &&
      policy.visibility !== 'public',
    queryFn: () => getExecutionCompilePreview(policy.target_name || '', unauthorizedRoles),
  })
  const allowedPlanQuery = useQuery({
    queryKey: ['ontology', 'policy-plan-preview', policy.name, 'allowed'],
    enabled: runtimePreviewEnabled && policy.target_type === 'metric' && Boolean(policy.target_name),
    queryFn: () => getExecutionPlanPreview(policy.target_name || ''),
  })
  const allowedExecuteQuery = useQuery({
    queryKey: ['ontology', 'policy-execute', policy.name, 'allowed', allowedRoles.join('|')],
    enabled: runtimePreviewEnabled && policy.target_type === 'metric' && Boolean(policy.target_name),
    queryFn: () => getExecutionExecute(policy.target_name || '', allowedRoles),
  })
  const blockedExecuteQuery = useQuery({
    queryKey: ['ontology', 'policy-execute', policy.name, 'blocked', unauthorizedRoles.join('|')],
    enabled:
      runtimePreviewEnabled &&
      policy.target_type === 'metric' &&
      Boolean(policy.target_name) &&
      policy.visibility !== 'public',
    queryFn: () => getExecutionExecute(policy.target_name || '', unauthorizedRoles),
  })

  const runtimePreviewRows = [
    {
      label: '命中授权角色',
      route: allowedRouteQuery.data?.data,
      compiler: allowedCompileQuery.data?.data,
      plan: allowedPlanQuery.data?.data,
      execute: allowedExecuteQuery.data?.data,
      loading:
        allowedRouteQuery.isLoading ||
        allowedCompileQuery.isLoading ||
        allowedPlanQuery.isLoading ||
        allowedExecuteQuery.isLoading,
    },
    {
      label: '未授权角色',
      route: blockedRouteQuery.data?.data,
      compiler: blockedCompileQuery.data?.data,
      execute: blockedExecuteQuery.data?.data,
      loading: blockedRouteQuery.isLoading || blockedCompileQuery.isLoading || blockedExecuteQuery.isLoading,
    },
  ].filter((item) => item.label !== '未授权角色' || policy.visibility !== 'public')

  const policyImpact = policyImpactQuery.data?.data
  const impactCards = policyImpact
    ? [
        { label: '投影状态', value: policyImpact.projection_status || 'pending' },
        { label: '关联分析实体', value: String(policyImpact.linked_entity_count || 0) },
        { label: '治理挂点', value: String((policyImpact.governance_hooks || []).length) },
        { label: '风险数', value: String((policyImpact.issues || []).length) },
      ]
    : []

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-slate-950">权限影响与治理验证</div>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            这里不会直接改动执行结果，而是帮助确认当前权限会影响哪些对象、会在哪些环节放行或阻断。
          </p>
        </div>
        <Badge variant="outline">可见性：{policy.visibility || 'restricted'}</Badge>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <FederationStat label="目标类型" value={policy.target_type || 'object'} />
        <FederationStat label="目标对象" value={targetLabel} />
        <FederationStat label="授权角色" value={String((policy.allowed_roles || []).filter(Boolean).length)} />
        <FederationStat label="状态" value={targetExists ? '已解析' : '待绑定'} />
      </div>

      <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-950">治理影响总览</div>
          {policyImpact?.projection_status ? <Badge variant="outline">{policyImpact.projection_status}</Badge> : null}
        </div>
        {policyImpactQuery.isLoading ? (
          <div className="mt-3 text-sm text-slate-500">正在汇总权限影响范围、治理挂点和分析实体联动...</div>
        ) : policyImpact ? (
          <>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              {impactCards.map((item) => (
                <FederationStat key={item.label} label={item.label} value={item.value} />
              ))}
            </div>
            <div className="mt-4 grid gap-5 xl:grid-cols-2">
              <div className="space-y-2">
                <div className="text-sm font-semibold text-slate-950">分析层联动</div>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-600">
                  <div>Cubes：{policyImpact.analysis_links.cubes.length}</div>
                  <div className="mt-2">Measures：{policyImpact.analysis_links.measures.length}</div>
                  <div className="mt-2">Join Paths：{policyImpact.analysis_links.join_paths.length}</div>
                  <div className="mt-2">Event Cubes：{policyImpact.analysis_links.event_cubes.length}</div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-semibold text-slate-950">治理挂点状态</div>
                <div className="space-y-2">
                  {policyImpact.governance_hooks.map((hook) => (
                    <div key={hook.hook} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-slate-950">{hook.hook}</span>
                        <Badge variant="outline">{hook.status}</Badge>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{hook.effect}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {policyImpact.issues.length > 0 ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                <div className="font-medium">当前风险</div>
                <ul className="mt-2 list-disc pl-5">
                  {policyImpact.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : (
          <div className="mt-3 text-sm text-slate-500">当前权限尚未保存，保存后会自动汇总治理影响。</div>
        )}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <div className="space-y-3">
          <div className="text-sm font-semibold text-slate-950">影响范围说明</div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
            <div>目标名称：{policy.target_name || '未填写'}</div>
            <div className="mt-2">目标标题：{targetLabel}</div>
            <div className="mt-2">解析结果：{targetExists ? '可命中已定义语义对象' : '当前未命中已定义语义对象'}</div>
            <div className="mt-2">{impactSummary}</div>
          </div>
          {!targetExists ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
              当前目标还没有解析到已存在的业务语义资产，保存时后端会拒绝无效引用。
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
              <div className="text-sm font-semibold text-slate-950">真实治理验证</div>
          {!runtimePreviewEnabled ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-sm text-slate-500">
              {canRunRuntimePreview
                ? policy.target_type === 'property'
                  ? '属性级权限的真实执行预演会在字段暴露链路产品化后接入；当前先展示影响范围。'
                  : '请先保存并绑定到有效的对象、动作或业务指标，再查看真实治理挂点预演。'
                : '当前处于新建或未保存状态，保存后才能基于已存语义权限做真实预演。'}
            </div>
          ) : (
            <div className="space-y-2">
              {runtimePreviewRows.map((item) => {
                const routePolicy = item.route?.policy as Record<string, unknown> | undefined
                const routeStatus = String(routePolicy?.status || item.route?.route_type || (item.loading ? 'loading' : 'unknown'))
                const compilerPolicy = item.compiler?.policy as Record<string, unknown> | undefined
                const compilerStatus = item.compiler ? String(item.compiler.status || compilerPolicy?.status || 'unknown') : 'not-applicable'
                const executeStatus = item.execute ? String(item.execute.status || 'unknown') : 'not-applicable'
                const reason = String(
                  routePolicy?.reason ||
                    (item.execute?.governance_trace as Record<string, unknown> | undefined)?.reason ||
                    item.compiler?.reason ||
                    compilerPolicy?.reason ||
                    (routeStatus === 'allow' ? '命中当前权限策略，可继续进入执行链。' : '当前请求会在权限挂点被阻断。'),
                )
                return (
                  <div key={item.label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-slate-950">{item.label}</div>
                      <div className="flex items-center gap-2">
                        <Badge variant={routeStatus === 'allow' ? 'secondary' : 'outline'}>{getDecisionLabel(routeStatus)}</Badge>
                        {item.compiler ? (
                          <Badge variant={compilerStatus === 'ready' ? 'secondary' : 'outline'}>{getExecutionStatusLabel(compilerStatus)}</Badge>
                        ) : null}
                        {item.execute ? (
                          <Badge variant={executeStatus === 'executed' ? 'secondary' : 'outline'}>{getExecutionStatusLabel(executeStatus)}</Badge>
                        ) : null}
                      </div>
                    </div>
                    {item.loading ? (
                      <div className="mt-2 text-xs leading-5 text-slate-500">正在调用语义路由与执行预览校验当前 viewer_roles...</div>
                    ) : (
                      <>
                        <div className="mt-2 text-xs leading-5 text-slate-500">{reason}</div>
                        <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-2">
                          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                            <div className="font-medium text-slate-700">语义路由结果</div>
                            <div className="mt-1">{getRouteTypeLabel(String(item.route?.route_type || 'pending'))}</div>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                            <div className="font-medium text-slate-700">执行校验结果</div>
                            <div className="mt-1">{item.compiler ? getExecutionStatusLabel(compilerStatus) : '当前目标不进入执行校验'}</div>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 md:col-span-2">
                            <div className="font-medium text-slate-700">真实执行结果</div>
                            <div className="mt-1">{item.execute ? getExecutionStatusLabel(executeStatus) : '当前目标未触发真实执行'}</div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {runtimePreviewEnabled && policy.target_type === 'metric' ? (
            <div className="mt-4 space-y-3">
              <div className="text-sm font-semibold text-slate-950">最近治理执行结果</div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="text-xs leading-5 text-slate-500">
                  最近一次真实执行会在这里展示治理留痕、命中策略和执行结果。
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {runtimePreviewRows.map((item) => {
                    const governanceTrace = (item.execute?.governance_trace as Record<string, unknown> | undefined) || {}
                    return (
                      <div key={`${item.label}-governance`} className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-600">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium text-slate-950">{item.label}</div>
                          <Badge variant={String(governanceTrace.status || item.execute?.status || 'unknown') === 'allow' ? 'secondary' : 'outline'}>
                            {getDecisionLabel(String(governanceTrace.status || item.execute?.status || 'unknown'))}
                          </Badge>
                        </div>
                        <div className="mt-3 space-y-2 text-xs leading-5 text-slate-500">
                          <div>执行状态：{String(governanceTrace.execution_status || item.execute?.status || 'unknown')}</div>
                          <div>目标类型：{String(governanceTrace.target_type || item.execute?.target_type || 'unknown')}</div>
                          <div>目标名称：{String(governanceTrace.target_name || policy.target_name || 'unknown')}</div>
                          <div>角色：{Array.isArray(governanceTrace.viewer_roles) && governanceTrace.viewer_roles.length > 0 ? governanceTrace.viewer_roles.join(', ') : '未传入角色'}</div>
                          <div>命中策略：{String((governanceTrace.matched_policy as Record<string, unknown> | undefined)?.name || '未命中')}</div>
                          <div>结果说明：{String(governanceTrace.reason || '未命中阻断条件，可继续执行')}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {policy.name ? (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-950">最近审计记录</div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs text-slate-500">
                    决策
                    <select
                      className="ml-2 rounded-xl border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                      value={auditDecisionFilter}
                      onChange={(event) => setAuditDecisionFilter(event.target.value as typeof auditDecisionFilter)}
                    >
                      <option value="all">全部</option>
                      <option value="allow">{getDecisionLabel('allow')}</option>
                      <option value="blocked">{getDecisionLabel('blocked')}</option>
                      <option value="not_configured">{getDecisionLabel('not_configured')}</option>
                    </select>
                  </label>
                  <label className="text-xs text-slate-500">
                    路由
                    <select
                      className="ml-2 rounded-xl border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                      value={auditRouteFilter}
                      onChange={(event) => setAuditRouteFilter(event.target.value as typeof auditRouteFilter)}
                    >
                      <option value="all">全部</option>
                      <option value="direct">{getRouteTypeLabel('direct')}</option>
                      <option value="cube">{getRouteTypeLabel('cube')}</option>
                      <option value="knowledge">{getRouteTypeLabel('knowledge')}</option>
                      <option value="hybrid">{getRouteTypeLabel('hybrid')}</option>
                      <option value="tool">{getRouteTypeLabel('tool')}</option>
                    </select>
                  </label>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                {policyAuditQuery.isLoading ? (
                  <div className="text-sm text-slate-500">正在加载最近命中的治理审计记录...</div>
                ) : (policyAuditQuery.data?.data.items || []).length > 0 ? (
                  <div className="space-y-2">
                    {(policyAuditQuery.data?.data.items || []).slice(0, 5).map((item) => (
                      <div key={item.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium text-slate-950">{item.target_name}</div>
                          <Badge variant={item.decision === 'allow' ? 'secondary' : 'outline'}>{getDecisionLabel(item.decision)}</Badge>
                        </div>
                        <div className="mt-2 grid gap-1 text-xs leading-5 text-slate-500 md:grid-cols-2">
                          <div>执行目标：{item.execution_target}</div>
                          <div>路由类型：{getRouteTypeLabel(item.route_type)}</div>
                          <div>角色：{item.viewer_roles.length > 0 ? item.viewer_roles.join(', ') : '未传入角色'}</div>
                          <div>时间：{item.timestamp}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">当前筛选条件下还没有命中审计记录，执行后会在这里显示最近治理事件。</div>
                )}
              </div>
            </div>
          ) : null}

          {runtimePreviewEnabled ? (
            <div className="mt-4">
              <ExecutionCompilePanel
                title="统一执行预览"
                description="用同一套执行预览查看不同 viewer_roles 下的执行结果，确认语义权限对执行层的真实影响。"
                entries={runtimePreviewRows.map((item) => ({
                  key: item.label,
                  label: item.label,
                  compiler: item.compiler,
                  plan: item.plan,
                  loading: item.loading,
                }))}
                emptyMessage="当前权限目标还没有可展示的执行预览结果。"
              />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function FederationStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-2 text-xl font-semibold text-slate-950">{value}</div>
    </div>
  )
}

function SummaryFieldList({
  entries,
  emptyText,
  rawPayload,
  detailsLabel,
  className,
}: {
  entries: Array<{ key: string; label: string; value: string }>
  emptyText: string
  rawPayload?: Record<string, unknown>
  detailsLabel?: string
  className?: string
}) {
  if (entries.length === 0) {
    return <div className={cn('text-sm text-slate-600', className)}>{emptyText}</div>
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="grid gap-2">
        {entries.map((entry) => (
          <div key={entry.key} className="flex items-start justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
            <div className="text-xs font-medium text-slate-500">{entry.label}</div>
            <div className="max-w-[70%] text-right text-sm text-slate-700">{entry.value}</div>
          </div>
        ))}
      </div>
      {rawPayload && Object.keys(rawPayload).length > 0 ? (
        <details className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-slate-500">{detailsLabel || '查看原始数据'}</summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-slate-950 px-3 py-3 text-xs leading-6 text-slate-100">
            {JSON.stringify(rawPayload, null, 2)}
          </pre>
        </details>
      ) : null}
    </div>
  )
}
