import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  Box,
  ChevronDown,
  ChevronRight,
  GitMerge,
  Info,
  PanelRightClose,
  Search,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react'
import {
  type GovernanceAuditTrace,
  getBusinessMetricLinks,
  getExecutionCompilePreview,
  getExecutionPlanPreview,
  getOntologyWorkbenchGovernance,
  getOntologyWorkbenchObjectOverview,
  getOntologyWorkbenchObjects,
  getPolicyAudit,
  getPolicyImpact,
  listBusinessMetrics,
  listBusinessRelations,
  publishOntologyEntity,
  saveBusinessObject,
} from '@/api/ontology'
import { Badge, FormButton, FormInput, FormTextarea, useToast } from '@/components/business'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  adaptGovernanceSummary,
  adaptObjectOverview,
  adaptObjectSummaryList,
  getMetricBindingStatus,
  getMetricBindingTone,
  getRelationBadgeTone,
  normalizeWorkbenchTab,
  type ObjectWorkbenchOverview,
  type ObjectWorkbenchSummary,
  type WorkbenchView,
} from './ontology-workbench-v2/model'

type ObjectDetailPanel = 'definition' | 'fields' | 'relations' | 'rules' | 'history'
type ObjectStatusFilter = 'all' | 'active' | 'draft' | 'warning'
type MetricBindingFilter = 'all' | 'bound' | 'unbound'
type RelationTypeFilter = 'all' | string

interface ObjectFormState {
  name: string
  title: string
  description: string
  aliasesText: string
  status: string
  domain: string
  owner: string
  isAggregateRoot: boolean
}

const SPECIAL_INDEXES: Array<{ key: WorkbenchView; label: string; icon: typeof GitMerge }> = [
  { key: 'relations', label: '关系索引', icon: GitMerge },
  { key: 'metrics', label: '业务指标索引', icon: TrendingUp },
  { key: 'policies', label: '规则索引', icon: ShieldCheck },
]

const OBJECT_PANELS: Array<{ key: ObjectDetailPanel; label: string }> = [
  { key: 'definition', label: '对象定义' },
  { key: 'fields', label: '字段列表' },
  { key: 'relations', label: '关系图' },
  { key: 'rules', label: '规则' },
  { key: 'history', label: '历史' },
]

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  active: '已发布',
  deprecated: '已废弃',
  warning: '需处理',
  blocked: '已阻断',
  ok: '正常',
  ready: '已准备',
  executed: '已执行',
}

const VISIBILITY_LABELS: Record<string, string> = {
  public: '公开',
  restricted: '受限',
  private: '私有',
}

const OBJECT_ICON_PALETTE = [
  'bg-indigo-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-sky-500',
  'bg-rose-500',
  'bg-violet-500',
  'bg-cyan-500',
  'bg-orange-500',
]

function hashIndex(value: string, modulo: number) {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash % Math.max(modulo, 1)
}

function getObjectIconClass(name: string) {
  return OBJECT_ICON_PALETTE[hashIndex(name || 'object', OBJECT_ICON_PALETTE.length)]
}

function normalizeObjectPanel(value: string | null): ObjectDetailPanel {
  if (value === 'fields' || value === 'relations' || value === 'rules' || value === 'history') return value
  if (value === 'capabilities') return 'fields'
  if (value === 'associations') return 'relations'
  if (value === 'governance') return 'rules'
  return 'definition'
}

function splitText(value: string) {
  return value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function formatDateTime(value?: string | null) {
  if (!value) return '暂无记录'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusLabel(value?: string | null) {
  if (!value) return '未设置'
  return STATUS_LABELS[value] || value
}

function statusTone(value?: string | null) {
  if (value === 'active' || value === 'ok' || value === 'ready' || value === 'executed') return 'bg-emerald-100 text-emerald-700'
  if (value === 'warning' || value === 'draft') return 'bg-amber-100 text-amber-700'
  if (value === 'blocked' || value === 'deprecated') return 'bg-rose-100 text-rose-700'
  return 'bg-slate-100 text-slate-700'
}

function visibilityLabel(value?: string | null) {
  if (!value) return '未设置'
  return VISIBILITY_LABELS[value] || value
}

function buildObjectForm(overview?: ObjectWorkbenchOverview | null): ObjectFormState {
  return {
    name: overview?.object.name || '',
    title: overview?.object.title || '',
    description: overview?.object.description || '',
    aliasesText: overview?.definition.aliasesText || '',
    status: overview?.object.status || 'draft',
    domain: '',
    owner: '',
    isAggregateRoot: true,
  }
}

function buildBreadcrumbText(
  view: WorkbenchView,
  options: { selectedObjectTitle?: string | null; isCreatingObject?: boolean; hasSelectedObject?: boolean },
) {
  if (view === 'overview') return '本体工作台 / 壳层总览'
  if (view === 'objects') {
    if (options.isCreatingObject) return '本体工作台 / 对象列表 / 新建对象'
    if (options.hasSelectedObject && options.selectedObjectTitle) {
      return `本体工作台 / 对象列表 / ${options.selectedObjectTitle}`
    }
    return '本体工作台 / 对象列表'
  }
  if (view === 'metrics') return '语义中心 / 本体工作台 / 业务指标索引'
  if (view === 'relations') return '语义中心 / 本体工作台 / 关系索引'
  if (view === 'policies') return '语义中心 / 本体工作台 / 规则与治理'
  return '本体工作台'
}

function EmptyCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-2 leading-6">{description}</div>
    </div>
  )
}

function SectionCard({
  title,
  extra,
  children,
  className,
}: {
  title: string
  extra?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('rounded-md border border-slate-200 bg-white p-5', className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
        {extra}
      </div>
      {children}
    </section>
  )
}

function InspectorSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      <div className="mt-3 space-y-1.5">{children}</div>
    </section>
  )
}

function CountBadge({ children }: { children: ReactNode }) {
  return <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{children}</span>
}

function SidebarSearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <label className="relative block">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-8 rounded-md border-0 bg-slate-100 pl-8 text-xs shadow-none"
      />
    </label>
  )
}

function LabeledField({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: ReactNode
}) {
  return (
    <label htmlFor={htmlFor} className="space-y-2">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  )
}

function SidebarGroupHeader({
  label,
  collapsed,
  onToggle,
  extra,
}: {
  label: string
  collapsed: boolean
  onToggle: () => void
  extra?: ReactNode
}) {
  const Icon = collapsed ? ChevronRight : ChevronDown
  return (
    <div className="flex items-center justify-between px-3 py-1.5">
      <button
        type="button"
        onClick={onToggle}
        className="flex flex-1 items-center gap-1 text-[12px] font-semibold text-slate-700 hover:text-slate-900"
      >
        <Icon className="h-3.5 w-3.5 text-slate-400" />
        <span>{label}</span>
      </button>
      {extra}
    </div>
  )
}

function SidebarObjectItem({
  object,
  active,
  onSelect,
}: {
  object: ObjectWorkbenchSummary
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left transition',
        active ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
      )}
    >
      <span
        className={cn(
          'flex h-4 w-4 items-center justify-center rounded-sm text-[9px] font-semibold text-white',
          active ? 'bg-blue-500' : getObjectIconClass(object.name),
        )}
      >
        <Box className="h-2.5 w-2.5" />
      </span>
      <span className="truncate text-[13px] font-medium">{object.title}</span>
    </button>
  )
}

