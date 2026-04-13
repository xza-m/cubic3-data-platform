import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  Box,
  ChevronRight,
  Database,
  Eye,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Table2,
  X,
} from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  createCube,
  createCubeDraftFromSource,
  describeCube,
  listCubes,
  listDomains,
  updateCube,
  type CubeDetail,
  type CubeDraftPayload,
  type CubeSummary,
  type SemanticDomainProjection,
} from '@/api/semantic'
import { getDataSources } from '@/api/datasources'
import { getDatasetFields, getDatasets, previewDataset } from '@/api/datasets'
import { getCubeBacklinks } from '@/api/ontology'
import { PlaygroundTab } from '@/components/Semantic/DevTools/PlaygroundTab'
import { PythonPreviewTab } from '@/components/Semantic/DevTools/PythonPreviewTab'
import { YamlEditorTab } from '@/components/Semantic/DevTools/YamlEditorTab'
import { SchemaBrowser, useToast } from '@/components/business'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { buildDatasetCubeDraftRequest, buildCreateCubeDraftRequest } from '@/lib/semantic-cube-draft'
import { buildSemanticWorkbenchHref } from '@/hooks/semantic-ia'
import { cn } from '@/lib/utils'
import type { TreeNode } from '@/components/business/SchemaBrowser/types'
import type { DatasetField } from '@/types'

type WorkspaceTab = 'modeling' | 'yaml' | 'python' | 'preview' | 'dsl'
type WorkspaceMode = 'ui' | 'yaml' | 'python' | 'dsl'
type UiSection = 'preview' | 'measures' | 'dimensions' | 'filters' | 'joins'
type ExpressionMode = 'builder' | 'custom'
type FilterMode = 'form' | 'custom'
type JoinMode = 'form' | 'custom' | 'canvas'
type WorkbenchContextState = '未开始' | '草稿中' | '修订草稿' | '已发布'
type MeasureAggregation = 'sum' | 'count' | 'count_distinct' | 'avg' | 'min' | 'max'

interface SelectedWorkbenchResource {
  key: string
  kind: 'physical' | 'dataset'
  title: string
  meta: string
  sourceId?: number
  datasetId?: number
  sourceName?: string
  database: string
  schema?: string
  table: string
  fieldCount?: number
  datasetType?: string
}

interface SourceFieldOption {
  name: string
  label: string
  dataType: string
  comment: string
  category: 'text' | 'numeric' | 'temporal' | 'boolean' | 'other'
  recommendedRole: 'dimension' | 'measure'
  sourceRef: string
}

interface PreviewFieldRecord {
  physical_name?: string
  field_name?: string
  display_name?: string
  data_type?: string
  comment?: string
  is_measure?: boolean
}

interface PreviewDatasetPayload {
  fields?: PreviewFieldRecord[]
  sample_rows?: Record<string, unknown>[]
  sample_columns?: string[]
}

interface EditableDimension {
  id: string
  name: string
  displayName: string
  expression: string
  expressionMode: ExpressionMode
  field: string
  comment: string
  synonyms: string
  format: string
  tags: string
  type: 'string' | 'number' | 'time' | 'boolean' | 'geo'
  sourceDataType?: string
}

interface EditableMeasure {
  id: string
  name: string
  displayName: string
  expression: string
  expressionMode: ExpressionMode
  field: string
  aggregation: MeasureAggregation
  comment: string
  synonyms: string
  format: string
  tags: string
  sourceDataType?: string
}

interface EditableFilter {
  id: string
  name: string
  mode: FilterMode
  field: string
  operator: string
  value: string
  required: boolean
  expression: string
  comment: string
}

interface JoinCondition {
  sourceField: string
  targetField: string
}

interface EditableJoin {
  id: string
  name: string
  mode: JoinMode
  targetCube: string
  targetTable: string
  joinType: 'left' | 'inner' | 'right' | 'full'
  relationship: 'one_to_one' | 'one_to_many' | 'many_to_one' | 'many_to_many'
  sourceField: string
  targetField: string
  conditions: JoinCondition[]
  expression: string
  description: string
}

interface WorkspaceDraftState {
  cubeName: string
  title: string
  description: string
  domainId: string
  grain: string
  entityKey: string
  dimensions: EditableDimension[]
  measures: EditableMeasure[]
  filters: EditableFilter[]
  joins: EditableJoin[]
}

type SelectedEditorItem =
  | { kind: 'dimension'; id: string }
  | { kind: 'measure'; id: string }
  | { kind: 'filter'; id: string }
  | { kind: 'join'; id: string }
  | { kind: 'meta' }

function parseWorkspaceTab(rawTab: string | null, status?: string): WorkspaceTab {
  const normalized = String(rawTab || '').toLowerCase()
  if (normalized === 'dsl' || normalized === 'preview' || normalized === 'sync' || normalized === 'compiler') return 'dsl'
  if (normalized === 'yaml' || normalized === 'editor') return 'yaml'
  if (normalized === 'python') return 'python'
  if (normalized === 'modeling') return 'modeling'
  return String(status || '').toLowerCase() === 'active' ? 'dsl' : 'modeling'
}

function parsePhysicalTable(physicalTable?: string | null) {
  const value = String(physicalTable || '').trim()
  if (!value) return { database: '', schema: undefined as string | undefined, table: '' }

  const parts = value.split('.').filter(Boolean)
  if (parts.length >= 3) {
    const table = parts.pop()!
    const schema = parts.pop()
    return {
      database: parts.join('.'),
      schema,
      table,
    }
  }

  if (parts.length === 2) {
    return {
      database: parts[0],
      schema: undefined,
      table: parts[1],
    }
  }

  return {
    database: '',
    schema: undefined,
    table: value,
  }
}

function classifyFieldCategory(dataType?: string | null): SourceFieldOption['category'] {
  const normalized = String(dataType || '').toLowerCase()
  if (/int|bigint|smallint|tinyint|decimal|numeric|float|double|real|number/.test(normalized)) return 'numeric'
  if (/date|time|timestamp|datetime/.test(normalized)) return 'temporal'
  if (/bool/.test(normalized)) return 'boolean'
  if (/char|string|text|varchar/.test(normalized)) return 'text'
  return 'other'
}

function inferDimensionType(dataType?: string | null): EditableDimension['type'] {
  const category = classifyFieldCategory(dataType)
  if (category === 'numeric') return 'number'
  if (category === 'temporal') return 'time'
  if (category === 'boolean') return 'boolean'
  return 'string'
}

function inferMeasureAggregation(field?: SourceFieldOption | null): MeasureAggregation {
  if (!field) return 'sum'
  return field.category === 'numeric' ? 'sum' : 'count'
}