function AuditItem({ item }: { item: GovernanceAuditTrace }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-slate-900">{item.target_name}</div>
        <Badge className={cn('rounded-full px-2 py-0.5 text-xs', statusTone(item.decision))}>
          {statusLabel(item.decision)}
        </Badge>
      </div>
      <div className="mt-2 text-sm text-slate-600">
        {item.target_type} · {item.execution_target}
      </div>
      <div className="mt-2 text-xs text-slate-500">{formatDateTime(item.timestamp)}</div>
    </div>
  )
}

function RelationTypeBadge({ relationType }: { relationType: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm px-2 py-0.5 font-mono text-[11px]',
        getRelationBadgeTone(relationType),
      )}
    >
      {relationType}
    </span>
  )
}

function ObjectInlineIcon({ name }: { name: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-4 w-4 items-center justify-center rounded-sm text-white',
        getObjectIconClass(name),
      )}
    >
      <Box className="h-2.5 w-2.5" />
    </span>
  )
}

export default function OntologyWorkbenchV2() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const currentView = normalizeWorkbenchTab(searchParams.get('tab'))
  const currentEntity = searchParams.get('entity')
  const currentPanel = normalizeObjectPanel(searchParams.get('panel'))
  const isCreatingObject = currentView === 'objects' && currentEntity === '__new__'

  const [objectSearch, setObjectSearch] = useState('')
  const [objectStatusFilter, setObjectStatusFilter] = useState<ObjectStatusFilter>('all')
  const [metricSearch, setMetricSearch] = useState('')
  const [metricObjectFilter, setMetricObjectFilter] = useState('all')
  const [metricBindingFilter, setMetricBindingFilter] = useState<MetricBindingFilter>('all')
  const [relationSearch, setRelationSearch] = useState('')
  const [relationTypeFilter, setRelationTypeFilter] = useState<RelationTypeFilter>('all')
  const [ruleSearch, setRuleSearch] = useState('')
  const [policyTargetFilter, setPolicyTargetFilter] = useState('all')
  const [objectForm, setObjectForm] = useState<ObjectFormState>(buildObjectForm())
  const [sidebarGroups, setSidebarGroups] = useState<{ objects: boolean; indexes: boolean }>({
    objects: true,
    indexes: true,
  })
  const [sidebarSearch, setSidebarSearch] = useState('')

  const updateRoute = useCallback(
    (patch: { tab?: WorkbenchView | null; entity?: string | null; panel?: ObjectDetailPanel | null }) => {
      const next = new URLSearchParams(searchParams)
      if (patch.tab !== undefined) {
        if (patch.tab) next.set('tab', patch.tab)
        else next.delete('tab')
      }
      if (patch.entity !== undefined) {
        if (patch.entity) next.set('entity', patch.entity)
        else next.delete('entity')
      }
      if (patch.panel !== undefined) {
        if (patch.panel) next.set('panel', patch.panel)
        else next.delete('panel')
      }
      setSearchParams(next)
    },
    [searchParams, setSearchParams],
  )

  const objectListQuery = useQuery({
    queryKey: ['ontology-v2', 'workbench', 'objects'],
    queryFn: async () => adaptObjectSummaryList((await getOntologyWorkbenchObjects()).data),
  })
  const governanceQuery = useQuery({
    queryKey: ['ontology-v2', 'workbench', 'governance'],
    queryFn: async () => adaptGovernanceSummary((await getOntologyWorkbenchGovernance()).data),
    enabled: currentView === 'policies',
  })
  const objectOverviewQuery = useQuery({
    queryKey: ['ontology-v2', 'workbench', 'objects', currentEntity, 'overview'],
    queryFn: async () => adaptObjectOverview((await getOntologyWorkbenchObjectOverview(currentEntity!)).data),
    enabled: currentView === 'objects' && !!currentEntity && currentEntity !== '__new__',
  })
  const metricsQuery = useQuery({
    queryKey: ['ontology-v2', 'metrics'],
    queryFn: async () => (await listBusinessMetrics()).data.items,
    enabled: currentView === 'metrics',
  })
  const relationsQuery = useQuery({
    queryKey: ['ontology-v2', 'relations'],
    queryFn: async () => (await listBusinessRelations()).data.items,
    enabled: currentView === 'relations',
  })

  const objectSummaries = useMemo(() => objectListQuery.data?.items ?? [], [objectListQuery.data?.items])
  const governanceSummary = governanceQuery.data
  const metrics = useMemo(() => metricsQuery.data ?? [], [metricsQuery.data])
  const relations = useMemo(() => relationsQuery.data ?? [], [relationsQuery.data])

  const selectedObjectSummary = useMemo(
    () => objectSummaries.find((item) => item.name === currentEntity) || null,
    [currentEntity, objectSummaries],
  )
  const selectedObjectOverview = objectOverviewQuery.data
  const selectedMetric = useMemo(
    () => (currentView === 'metrics' ? metrics.find((item) => item.name === currentEntity) || null : null),
    [currentEntity, currentView, metrics],
  )
  const selectedRelation = useMemo(
    () => (currentView === 'relations' ? relations.find((item) => item.name === currentEntity) || null : null),
    [currentEntity, currentView, relations],
  )
  const selectedPolicy = useMemo(
    () => (currentView === 'policies' ? governanceSummary?.items.find((item) => item.name === currentEntity) || null : null),
    [currentEntity, currentView, governanceSummary?.items],
  )

  useEffect(() => {
    if (currentView === 'objects' && currentEntity && currentEntity !== '__new__' && objectListQuery.isFetched && !selectedObjectSummary) {
      updateRoute({ tab: 'objects', entity: null, panel: null })
    }
  }, [currentEntity, currentView, objectListQuery.isFetched, selectedObjectSummary, updateRoute])

  useEffect(() => {
    if (currentView === 'metrics' && metrics.length > 0 && !selectedMetric) {
      updateRoute({ tab: 'metrics', entity: metrics[0].name, panel: null })
    }
  }, [currentView, metrics, selectedMetric, updateRoute])

  useEffect(() => {
    if (currentView === 'relations' && relations.length > 0 && !selectedRelation) {
      updateRoute({ tab: 'relations', entity: relations[0].name, panel: null })
    }
  }, [currentView, relations, selectedRelation, updateRoute])

  useEffect(() => {
    if (currentView === 'policies' && governanceSummary?.items.length && !selectedPolicy) {
      updateRoute({ tab: 'policies', entity: governanceSummary.items[0].name, panel: null })
    }
  }, [currentView, governanceSummary?.items, selectedPolicy, updateRoute])

  useEffect(() => {
    setObjectForm(buildObjectForm(selectedObjectOverview))
  }, [selectedObjectOverview])

  const metricLinksQuery = useQuery({
    queryKey: ['ontology-v2', 'metrics', selectedMetric?.name, 'links'],
    queryFn: async () => (await getBusinessMetricLinks(selectedMetric!.name)).data,
    enabled: !!selectedMetric,
  })
  const metricCompileQuery = useQuery({
    queryKey: ['ontology-v2', 'metrics', selectedMetric?.name, 'compile'],
    queryFn: async () => (await getExecutionCompilePreview(selectedMetric!.name)).data,
    enabled: !!selectedMetric,
  })
  const metricPlanQuery = useQuery({
    queryKey: ['ontology-v2', 'metrics', selectedMetric?.name, 'plan'],
    queryFn: async () => (await getExecutionPlanPreview(selectedMetric!.name)).data,
    enabled: !!selectedMetric,
  })
  const policyImpactQuery = useQuery({
    queryKey: ['ontology-v2', 'policies', selectedPolicy?.name, 'impact'],
    queryFn: async () => (await getPolicyImpact(selectedPolicy!.name)).data,
    enabled: !!selectedPolicy,
  })
  const policyAuditQuery = useQuery({
    queryKey: ['ontology-v2', 'policies', selectedPolicy?.name, 'audit'],
    queryFn: async () => (await getPolicyAudit(selectedPolicy!.name)).data,
    enabled: !!selectedPolicy,
  })

  const saveObjectMutation = useMutation({
    mutationFn: async (payload: ObjectFormState) =>
      (
        await saveBusinessObject({
          name: payload.name.trim(),
          title: payload.title.trim(),
          description: payload.description.trim(),
          aliases: splitText(payload.aliasesText),
          status: payload.status || 'draft',
        })
      ).data,
    onSuccess: async (payload) => {
      await queryClient.invalidateQueries({ queryKey: ['ontology-v2', 'workbench', 'objects'] })
      await queryClient.invalidateQueries({ queryKey: ['ontology-v2', 'workbench', 'objects', payload.name, 'overview'] })
      updateRoute({ tab: 'objects', entity: payload.name, panel: currentPanel })
      toast({ title: '对象已保存', description: `${payload.title} 已同步到本体定义。` })
    },
    onError: (error: Error) => {
      toast({ title: '保存失败', description: error.message, variant: 'destructive' })
    },
  })

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (currentView === 'objects') {
        const entityName = (isCreatingObject ? objectForm.name : selectedObjectOverview?.object.name || selectedObjectSummary?.name || '').trim()
        return (await publishOntologyEntity('objects', entityName)).data
      }
      if (currentView === 'metrics' && selectedMetric) return (await publishOntologyEntity('metrics', selectedMetric.name)).data
      if (currentView === 'relations' && selectedRelation) return (await publishOntologyEntity('relations', selectedRelation.name)).data
      if (currentView === 'policies' && selectedPolicy) return (await publishOntologyEntity('policies', selectedPolicy.name)).data
      throw new Error('当前没有可发布的资产')
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['ontology-v2'] })
      toast({ title: '发布校验已通过', description: '当前语义资产已进入发布流程。' })
    },
    onError: (error: Error) => {
      toast({ title: '发布失败', description: error.message, variant: 'destructive' })
    },
  })

  const sidebarObjects = useMemo(() => {
    const keyword = sidebarSearch.trim().toLowerCase()
    if (!keyword) return objectSummaries
    return objectSummaries.filter(
      (item) =>
        item.title.toLowerCase().includes(keyword) ||
        item.name.toLowerCase().includes(keyword) ||
        item.description.toLowerCase().includes(keyword),
    )
  }, [objectSummaries, sidebarSearch])

  const filteredObjects = useMemo(() => {
    return objectSummaries.filter((item) => {
      const keyword = objectSearch.trim().toLowerCase()
      const matchesKeyword =
        !keyword ||
        item.title.toLowerCase().includes(keyword) ||
        item.name.toLowerCase().includes(keyword) ||
        item.description.toLowerCase().includes(keyword)
      if (!matchesKeyword) return false
      if (objectStatusFilter === 'all') return true
      if (objectStatusFilter === 'warning') return item.riskCount > 0
      return item.status === objectStatusFilter
    })
  }, [objectSearch, objectStatusFilter, objectSummaries])

  const filteredMetrics = useMemo(() => {
    return metrics.filter((metric) => {
      const keyword = metricSearch.trim().toLowerCase()
      const matchesKeyword =
        !keyword ||
        metric.title.toLowerCase().includes(keyword) ||
        metric.name.toLowerCase().includes(keyword) ||
        (metric.description || '').toLowerCase().includes(keyword)
      if (!matchesKeyword) return false
      if (metricObjectFilter !== 'all' && metric.object_name !== metricObjectFilter) return false
      if (metricBindingFilter === 'bound') return metric.measure_refs.length > 0
      if (metricBindingFilter === 'unbound') return metric.measure_refs.length === 0
      return true
    })
  }, [metricBindingFilter, metricObjectFilter, metricSearch, metrics])

  const filteredRelations = useMemo(() => {
    return relations.filter((relation) => {
      const keyword = relationSearch.trim().toLowerCase()
      const matchesKeyword =
        !keyword ||
        relation.title.toLowerCase().includes(keyword) ||
        relation.name.toLowerCase().includes(keyword) ||
        (relation.description || '').toLowerCase().includes(keyword) ||
        relation.source_object_name.toLowerCase().includes(keyword) ||
        relation.target_object_name.toLowerCase().includes(keyword)
      if (!matchesKeyword) return false
      if (relationTypeFilter === 'all') return true
      return relation.relation_type === relationTypeFilter
    })
  }, [relationSearch, relationTypeFilter, relations])

  const filteredPolicies = useMemo(() => {
    return (governanceSummary?.items || []).filter((policy) => {
      const keyword = ruleSearch.trim().toLowerCase()
      const matchesKeyword =
        !keyword ||
        policy.name.toLowerCase().includes(keyword) ||
        policy.target_name.toLowerCase().includes(keyword) ||
        (policy.description || '').toLowerCase().includes(keyword)
      if (!matchesKeyword) return false
      if (policyTargetFilter === 'all') return true
      return policy.target_name === policyTargetFilter
    })
  }, [governanceSummary?.items, policyTargetFilter, ruleSearch])

  const selectedObjectTitle = selectedObjectOverview?.object.title || selectedObjectSummary?.title || null
  const breadcrumbText = useMemo(
    () =>
      buildBreadcrumbText(currentView, {
        selectedObjectTitle,
        isCreatingObject,
        hasSelectedObject: !!currentEntity,
      }),
    [currentView, selectedObjectTitle, isCreatingObject, currentEntity],
  )
  const shouldShowObjectDetail = currentView === 'objects' && (isCreatingObject || !!currentEntity)
  const selectedObjectMetrics = useMemo(
    () => selectedObjectOverview?.associations.metrics ?? [],
    [selectedObjectOverview?.associations.metrics],
  )
  const selectedObjectRules = selectedObjectOverview?.associations.rules || []
  const selectedObjectActions = useMemo(
    () => selectedObjectOverview?.capabilities.actions ?? [],
    [selectedObjectOverview?.capabilities.actions],
  )
  const linkedCubes = useMemo(() => {
    const cubes = new Set<string>()
    selectedObjectMetrics.forEach((metric) => {
      metric.measure_refs.forEach((measureRef) => {
        const cubeName = measureRef.split('.')[0]
        if (cubeName) cubes.add(cubeName)
      })
    })
    selectedObjectActions.forEach((action) => action.event_cube_refs.forEach((cubeName) => cubes.add(cubeName)))
    return [...cubes]
  }, [selectedObjectActions, selectedObjectMetrics])

  const headerButton = useMemo(() => {
    if (currentView === 'overview') {
      return { save: true, publish: false, newObject: false }
    }
    if (currentView === 'objects') {
      if (shouldShowObjectDetail) {
        return { save: true, publish: true, newObject: false }
      }
      return { save: false, publish: false, newObject: true }
    }
    return { save: true, publish: true, newObject: false }
  }, [currentView, shouldShowObjectDetail])

  const showInspector = currentView === 'overview' || currentView === 'objects' || currentView === 'metrics'
  const mainGridCols = showInspector
    ? 'grid-cols-[270px_minmax(0,1fr)_300px]'
    : 'grid-cols-[270px_minmax(0,1fr)]'

  const inspectorContent = useMemo(() => {
    if (currentView === 'objects' && selectedObjectOverview) {
      return {
        title: selectedObjectOverview.object.title,
        subtitle: selectedObjectOverview.object.name,
        statistics: [
          { label: '字段数', value: `${selectedObjectOverview.stats.property_count}` },
          { label: '关系数', value: `${selectedObjectOverview.stats.relation_count}` },
          { label: '规则数', value: `${selectedObjectOverview.stats.rule_count}` },
          { label: '版本', value: '—' },
        ],
        recentActivities: selectedObjectOverview.lifecycle.historyItems.slice(0, 3),
      }
    }
    if (currentView === 'metrics' && selectedMetric) {
      return {
        title: selectedMetric.title,
        subtitle: selectedMetric.object_name,
        statistics: [
          { label: '绑定健康', value: getMetricBindingStatus(selectedMetric) },
          { label: '关联 Cube', value: `${metricLinksQuery.data?.linked_cubes.length || 0} 个` },
          { label: '编译状态', value: statusLabel(metricCompileQuery.data?.status) },
          { label: '计划步骤', value: `${metricPlanQuery.data?.steps.length || 0} 步` },
        ],
        recentActivities: [],
      }
    }
    return null
  }, [
    currentView,
    metricCompileQuery.data?.status,
    metricLinksQuery.data?.linked_cubes.length,
    metricPlanQuery.data?.steps.length,
    selectedMetric,
    selectedObjectOverview,
  ])

  const sidebarSpecialActive = (key: WorkbenchView) => currentView === key

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-slate-950">
      <header role="banner" className="flex h-12 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div className="text-[13px] font-medium text-slate-500">{breadcrumbText}</div>
        <div className="flex items-center gap-3">
          {headerButton.newObject ? (
            <FormButton
              size="sm"
              className="rounded-md px-3"
              onClick={() => updateRoute({ tab: 'objects', entity: '__new__', panel: 'definition' })}
            >
              + 新建对象
            </FormButton>
          ) : null}
          {headerButton.save ? (
            <FormButton
              size="sm"
              variant="outline"
              className="rounded-md px-3"
              onClick={() => {
                if (currentView === 'objects') saveObjectMutation.mutate(objectForm)
              }}
              disabled={saveObjectMutation.isPending || currentView !== 'objects'}
            >
              保存
            </FormButton>
          ) : null}
          {headerButton.publish ? (
            <FormButton
              size="sm"
              className="rounded-md px-3"
              onClick={() => publishMutation.mutate()}
              disabled={publishMutation.isPending}
            >
              发布
            </FormButton>
          ) : null}
        </div>
      </header>

      <div className={cn('grid min-h-[calc(100vh-3rem)]', mainGridCols)}>
        <aside className="border-r border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-3 py-2">
            <SidebarSearchField value={sidebarSearch} onChange={setSidebarSearch} placeholder="搜索对象..." />
          </div>
          <div className="space-y-1 pb-2">
            <SidebarGroupHeader
              label="业务对象"
              collapsed={!sidebarGroups.objects}
              onToggle={() => setSidebarGroups((prev) => ({ ...prev, objects: !prev.objects }))}
              extra={
                <button
                  type="button"
                  onClick={() => updateRoute({ tab: 'objects', entity: '__new__', panel: 'definition' })}
                  className="flex h-6 items-center gap-1 rounded-md bg-blue-500 px-2 text-[11px] font-medium text-white hover:bg-blue-600"
                >
                  + 新建
                </button>
              }
            />
            {sidebarGroups.objects ? (
              <div className="space-y-0.5 px-2">
                {objectListQuery.isLoading ? (
                  <div className="rounded-md bg-slate-50 px-3 py-3 text-[12px] text-slate-500">正在加载对象列表...</div>
                ) : sidebarObjects.length === 0 ? (
                  <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-[12px] text-slate-500">
                    暂无对象
                  </div>
                ) : (
                  sidebarObjects.map((object) => (
                    <SidebarObjectItem
                      key={object.name}
                      object={object}
                      active={currentView === 'objects' && currentEntity === object.name}
                      onSelect={() => updateRoute({ tab: 'objects', entity: object.name, panel: 'definition' })}
                    />
                  ))
                )}
              </div>
            ) : null}

            <SidebarGroupHeader
              label="专项索引"
              collapsed={!sidebarGroups.indexes}
              onToggle={() => setSidebarGroups((prev) => ({ ...prev, indexes: !prev.indexes }))}
            />
            {sidebarGroups.indexes ? (
              <div className="space-y-0.5 px-2">
                {SPECIAL_INDEXES.map((item) => {
                  const active = sidebarSpecialActive(item.key)
                  const Icon = item.icon
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => updateRoute({ tab: item.key, entity: null, panel: null })}
                      className={cn(
                        'flex h-7 w-full items-center gap-2 rounded-md px-3 text-left text-[12px] transition',
                        active ? 'bg-blue-50 font-semibold text-blue-600' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                      )}
                    >
                      <Icon className={cn('h-3.5 w-3.5', active ? 'text-blue-500' : 'text-slate-400')} />
                      <span>{item.label}</span>
                    </button>
                  )
                })}
              </div>
            ) : null}
          </div>
        </aside>

        <main className="bg-[#f7f8fa]">
          {currentView === 'overview' ? (
            <div className="flex h-full flex-col">
              <section className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded bg-slate-100 text-slate-500">
                    <Box className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-base font-semibold text-slate-950">壳层总览</div>
                    <div className="mt-0.5 text-xs text-slate-400">本体工作台 · 对象聚合组架构</div>
                  </div>
                </div>
                <FormButton
                  size="sm"
                  variant="outline"
                  className="rounded-md px-3"
                  onClick={() => updateRoute({ tab: 'objects', entity: null, panel: null })}
                >
                  选择对象
                </FormButton>
              </section>
              <div className="flex flex-1 flex-col items-center justify-center py-16 text-slate-400">
                <Box className="h-10 w-10 text-slate-300" strokeWidth={1.2} />
                <div className="mt-4 text-sm font-medium text-slate-500">请从左侧选择一个对象</div>
                <div className="mt-1 text-xs text-slate-400">选择后可查看对象定义、字段、关系与规则</div>
              </div>
            </div>
          ) : currentView === 'objects' ? (
            shouldShowObjectDetail ? (
              <div className="flex h-full flex-col">
                <section className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded text-white',
                        getObjectIconClass(selectedObjectOverview?.object.name || 'new'),
                      )}
                    >
                      <Box className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <div className="text-lg font-semibold text-slate-950">
                        {isCreatingObject ? '新建对象' : selectedObjectOverview?.object.title || '对象详情'}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-400">
                        {isCreatingObject ? '未保存对象' : selectedObjectOverview?.object.name || '正在加载对象...'}
                      </div>
                    </div>
                  </div>
                  <Badge className={cn('rounded-full px-2.5 py-0.5 text-xs', statusTone(objectForm.status))}>
                    {statusLabel(objectForm.status)}
                  </Badge>
                </section>
                <section className="border-b border-slate-200 bg-white px-6">
                  <div className="flex items-center">
                    {OBJECT_PANELS.map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        aria-selected={currentPanel === tab.key}
                        onClick={() => updateRoute({ tab: 'objects', entity: currentEntity, panel: tab.key })}
                        className={cn(
                          'border-b-2 px-4 py-3 text-[13px] transition',
                          currentPanel === tab.key
                            ? 'border-blue-500 font-semibold text-blue-500'
                            : 'border-transparent text-slate-600 hover:text-slate-900',
                        )}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </section>
                <div className="space-y-5 p-6">
                  {objectOverviewQuery.isLoading && !isCreatingObject ? (
                    <EmptyCard title="对象详情加载中" description="正在从 OWV2 聚合读模型读取对象详情..." />
                  ) : objectOverviewQuery.isError && !isCreatingObject ? (
                    <EmptyCard title="对象详情加载失败" description="请稍后重试，或检查后端 OWV2 工作台聚合接口是否可用。" />
                  ) : currentPanel === 'definition' ? (
                    <>
                      <SectionCard title="基本信息">
                        <div className="grid gap-4 md:grid-cols-2">
                          <LabeledField label="对象名称" htmlFor="object-title">
                            <FormInput
                              id="object-title"
                              value={objectForm.title}
                              onChange={(value) => setObjectForm((current) => ({ ...current, title: value }))}
                              placeholder="请输入对象名称"
                            />
                          </LabeledField>
                          <LabeledField label="英文标识符" htmlFor="object-name">
                            <FormInput
                              id="object-name"
                              value={objectForm.name}
                              onChange={(value) => setObjectForm((current) => ({ ...current, name: value }))}
                              placeholder="例如 order"
                            />
                          </LabeledField>
                        </div>
                        <div className="mt-4">
                          <LabeledField label="描述" htmlFor="object-description">
                            <FormTextarea
                              id="object-description"
                              value={objectForm.description}
                              onChange={(value) => setObjectForm((current) => ({ ...current, description: value }))}
                              placeholder="描述这个业务对象表达什么，以及它在语义中心中的职责"
                              rows={3}
                            />
                          </LabeledField>
                        </div>
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <LabeledField label="所属域" htmlFor="object-domain">
                            <FormInput
                              id="object-domain"
                              value={objectForm.domain}
                              onChange={(value) => setObjectForm((current) => ({ ...current, domain: value }))}
                              placeholder="如 交易域"
                            />
                          </LabeledField>
                          <LabeledField label="负责人" htmlFor="object-owner">
                            <FormInput
                              id="object-owner"
                              value={objectForm.owner}
                              onChange={(value) => setObjectForm((current) => ({ ...current, owner: value }))}
                              placeholder="如 张三"
                            />
                          </LabeledField>
                        </div>
                      </SectionCard>

                      <SectionCard title="聚合根配置">
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-slate-900">设为聚合根</span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={objectForm.isAggregateRoot}
                            onClick={() =>
                              setObjectForm((current) => ({ ...current, isAggregateRoot: !current.isAggregateRoot }))
                            }
                            className={cn(
                              'inline-flex h-5 w-9 items-center rounded-full p-0.5 transition',
                              objectForm.isAggregateRoot ? 'bg-blue-500' : 'bg-slate-300',
                            )}
                          >
                            <span
                              className={cn(
                                'h-4 w-4 rounded-full bg-white transition',
                                objectForm.isAggregateRoot ? 'ml-auto' : '',
                              )}
                            />
                          </button>
                          <Badge
                            className={cn(
                              'rounded px-2 py-0.5 text-[11px]',
                              objectForm.isAggregateRoot
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-slate-100 text-slate-700',
                            )}
                          >
                            {objectForm.isAggregateRoot ? '已启用' : '未启用'}
                          </Badge>
                        </div>
                        <div className="mt-4 rounded-md bg-blue-50 p-3 text-xs leading-6 text-slate-600">
                          聚合根是领域驱动设计中的核心概念，作为一组相关对象的入口点，确保业务规则的一致性。
                        </div>
                      </SectionCard>

                      <SectionCard title="标签">
                        <div className="flex flex-wrap gap-2">
                          {splitText(objectForm.aliasesText).map((alias) => (
                            <Badge key={alias} className="rounded-md bg-slate-100 px-2.5 py-0.5 text-slate-700">
                              {alias}
                            </Badge>
                          ))}
                          <button
                            type="button"
                            className="rounded-md border border-dashed border-slate-300 px-2.5 py-0.5 text-[11px] text-slate-400 hover:border-slate-400 hover:text-slate-600"
                          >
                            +
                          </button>
                        </div>
                      </SectionCard>
                    </>
                  ) : currentPanel === 'fields' ? (
                    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
                      <SectionCard title="字段列表">
                        {selectedObjectOverview?.capabilities.properties.length ? (
                          <div className="space-y-0 divide-y divide-slate-200 overflow-hidden rounded-md border border-slate-200">
                            {selectedObjectOverview.capabilities.properties.map((property) => (
                              <div key={property.name} className="bg-white px-4 py-3">
                                <div className="flex items-center justify-between gap-4">
                                  <div>
                                    <div className="text-sm font-semibold text-slate-950">{property.title}</div>
                                    <div className="mt-1 font-mono text-[10px] text-slate-400">{property.name}</div>
                                  </div>
                                  <Badge className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                                    {property.property_type}
                                  </Badge>
                                </div>
                                <div className="mt-2 text-sm text-slate-600">{property.description || '暂无字段说明'}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <EmptyCard title="暂无属性" description="当前对象还没有附着属性定义。" />
                        )}
                      </SectionCard>
                      <SectionCard title="对象动作">
                        {selectedObjectOverview?.capabilities.actions.length ? (
                          <div className="space-y-3">
                            {selectedObjectOverview.capabilities.actions.map((action) => (
                              <div key={action.name} className="rounded-md border border-slate-200 bg-slate-50 p-4">
                                <div className="text-sm font-semibold text-slate-950">{action.title}</div>
                                <div className="mt-1 font-mono text-[10px] text-slate-400">{action.name}</div>
                                <div className="mt-3 text-sm text-slate-600">{action.description || '暂无动作说明'}</div>
                                <div className="mt-3 text-xs text-slate-500">
                                  事件 Cube：{action.event_cube_refs.join(', ') || '未绑定'}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <EmptyCard title="暂无动作" description="当前对象还没有定义业务动作。" />
                        )}
                      </SectionCard>
                    </div>
                  ) : currentPanel === 'relations' ? (
                    <div className="space-y-5">
                      <SectionCard title="关系图">
                        {selectedObjectOverview?.associations.relations.length ? (
                          <div className="space-y-0 divide-y divide-slate-200 overflow-hidden rounded-md border border-slate-200">
                            {selectedObjectOverview.associations.relations.map((relation) => (
                              <div key={relation.name} className="bg-white px-4 py-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <div className="text-sm font-semibold text-slate-950">{relation.title}</div>
                                    <div className="mt-1 text-xs text-slate-500">
                                      {relation.source_object_name} → {relation.target_object_name}
                                    </div>
                                  </div>
                                  <RelationTypeBadge relationType={relation.relation_type} />
                                </div>
                                <div className="mt-2 text-sm text-slate-600">{relation.description || '暂无关系说明'}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <EmptyCard title="暂无关系" description="当前对象尚未配置上下游语义关系。" />
                        )}
                      </SectionCard>

                      <SectionCard title="关联业务指标">
                        {selectedObjectMetrics.length ? (
                          <div className="grid gap-4 xl:grid-cols-2">
                            {selectedObjectMetrics.map((metric) => (
                              <div key={metric.name} className="rounded-md border border-slate-200 bg-white p-4">
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <div className="text-sm font-semibold text-slate-950">{metric.title}</div>
                                    <div className="mt-1 font-mono text-[10px] text-slate-400">{metric.name}</div>
                                  </div>
                                  <Badge
                                    className={cn(
                                      'rounded px-2 py-0.5 text-[11px]',
                                      getMetricBindingTone(metric.bindingStatus),
                                    )}
                                  >
                                    {metric.bindingStatus}
                                  </Badge>
                                </div>
                                <div className="mt-3 text-sm leading-6 text-slate-600">{metric.semantic_formula}</div>
                                <div className="mt-2 text-xs text-slate-500">
                                  Measure：{metric.measure_refs.join(', ') || '待绑定'}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <EmptyCard title="暂无业务指标" description="当前对象还没有定义业务指标。" />
                        )}
                      </SectionCard>

                      <SectionCard title="关联分析模型">
                        {linkedCubes.length ? (
                          <div className="flex flex-wrap gap-2">
                            {linkedCubes.map((cubeName) => (
                              <Badge key={cubeName} className="rounded-md bg-slate-100 px-3 py-1 text-slate-700">
                                {cubeName}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <EmptyCard title="暂无分析模型绑定" description="当前对象尚未通过指标或动作关联分析模型。" />
                        )}
                      </SectionCard>
                    </div>
                  ) : currentPanel === 'rules' ? (
                    <div className="space-y-5">
                      <SectionCard title="规则">
                        {selectedObjectRules.length ? (
                          <div className="space-y-3">
                            {selectedObjectRules.map((rule) => (
                              <div
                                key={`${rule.target_name}-${rule.visibility}`}
                                className="rounded-md border border-slate-200 bg-white p-4"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <div className="text-sm font-semibold text-slate-950">
                                      {rule.description || `${rule.target_name} 可见性规则`}
                                    </div>
                                    <div className="mt-1 text-xs text-slate-500">
                                      {rule.target_type} · {rule.target_name}
                                    </div>
                                  </div>
                                  <Badge className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                                    {visibilityLabel(rule.visibility)}
                                  </Badge>
                                </div>
                                <div className="mt-3 text-sm text-slate-600">
                                  允许角色：{rule.allowed_roles.join('、') || '未设置'}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <EmptyCard title="暂无规则" description="当前对象还没有附着治理规则。" />
                        )}
                      </SectionCard>

                      <SectionCard title="治理信号">
                        <div className="space-y-3">
                          {selectedObjectOverview?.governance.staleItems.map((item, index) => (
                            <div
                              key={`stale-${index}`}
                              className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
                            >
                              {String(item.reason || '发现待处理 stale 问题')}
                            </div>
                          ))}
                          {selectedObjectOverview?.governance.consistencyItems.map((item, index) => (
                            <div
                              key={`consistency-${index}`}
                              className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"
                            >
                              {String(item.reason || '存在一致性风险')}
                            </div>
                          ))}
                          {!selectedObjectOverview?.governance.riskCount ? (
                            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                              当前对象暂无额外治理风险。
                            </div>
                          ) : null}
                        </div>
                      </SectionCard>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      <SectionCard title="历史">
                        {selectedObjectOverview?.lifecycle.historyItems.length ? (
                          <div className="space-y-2">
                            {selectedObjectOverview.lifecycle.historyItems.map((item) => (
                              <div key={item.id} className="rounded-md border border-slate-200 bg-white px-4 py-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-sm text-slate-900">{item.summary || item.action}</div>
                                  <Badge
                                    className={cn('rounded-full px-2 py-0.5 text-[11px]', statusTone(item.status))}
                                  >
                                    {statusLabel(item.status)}
                                  </Badge>
                                </div>
                                <div className="mt-1 text-xs text-slate-400">{formatDateTime(item.timestamp)}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <EmptyCard title="暂无历史记录" description="保存或发布后会在这里沉淀对象历史。" />
                        )}
                      </SectionCard>
                      <SectionCard title="生命周期摘要">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                            <div className="text-xs text-slate-500">最近活动</div>
                            <div className="mt-2 text-sm font-medium text-slate-900">
                              {selectedObjectOverview?.lifecycle.lastActivitySummary || '暂无记录'}
                            </div>
                          </div>
                          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                            <div className="text-xs text-slate-500">历史总数</div>
                            <div className="mt-2 text-sm font-medium text-slate-900">
                              {selectedObjectOverview?.lifecycle.historyTotal || 0} 条
                            </div>
                          </div>
                        </div>
                      </SectionCard>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-5 p-6">
                <section className="rounded-md border border-slate-200 bg-white p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <h1 className="text-base font-semibold text-slate-950">对象列表</h1>
                      <CountBadge>{filteredObjects.length} 个对象</CountBadge>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_140px]">
                    <label className="relative block">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={objectSearch}
                        onChange={(event) => setObjectSearch(event.target.value)}
                        placeholder="按名称筛选..."
                        className="h-8 rounded-md border border-slate-200 bg-white pl-8 text-xs"
                      />
                    </label>
                    <select
                      value={objectStatusFilter}
                      onChange={(event) => setObjectStatusFilter(event.target.value as ObjectStatusFilter)}
                      className="h-8 rounded-md border border-slate-200 bg-white px-3 text-xs"
                    >
                      <option value="all">全部状态</option>
                      <option value="active">已发布</option>
                      <option value="draft">草稿</option>
                      <option value="warning">有风险</option>
                    </select>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-2">
                    {objectListQuery.isLoading ? (
                      <div className="col-span-full rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
                        正在加载对象列表...
                      </div>
                    ) : filteredObjects.length === 0 ? (
                      <div className="col-span-full rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
                        暂无对象，可通过新建对象开始建模。
                      </div>
                    ) : (
                      filteredObjects.map((object) => (
                        <button
                          key={object.name}
                          type="button"
                          onClick={() => updateRoute({ tab: 'objects', entity: object.name, panel: 'definition' })}
                          className="group flex flex-col rounded-md border border-slate-200 bg-white p-4 text-left transition hover:border-blue-300 hover:shadow-sm"
                          aria-label={`${object.title} 卡片`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <div
                                className={cn(
                                  'flex h-7 w-7 items-center justify-center rounded text-white',
                                  getObjectIconClass(object.name),
                                )}
                              >
                                <Box className="h-4 w-4" />
                              </div>
                              <div>
                                <div className="text-sm font-semibold text-slate-950">{object.title}</div>
                                <div className="mt-0.5 font-mono text-[10px] text-slate-400">{object.name}</div>
                              </div>
                            </div>
                            <Badge className={cn('rounded-full px-2 py-0.5 text-[11px]', statusTone(object.status))}>
                              {statusLabel(object.status)}
                            </Badge>
                          </div>
                          <div className="mt-3 line-clamp-2 text-xs leading-5 text-slate-500">
                            {object.description || '暂无业务描述'}
                          </div>
                          <div className="mt-4 grid grid-cols-3 gap-3">
                            <div>
                              <div className="text-[10px] text-slate-400">字段数</div>
                              <div className="mt-1 text-sm font-semibold text-slate-900">{object.propertyCount}</div>
                            </div>
                            <div>
                              <div className="text-[10px] text-slate-400">关系数</div>
                              <div className="mt-1 text-sm font-semibold text-slate-900">{object.relationCount}</div>
                            </div>
                            <div>
                              <div className="text-[10px] text-slate-400">规则数</div>
                              <div className="mt-1 text-sm font-semibold text-slate-900">{object.ruleCount}</div>
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </section>
              </div>
            )
          ) : currentView === 'metrics' ? (
            <div className="space-y-5 p-6">
              <section className="rounded-md border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <h1 className="text-base font-semibold text-slate-950">业务指标索引</h1>
                    <CountBadge>{filteredMetrics.length} 个指标</CountBadge>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="relative block">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={metricSearch}
                        onChange={(event) => setMetricSearch(event.target.value)}
                        placeholder="搜索指标..."
                        className="h-8 w-[180px] rounded-md border border-slate-200 bg-white pl-8 text-xs"
                      />
                    </label>
                    <select
                      value={metricObjectFilter}
                      onChange={(event) => setMetricObjectFilter(event.target.value)}
                      className="h-8 rounded-md border border-slate-200 bg-white px-3 text-xs"
                      aria-label="对象筛选"
                    >
                      <option value="all">对象筛选</option>
                      {objectSummaries.map((object) => (
                        <option key={object.name} value={object.name}>
                          {object.title}
                        </option>
                      ))}
                    </select>
                    <select
                      value={metricBindingFilter}
                      onChange={(event) => setMetricBindingFilter(event.target.value as MetricBindingFilter)}
                      className="h-8 rounded-md border border-slate-200 bg-white px-3 text-xs"
                      aria-label="绑定状态"
                    >
                      <option value="all">绑定状态</option>
                      <option value="bound">已绑定</option>
                      <option value="unbound">未绑定</option>
                    </select>
                  </div>
                </div>

                <div className="mt-4 flex items-start gap-2 rounded-md border border-blue-100 bg-blue-50/50 p-3 text-[12px] leading-5 text-slate-600">
                  <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-blue-500" />
                  <div>业务指标是对象下的语义能力声明，技术绑定在 Cube 层实现。此页为治理辅助视图。</div>
                </div>

                <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-left text-[12px] text-slate-500">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">指标名称</th>
                        <th className="px-4 py-2.5 font-medium">所属对象</th>
                        <th className="px-4 py-2.5 font-medium">业务口径</th>
                        <th className="px-4 py-2.5 font-medium">绑定状态</th>
                        <th className="px-4 py-2.5 font-medium">关联 Cube / Measure</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {filteredMetrics.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                            暂无指标
                          </td>
                        </tr>
                      ) : (
                        filteredMetrics.map((metric) => {
                          const measureRef = metric.measure_refs[0]
                          const cubeName = measureRef?.includes('.') ? measureRef.split('.')[0] : ''
                          const measureName = measureRef?.includes('.')
                            ? measureRef.split('.').slice(1).join('.')
                            : measureRef
                          const bindingStatus = getMetricBindingStatus(metric)
                          return (
                            <tr
                              key={metric.name}
                              onClick={() => updateRoute({ tab: 'metrics', entity: metric.name, panel: null })}
                              className={cn(
                                'cursor-pointer transition hover:bg-slate-50',
                                selectedMetric?.name === metric.name && 'bg-slate-50',
                              )}
                            >
                              <td className="px-4 py-3">
                                <div className="text-sm font-medium text-slate-950">{metric.title}</div>
                                <div className="mt-0.5 font-mono text-[10px] text-slate-400">{metric.name}</div>
                              </td>
                              <td className="px-4 py-3">
                                <Badge className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                                  {metric.object_name}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-slate-600">{metric.semantic_formula}</td>
                              <td className="px-4 py-3">
                                <Badge
                                  className={cn(
                                    'rounded-md px-2 py-0.5 text-[11px]',
                                    getMetricBindingTone(bindingStatus),
                                  )}
                                >
                                  {bindingStatus}
                                </Badge>
                              </td>
                              <td className="px-4 py-3">
                                {measureRef ? (
                                  <div className="text-[12px] leading-5">
                                    <div className="font-mono text-blue-600">{cubeName || measureRef}</div>
                                    {cubeName ? (
                                      <div className="font-mono text-slate-500">measure: {measureName}</div>
                                    ) : null}
                                  </div>
                                ) : (
                                  <span className="text-xs text-slate-400">— 待绑定</span>
                                )}
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          ) : currentView === 'relations' ? (
            <div className="space-y-5 p-6">
              <section className="rounded-md border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <h1 className="text-base font-semibold text-slate-950">关系索引</h1>
                    <CountBadge>{filteredRelations.length} 条关系</CountBadge>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="relative block">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={relationSearch}
                        onChange={(event) => setRelationSearch(event.target.value)}
                        placeholder="搜索关系..."
                        className="h-8 w-[180px] rounded-md border border-slate-200 bg-white pl-8 text-xs"
                      />
                    </label>
                    <select
                      value={relationTypeFilter}
                      onChange={(event) => setRelationTypeFilter(event.target.value)}
                      className="h-8 rounded-md border border-slate-200 bg-white px-3 text-xs"
                      aria-label="关系类型"
                    >
                      <option value="all">关系类型</option>
                      {[...new Set(relations.map((item) => item.relation_type))].map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-left text-[12px] text-slate-500">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">源对象</th>
                        <th className="px-4 py-2.5 font-medium">关系类型</th>
                        <th className="px-4 py-2.5 font-medium">目标对象</th>
                        <th className="px-4 py-2.5 font-medium">状态</th>
                        <th className="px-4 py-2.5 font-medium">说明</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {filteredRelations.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                            暂无关系
                          </td>
                        </tr>
                      ) : (
                        filteredRelations.map((relation) => (
                          <tr
                            key={relation.name}
                            onClick={() => updateRoute({ tab: 'relations', entity: relation.name, panel: null })}
                            className={cn(
                              'cursor-pointer transition hover:bg-slate-50',
                              selectedRelation?.name === relation.name && 'bg-slate-50',
                            )}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <ObjectInlineIcon name={relation.source_object_name} />
                                <span className="text-sm text-slate-950">
                                  {objectSummaries.find((item) => item.name === relation.source_object_name)?.title ||
                                    relation.source_object_name}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <RelationTypeBadge relationType={relation.relation_type} />
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <ObjectInlineIcon name={relation.target_object_name} />
                                <span className="text-sm text-slate-950">
                                  {objectSummaries.find((item) => item.name === relation.target_object_name)?.title ||
                                    relation.target_object_name}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <Badge className={cn('rounded-full px-2 py-0.5 text-[11px]', statusTone(relation.status))}>
                                {statusLabel(relation.status)}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-slate-600">{relation.description || '暂无说明'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          ) : (
            <div className="space-y-5 p-6">
              <section className="rounded-md border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <h1 className="text-base font-semibold text-slate-950">规则与治理</h1>
                    <CountBadge>{filteredPolicies.length} 条规则</CountBadge>
                    {governanceSummary?.summary.totalRiskCount ? (
                      <Badge className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700">
                        风控项 {governanceSummary.summary.totalRiskCount}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="relative block">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={ruleSearch}
                        onChange={(event) => setRuleSearch(event.target.value)}
                        placeholder="搜索规则..."
                        className="h-8 w-[180px] rounded-md border border-slate-200 bg-white pl-8 text-xs"
                      />
                    </label>
                    <select
                      value={policyTargetFilter}
                      onChange={(event) => setPolicyTargetFilter(event.target.value)}
                      className="h-8 rounded-md border border-slate-200 bg-white px-3 text-xs"
                      aria-label="规则目标"
                    >
                      <option value="all">全部目标</option>
                      {[...new Set((governanceSummary?.items || []).map((item) => item.target_name))].map((name) => (
                        <option key={name} value={name}>
                          指标 · {name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              {filteredPolicies.length === 0 ? (
                <EmptyCard title="暂无规则" description="当前没有符合筛选条件的规则记录。" />
              ) : (
                <>
                  <div className="space-y-4">
                    {filteredPolicies.map((policy) => {
                      const isSelected = selectedPolicy?.name === policy.name
                      const impactIssues = (isSelected ? policyImpactQuery.data?.issues : undefined) || policy.issues
                      const auditItems = isSelected ? policyAuditQuery.data?.items || [] : []
                      return (
                        <button
                          key={policy.name}
                          type="button"
                          onClick={() => updateRoute({ tab: 'policies', entity: policy.name, panel: null })}
                          className={cn(
                            'block w-full rounded-md border border-slate-200 bg-white p-5 text-left transition',
                            isSelected ? 'border-blue-200 bg-blue-50/30' : 'hover:border-slate-300',
                          )}
                          aria-label={`规则 ${policy.name}`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="text-base font-semibold text-slate-950">{policy.name}</div>
                              <div className="mt-1 text-xs text-slate-500">{policy.targetLabel}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge className={cn('rounded-md px-2 py-0.5 text-[11px]', statusTone(policy.status))}>
                                {statusLabel(policy.status)}
                              </Badge>
                              {policy.riskCount ? (
                                <Badge className="rounded-md bg-rose-100 px-2 py-0.5 text-[11px] text-rose-700">
                                  风控项 {policy.riskCount}
                                </Badge>
                              ) : null}
                            </div>
                          </div>

                          <div className="mt-5 grid gap-4 md:grid-cols-2">
                            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                              <div className="text-[11px] text-slate-400">规则摘要</div>
                              <div className="mt-2 text-sm leading-6 text-slate-700">
                                {policy.description || '暂无规则说明'}
                              </div>
                            </div>
                            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                              <div className="text-[11px] text-slate-400">风险与审计</div>
                              <div className="mt-2 space-y-2 text-sm">
                                {impactIssues.length ? (
                                  impactIssues.map((issue, index) => (
                                    <div
                                      key={`${policy.name}-issue-${index}`}
                                      className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
                                    >
                                      {issue}
                                    </div>
                                  ))
                                ) : (
                                  <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                                    当前规则暂无额外风险项。
                                  </div>
                                )}
                                {isSelected && auditItems.length ? (
                                  auditItems.slice(0, 2).map((item) => <AuditItem key={item.id} item={item} />)
                                ) : isSelected ? (
                                  <div className="text-xs text-slate-500">暂无规则审计记录。</div>
                                ) : null}
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3 md:grid-cols-3">
                            <div className="rounded-md border border-slate-200 bg-white p-3">
                              <div className="text-[11px] text-slate-400">目标</div>
                              <div className="mt-1 text-sm font-medium text-slate-900">{policy.targetLabel}</div>
                            </div>
                            <div className="rounded-md border border-slate-200 bg-white p-3">
                              <div className="text-[11px] text-slate-400">可见性</div>
                              <div className="mt-1 text-sm font-medium text-slate-900">
                                {visibilityLabel(policy.visibility)}
                              </div>
                            </div>
                            <div className="rounded-md border border-slate-200 bg-white p-3">
                              <div className="text-[11px] text-slate-400">允许角色</div>
                              <div className="mt-1 text-sm font-medium text-slate-900">
                                {policy.allowed_roles.join('、') || '未设置'}
                              </div>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  <SectionCard title="平台级治理信号">
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="rounded-md border border-slate-200 bg-slate-50 p-5 text-center">
                        <div className="text-2xl font-semibold text-amber-500">
                          {governanceSummary?.summary.staleCount || 0}
                        </div>
                        <div className="mt-2 text-xs text-slate-500">stale</div>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 p-5 text-center">
                        <div className="text-2xl font-semibold text-rose-500">
                          {governanceSummary?.summary.consistencyCount || 0}
                        </div>
                        <div className="mt-2 text-xs text-slate-500">consistency</div>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 p-5 text-center">
                        <div className="text-2xl font-semibold text-emerald-500">
                          {governanceSummary?.summary.auditTotal || 0}
                        </div>
                        <div className="mt-2 text-xs text-slate-500">审计记录</div>
                      </div>
                    </div>
                  </SectionCard>
                </>
              )}
            </div>
          )}
        </main>

        {showInspector ? (
          <aside className="border-l border-slate-200 bg-white">
            <div className="flex h-12 items-center border-b border-slate-200 px-4">
              <div className="text-sm font-semibold text-slate-900">检查器</div>
              <div className="flex-1" />
              <PanelRightClose className="h-4 w-4 text-slate-400" />
            </div>
            <div className="p-4">
              {inspectorContent ? (
                <div className="space-y-5">
                  <div className="rounded-md bg-white">
                    <div className="text-sm font-semibold text-slate-950">{inspectorContent.title}</div>
                    <div className="mt-1 text-xs text-slate-500">{inspectorContent.subtitle}</div>
                  </div>
                  <InspectorSection title="对象统计">
                    {inspectorContent.statistics.map((item) => (
                      <div
                        key={item.label}
                        className="flex items-center justify-between py-1.5"
                      >
                        <div className="text-[13px] text-slate-500">{item.label}</div>
                        <div className="text-[13px] font-semibold text-slate-900">{item.value}</div>
                      </div>
                    ))}
                  </InspectorSection>
                  {currentView === 'objects' ? (
                    <InspectorSection title="最近活动">
                      {inspectorContent.recentActivities.length ? (
                        inspectorContent.recentActivities.map((item) => (
                          <div key={item.id} className="py-1">
                            <div className="text-xs text-slate-700">{item.summary || item.action}</div>
                            <div className="mt-0.5 text-[11px] text-slate-400">{formatDateTime(item.timestamp)}</div>
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-slate-400">暂无最近活动</div>
                      )}
                    </InspectorSection>
                  ) : null}
                </div>
              ) : (
                <div className="flex min-h-[240px] flex-col items-center justify-center px-6 text-center text-sm leading-6 text-slate-400">
                  <Info className="h-5 w-5 text-slate-300" />
                  <div className="mt-3">选择对象查看详情</div>
                </div>
              )}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  )
}