function toTitleCase(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function stringifyLabelList(values?: string[] | null) {
  return Array.isArray(values) ? values.filter(Boolean).join(', ') : ''
}

function parseLabelList(raw: string) {
  return raw
    .split(/[\n,，]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function ensureUniqueKey(base: string, existing: string[]) {
  const normalized = base.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'untitled'
  if (!existing.includes(normalized)) return normalized
  let index = 1
  while (existing.includes(`${normalized}_${index}`)) {
    index += 1
  }
  return `${normalized}_${index}`
}

function buildMeasureExpression(field: string, aggregation: MeasureAggregation) {
  if (!field) return ''
  if (aggregation === 'count') return `COUNT(\`${field}\`)`
  if (aggregation === 'count_distinct') return `COUNT(DISTINCT \`${field}\`)`
  return `${aggregation.toUpperCase()}(\`${field}\`)`
}

function extractSourceField(expression?: string | null) {
  const normalized = String(expression || '')
  const cubeRef = normalized.match(/\{CUBE\}\.([A-Za-z0-9_]+)/)
  if (cubeRef?.[1]) return cubeRef[1]
  const sourceRef = normalized.match(/source\.([A-Za-z0-9_]+)/)
  if (sourceRef?.[1]) return sourceRef[1]
  const backtickRef = normalized.match(/`([A-Za-z0-9_]+)`/)
  if (backtickRef?.[1]) return backtickRef[1]
  return ''
}

function normalizeMeasureSql(sql: string | undefined | null, aggregation: MeasureAggregation): string {
  if (!sql) return ''
  const field = extractSourceField(sql)
  if (!field) return sql
  const upper = sql.trim().toUpperCase()
  if (upper.startsWith('COUNT(') || upper.startsWith('SUM(') || upper.startsWith('AVG(') || upper.startsWith('MIN(') || upper.startsWith('MAX(')) {
    return sql
  }
  return buildMeasureExpression(field, aggregation)
}

function normalizeDimensionSql(sql: string | undefined | null): string {
  if (!sql) return ''
  const field = extractSourceField(sql)
  return field ? `\`${field}\`` : sql
}

function parseFilterExpression(sql?: string | null) {
  const normalized = String(sql || '').trim()
  const matched = normalized.match(/^source\.([A-Za-z0-9_]+)\s*(=|!=|<>|>=|<=|>|<|like|in)\s*(.+)$/i)
  if (!matched) {
    return {
      field: '',
      operator: '=',
      value: '',
      mode: 'custom' as FilterMode,
    }
  }
  return {
    field: matched[1],
    operator: matched[2],
    value: matched[3].replace(/^['"]|['"]$/g, ''),
    mode: 'form' as FilterMode,
  }
}

function mapSourceFieldsFromPreview(preview: PreviewDatasetPayload): SourceFieldOption[] {
  const fields = Array.isArray(preview?.fields) ? preview.fields : []
  const seen = new Set<string>()
  const result: SourceFieldOption[] = []
  for (const field of fields) {
    const name = String(field?.physical_name || field?.field_name || '')
    if (!name || seen.has(name)) continue
    seen.add(name)
    const dataType = String(field?.data_type || '')
    result.push({
      name,
      label: String(field?.display_name || field?.physical_name || field?.field_name || ''),
      dataType,
      comment: String(field?.comment || ''),
      category: classifyFieldCategory(dataType),
      recommendedRole: field?.is_measure ? 'measure' : 'dimension',
      sourceRef: `source.${name}`,
    })
  }
  return result
}

function mapSourceFieldsFromDataset(fields: DatasetField[]): SourceFieldOption[] {
  return fields.map((field) => ({
    name: field.physical_name,
    label: field.display_name || field.physical_name,
    dataType: field.data_type,
    comment: field.comment || '',
    category: classifyFieldCategory(field.data_type),
    recommendedRole:
      field.business_type === 'metric' || field.business_type === 'measure' ? 'measure' : 'dimension',
    sourceRef: `source.${field.physical_name}`,
  }))
}

function buildEditableState(detail: CubeDetail): WorkspaceDraftState {
  const dimensions = Object.entries(detail.dimensions || {}).map(([name, item]) => ({
    id: `dimension:${name}`,
    name,
    displayName: item.title || name,
    expression: normalizeDimensionSql(item.sql) || `\`${name}\``,
    expressionMode: (extractSourceField(item.sql || name) ? 'builder' : 'custom') as ExpressionMode,
    field: extractSourceField(item.sql || name) || name,
    comment: item.description || '',
    synonyms: stringifyLabelList(item.synonyms),
    format: item.format || '',
    tags: stringifyLabelList(item.tags),
    type: inferDimensionType(item.source_data_type || item.type),
    sourceDataType: item.source_data_type || undefined,
  }))

  const measures = Object.entries(detail.measures || {}).map(([name, item]) => {
    const agg = (item.type as MeasureAggregation) || 'sum'
    const field = extractSourceField(item.sql || '') || name
    return {
    id: `measure:${name}`,
    name,
    displayName: item.title || name,
    expression: normalizeMeasureSql(item.sql, agg) || buildMeasureExpression(field, agg),
    expressionMode: (extractSourceField(item.sql || '') ? 'builder' : 'custom') as ExpressionMode,
    field,
    aggregation: agg,
    comment: item.description || '',
    synonyms: stringifyLabelList(item.synonyms),
    format: item.format || '',
    tags: stringifyLabelList(item.tags),
    sourceDataType: item.source_data_type || undefined,
  }
  })

  const filters = (detail.default_filters || []).map((item, index) => ({
    ...parseFilterExpression(item.sql),
    id: `filter:${index}`,
    name: item.description || `filter_${index + 1}`,
    required: false,
    expression: item.sql,
    comment: item.description || '',
  }))

  const joins = Object.entries(detail.joins || {}).map(([name, item]) => ({
    id: `join:${name}`,
    name,
    mode: 'form' as const,
    targetCube: item.target_cube,
    targetTable: item.target_cube || '',
    joinType: ((item.type as EditableJoin['joinType']) || 'left'),
    relationship: (item.relationship === 'N:1' ? 'many_to_one' : item.relationship === '1:N' ? 'one_to_many' : item.relationship === '1:1' ? 'one_to_one' : item.relationship === 'N:N' ? 'many_to_many' : (item.relationship as EditableJoin['relationship']) || 'many_to_one') as EditableJoin['relationship'],
    sourceField: '',
    targetField: '',
    conditions: [] as JoinCondition[],
    expression: item.sql || '',
    description: '',
  }))

  return {
    cubeName: detail.name,
    title: detail.title,
    description: detail.description || '',
    domainId: detail.domain_id || '',
    grain: detail.grain || '',
    entityKey: detail.entity_key || '',
    dimensions,
    measures,
    filters,
    joins,
  }
}

function serializeDraftState(state: WorkspaceDraftState) {
  return JSON.stringify(state)
}

function buildCubeUpdatePayload(state: WorkspaceDraftState, sourceId: number, sourceDatabase?: string | null, sourceSchema?: string | null, table?: string) {
  return {
    name: state.cubeName,
    title: state.title,
    description: state.description,
    domain_id: state.domainId || null,
    source_id: sourceId,
    source_database: sourceDatabase,
    source_schema: sourceSchema,
    table: table || state.cubeName,
    grain: state.grain || null,
    entity_key: state.entityKey || null,
    dimensions: Object.fromEntries(
      state.dimensions.map((item) => [
        item.name,
        {
          title: item.displayName || toTitleCase(item.name),
          type: item.type,
          sql: item.expression,
          description: item.comment || undefined,
          source_data_type: item.sourceDataType || undefined,
          format: item.format || undefined,
          synonyms: parseLabelList(item.synonyms),
          tags: parseLabelList(item.tags),
          primary_key: state.entityKey === item.name,
        },
      ]),
    ),
    measures: Object.fromEntries(
      state.measures.map((item) => [
        item.name,
        {
          title: item.displayName || toTitleCase(item.name),
          type: item.aggregation,
          sql: item.expression,
          description: item.comment || undefined,
          source_data_type: item.sourceDataType || undefined,
          synonyms: parseLabelList(item.synonyms),
          tags: parseLabelList(item.tags),
          format: item.format || undefined,
        },
      ]),
    ),
    joins: Object.fromEntries(
      state.joins.map((item) => {
        const validConditions = (item.conditions || []).filter((c) => c.sourceField && c.targetField)
        const sqlFromConditions = validConditions.length > 0
          ? validConditions.map((c) => `\`${c.sourceField}\` = ${item.targetTable || item.targetCube}.\`${c.targetField}\``).join(' AND ')
          : item.expression
        return [
          item.name,
          {
            cube: item.targetCube || item.targetTable,
            type: item.joinType,
            relationship: item.relationship,
            sql: item.mode === 'custom' ? item.expression : sqlFromConditions,
            target_table: item.targetTable || undefined,
            conditions: validConditions.length > 0 ? validConditions : undefined,
          },
        ]
      }),
    ),
    default_filters: state.filters.map((item) => ({
      sql: item.mode === 'custom' ? item.expression : `source.${item.field} ${item.operator} '${item.value}'`,
      description: item.comment || item.name,
    })),
  }
}

function buildStateLabel(status?: string, cubeName?: string) {
  if (String(status || '').toLowerCase() === 'active') return '已发布' as const
  if (String(cubeName || '').includes('__revision_draft')) return '修订草稿' as const
  if (cubeName) return '草稿中' as const
  return '未开始' as const
}

function TagInput({
  value,
  onChange,
  placeholder = '输入后按 Enter 添加',
  id,
  ariaLabel,
}: {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  id?: string
  ariaLabel?: string
}) {
  const [inputValue, setInputValue] = useState('')
  const tags = useMemo(() => parseLabelList(value), [value])

  const addTag = (tag: string) => {
    const trimmed = tag.trim()
    if (!trimmed || tags.includes(trimmed)) return
    onChange(stringifyLabelList([...tags, trimmed]))
  }

  const removeTag = (tag: string) => {
    onChange(stringifyLabelList(tags.filter((t) => t !== tag)))
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-0.5 rounded bg-[#F0F4F8] px-1.5 py-0.5 text-[11px] text-[#2E2E2E]"
          >
            {tag}
            <button
              type="button"
              className="ml-0.5 text-[#8C8C8C] hover:text-[#2E2E2E]"
              onClick={() => removeTag(tag)}
              aria-label={`删除 ${tag}`}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
      </div>
      <Input
        id={id}
        aria-label={ariaLabel}
        className="mt-1 h-8 text-xs"
        placeholder={placeholder}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            addTag(inputValue)
            setInputValue('')
          }
        }}
      />
    </div>
  )
}

function LandingCubeList({ cubes, selectedSource, onSelectCube }: {
  cubes: CubeSummary[]
  selectedSource: string
  onSelectCube: (name: string) => void
}) {
  const sourceIdNum = selectedSource ? Number(selectedSource) : null
  const filteredCubes = sourceIdNum
    ? cubes.filter((c) => c.source_id === sourceIdNum)
    : cubes

  return (
    <div className="flex min-h-0 flex-1 flex-col px-6 py-8">
      <div className="flex shrink-0 flex-col items-center text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F0F4F8]">
          <Table2 className="h-7 w-7 text-[#2272B4]" />
        </div>
        <h3 className="text-base font-semibold text-[#1B3139]">选择物理表开始建模</h3>
        <p className="mt-1.5 text-sm leading-5 text-[#6E6E6E]">
          在左侧数据库结构中展开表，点击选中一张物理表后，可预览字段并通过 AI 生成 Cube 草稿。
        </p>
      </div>
      {filteredCubes.length > 0 && (
        <div className="mt-6 flex min-h-0 flex-1 flex-col border-t border-[#E0E0E0] pt-4">
          <div className="mb-2 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-[#8C8C8C] text-left">
            当前数据源已有 Cube ({filteredCubes.length})
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 xl:grid-cols-3">
              {filteredCubes.map((cube) => (
                <button
                  key={cube.name}
                  type="button"
                  onClick={() => onSelectCube(cube.name)}
                  className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-xs transition hover:bg-[#F0F4F8]"
                >
                  <Box className="h-3.5 w-3.5 shrink-0 text-[#2272B4]" />
                  <span className="min-w-0 flex-1 truncate font-medium text-[#2E2E2E]">{cube.title || cube.name}</span>
                  <Badge variant="outline" className={cn(
                    'ml-auto shrink-0 text-[9px] border-[#E0E0E0]',
                    cube.status === 'active' && 'border-green-200 bg-green-50 text-green-700',
                    cube.status === 'draft' && 'border-amber-200 bg-amber-50 text-amber-700',
                  )}>{cube.status === 'active' ? '已发布' : cube.status === 'draft' ? '草稿' : cube.status}</Badge>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DevToolsSkeleton() {
  return (
    <div className="flex h-full flex-col text-[13px] text-[#2E2E2E]" data-testid="devtools-screen">
      <div className="flex flex-1 overflow-hidden bg-white">
        <Skeleton className="h-[42rem] rounded-none" />
        <Skeleton className="h-[42rem] rounded-none" />
        <Skeleton className="h-[42rem] rounded-none" />
      </div>
    </div>
  )
}

function ExpressionModeToggle({
  mode,
  onChange,
}: {
  mode: ExpressionMode
  onChange: (next: ExpressionMode) => void
}) {
  return (
    <div className="inline-flex rounded-md bg-[#F0F0F0] p-0.5">
      {(['builder', 'custom'] as const).map((item) => (
        <button
          key={item}
          type="button"
          aria-pressed={mode === item}
          onClick={() => onChange(item)}
          className={cn(
            'rounded px-2.5 py-0.5 text-[10px] font-medium transition whitespace-nowrap',
            mode === item ? 'bg-white text-[#1B3139] shadow-sm' : 'text-[#8C8C8C] hover:text-[#6E6E6E]',
          )}
        >
          {item === 'builder' ? '表单模式' : '自定义模式'}
        </button>
      ))}
    </div>
  )
}

function renderExpressionModeLabel(mode: FilterMode | JoinMode) {
  if (mode === 'form') return '表单模式'
  if (mode === 'custom') return '自定义模式'
  return '关系画布'
}

export default function DevTools() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedCubeName = searchParams.get('cube') ?? ''
  const rawTab = searchParams.get('tab')
  const modelingIntent = searchParams.get('intent')
  const intentDatasetId = Number(searchParams.get('datasetId') || '')

  const [selectedSource, setSelectedSource] = useState('')
  const [selectedResources, setSelectedResources] = useState<SelectedWorkbenchResource[]>([])
  const [uiSection, setUiSection] = useState<UiSection>('preview')
  const [selectedEditorItem, setSelectedEditorItem] = useState<SelectedEditorItem>({ kind: 'meta' })
  const [draftState, setDraftState] = useState<WorkspaceDraftState | null>(null)
  const [measuresPage, setMeasuresPage] = useState(0)
  const [dimensionsPage, setDimensionsPage] = useState(0)
  const [joinDialogOpen, setJoinDialogOpen] = useState(false)
  const [joinSearchQuery, setJoinSearchQuery] = useState('')
  const initialDraftSnapshotRef = useRef<string>('')
  const intentSelectionAppliedRef = useRef('')
  const previewTabRef = useRef<UiSection>('dimensions')

  const cubesQuery = useQuery({
    queryKey: ['semantic', 'cubes'],
    queryFn: async () => (await listCubes()).data,
  })
  const datasourcesQuery = useQuery({
    queryKey: ['datasources', 'semantic-workbench'],
    queryFn: async () => (await getDataSources({ is_active: true, page_size: 200 })).data,
  })
  const datasetsQuery = useQuery({
    queryKey: ['datasets', 'semantic-workbench'],
    queryFn: async () => (await getDatasets({ page_size: 200 })).data,
  })
  const domainsQuery = useQuery({
    queryKey: ['semantic', 'domains', 'workbench'],
    queryFn: async () => (await listDomains()).data,
  })

  const datasets = useMemo(() => datasetsQuery.data?.items ?? [], [datasetsQuery.data?.items])
  const domains = useMemo<SemanticDomainProjection[]>(() => domainsQuery.data?.domains ?? [], [domainsQuery.data?.domains])
  const cubes = useMemo(() => cubesQuery.data?.cubes ?? [], [cubesQuery.data?.cubes])
  const datasources = useMemo(() => datasourcesQuery.data?.items ?? [], [datasourcesQuery.data?.items])
  const selectedCube = useMemo(() => cubes.find((cube) => cube.name === selectedCubeName) ?? null, [cubes, selectedCubeName])

  const cubeDetailQuery = useQuery({
    queryKey: ['semantic', 'cube-detail', selectedCubeName],
    queryFn: async () => (await describeCube(selectedCubeName)).data,
    enabled: Boolean(selectedCubeName),
  })
  const cubeDetail = cubeDetailQuery.data
  const cubeBacklinksQuery = useQuery({
    queryKey: ['ontology', 'cube-backlinks', selectedCubeName],
    queryFn: () => getCubeBacklinks(selectedCubeName),
    enabled: Boolean(selectedCubeName),
  })

  const workspaceTab = useMemo(() => parseWorkspaceTab(rawTab, cubeDetail?.status || selectedCube?.status), [cubeDetail?.status, rawTab, selectedCube?.status])
  const workspaceMode: WorkspaceMode = workspaceTab === 'yaml' ? 'yaml' : workspaceTab === 'python' ? 'python' : workspaceTab === 'dsl' ? 'dsl' : 'ui'

  const currentCube = selectedCube || (cubeDetail
    ? {
      name: cubeDetail.name,
      title: cubeDetail.title,
      description: cubeDetail.description,
      table: cubeDetail.table,
      dimensions: Object.keys(cubeDetail.dimensions || {}),
      measures: Object.keys(cubeDetail.measures || {}),
      dimension_count: Object.keys(cubeDetail.dimensions || {}).length,
      measure_count: Object.keys(cubeDetail.measures || {}).length,
      status: cubeDetail.status,
      source_id: cubeDetail.source_id,
      source_database: cubeDetail.source_database || undefined,
      source_schema: cubeDetail.source_schema || undefined,
      domain_ids: cubeDetail.domain_ids,
      domains: cubeDetail.domains,
      domain_count: cubeDetail.domain_count,
    } satisfies CubeSummary
    : null)

  useEffect(() => {
    if (!selectedSource && datasources.length > 0) {
      setSelectedSource(String(datasources[0].id))
    }
  }, [datasources, selectedSource])

  useEffect(() => {
    if (!selectedCubeName || modelingIntent !== 'dataset-modeling' || !Number.isFinite(intentDatasetId) || intentDatasetId <= 0) {
      return
    }
    if (!datasets.length) return
    const intentKey = `dataset:${intentDatasetId}`
    if (intentSelectionAppliedRef.current === intentKey) return
    const target = datasets.find((dataset) => dataset.id === intentDatasetId)
    if (!target) return

    const parsed = parsePhysicalTable(target.physical_table)
    const sourceName = datasources.find((item) => item.id === target.source_id)?.name
    setSelectedResources([
      {
        key: `dataset:${target.id}`,
        kind: 'dataset',
        title: target.dataset_name,
        meta: `Dataset · ${target.field_count || 0} 字段 · ${target.dataset_type}`,
        sourceId: target.source_id,
        datasetId: target.id,
        sourceName,
        database: parsed.database,
        schema: parsed.schema,
        table: parsed.table,
        fieldCount: target.field_count,
        datasetType: target.dataset_type,
      },
    ])
    if (target.source_id) setSelectedSource(String(target.source_id))
    intentSelectionAppliedRef.current = intentKey
  }, [datasources, datasets, intentDatasetId, modelingIntent, selectedCubeName])

  useEffect(() => {
    if (!cubeDetail) return
    const sourceName = cubeDetail.source_binding_summary?.source_name || ''
    setSelectedResources([
      {
        key: `physical:${cubeDetail.name}`,
        kind: 'physical',
        title: cubeDetail.table || cubeDetail.name,
        meta: cubeDetail.source_binding_summary?.display || cubeDetail.table,
        sourceId: cubeDetail.source_id || undefined,
        sourceName,
        database: cubeDetail.source_database || '',
        schema: cubeDetail.source_schema || undefined,
        table: cubeDetail.table,
      },
    ])
    if (cubeDetail.source_id) {
      setSelectedSource(String(cubeDetail.source_id))
    }
    const nextState = buildEditableState(cubeDetail)
    setDraftState(nextState)
    initialDraftSnapshotRef.current = serializeDraftState(nextState)
  }, [cubeDetail])

  useEffect(() => {
    if (workspaceMode !== 'ui') return
    setUiSection((current) => current || 'preview')
  }, [workspaceMode])

  useEffect(() => {
    if (!draftState) {
      setSelectedEditorItem((current) => (current.kind === 'meta' ? current : { kind: 'meta' }))
      return
    }
    const expectedKind =
      uiSection === 'measures'
        ? 'measure'
        : uiSection === 'dimensions'
          ? 'dimension'
          : uiSection === 'filters'
            ? 'filter'
            : uiSection === 'joins'
              ? 'join'
              : 'meta'

    if (expectedKind === 'meta') {
      setSelectedEditorItem((current) => (current.kind === 'meta' ? current : { kind: 'meta' }))
      return
    }

    if (selectedEditorItem.kind === expectedKind) return

    setSelectedEditorItem({ kind: expectedKind, id: '' })
  }, [draftState, selectedEditorItem, uiSection])

  const singleSelectedResource = selectedResources.length === 1 ? selectedResources[0] : null

  const sourceFieldQuery = useQuery({
    queryKey: [
      'semantic',
      'workbench',
      'source-fields',
      currentCube?.name || singleSelectedResource?.key || 'empty',
      selectedSource,
      singleSelectedResource?.datasetId || '',
      singleSelectedResource?.table || cubeDetail?.table || '',
    ],
    queryFn: async (): Promise<{ fields: SourceFieldOption[]; sampleRows: Record<string, unknown>[]; sampleColumns: string[]; previewError?: string }> => {
      if (singleSelectedResource?.kind === 'dataset' && singleSelectedResource.datasetId) {
        return { fields: mapSourceFieldsFromDataset((await getDatasetFields(singleSelectedResource.datasetId)).data), sampleRows: [], sampleColumns: [] }
      }
      const sourceId = singleSelectedResource?.sourceId || cubeDetail?.source_id
      const database = singleSelectedResource?.database || cubeDetail?.source_database
      const table = singleSelectedResource?.table || cubeDetail?.table
      if (!sourceId || !database || !table) return { fields: [], sampleRows: [], sampleColumns: [] }
      const preview = await previewDataset({
        datasource_id: sourceId,
        database,
        table,
      })
      return {
        fields: mapSourceFieldsFromPreview(preview.data),
        sampleRows: preview.data?.sample_rows ?? [],
        sampleColumns: preview.data?.sample_columns ?? [],
        previewError: preview.data?.preview_error || undefined,
      }
    },
    enabled: Boolean((singleSelectedResource?.kind === 'dataset' && singleSelectedResource.datasetId)
      || ((singleSelectedResource?.sourceId || cubeDetail?.source_id) && (singleSelectedResource?.database || cubeDetail?.source_database) && (singleSelectedResource?.table || cubeDetail?.table))),
  })

  const sourceFields = useMemo(() => sourceFieldQuery.data?.fields ?? [], [sourceFieldQuery.data?.fields])
  const sampleRows = useMemo(() => sourceFieldQuery.data?.sampleRows ?? [], [sourceFieldQuery.data?.sampleRows])
  const sampleColumns = useMemo(() => sourceFieldQuery.data?.sampleColumns ?? [], [sourceFieldQuery.data?.sampleColumns])
  const previewError = sourceFieldQuery.data?.previewError

  const joinTargetTable = draftState?.joins.find((j) => selectedEditorItem.kind === 'join' && j.id === selectedEditorItem.id)?.targetTable || ''
  const targetFieldsQuery = useQuery({
    queryKey: ['semantic', 'workbench', 'target-fields', selectedSource, cubeDetail?.source_database, joinTargetTable],
    queryFn: async (): Promise<SourceFieldOption[]> => {
      const sourceId = singleSelectedResource?.sourceId || cubeDetail?.source_id
      const database = singleSelectedResource?.database || cubeDetail?.source_database
      if (!sourceId || !database || !joinTargetTable) return []
      const preview = await previewDataset({ datasource_id: sourceId, database, table: joinTargetTable })
      return mapSourceFieldsFromPreview(preview.data)
    },
    enabled: Boolean(joinTargetTable && (singleSelectedResource?.sourceId || cubeDetail?.source_id) && (singleSelectedResource?.database || cubeDetail?.source_database)),
  })
  const targetFields = useMemo(() => targetFieldsQuery.data ?? [], [targetFieldsQuery.data])

  const dirty = draftState ? serializeDraftState(draftState) !== initialDraftSnapshotRef.current : false

  const selectWorkbenchResource = useCallback((resource: SelectedWorkbenchResource) => {
    if (selectedCubeName) {
      setSelectedResources([resource])
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('cube')
        next.delete('tab')
        return next
      }, { replace: true })
      toast({
        title: '已切换到新资源',
        description: '当前为新建草稿态，请重新发起 AI 建模。',
      })
      return
    }

    setSelectedResources((current) => {
      const exists = current.some((item) => item.key === resource.key)
      if (exists) return current.filter((item) => item.key !== resource.key)
      return [resource]
    })
  }, [selectedCubeName, setSearchParams, toast])

  const handleSelectPhysicalNode = useCallback((node: TreeNode) => {
    if (node.type !== 'table' && node.type !== 'view') return
    const database = node.metadata?.database || ''
    const schema = node.metadata?.schema || undefined
    const table = node.metadata?.table || node.name
    let resolvedSourceId = selectedSource
    if (!resolvedSourceId && node.key) {
      const dsSegment = node.key.split('/').find((s) => s.startsWith('datasource:'))
      if (dsSegment) resolvedSourceId = dsSegment.replace('datasource:', '')
    }
    const sourceName = datasources.find((item) => String(item.id) === resolvedSourceId)?.name
    selectWorkbenchResource({
      key: `physical:${database}:${schema || ''}:${table}`,
      kind: 'physical',
      title: table,
      meta: `物理表 · ${database}${schema ? `.${schema}` : ''}.${table}`,
      sourceId: resolvedSourceId ? Number(resolvedSourceId) : undefined,
      sourceName,
      database,
      schema,
      table,
    })
  }, [datasources, selectWorkbenchResource, selectedSource])

  const createDraftMutation = useMutation({
    mutationFn: async () => {
      if (!singleSelectedResource) throw new Error('请先选择物理表或数据集')
      if (singleSelectedResource.kind === 'dataset') {
        if (singleSelectedResource.datasetType === 'file') {
          throw new Error('当前暂不支持从 file 数据集生成 Cube，请改选物理表、physical Dataset 或 virtual Dataset。')
        }
        if (!singleSelectedResource.datasetId) {
          throw new Error('当前所选数据集缺少 dataset_id，无法生成 Cube')
        }
        const draftPayload = await createCubeDraftFromSource(buildDatasetCubeDraftRequest(singleSelectedResource.datasetId))
        return (await createCube(draftPayload.data)).data
      }
      const draftPayload = await createCubeDraftFromSource(
        buildCreateCubeDraftRequest(String(singleSelectedResource.sourceId), {
          database: singleSelectedResource.database,
          schema: singleSelectedResource.schema,
          table: singleSelectedResource.table,
        }),
      )
      return (await createCube(draftPayload.data)).data
    },
    onSuccess: async (payload) => {
      await queryClient.invalidateQueries({ queryKey: ['semantic'] })
      toast({ title: 'Cube 草稿已生成' })
      navigate(buildSemanticWorkbenchHref(payload.name, 'modeling'))
    },
    onError: (error) => {
      toast({
        title: 'AI 建模失败',
        description: error instanceof Error ? error.message : '请稍后重试',
        variant: 'destructive',
      })
    },
  })

  const saveDraftMutation = useMutation({
    mutationFn: async (payload: ReturnType<typeof buildCubeUpdatePayload>) => {
      return (await updateCube(payload.name, payload as Partial<CubeDraftPayload>)).data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['semantic'] })
      await cubeDetailQuery.refetch()
      toast({ title: '已保存草稿' })
    },
    onError: (error) => {
      toast({
        title: '保存失败',
        description: error instanceof Error ? error.message : '请稍后重试',
        variant: 'destructive',
      })
    },
  })

  const handleUiSectionChange = useCallback((section: UiSection) => {
    setUiSection(section)
    setMeasuresPage(0)
    setDimensionsPage(0)
    if (!currentCube) return
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('cube', currentCube.name)
      next.set('tab', 'modeling')
      return next
    }, { replace: true })
  }, [currentCube, setSearchParams])

  const handleModeChange = useCallback((mode: WorkspaceMode) => {
    if (!currentCube && mode !== 'ui') return
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (!currentCube) {
        next.delete('tab')
        return next
      }
      next.set('cube', currentCube.name)
      if (mode === 'ui') {
        next.set('tab', 'modeling')
      } else if (mode === 'yaml') {
        next.set('tab', 'yaml')
      } else if (mode === 'dsl') {
        next.set('tab', 'dsl')
      } else {
        next.set('tab', 'python')
      }
      return next
    }, { replace: true })
  }, [currentCube, setSearchParams])

  const updateDraftState = useCallback((updater: (current: WorkspaceDraftState) => WorkspaceDraftState) => {
    setDraftState((current) => {
      if (!current) return current
      return updater(current)
    })
  }, [])

  const addDimensionDraft = useCallback((fieldName?: string) => {
    if (!draftState) return
    const field = sourceFields.find((item) => item.name === fieldName) || null
    const nextName = ensureUniqueKey('untitled_dimension', draftState.dimensions.map((item) => item.name))
    const nextItem: EditableDimension = {
      id: `dimension:${nextName}:${Date.now()}`,
      name: nextName,
      displayName: '未命名 Dimension',
      expression: field ? `\`${field.name}\`` : '',
      expressionMode: 'builder',
      field: field?.name || '',
      comment: field?.comment || '',
      synonyms: '',
      format: '',
      tags: '',
      type: inferDimensionType(field?.dataType),
      sourceDataType: field?.dataType,
    }
    setDraftState((current) => {
      if (!current) return current
      return {
        ...current,
        dimensions: [...current.dimensions, nextItem],
      }
    })
    setSelectedEditorItem({ kind: 'dimension', id: nextItem.id })
    setUiSection('dimensions')
    previewTabRef.current = 'dimensions'
    if (currentCube) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set('cube', currentCube.name)
        next.set('tab', 'modeling')
        return next
      }, { replace: true })
    }
  }, [currentCube, draftState, setSearchParams, sourceFields])

  const addMeasureDraft = useCallback((fieldName?: string) => {
    if (!draftState) return
    const field = sourceFields.find((item) => item.name === fieldName) || null
    const nextName = ensureUniqueKey('untitled_measure', draftState.measures.map((item) => item.name))
    const aggregation = inferMeasureAggregation(field)
    const nextItem: EditableMeasure = {
      id: `measure:${nextName}:${Date.now()}`,
      name: nextName,
      displayName: '未命名 Measure',
      expression: field ? buildMeasureExpression(field.name, aggregation) : '',
      expressionMode: 'builder',
      field: field?.name || '',
      aggregation,
      comment: field?.comment || '',
      synonyms: '',
      format: '',
      tags: '',
      sourceDataType: field?.dataType,
    }
    setDraftState((current) => {
      if (!current) return current
      return {
        ...current,
        measures: [...current.measures, nextItem],
      }
    })
    setSelectedEditorItem({ kind: 'measure', id: nextItem.id })
    setUiSection('measures')
    previewTabRef.current = 'measures'
    if (currentCube) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set('cube', currentCube.name)
        next.set('tab', 'modeling')
        return next
      }, { replace: true })
    }
  }, [currentCube, draftState, setSearchParams, sourceFields])

  const addFilterDraft = useCallback(() => {
    if (!draftState) return
    const nextItem: EditableFilter = {
      id: `filter:${Date.now()}`,
      name: `filter_${draftState.filters.length + 1}`,
      mode: 'form',
      field: sourceFields[0]?.name || '',
      operator: '=',
      value: '',
      required: false,
      expression: '',
      comment: '',
    }
    setDraftState((current) => {
      if (!current) return current
      return {
        ...current,
        filters: [...current.filters, nextItem],
      }
    })
    setSelectedEditorItem({ kind: 'filter', id: nextItem.id })
  }, [draftState, sourceFields])

  const addJoinDraft = useCallback((mode: JoinMode = 'form', targetTable?: string) => {
    if (!draftState) return
    const baseName = targetTable
      ? `${draftState.cubeName || 'source'}_${targetTable.replace(/\W+/g, '_')}`
      : 'join'
    const nextItem: EditableJoin = {
      id: `join:${Date.now()}`,
      name: ensureUniqueKey(baseName, draftState.joins.map((item) => item.name)),
      mode,
      targetCube: targetTable || '',
      targetTable: targetTable || '',
      joinType: 'left',
      relationship: 'many_to_one',
      sourceField: '',
      targetField: '',
      conditions: [{ sourceField: '', targetField: '' }],
      expression: '',
      description: '',
    }
    setDraftState((current) => {
      if (!current) return current
      return {
        ...current,
        joins: [...current.joins, nextItem],
      }
    })
    setSelectedEditorItem({ kind: 'join', id: nextItem.id })
  }, [draftState, sourceFields])

  const selectedDimension = draftState?.dimensions.find((item) => selectedEditorItem.kind === 'dimension' && item.id === selectedEditorItem.id) || null
  const selectedMeasure = draftState?.measures.find((item) => selectedEditorItem.kind === 'measure' && item.id === selectedEditorItem.id) || null
  const selectedFilter = draftState?.filters.find((item) => selectedEditorItem.kind === 'filter' && item.id === selectedEditorItem.id) || null
  const selectedJoin = draftState?.joins.find((item) => selectedEditorItem.kind === 'join' && item.id === selectedEditorItem.id) || null

  const updateDimension = useCallback((id: string, patch: Partial<EditableDimension>) => {
    updateDraftState((current) => ({
      ...current,
      dimensions: current.dimensions.map((item) => {
        if (item.id !== id) return item
        const next = { ...item, ...patch }
        if (next.expressionMode === 'builder' && next.field) {
          next.expression = `\`${next.field}\``
        }
        return next
      }),
    }))
  }, [updateDraftState])

  const updateMeasure = useCallback((id: string, patch: Partial<EditableMeasure>) => {
    updateDraftState((current) => ({
      ...current,
      measures: current.measures.map((item) => {
        if (item.id !== id) return item
        const next = { ...item, ...patch }
        if (next.expressionMode === 'builder') {
          next.expression = buildMeasureExpression(next.field, next.aggregation)
        }
        return next
      }),
    }))
  }, [updateDraftState])

  const updateFilter = useCallback((id: string, patch: Partial<EditableFilter>) => {
    updateDraftState((current) => ({
      ...current,
      filters: current.filters.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }))
  }, [updateDraftState])

  const updateJoinCondition = useCallback((joinId: string, condIdx: number, patch: Partial<JoinCondition>) => {
    updateDraftState((current) => ({
      ...current,
      joins: current.joins.map((item) => {
        if (item.id !== joinId) return item
        const conditions = [...(item.conditions || [])]
        conditions[condIdx] = { ...conditions[condIdx], ...patch }
        return { ...item, conditions }
      }),
    }))
  }, [updateDraftState])

  const addJoinCondition = useCallback((joinId: string) => {
    updateDraftState((current) => ({
      ...current,
      joins: current.joins.map((item) => {
        if (item.id !== joinId) return item
        return { ...item, conditions: [...(item.conditions || []), { sourceField: '', targetField: '' }] }
      }),
    }))
  }, [updateDraftState])

  const removeJoinCondition = useCallback((joinId: string, condIdx: number) => {
    updateDraftState((current) => ({
      ...current,
      joins: current.joins.map((item) => {
        if (item.id !== joinId) return item
        const conditions = (item.conditions || []).filter((_, i) => i !== condIdx)
        return { ...item, conditions: conditions.length > 0 ? conditions : [{ sourceField: '', targetField: '' }] }
      }),
    }))
  }, [updateDraftState])

  const updateJoin = useCallback((id: string, patch: Partial<EditableJoin>) => {
    updateDraftState((current) => ({
      ...current,
      joins: current.joins.map((item) => {
        if (item.id !== id) return item
        return { ...item, ...patch }
      }),
    }))
  }, [updateDraftState])

  const saveCurrentDraft = useCallback(async () => {
    if (!draftState || !currentCube || !cubeDetail?.source_id) return
    const payload = buildCubeUpdatePayload(
      draftState,
      cubeDetail.source_id,
      cubeDetail.source_database,
      cubeDetail.source_schema,
      cubeDetail.table,
    )
    await saveDraftMutation.mutateAsync(payload)
  }, [cubeDetail, currentCube, draftState, saveDraftMutation])

  const contextState: WorkbenchContextState = buildStateLabel(currentCube?.status, currentCube?.name)

  const [leftPanelWidth, setLeftPanelWidth] = useState(220)
  const isDragging = useRef(false)
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    const startX = e.clientX
    const startW = leftPanelWidth
    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return
      const newW = Math.max(160, Math.min(440, startW + ev.clientX - startX))
      setLeftPanelWidth(newW)
    }
    const onUp = () => { isDragging.current = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [leftPanelWidth])

  const relatedCubes = useMemo(() => {
    if (!singleSelectedResource || currentCube) return []
    const tableName = singleSelectedResource.table
    if (!tableName) return []
    return cubes.filter((c) => c.table === tableName)
  }, [singleSelectedResource, currentCube, cubes])

  if (selectedCubeName && (cubesQuery.isLoading || cubeDetailQuery.isLoading)) {
    return <DevToolsSkeleton />
  }

  const hasInspectorTarget = !!(selectedMeasure || selectedDimension || selectedFilter || selectedJoin)
  const shouldShowRightPanel = currentCube && workspaceMode === 'ui' && uiSection !== 'preview' && hasInspectorTarget
  const showRelatedCubesPanel = !currentCube && singleSelectedResource && relatedCubes.length > 0

  return (
    <div className="flex h-full flex-col text-[13px] text-[#2E2E2E]" data-testid="devtools-screen">
      <div className="flex flex-1 overflow-hidden bg-white">
        <aside className="flex min-h-0 shrink-0 flex-col border-r border-[#E0E0E0] bg-white" style={{ width: leftPanelWidth }} data-testid="semantic-resource-pane">
          <div className="border-b border-[#E0E0E0] px-3 py-2">
            <Select value={selectedSource} onValueChange={(val) => setSelectedSource(val)}>
              <SelectTrigger className="h-8 w-full border-[#E0E0E0] bg-white text-xs">
                <Database className="mr-1.5 h-3.5 w-3.5 text-[#2272B4]" />
                <SelectValue placeholder="选择数据源" />
              </SelectTrigger>
              <SelectContent>
                {datasources.map((item) => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            <SchemaBrowser
              datasourceId={selectedSource ? Number(selectedSource) : undefined}
              showTitle={false}
              showSearch
              hideDatabaseLevel={false}
              showStatusBar={false}
              className="h-full"
              onSelect={handleSelectPhysicalNode}
            />
          </div>

        </aside>

        <div
          className="group relative z-10 w-1 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-[#2272B4]/30 active:bg-[#2272B4]/50"
          onMouseDown={handleResizeStart}
          role="separator"
          aria-orientation="vertical"
        >
          <div className="absolute inset-y-0 -left-0.5 -right-0.5" />
        </div>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white" data-testid="semantic-main-pane">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#E0E0E0] px-4">
            {!currentCube ? (
              <div className="text-base font-semibold text-[#1B3139]">语义工作台</div>
            ) : (
              <div className="flex min-w-0 items-center gap-1 text-xs">
                <span className="shrink-0 text-[#2272B4] hover:underline cursor-pointer" onClick={() => navigate('/semantic/workbench')}>语义工作台</span>
                <ChevronRight className="h-3 w-3 shrink-0 text-[#6E6E6E]" />
                <span data-testid="semantic-workbench-title" className="truncate text-base font-semibold text-[#1B3139]">
                  {draftState?.title || cubeDetail?.title || currentCube.title || currentCube.name}
                </span>
                <Badge variant="outline" className="ml-1 shrink-0 border-[#E0E0E0] text-[10px]">{contextState}</Badge>
              </div>
            )}
            {currentCube && (
              <Button type="button" size="sm" className="ml-2 shrink-0" onClick={() => saveCurrentDraft()} disabled={!dirty || saveDraftMutation.isPending}>
                {saveDraftMutation.isPending ? '保存中…' : '保存'}
              </Button>
            )}
          </div>

          {currentCube && draftState?.cubeName?.includes('_draft_') && (
            <div className="flex shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-1.5">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
              <span className="text-xs text-amber-800">当前为临时草稿名，建议在保存前修改为正式的 Cube 名称和标题。</span>
            </div>
          )}

          {currentCube && (
            <div className="flex h-10 shrink-0 items-center border-b border-[#E0E0E0] px-4">
              <div className="inline-flex rounded-lg bg-[#F0F0F0] p-0.5">
                {[
                  { key: 'ui' as const, label: 'UI Preview' },
                  { key: 'yaml' as const, label: 'YAML' },
                  { key: 'dsl' as const, label: 'Debug' },
                ].map((item) => {
                  const isActive = workspaceMode === item.key
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => handleModeChange(item.key)}
                      className={cn(
                        'rounded-md px-3 py-1 text-xs font-medium transition-all',
                        isActive ? 'bg-white text-[#1B3139] shadow-sm' : 'text-[#6E6E6E] hover:text-[#2E2E2E]',
                      )}
                    >
                      {item.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {!currentCube ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-white">
              {!singleSelectedResource ? (
                <LandingCubeList
                  cubes={cubes}
                  selectedSource={selectedSource}
                  onSelectCube={(name) => setSearchParams({ cube: name, tab: 'modeling' })}
                />
              ) : (
                <div>
                  <section className="border-b border-[#E0E0E0] bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]">资源概览</div>
                        <div className="mt-1.5 text-base font-semibold text-[#1B3139]">{singleSelectedResource.title}</div>
                        <div className="mt-0.5 text-xs text-[#6E6E6E]">{singleSelectedResource.meta}</div>
                      </div>
                      <Button
                        type="button"
                        data-testid="cube-generate-draft"
                        className="gap-1.5"
                        onClick={() => createDraftMutation.mutate()}
                        disabled={createDraftMutation.isPending}
                      >
                        {createDraftMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            生成中…
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4" />
                            AI 建模
                          </>
                        )}
                      </Button>
                    </div>
                  </section>

                  <section className="overflow-hidden bg-white">
                    <div className="flex items-center justify-between border-b border-[#E0E0E0] px-5 py-3">
                      <div className="text-sm font-semibold text-[#1B3139]">字段预览</div>
                      {sourceFieldQuery.isFetching && <Loader2 className="h-4 w-4 animate-spin text-[#6E6E6E]" />}
                    </div>
                    {sourceFieldQuery.isError ? (
                      <div className="px-5 py-8 text-center text-sm text-[#6E6E6E]">
                        加载字段失败：{sourceFieldQuery.error instanceof Error ? sourceFieldQuery.error.message : '请稍后重试'}
                      </div>
                    ) : sourceFieldQuery.isLoading ? (
                      <div className="space-y-2 px-5 py-4">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Skeleton key={i} className="h-8 w-full" />
                        ))}
                      </div>
                    ) : sourceFields.length === 0 ? (
                      <div className="px-5 py-8 text-center text-sm text-[#6E6E6E]">暂无字段数据</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead className="bg-[#F5F5F5]">
                            <tr className="text-left">
                              <th className="whitespace-nowrap px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]">字段</th>
                              <th className="whitespace-nowrap px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]">类型</th>
                              <th className="whitespace-nowrap px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]">说明</th>
                              <th className="whitespace-nowrap px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]">建议</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sourceFields.map((field) => (
                              <tr key={field.name} className="border-t border-[#E0E0E0] transition-colors hover:bg-[#F0F4F8]">
                                <td className="whitespace-nowrap px-5 py-3 font-medium text-[#2E2E2E]">{field.name}</td>
                                <td className="whitespace-nowrap px-5 py-3 text-[#6E6E6E]">{field.dataType}</td>
                                <td className="px-5 py-3 text-[#6E6E6E]">{field.comment || '暂无说明'}</td>
                                <td className="whitespace-nowrap px-5 py-3 text-[#6E6E6E]">{field.recommendedRole === 'measure' ? '指标候选' : '维度候选'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                </div>
              )}
            </div>
          ) : workspaceMode === 'yaml' ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#FAFAFA] px-5 py-5">
              <YamlEditorTab fileType="cubes" fileName={currentCube.name} onDirtyChange={() => undefined} />
            </div>
          ) : workspaceMode === 'python' ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#FAFAFA] px-5 py-5">
              <PythonPreviewTab cube={cubeDetail} />
            </div>
          ) : workspaceMode === 'dsl' ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[hsl(var(--workbench-surface))] px-5 py-5">
              <PlaygroundTab preferredCube={currentCube.name} hideCubeSelect />
            </div>
          ) : (
            <>
              {currentCube && draftState && (
                <div className="flex h-10 shrink-0 items-center gap-0 border-b border-[#E0E0E0] bg-[#FAFAFA] px-5">
                  {([
                    { key: 'preview' as UiSection, label: 'Preview', ariaLabel: 'Preview' },
                    { key: 'measures' as UiSection, label: `Measures (${draftState.measures.length})`, ariaLabel: 'Measures' },
                    { key: 'dimensions' as UiSection, label: `Dimensions (${draftState.dimensions.length})`, ariaLabel: 'Dimensions' },
                    { key: 'joins' as UiSection, label: `Joins (${draftState.joins.length})`, ariaLabel: 'Joins' },
                  ]).map((item) => {
                    const isActive = uiSection === item.key
                    return (
                      <button
                        key={item.key}
                        type="button"
                        aria-label={item.ariaLabel}
                        aria-current={isActive ? 'true' : undefined}
                        onClick={() => handleUiSectionChange(item.key)}
                        className={cn(
                          'relative h-10 px-4 text-xs font-medium transition-colors',
                          isActive ? 'font-semibold text-[#1B3139]' : 'text-[#6E6E6E] hover:text-[#2E2E2E]',
                        )}
                      >
                        {item.label}
                        {isActive && <span className="absolute inset-x-0 bottom-0 h-[3px] bg-[#1B3139]" />}
                      </button>
                    )
                  })}
                </div>
              )}

              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-white" data-testid="semantic-workbench-ui">
                {uiSection === 'preview' && draftState ? (
                  <div className="flex min-h-0 flex-1">
                    <div className="w-[240px] shrink-0 overflow-y-auto border-r border-[#E0E0E0]">
                      <Accordion type="multiple" className="w-full">
                        <AccordionItem value="measures" className="border-b border-[#E0E0E0]">
                          <AccordionTrigger className="px-4 py-2 text-xs font-semibold text-[#1B3139] hover:no-underline [&>svg]:h-3 [&>svg]:w-3">
                            Measures ({draftState.measures.length})
                          </AccordionTrigger>
                          <AccordionContent className="pb-0 pt-0">
                            {draftState.measures.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                className="flex w-full items-center gap-2 px-4 py-1.5 text-left text-xs transition hover:bg-[#F0F4F8]"
                                onClick={() => { handleUiSectionChange('measures'); setSelectedEditorItem({ kind: 'measure', id: item.id }) }}
                              >
                                <Eye className="h-3 w-3 shrink-0 text-[#6E6E6E]" />
                                <span className="truncate text-[#2E2E2E]">{item.displayName}</span>
                              </button>
                            ))}
                          </AccordionContent>
                        </AccordionItem>
                        <AccordionItem value="dimensions" className="border-b border-[#E0E0E0]">
                          <AccordionTrigger className="px-4 py-2 text-xs font-semibold text-[#1B3139] hover:no-underline [&>svg]:h-3 [&>svg]:w-3">
                            Dimensions ({draftState.dimensions.length})
                          </AccordionTrigger>
                          <AccordionContent className="pb-0 pt-0">
                            {draftState.dimensions.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                className="flex w-full items-center gap-2 px-4 py-1.5 text-left text-xs transition hover:bg-[#F0F4F8]"
                                onClick={() => { handleUiSectionChange('dimensions'); setSelectedEditorItem({ kind: 'dimension', id: item.id }) }}
                              >
                                <Eye className="h-3 w-3 shrink-0 text-[#6E6E6E]" />
                                <span className="truncate text-[#2E2E2E]">{item.displayName}</span>
                              </button>
                            ))}
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    </div>

                    <div className="min-w-0 flex-1 overflow-auto">
                      <div className="border-b border-[#E0E0E0] px-5 py-2.5">
                        <div className="text-xs font-semibold text-[#1B3139]">Preview</div>
                      </div>
                      {sourceFieldQuery.isLoading ? (
                        <div className="space-y-2 px-5 py-4">
                          <div className="mb-2 text-xs text-[#6E6E6E]">加载数据预览中…</div>
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Skeleton key={i} className="h-7 w-full" />
                          ))}
                        </div>
                      ) : sourceFieldQuery.isError ? (
                        <div className="px-5 py-8 text-center text-xs text-[#6E6E6E]">
                          加载失败：{sourceFieldQuery.error instanceof Error ? sourceFieldQuery.error.message : '请稍后重试'}
                        </div>
                      ) : sampleColumns.length > 0 && sampleRows.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-xs">
                            <thead className="sticky top-0 bg-[#F5F5F5]">
                              <tr className="text-left">
                                <th className="whitespace-nowrap px-3 py-2 text-[11px] font-semibold text-[#6E6E6E]">#</th>
                                {sampleColumns.map((col) => (
                                  <th key={col} className="whitespace-nowrap px-3 py-2 text-[11px] font-semibold text-[#6E6E6E]">{col}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {sampleRows.map((row, idx) => (
                                <tr key={idx} className="border-t border-[#E0E0E0] transition-colors hover:bg-[#F9FAFB]">
                                  <td className="whitespace-nowrap px-3 py-1.5 text-[#6E6E6E]">{idx + 1}</td>
                                  {sampleColumns.map((col) => (
                                    <td key={col} className="max-w-[200px] truncate whitespace-nowrap px-3 py-1.5 text-[#2E2E2E]">
                                      {row[col] != null ? String(row[col]) : <span className="text-[#C0C0C0]">-</span>}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : sourceFields.length > 0 ? (
                        <div className="overflow-x-auto">
                          {previewError && (
                            <div className="mx-5 mt-3 rounded bg-amber-50 px-3 py-2 text-xs text-amber-700">
                              数据预览失败（字段信息已加载）：{previewError}
                            </div>
                          )}
                          <table className="min-w-full text-xs">
                            <thead className="sticky top-0 bg-[#F5F5F5]">
                              <tr className="text-left">
                                <th className="whitespace-nowrap px-3 py-2 text-[11px] font-semibold text-[#6E6E6E]">#</th>
                                {sourceFields.map((f) => (
                                  <th key={f.name} className="whitespace-nowrap px-3 py-2 text-[11px] font-semibold text-[#6E6E6E]">{f.name}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="border-t border-[#E0E0E0]">
                                <td colSpan={sourceFields.length + 1} className="px-3 py-4 text-center text-[#6E6E6E]">
                                  {previewError ? '数据预览不可用，但字段定义已就绪' : '暂无样本数据'}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="px-5 py-8 text-center text-xs text-[#6E6E6E]">暂无数据预览</div>
                      )}
                    </div>
                  </div>
                ) : null}

                {uiSection === 'measures' && draftState ? (() => {
                  const PAGE_SIZE = 20
                  const items = draftState.measures
                  const totalPages = Math.ceil(items.length / PAGE_SIZE)
                  const paged = items.slice(measuresPage * PAGE_SIZE, (measuresPage + 1) * PAGE_SIZE)
                  return (
                  <div className="px-5 py-5">
                    <section className="overflow-hidden border border-[#E0E0E0] bg-white">
                      <div className="flex items-center justify-between border-b border-[#E0E0E0] px-5 py-3">
                        <div className="text-sm font-semibold text-[#1B3139]">Measures</div>
                        <Button type="button" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => addMeasureDraft()}>
                          <Plus className="h-4 w-4" />
                          新增
                        </Button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead className="bg-[#F5F5F5] text-left">
                            <tr>
                              <th className="whitespace-nowrap px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]">名称</th>
                              <th className="whitespace-nowrap px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]">表达式</th>
                              <th className="whitespace-nowrap px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]">注释</th>
                              <th className="whitespace-nowrap px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]">格式</th>
                            </tr>
                          </thead>
                          <tbody>
                            {paged.map((item) => (
                              <tr
                                key={item.id}
                                className={cn(
                                  'cursor-pointer border-t border-[#E0E0E0] transition hover:bg-[#F0F4F8]',
                                  selectedMeasure?.id === item.id ? 'bg-[#E8F0FE]' : '',
                                )}
                                onClick={() => setSelectedEditorItem({ kind: 'measure', id: item.id })}
                              >
                                <td className="whitespace-nowrap px-5 py-3 font-medium text-[#2E2E2E]">{item.displayName}</td>
                                <td className="max-w-[18rem] truncate px-5 py-3 text-[#6E6E6E]">{item.expression || '--'}</td>
                                <td className="max-w-[18rem] truncate px-5 py-3 text-[#6E6E6E]">{item.comment || '--'}</td>
                                <td className="whitespace-nowrap px-5 py-3 text-[#6E6E6E]">{item.format || '无'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {totalPages > 1 && (
                        <div className="flex items-center justify-between border-t border-[#E0E0E0] px-5 py-2">
                          <span className="text-xs text-[#6E6E6E]">{items.length} 条，第 {measuresPage + 1}/{totalPages} 页</span>
                          <div className="flex gap-1">
                            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={measuresPage === 0} onClick={() => setMeasuresPage((p) => p - 1)}>上一页</Button>
                            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={measuresPage >= totalPages - 1} onClick={() => setMeasuresPage((p) => p + 1)}>下一页</Button>
                          </div>
                        </div>
                      )}
                    </section>
                  </div>
                  )
                })() : null}

                {uiSection === 'dimensions' && draftState ? (() => {
                  const PAGE_SIZE = 20
                  const items = draftState.dimensions
                  const totalPages = Math.ceil(items.length / PAGE_SIZE)
                  const paged = items.slice(dimensionsPage * PAGE_SIZE, (dimensionsPage + 1) * PAGE_SIZE)
                  return (
                  <div className="px-5 py-5">
                    <section className="overflow-hidden border border-[#E0E0E0] bg-white">
                      <div className="flex items-center justify-between border-b border-[#E0E0E0] px-5 py-3">
                        <div className="text-sm font-semibold text-[#1B3139]">Dimensions</div>
                        <Button type="button" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => addDimensionDraft()}>
                          <Plus className="h-4 w-4" />
                          新增
                        </Button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead className="bg-[#F5F5F5] text-left">
                            <tr>
                              <th className="whitespace-nowrap px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]">名称</th>
                              <th className="whitespace-nowrap px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]">表达式</th>
                              <th className="whitespace-nowrap px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]">注释</th>
                            </tr>
                          </thead>
                          <tbody>
                            {paged.map((item) => (
                              <tr
                                key={item.id}
                                className={cn(
                                  'cursor-pointer border-t border-[#E0E0E0] transition hover:bg-[#F0F4F8]',
                                  selectedDimension?.id === item.id ? 'bg-[#E8F0FE]' : '',
                                )}
                                onClick={() => setSelectedEditorItem({ kind: 'dimension', id: item.id })}
                              >
                                <td className="whitespace-nowrap px-5 py-3 font-medium text-[#2E2E2E]">{item.name}</td>
                                <td className="max-w-[18rem] truncate px-5 py-3 text-[#6E6E6E]">{item.expression || '--'}</td>
                                <td className="max-w-[18rem] truncate px-5 py-3 text-[#6E6E6E]">{item.comment || '--'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {totalPages > 1 && (
                        <div className="flex items-center justify-between border-t border-[#E0E0E0] px-5 py-2">
                          <span className="text-xs text-[#6E6E6E]">{items.length} 条，第 {dimensionsPage + 1}/{totalPages} 页</span>
                          <div className="flex gap-1">
                            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={dimensionsPage === 0} onClick={() => setDimensionsPage((p) => p - 1)}>上一页</Button>
                            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={dimensionsPage >= totalPages - 1} onClick={() => setDimensionsPage((p) => p + 1)}>下一页</Button>
                          </div>
                        </div>
                      )}
                    </section>
                  </div>
                  )
                })() : null}

                {uiSection === 'filters' && draftState ? (
                  <div className="space-y-5 px-5 py-5">
                    <section className="overflow-hidden border border-[#E0E0E0] bg-white">
                      <div className="flex items-center justify-between border-b border-[#E0E0E0] px-5 py-3">
                        <div className="text-sm font-semibold text-[#1B3139]">Filters</div>
                        <Button type="button" variant="ghost" className="h-8 px-2 text-[#2272B4]" onClick={() => addFilterDraft()}>
                          <Plus className="mr-1 h-4 w-4" />
                          新建 Filter
                        </Button>
                      </div>
                      {draftState.filters.length > 0 ? (
                        <div className="divide-y divide-[#E0E0E0]">
                          {draftState.filters.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              className={cn(
                                'flex w-full items-center justify-between px-5 py-3 text-left transition hover:bg-[#F0F4F8]',
                                selectedFilter?.id === item.id ? 'bg-[#E8F0FE]' : '',
                              )}
                              onClick={() => setSelectedEditorItem({ kind: 'filter', id: item.id })}
                            >
                              <span className="font-medium text-[#2E2E2E]">{item.name}</span>
                              <span className="text-xs text-[#6E6E6E]">{renderExpressionModeLabel(item.mode)}</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="px-5 py-6 text-center">
                          <Box className="mx-auto h-8 w-8 text-[#E0E0E0]" />
                          <div className="mt-3 text-sm font-medium text-[#6E6E6E]">暂无自定义 Filter</div>
                          <div className="mt-1 text-xs text-[#6E6E6E]">点击「新建 Filter」以创建筛选条件</div>
                        </div>
                      )}
                    </section>
                  </div>
                ) : null}

                {uiSection === 'joins' && draftState ? (() => {
                  const joinableItems = datasets
                    .filter((d) => {
                      const q = joinSearchQuery.toLowerCase()
                      if (!q) return true
                      return d.dataset_name.toLowerCase().includes(q) || (d.physical_table || '').toLowerCase().includes(q)
                    })
                    .slice(0, 50)
                  return (
                  <div className="px-5 py-5">
                    <section className="overflow-hidden border border-[#E0E0E0] bg-white">
                      <div className="flex items-center justify-between border-b border-[#E0E0E0] px-5 py-3">
                        <div className="text-sm font-semibold text-[#1B3139]">Joins</div>
                        <Button type="button" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => { setJoinDialogOpen(true); setJoinSearchQuery('') }}>
                          <Plus className="h-4 w-4" />
                          新增
                        </Button>
                      </div>
                      {draftState.joins.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-sm">
                            <thead className="bg-[#F5F5F5] text-left">
                              <tr>
                                <th className="whitespace-nowrap px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]">名称</th>
                                <th className="whitespace-nowrap px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]">Target Table</th>
                                <th className="whitespace-nowrap px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]">Relationship</th>
                                <th className="whitespace-nowrap px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]">Join Type</th>
                              </tr>
                            </thead>
                            <tbody>
                              {draftState.joins.map((item) => (
                                <tr
                                  key={item.id}
                                  className={cn(
                                    'cursor-pointer border-t border-[#E0E0E0] transition hover:bg-[#F0F4F8]',
                                    selectedJoin?.id === item.id ? 'bg-[#E8F0FE]' : '',
                                  )}
                                  onClick={() => setSelectedEditorItem({ kind: 'join', id: item.id })}
                                >
                                  <td className="whitespace-nowrap px-5 py-3 font-medium text-[#2E2E2E]">{item.name}</td>
                                  <td className="max-w-[12rem] truncate px-5 py-3 font-mono text-[#6E6E6E]">{item.targetTable || item.targetCube || '--'}</td>
                                  <td className="whitespace-nowrap px-5 py-3 text-[#6E6E6E]">{item.relationship.replace(/_/g, ':')}</td>
                                  <td className="whitespace-nowrap px-5 py-3">
                                    <Badge variant="outline" className="text-[10px]">{item.joinType}</Badge>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="px-5 py-6 text-center">
                          <Box className="mx-auto h-8 w-8 text-[#E0E0E0]" />
                          <div className="mt-3 text-sm font-medium text-[#6E6E6E]">暂无 Join 关系</div>
                          <div className="mt-1 text-xs text-[#6E6E6E]">点击「新增」添加表关联</div>
                        </div>
                      )}
                    </section>

                    <Dialog open={joinDialogOpen} onOpenChange={setJoinDialogOpen}>
                      <DialogContent className="max-h-[80vh] sm:max-w-lg">
                        <DialogHeader>
                          <DialogTitle>新增 Join</DialogTitle>
                          <DialogDescription>选择要关联的物理表或数据集</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-3">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6E6E6E]" />
                            <Input
                              placeholder="搜索物理表或数据集…"
                              value={joinSearchQuery}
                              onChange={(e) => setJoinSearchQuery(e.target.value)}
                              className="pl-9"
                            />
                          </div>
                          <div className="max-h-[40vh] overflow-y-auto rounded border border-[#E0E0E0]">
                            {joinableItems.length === 0 ? (
                              <div className="px-4 py-6 text-center text-sm text-[#6E6E6E]">未找到匹配的表</div>
                            ) : (
                              joinableItems.map((d) => (
                                <button
                                  key={d.id}
                                  type="button"
                                  className="flex w-full items-center gap-3 border-b border-[#E0E0E0] px-4 py-2.5 text-left text-sm transition last:border-b-0 hover:bg-[#F0F4F8]"
                                  onClick={() => {
                                    addJoinDraft('form', d.physical_table || d.dataset_name)
                                    setJoinDialogOpen(false)
                                  }}
                                >
                                  <Table2 className="h-4 w-4 shrink-0 text-[#6E6E6E]" />
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate font-medium text-[#2E2E2E]">{d.dataset_name}</div>
                                    <div className="truncate text-xs text-[#6E6E6E]">{d.physical_table || d.dataset_code}</div>
                                  </div>
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                        <DialogFooter>
                          <Button type="button" variant="outline" onClick={() => setJoinDialogOpen(false)}>取消</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                  )
                })() : null}
              </div>
            </>
          )}
        </main>

        {shouldShowRightPanel && (
        <aside className="hidden min-h-0 w-[320px] shrink-0 flex-col overflow-hidden border-l border-[#E0E0E0] bg-white lg:flex" data-testid="semantic-inspector-pane">
          <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#E0E0E0] px-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]">属性</div>
            <button
              type="button"
              className="text-[#8C8C8C] hover:text-[#2E2E2E] transition-colors"
              onClick={() => setSelectedEditorItem((prev) => ('kind' in prev && prev.kind !== 'meta' ? { kind: prev.kind, id: '' } : { kind: 'meta' }))}
              aria-label="关闭属性面板"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {selectedMeasure ? (
              <div>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <div className="text-[11px] font-semibold text-[#6E6E6E]">Measure · {selectedMeasure.displayName}</div>
                  <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => handleModeChange('dsl')}>
                    <Eye className="mr-1 h-3 w-3" />
                    预览
                  </Button>
                </div>
                <div className="space-y-3 px-4 pb-4">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]" htmlFor="measure-name">Measure name</label>
                    <Input id="measure-name" aria-label="Measure name" className="h-8 text-xs" value={selectedMeasure.name} onChange={(event) => updateMeasure(selectedMeasure.id, { name: event.target.value })} />

                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]" htmlFor="measure-expression">Expression</label>
                      <ExpressionModeToggle mode={selectedMeasure.expressionMode} onChange={(next) => updateMeasure(selectedMeasure.id, { expressionMode: next })} />
                    </div>
                    <Input
                      id="measure-expression"
                      aria-label="Expression"
                      className="h-8 font-mono text-xs"
                      value={selectedMeasure.expression}
                      onChange={(event) => updateMeasure(selectedMeasure.id, { expression: event.target.value })}
                      readOnly={selectedMeasure.expressionMode === 'builder'}
                    />

                    {selectedMeasure.expressionMode === 'builder' ? (
                      <div className="grid gap-2 grid-cols-2">
                        <div>
                          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]" htmlFor="measure-field">Field</label>
                          <Select
                            value={selectedMeasure.field || ''}
                            onValueChange={(val) => updateMeasure(selectedMeasure.id, {
                              field: val,
                              sourceDataType: sourceFields.find((item) => item.name === val)?.dataType,
                            })}
                          >
                            <SelectTrigger id="measure-field" aria-label="Field" className="h-8 w-full text-xs">
                              <SelectValue placeholder="选择字段" />
                            </SelectTrigger>
                            <SelectContent>
                              {sourceFields.map((item) => (
                                <SelectItem key={item.name} value={item.name}>{item.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]" htmlFor="measure-aggregation">Aggregation</label>
                          <Select
                            value={selectedMeasure.aggregation}
                            onValueChange={(val) => updateMeasure(selectedMeasure.id, { aggregation: val as MeasureAggregation })}
                          >
                            <SelectTrigger id="measure-aggregation" aria-label="Aggregation" className="h-8 w-full text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="sum">sum</SelectItem>
                              <SelectItem value="count">count</SelectItem>
                              <SelectItem value="count_distinct">count_distinct</SelectItem>
                              <SelectItem value="avg">avg</SelectItem>
                              <SelectItem value="min">min</SelectItem>
                              <SelectItem value="max">max</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-1 border-t border-[#F0F0F0] pt-3 space-y-3">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]" htmlFor="measure-display-name">显示名称</label>
                    <Input id="measure-display-name" aria-label="Display name" className="h-8 text-xs" value={selectedMeasure.displayName} onChange={(event) => updateMeasure(selectedMeasure.id, { displayName: event.target.value })} />

                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]" htmlFor="measure-comment">备注</label>
                    <Textarea id="measure-comment" aria-label="Comment" className="min-h-[60px] text-xs" value={selectedMeasure.comment} onChange={(event) => updateMeasure(selectedMeasure.id, { comment: event.target.value })} />
                    </div>

                    <div className="mt-1 border-t border-[#F0F0F0] pt-3 space-y-3">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]" htmlFor="measure-synonyms">同义词</label>
                    <TagInput id="measure-synonyms" ariaLabel="Synonyms" value={selectedMeasure.synonyms} onChange={(val) => updateMeasure(selectedMeasure.id, { synonyms: val })} placeholder="输入同义词后按 Enter" />

                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]">格式</label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="mt-1.5 h-8 w-full justify-start text-xs font-normal">
                            {(() => {
                              const parts = (selectedMeasure.format || '').split(':')
                              const type = parts[0] || 'None'
                              const abbr = parts[1] || 'None'
                              if (type === 'None' && abbr === 'None') return '无格式'
                              return [type !== 'None' ? type : null, abbr !== 'None' ? abbr : null].filter(Boolean).join(', ')
                            })()}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 space-y-3 p-4" align="start">
                          <div>
                            <div className="mb-1 text-[10px] font-semibold text-[#6E6E6E]">Type</div>
                            <div className="flex gap-0.5 rounded border border-[#E0E0E0] p-0.5">
                              {(['None', '$', '%', 'Byte'] as const).map((opt) => {
                                const fmtType = selectedMeasure.format?.split(':')[0] || 'None'
                                const isActive = fmtType === opt
                                return (
                                  <button
                                    key={opt}
                                    type="button"
                                    aria-label={`Format type ${opt}`}
                                    className={cn('flex-1 rounded px-2 py-1 text-[11px] font-medium transition-colors', isActive ? 'bg-[#1B3139] text-white' : 'text-[#6E6E6E] hover:bg-[#F5F5F5]')}
                                    onClick={() => {
                                      const parts = (selectedMeasure.format || 'None').split(':')
                                      parts[0] = opt
                                      updateMeasure(selectedMeasure.id, { format: parts.join(':') })
                                    }}
                                  >
                                    {opt}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                          <div>
                            <div className="mb-1 text-[10px] font-semibold text-[#6E6E6E]">Abbreviation</div>
                            <div className="flex gap-0.5 rounded border border-[#E0E0E0] p-0.5">
                              {(['None', 'Compact', 'Scientific'] as const).map((opt) => {
                                const fmtAbbr = selectedMeasure.format?.split(':')[1] || 'None'
                                const isActive = fmtAbbr === opt
                                return (
                                  <button
                                    key={opt}
                                    type="button"
                                    aria-label={`Format abbreviation ${opt}`}
                                    className={cn('flex-1 rounded px-2 py-1 text-[11px] font-medium transition-colors', isActive ? 'bg-[#1B3139] text-white' : 'text-[#6E6E6E] hover:bg-[#F5F5F5]')}
                                    onClick={() => {
                                      const parts = (selectedMeasure.format || 'None:None:2:true').split(':')
                                      while (parts.length < 4) parts.push(parts.length === 3 ? 'true' : parts.length === 2 ? '2' : 'None')
                                      parts[1] = opt
                                      updateMeasure(selectedMeasure.id, { format: parts.join(':') })
                                    }}
                                  >
                                    {opt}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                          <div>
                            <div className="mb-1 text-[10px] font-semibold text-[#6E6E6E]">Negative sign</div>
                            <div className="flex gap-0.5 rounded border border-[#E0E0E0] p-0.5">
                              {(['-123.45', '(123.45)'] as const).map((opt) => {
                                const fmtNeg = selectedMeasure.format?.split(':')[4] || '-123.45'
                                const isActive = fmtNeg === opt
                                return (
                                  <button
                                    key={opt}
                                    type="button"
                                    className={cn('flex-1 rounded px-2 py-1 text-[11px] font-medium transition-colors', isActive ? 'bg-[#1B3139] text-white' : 'text-[#6E6E6E] hover:bg-[#F5F5F5]')}
                                    onClick={() => {
                                      const parts = (selectedMeasure.format || 'None:None:auto:true:-123.45').split(':')
                                      while (parts.length < 5) parts.push(parts.length === 4 ? '-123.45' : parts.length === 3 ? 'true' : parts.length === 2 ? 'auto' : 'None')
                                      parts[4] = opt
                                      updateMeasure(selectedMeasure.id, { format: parts.join(':') })
                                    }}
                                  >
                                    {opt}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <div className="mb-1 text-[10px] font-semibold text-[#6E6E6E]">Decimal places</div>
                              <Select
                                value={selectedMeasure.format?.split(':')[2] || 'auto'}
                                onValueChange={(val) => {
                                  const parts = (selectedMeasure.format || 'None:None:auto:true').split(':')
                                  while (parts.length < 4) parts.push(parts.length === 3 ? 'true' : parts.length === 2 ? 'auto' : 'None')
                                  parts[2] = val
                                  updateMeasure(selectedMeasure.id, { format: parts.join(':') })
                                }}
                              >
                                <SelectTrigger aria-label="Decimal places" className="h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="auto">Auto</SelectItem>
                                  <SelectItem value="0">0</SelectItem>
                                  <SelectItem value="1">1</SelectItem>
                                  <SelectItem value="2">2</SelectItem>
                                  <SelectItem value="3">3</SelectItem>
                                  <SelectItem value="4">4</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex items-end pb-1">
                              <label className="flex items-center gap-2 text-[11px] text-[#6E6E6E]">
                                <Checkbox
                                  checked={selectedMeasure.format?.split(':')[3] !== 'false'}
                                  onCheckedChange={(checked) => {
                                    const parts = (selectedMeasure.format || 'None:None:auto:true').split(':')
                                    while (parts.length < 4) parts.push(parts.length === 3 ? 'true' : parts.length === 2 ? 'auto' : 'None')
                                    parts[3] = checked ? 'true' : 'false'
                                    updateMeasure(selectedMeasure.id, { format: parts.join(':') })
                                  }}
                                />
                                Group separator
                              </label>
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>

                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]" htmlFor="measure-tags">标签</label>
                    <TagInput id="measure-tags" ariaLabel="Tags" value={selectedMeasure.tags} onChange={(val) => updateMeasure(selectedMeasure.id, { tags: val })} placeholder="输入标签后按 Enter" />
                    </div>
                </div>
              </div>
            ) : selectedDimension ? (
              <div>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <div className="text-[11px] font-semibold text-[#6E6E6E]">Dimension · {selectedDimension.displayName}</div>
                  <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => handleModeChange('dsl')}>
                    <Eye className="mr-1 h-3 w-3" />
                    预览
                  </Button>
                </div>
                <div className="space-y-3 px-4 pb-4">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]" htmlFor="dimension-name">Dimension name</label>
                    <Input id="dimension-name" aria-label="Dimension name" className="h-8 text-xs" value={selectedDimension.name} onChange={(event) => updateDimension(selectedDimension.id, { name: event.target.value })} />

                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]" htmlFor="dimension-type">Type</label>
                    <Select
                      value={selectedDimension.type || 'string'}
                      onValueChange={(val) => updateDimension(selectedDimension.id, { type: val as EditableDimension['type'] })}
                    >
                      <SelectTrigger id="dimension-type" aria-label="Type" className="h-8 w-full text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="string">string</SelectItem>
                        <SelectItem value="number">number</SelectItem>
                        <SelectItem value="boolean">boolean</SelectItem>
                        <SelectItem value="time">time</SelectItem>
                        <SelectItem value="geo">geo</SelectItem>
                      </SelectContent>
                    </Select>

                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]" htmlFor="dimension-expression">Expression</label>
                      <ExpressionModeToggle mode={selectedDimension.expressionMode} onChange={(next) => updateDimension(selectedDimension.id, { expressionMode: next })} />
                    </div>
                    <Input
                      id="dimension-expression"
                      aria-label="Expression"
                      className="h-8 font-mono text-xs"
                      value={selectedDimension.expression}
                      onChange={(event) => updateDimension(selectedDimension.id, { expression: event.target.value })}
                      readOnly={selectedDimension.expressionMode === 'builder'}
                    />

                    {selectedDimension.expressionMode === 'builder' ? (
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]" htmlFor="dimension-field">Field</label>
                        <Select
                          value={selectedDimension.field || ''}
                          onValueChange={(val) => updateDimension(selectedDimension.id, {
                            field: val,
                            sourceDataType: sourceFields.find((item) => item.name === val)?.dataType,
                            type: inferDimensionType(sourceFields.find((item) => item.name === val)?.dataType),
                          })}
                        >
                          <SelectTrigger id="dimension-field" aria-label="Field" className="h-8 w-full text-xs">
                            <SelectValue placeholder="选择字段" />
                          </SelectTrigger>
                          <SelectContent>
                            {sourceFields.map((item) => (
                              <SelectItem key={item.name} value={item.name}>{item.name} ({item.dataType})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}

                    <div className="mt-1 border-t border-[#F0F0F0] pt-3 space-y-3">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]" htmlFor="dimension-display-name">显示名称</label>
                    <Input id="dimension-display-name" aria-label="Display name" className="h-8 text-xs" value={selectedDimension.displayName} onChange={(event) => updateDimension(selectedDimension.id, { displayName: event.target.value })} />

                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]" htmlFor="dimension-comment">描述</label>
                    <Textarea id="dimension-comment" aria-label="Description" className="min-h-[60px] text-xs" value={selectedDimension.comment} onChange={(event) => updateDimension(selectedDimension.id, { comment: event.target.value })} />
                    </div>

                    <div className="mt-1 border-t border-[#F0F0F0] pt-3 space-y-3">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]" htmlFor="dimension-synonyms">同义词</label>
                    <TagInput id="dimension-synonyms" ariaLabel="Synonyms" value={selectedDimension.synonyms} onChange={(val) => updateDimension(selectedDimension.id, { synonyms: val })} placeholder="输入同义词后按 Enter" />

                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]" htmlFor="dimension-format">格式</label>
                    <Input id="dimension-format" aria-label="Format" className="h-8 text-xs" value={selectedDimension.format} onChange={(event) => updateDimension(selectedDimension.id, { format: event.target.value })} />

                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]" htmlFor="dimension-tags">标签</label>
                    <TagInput id="dimension-tags" ariaLabel="Tags" value={selectedDimension.tags} onChange={(val) => updateDimension(selectedDimension.id, { tags: val })} placeholder="输入标签后按 Enter" />
                    </div>
                </div>
              </div>
            ) : selectedFilter ? (
              <div>
                <div className="px-4 py-2.5">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] font-semibold text-[#6E6E6E]">Filter · {selectedFilter.name}</div>
                    <div className="inline-flex rounded-md bg-[#F0F0F0] p-0.5">
                      <button
                        type="button"
                        aria-pressed={selectedFilter.mode === 'form'}
                        onClick={() => updateFilter(selectedFilter.id, { mode: 'form' })}
                        className={cn('rounded px-2.5 py-0.5 text-[10px] font-medium whitespace-nowrap transition', selectedFilter.mode === 'form' ? 'bg-white shadow-sm text-[#1B3139]' : 'text-[#8C8C8C] hover:text-[#6E6E6E]')}
                      >
                        表单模式
                      </button>
                      <button
                        type="button"
                        aria-pressed={selectedFilter.mode === 'custom'}
                        onClick={() => updateFilter(selectedFilter.id, { mode: 'custom' })}
                        className={cn('rounded px-2.5 py-0.5 text-[10px] font-medium whitespace-nowrap transition', selectedFilter.mode === 'custom' ? 'bg-white shadow-sm text-[#1B3139]' : 'text-[#8C8C8C] hover:text-[#6E6E6E]')}
                      >
                      自定义模式
                    </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 px-4 py-3">
                  {selectedFilter.mode === 'custom' ? (
                    <>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]" htmlFor="filter-expression">
                        Filter expression
                      </label>
                      <Textarea
                        id="filter-expression"
                        aria-label="Filter expression"
                        className="min-h-[60px] text-xs"
                        value={selectedFilter.expression}
                        onChange={(event) => updateFilter(selectedFilter.id, { expression: event.target.value })}
                      />
                    </>
                  ) : (
                    <>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]" htmlFor="filter-field">
                        Field
                      </label>
                      <Select
                        value={selectedFilter.field || ''}
                        onValueChange={(val) => updateFilter(selectedFilter.id, { field: val })}
                      >
                        <SelectTrigger id="filter-field" aria-label="Field" className="h-8 w-full text-xs">
                          <SelectValue placeholder="选择字段" />
                        </SelectTrigger>
                        <SelectContent>
                          {sourceFields.map((item) => (
                            <SelectItem key={item.name} value={item.name}>{item.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]" htmlFor="filter-operator">
                        Operator
                      </label>
                      <Input id="filter-operator" aria-label="Operator" className="h-8 text-xs" value={selectedFilter.operator} onChange={(event) => updateFilter(selectedFilter.id, { operator: event.target.value })} />

                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]" htmlFor="filter-value">
                        Default value
                      </label>
                      <Input id="filter-value" aria-label="Default value" className="h-8 text-xs" value={selectedFilter.value} onChange={(event) => updateFilter(selectedFilter.id, { value: event.target.value })} />
                    </>
                  )}
                </div>
              </div>
            ) : selectedJoin ? (
              <div>
                <div className="border-b border-[#E0E0E0] px-4 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] font-semibold text-[#6E6E6E] truncate">Join · {selectedJoin.name}</div>
                    <div className="inline-flex shrink-0 rounded border border-[#E0E0E0] bg-[#F5F5F5] p-0.5">
                      {(['form', 'custom'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          aria-pressed={selectedJoin.mode === mode}
                          onClick={() => updateJoin(selectedJoin.id, { mode })}
                          className={cn(
                            'rounded px-2 py-0.5 text-[10px] font-medium whitespace-nowrap transition',
                            selectedJoin.mode === mode ? 'bg-white text-[#1B3139] shadow-sm' : 'text-[#8C8C8C]',
                          )}
                        >
                          {mode === 'form' ? '表单' : 'SQL'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-2 px-4 py-3">
                  {selectedJoin.mode === 'custom' ? (
                    <>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]" htmlFor="join-expression">
                        Join expression
                      </label>
                      <Textarea
                        id="join-expression"
                        aria-label="Join expression"
                        className="min-h-[80px] font-mono text-xs"
                        value={selectedJoin.expression}
                        onChange={(event) => updateJoin(selectedJoin.id, { expression: event.target.value })}
                      />
                    </>
                  ) : (
                    <>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]">Join Name</label>
                      <Input aria-label="Join name" className="h-8 text-xs" value={selectedJoin.name} onChange={(event) => updateJoin(selectedJoin.id, { name: event.target.value })} />

                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]">Target Table</label>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="max-w-[180px] truncate text-[11px]">{selectedJoin.targetTable || selectedJoin.targetCube || '未设置'}</Badge>
                        <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => { setJoinDialogOpen(true); setJoinSearchQuery('') }}>
                          更换
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]">Relationship</label>
                          <Select
                            value={selectedJoin.relationship}
                            onValueChange={(val) => updateJoin(selectedJoin.id, { relationship: val as EditableJoin['relationship'] })}
                          >
                            <SelectTrigger aria-label="Relationship" className="h-8 w-full text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="one_to_one">1:1</SelectItem>
                              <SelectItem value="one_to_many">1:N</SelectItem>
                              <SelectItem value="many_to_one">N:1</SelectItem>
                              <SelectItem value="many_to_many">N:N</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]">Join Type</label>
                          <Select
                            value={selectedJoin.joinType}
                            onValueChange={(val) => updateJoin(selectedJoin.id, { joinType: val as EditableJoin['joinType'] })}
                          >
                            <SelectTrigger aria-label="Join Type" className="h-8 w-full text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="left">LEFT</SelectItem>
                              <SelectItem value="inner">INNER</SelectItem>
                              <SelectItem value="right">RIGHT</SelectItem>
                              <SelectItem value="full">FULL</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="mt-1 rounded border border-[#E0E0E0] bg-[#FAFAFA] p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]">Join Conditions</div>
                          <div className="inline-flex rounded border border-[#E0E0E0] bg-[#F5F5F5] p-0.5 text-[10px]">
                            <span className={cn('rounded px-1.5 py-0.5 font-medium', 'bg-white text-[#1B3139] shadow-sm')}>Column</span>
                          </div>
                        </div>
                        {(selectedJoin.conditions?.length ? selectedJoin.conditions : [{ sourceField: '', targetField: '' }]).map((cond, idx) => (
                          <div key={idx} className="mb-2">
                            <div className="mb-1 text-[10px] text-[#8C8C8C]">Join key {idx + 1}</div>
                            <div className="grid grid-cols-[1fr_1fr_24px] items-start gap-1">
                              <div>
                                <div className="mb-0.5 text-[10px] text-[#8C8C8C]">{draftState?.cubeName || 'source'}</div>
                                <Select value={cond.sourceField || ''} onValueChange={(val) => updateJoinCondition(selectedJoin.id, idx, { sourceField: val })}>
                                  <SelectTrigger className="h-7 text-[11px]">
                                    <SelectValue placeholder="选择字段" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {sourceFields.map((f) => (
                                      <SelectItem key={f.name} value={f.name}>{f.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <div className="mb-0.5 text-[10px] text-[#8C8C8C]">{selectedJoin.targetTable || 'target'}</div>
                                <Select value={cond.targetField || ''} onValueChange={(val) => updateJoinCondition(selectedJoin.id, idx, { targetField: val })}>
                                  <SelectTrigger className="h-7 text-[11px]">
                                    <SelectValue placeholder={targetFieldsQuery.isLoading ? '加载中…' : '选择字段'} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {targetFields.map((f) => (
                                      <SelectItem key={f.name} value={f.name}>{f.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              {(selectedJoin.conditions?.length || 0) > 1 && (
                                <button type="button" className="mt-4 text-[#8C8C8C] hover:text-red-500" onClick={() => removeJoinCondition(selectedJoin.id, idx)}>
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                        <button
                          type="button"
                          className="mt-1 flex items-center gap-1 text-[11px] font-medium text-[#2272B4] hover:underline"
                          onClick={() => addJoinCondition(selectedJoin.id)}
                        >
                          <Plus className="h-3 w-3" />
                          Join Key
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : draftState ? (
              <div>
                <div className="border-b border-[#E0E0E0] px-4 py-2">
                  <div className="text-[11px] font-semibold text-[#6E6E6E]">模型上下文</div>
                </div>
                <div className="space-y-2 px-4 py-3">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]" htmlFor="model-title">模型标题</label>
                    <Input id="model-title" className="h-8 text-xs" value={draftState.title} onChange={(event) => updateDraftState((current) => ({ ...current, title: event.target.value }))} />

                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]" htmlFor="model-domain">Domain</label>
                    <Select
                      value={draftState.domainId || ''}
                      onValueChange={(val) => updateDraftState((current) => ({ ...current, domainId: val }))}
                    >
                      <SelectTrigger id="model-domain" className="h-8 w-full text-xs">
                        <SelectValue placeholder="未归属领域" />
                      </SelectTrigger>
                      <SelectContent>
                        {domains.map((domain) => (
                          <SelectItem key={String(domain.id || domain.code)} value={String(domain.id || domain.code)}>
                            {String(domain.name || domain.code)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]" htmlFor="model-grain">grain</label>
                    <Input id="model-grain" className="h-8 text-xs" value={draftState.grain} onChange={(event) => updateDraftState((current) => ({ ...current, grain: event.target.value }))} />

                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]" htmlFor="model-entity-key">entity_key</label>
                    <Input id="model-entity-key" className="h-8 text-xs" value={draftState.entityKey} onChange={(event) => updateDraftState((current) => ({ ...current, entityKey: event.target.value }))} />

                    <div className="divide-y divide-[#E0E0E0] rounded-md border border-[#E0E0E0] text-xs">
                      {[
                        ['状态', contextState],
                        ['维度', String(draftState.dimensions.length)],
                        ['指标', String(draftState.measures.length)],
                        ['过滤器', String(draftState.filters.length)],
                        ['Join', String(draftState.joins.length)],
                        ['未保存变更', dirty ? '是' : '否'],
                        ...(Array.isArray(cubeBacklinksQuery.data?.data?.linked_objects) && cubeBacklinksQuery.data?.data?.linked_objects.length
                          ? [['来源业务对象', String(cubeBacklinksQuery.data.data.linked_objects.length)]]
                          : []),
                      ].map(([key, val]) => (
                        <div key={key} className="flex items-center justify-between px-3 py-2">
                          <span className="text-[#6E6E6E]">{key}</span>
                          <span className="font-medium text-[#2E2E2E]">{val}</span>
                        </div>
                      ))}
                    </div>
                </div>
              </div>
            ) : null}
          </div>
        </aside>
        )}

        {showRelatedCubesPanel && (
        <aside className="hidden min-h-0 w-[280px] shrink-0 flex-col overflow-hidden border-l border-[#E0E0E0] bg-white lg:flex" data-testid="related-cubes-pane">
          <div className="flex h-9 shrink-0 items-center border-b border-[#E0E0E0] px-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#6E6E6E]">关联 Cube ({relatedCubes.length})</div>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <div className="space-y-1">
              {relatedCubes.map((cube) => (
                <button
                  key={cube.name}
                  type="button"
                  onClick={() => setSearchParams({ cube: cube.name, tab: 'modeling' })}
                  className="flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left transition hover:bg-[#F0F4F8]"
                >
                  <Box className="h-4 w-4 shrink-0 text-[#2272B4]" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-[#1B3139]">{cube.title || cube.name}</div>
                    <div className="mt-0.5 truncate text-[11px] text-[#8C8C8C]">{cube.name}</div>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      'shrink-0 text-[9px] border-[#E0E0E0]',
                      cube.status === 'active' && 'border-green-200 bg-green-50 text-green-700',
                      cube.status === 'draft' && 'border-amber-200 bg-amber-50 text-amber-700',
                    )}
                  >
                    {cube.status === 'active' ? '已发布' : cube.status === 'draft' ? '草稿' : cube.status}
                  </Badge>
                </button>
              ))}
            </div>
            <div className="mt-3 border-t border-[#E0E0E0] pt-3">
              <p className="text-[11px] leading-4 text-[#8C8C8C]">
                点击进入已有 Cube 继续编辑，或通过「AI 建模」创建新的 Cube。
              </p>
            </div>
          </div>
        </aside>
        )}

      </div>
    </div>
  )
}
