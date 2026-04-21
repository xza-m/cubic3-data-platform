import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Editor from '@monaco-editor/react'
import {
  ChevronDown,
  Clock3,
  FileText,
  Inbox,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Save,
  PanelRightClose,
  PanelRightOpen,
  Search,
  Sparkles,
} from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { format } from 'sql-formatter'
import { getDataSourceDatabases, getDataSources, previewTableData } from '../../api/datasources'
import {
  applyTemplate,
  createQuery,
  executeQuery,
  getQuery,
  getHistories,
  getTemplates,
  updateQuery,
  type CreateQueryRequest,
  type UpdateQueryRequest,
} from '../../api/queries'
import type { DataSource } from '@/types'
import {
  DataTable,
  FormButton,
  FormInput,
  FormSelect,
  PageModal,
  SchemaBrowser,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  useToast,
} from '@/components/business'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
interface QueryResultColumn {
  name: string
  type?: string
}

interface QueryResults {
  columns: QueryResultColumn[]
  data: Record<string, unknown>[]
  row_count?: number
  execution_time_ms?: number
}

type LegacyQueryView = 'editor' | 'visual' | 'my' | 'history' | 'templates' | 'scheduled'

const LEGACY_QUERY_VIEW_COPY: Record<LegacyQueryView, { title: string; description: string }> = {
  editor: {
    title: '兼容入口：SQL 编辑器',
    description: '旧版 SQL 编辑器已并入当前工作台，保留 SQL 与数据源上下文继续执行。',
  },
  visual: {
    title: '兼容入口：可视化查询',
    description: '旧版可视化查询入口已收口到当前工作台，已自动切换到可视化结果视图。',
  },
  my: {
    title: '兼容入口：我的查询',
    description: '旧版“我的查询”已并入当前工作台，可继续使用保存查询与最近执行能力。',
  },
  history: {
    title: '兼容入口：查询历史',
    description: '旧版查询历史已收口到当前工作台，已自动展开右侧最近执行区域。',
  },
  templates: {
    title: '兼容入口：查询模板',
    description: '旧版模板库已收口到当前工作台，已自动展开右侧模版库。',
  },
  scheduled: {
    title: '兼容入口：定时查询',
    description: '旧版定时查询已迁移到统一工作台，后续请结合提取任务链路继续配置。',
  },
}

const parseLegacyQueryView = (value: string | null): LegacyQueryView | null => {
  if (!value) return null
  return value in LEGACY_QUERY_VIEW_COPY ? value as LegacyQueryView : null
}

const DEFAULT_SQL = `SELECT
  o.order_id,
  o.status,
  c.name AS customer_name,
  SUM(o.total_amount) AS revenue
FROM public.orders o
LEFT JOIN public.customers c ON o.user_id = c.id
WHERE o.created_at >= CURRENT_DATE - INTERVAL '30 day'
GROUP BY o.order_id, o.status, c.name
LIMIT 100`

const queryToolbarIconButtonClass =
  'flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md bg-slate-100 p-0 text-slate-500 transition-colors hover:bg-slate-200'

const COMPACT_VIEWPORT_QUERY = '(max-width: 1279px)'
const QUERY_EDITOR_HEIGHT_STORAGE_KEY = 'query-center.editor-height-ratio'
const DEFAULT_EDITOR_HEIGHT_RATIO = 52
const MIN_EDITOR_HEIGHT_RATIO = 32
const MAX_EDITOR_HEIGHT_RATIO = 78

function useCompactViewport() {
  const [isCompact, setIsCompact] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return

    const media = window.matchMedia(COMPACT_VIEWPORT_QUERY)
    const update = () => setIsCompact(media.matches)

    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return isCompact
}

const readStoredEditorHeightRatio = () => {
  if (typeof window === 'undefined') return DEFAULT_EDITOR_HEIGHT_RATIO
  if (!window.localStorage || typeof window.localStorage.getItem !== 'function') {
    return DEFAULT_EDITOR_HEIGHT_RATIO
  }
  const saved = window.localStorage.getItem(QUERY_EDITOR_HEIGHT_STORAGE_KEY)
  const parsed = saved ? Number.parseFloat(saved) : Number.NaN
  if (!Number.isFinite(parsed)) return DEFAULT_EDITOR_HEIGHT_RATIO
  return Math.min(MAX_EDITOR_HEIGHT_RATIO, Math.max(MIN_EDITOR_HEIGHT_RATIO, parsed))
}

const normalizeQueryColumns = (columns: unknown): QueryResultColumn[] => {
  if (!Array.isArray(columns)) return []
  return columns.map((column) => {
    if (typeof column === 'string') return { name: column }
    if (typeof column === 'object' && column !== null && 'name' in column) {
      const typedColumn = column as { name: unknown; type?: unknown }
      return {
        name: String(typedColumn.name),
        type: typedColumn.type ? String(typedColumn.type) : undefined,
      }
    }
    return { name: String(column ?? '') }
  })
}

const normalizeQueryRows = (columns: QueryResultColumn[], rows: unknown): Record<string, unknown>[] => {
  if (!Array.isArray(rows)) return []

  return rows.map((row) => {
    if (Array.isArray(row)) {
      return columns.reduce<Record<string, unknown>>((acc, column, index) => {
        acc[column.name] = row[index]
        return acc
      }, {})
    }

    return typeof row === 'object' && row !== null ? row as Record<string, unknown> : {}
  })
}

const buildQueryResults = ({
  columns,
  rows,
  rowCount,
  executionTimeMs,
}: {
  columns: unknown
  rows: unknown
  rowCount?: number
  executionTimeMs?: number
}): QueryResults => {
  const normalizedColumns = normalizeQueryColumns(columns)
  const normalizedRows = normalizeQueryRows(normalizedColumns, rows)
  return {
    columns: normalizedColumns,
    data: normalizedRows,
    row_count: rowCount ?? normalizedRows.length,
    execution_time_ms: executionTimeMs,
  }
}

const isNumericColumnType = (value?: string | null) => Boolean(value && /(int|decimal|numeric|float|double|real|bigint|smallint|tinyint|number)/i.test(value))

const isStringColumnType = (value?: string | null) => Boolean(value && /(char|text|string|varchar)/i.test(value))

const inferColumnTypeFromData = (columnName: string, rows: Record<string, unknown>[]) => {
  const firstValue = rows.find((row) => row[columnName] !== null && row[columnName] !== undefined)?.[columnName]
  if (typeof firstValue === 'number') return 'number'
  if (typeof firstValue === 'string') return 'string'
  return undefined
}

const buildColumnHeaderTitle = (column: QueryResultColumn, rows: Record<string, unknown>[]) => {
  const inferredType = column.type || inferColumnTypeFromData(column.name, rows)

  if (isNumericColumnType(inferredType)) {
    return `123 ${column.name}`
  }

  if (isStringColumnType(inferredType) || inferredType === 'string') {
    return `ABC ${column.name}`
  }

  return column.name
}

export default function QueryCenterDashboard() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const location = useLocation()
  const isCompactViewport = useCompactViewport()
  const [selectedSource, setSelectedSource] = useState<number>()
  const [selectedDatabase, setSelectedDatabase] = useState<string>()
  const [sql, setSql] = useState(DEFAULT_SQL)
  const [executing, setExecuting] = useState(false)
  const [results, setResults] = useState<QueryResults>()
  const [resultView, setResultView] = useState<'result' | 'visual'>('result')
  const [templateSearch, setTemplateSearch] = useState('')
  const [templateCategory, setTemplateCategory] = useState<string>('__all__')
  const [schemaCollapsed, setSchemaCollapsed] = useState(false)
  const [templateCollapsed, setTemplateCollapsed] = useState(true)
  const [saveModalVisible, setSaveModalVisible] = useState(false)
  const [saveFormData, setSaveFormData] = useState({ query_name: '', description: '' })
  const [activeQueryId, setActiveQueryId] = useState<number>()
  const [legacyView, setLegacyView] = useState<LegacyQueryView | null>(null)
  const [editorHeightRatio, setEditorHeightRatio] = useState(readStoredEditorHeightRatio)
  const [isResizingEditor, setIsResizingEditor] = useState(false)
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const splitLayoutRef = useRef<HTMLDivElement | null>(null)
  const queryIntent = searchParams.get('intent')
  const intentBanner = useMemo(() => {
    if (queryIntent === 'create-virtual-dataset') {
      return '你正在从 SQL 虚拟数据集入口进入，请先选择数据源并完善 SQL，再决定是否沉淀为数据集。'
    }
    return null
  }, [queryIntent])

  useEffect(() => {
    if (isCompactViewport) {
      setSchemaCollapsed(true)
      setTemplateCollapsed(true)
      return
    }

    setSchemaCollapsed(false)
    setTemplateCollapsed(true)
  }, [isCompactViewport])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!window.localStorage || typeof window.localStorage.setItem !== 'function') return
    window.localStorage.setItem(QUERY_EDITOR_HEIGHT_STORAGE_KEY, String(editorHeightRatio))
  }, [editorHeightRatio])

  useEffect(() => {
    if (!isResizingEditor) return

    const handleMouseMove = (event: MouseEvent) => {
      if (!splitLayoutRef.current) return
      const rect = splitLayoutRef.current.getBoundingClientRect()
      if (rect.height <= 0) return
      const nextRatio = ((event.clientY - rect.top) / rect.height) * 100
      const clamped = Math.min(MAX_EDITOR_HEIGHT_RATIO, Math.max(MIN_EDITOR_HEIGHT_RATIO, nextRatio))
      setEditorHeightRatio(clamped)
    }

    const handleMouseUp = () => setIsResizingEditor(false)

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizingEditor])

  const { data: datasourcesData } = useQuery({
    queryKey: ['datasources'],
    queryFn: () => getDataSources({ page: 1, page_size: 100 }),
  })

  const datasources = datasourcesData?.data?.items || []

  useEffect(() => {
    if (!selectedSource && datasources.length > 0) {
      setSelectedSource(datasources[0].id)
    }
  }, [datasources, selectedSource])

  const { data: templatesData } = useQuery({
    queryKey: ['templates', { category: templateCategory === '__all__' ? undefined : templateCategory, search: templateSearch }],
    queryFn: () => getTemplates({
      page: 1,
      page_size: 20,
      category: templateCategory === '__all__' ? undefined : templateCategory,
      search: templateSearch || undefined,
    }),
  })

  const { data: historiesData } = useQuery({
    queryKey: ['query-histories', { sourceId: selectedSource }],
    queryFn: () => getHistories({ page: 1, page_size: 5, source_id: selectedSource }),
  })
  const { data: queryDetail } = useQuery({
    queryKey: ['query-detail', activeQueryId],
    queryFn: () => getQuery(activeQueryId!),
    enabled: Boolean(activeQueryId),
  })

  const templates = templatesData?.items || []
  const recentHistories = historiesData?.items || []
  const { data: databasesData } = useQuery({
    queryKey: ['datasource-databases', selectedSource],
    queryFn: () => getDataSourceDatabases(selectedSource!),
    enabled: Boolean(selectedSource),
  })
  const databaseOptions = Array.isArray(databasesData?.data) ? databasesData.data : []
  const datasourceSelectOptions = datasources.map((item: DataSource) => ({
    value: String(item.id),
    label: item.name,
  }))

  useEffect(() => {
    if (!databaseOptions.length) {
      setSelectedDatabase(undefined)
      return
    }
    if (!selectedDatabase || !databaseOptions.includes(selectedDatabase)) {
      setSelectedDatabase(databaseOptions[0])
    }
  }, [databaseOptions, selectedDatabase])

  useEffect(() => {
    const state = location.state as
      | { sql?: string; sourceId?: number; source_id?: number; name?: string; queryId?: number; id?: number }
      | null
      | undefined

    const nextLegacyView = parseLegacyQueryView(searchParams.get('legacy'))
    const sourceIdFromSearch = searchParams.get('sourceId') || searchParams.get('source_id')
    const normalizedSourceId = sourceIdFromSearch ? Number(sourceIdFromSearch) : undefined

    const nextSql = state?.sql ?? searchParams.get('sql') ?? undefined
    const nextSourceId =
      state?.sourceId
      ?? state?.source_id
      ?? (Number.isFinite(normalizedSourceId) ? normalizedSourceId : undefined)
    const nextName = state?.name ?? searchParams.get('name') ?? ''
    const searchQueryId = searchParams.get('queryId') || searchParams.get('id')
    const nextQueryId = state?.queryId ?? state?.id ?? (searchQueryId ? Number(searchQueryId) : undefined)

    setLegacyView(nextLegacyView)
    setActiveQueryId(nextQueryId)

    if (nextLegacyView === 'templates' || nextLegacyView === 'history') {
      setTemplateCollapsed(false)
    } else if (nextLegacyView === 'editor') {
      setTemplateCollapsed(true)
    }

    if (nextLegacyView === 'visual') {
      setResultView('visual')
    } else if (nextLegacyView) {
      setResultView('result')
    }

    if (nextSql) {
      setSql(nextSql)
    }

    if (nextSourceId) {
      setSelectedSource(nextSourceId)
    }

    if (nextName || nextQueryId) {
      setSaveFormData((previous) => ({
        ...previous,
        query_name: nextName || previous.query_name,
      }))
    }
  }, [location.state, location.search])

  useEffect(() => {
    if (!queryDetail) return

    const state = location.state as
      | { sql?: string; sourceId?: number; source_id?: number; name?: string }
      | null
      | undefined
    const hasSqlFromRoute = Boolean(state?.sql || searchParams.get('sql'))
    const hasSourceFromRoute = Boolean(
      state?.sourceId
      || state?.source_id
      || searchParams.get('sourceId')
      || searchParams.get('source_id'),
    )
    const hasNameFromRoute = Boolean(state?.name || searchParams.get('name'))

    if (!hasSqlFromRoute) {
      setSql(queryDetail.sql_query)
    }

    if (!hasSourceFromRoute) {
      setSelectedSource(queryDetail.source_id)
    }

    setSaveFormData((previous) => ({
      query_name: hasNameFromRoute ? previous.query_name || queryDetail.query_name : queryDetail.query_name,
      description: previous.description || queryDetail.description || '',
    }))
  }, [queryDetail, location.state, location.search])

  const templateCategories = useMemo(() => {
    const categories = new Set<string>()
    templates.forEach((template) => {
      if (template.category) categories.add(template.category)
    })

    return [
      { value: '__all__', label: '全部模版' },
      ...Array.from(categories).map((category) => ({ value: category, label: category })),
    ]
  }, [templates])

  const handleFormatSql = () => {
    try {
      setSql(format(sql, { language: 'sql', tabWidth: 2, keywordCase: 'upper' }))
      toast({ title: 'SQL 已美化' })
    } catch (error) {
      toast({
        title: 'SQL 美化失败',
        description: (error as Error).message,
        variant: 'destructive',
      })
    }
  }

  const handleExecute = async () => {
    if (!selectedSource) {
      toast({ title: '请先选择数据源', variant: 'warning' })
      return
    }

    if (!sql.trim()) {
      toast({ title: '请输入 SQL 查询', variant: 'warning' })
      return
    }

    setExecuting(true)
    try {
      const result = await executeQuery({ source_id: selectedSource, sql_query: sql, limit: 1000 })
      const payload = result.data
      const normalized = buildQueryResults({
        columns: payload?.columns,
        rows: payload?.data ?? payload?.rows,
        rowCount: payload?.row_count,
        executionTimeMs: payload?.execution_time_ms,
      })
      setResults(normalized)
      setResultView('result')
      queryClient.invalidateQueries({ queryKey: ['query-histories'] })
      toast({
        title: '查询成功',
        description: `返回 ${normalized.row_count ?? normalized.data.length} 行，耗时 ${normalized.execution_time_ms || 0}ms`,
      })
    } catch (error) {
      const err = error as { response?: { data?: { message?: string } }; message?: string }
      toast({
        title: '查询失败',
        description: err.response?.data?.message || err.message,
        variant: 'destructive',
      })
    } finally {
      setExecuting(false)
    }
  }

  const saveMutation = useMutation({
    mutationFn: ({ queryId, payload }: { queryId?: number; payload: CreateQueryRequest & UpdateQueryRequest }) =>
      (queryId ? updateQuery(queryId, payload) : createQuery(payload)),
    onSuccess: (_result, variables) => {
      toast({ title: variables.queryId ? '查询已更新' : '查询已保存' })
      queryClient.invalidateQueries({ queryKey: ['queries'] })
      if (variables.queryId) {
        queryClient.invalidateQueries({ queryKey: ['query-detail', variables.queryId] })
      }
      setSaveModalVisible(false)
      if (!variables.queryId) {
        setSaveFormData({ query_name: '', description: '' })
        setActiveQueryId(undefined)
      }
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } }; message?: string }
      toast({
        title: '保存失败',
        description: err.response?.data?.message || err.message,
        variant: 'destructive',
      })
    },
  })

  const handleSaveQuery = () => {
    if (!selectedSource) {
      toast({ title: '请先选择数据源', variant: 'warning' })
      return
    }
    if (!saveFormData.query_name.trim()) {
      toast({ title: '请输入查询名称', variant: 'warning' })
      return
    }

    saveMutation.mutate({
      queryId: activeQueryId,
      payload: {
        query_name: saveFormData.query_name,
        description: saveFormData.description,
        sql_query: sql,
        source_id: selectedSource,
      },
    })
  }

  const handleUseTemplate = async (templateId: number, hasParameters: boolean) => {
    if (hasParameters) {
      toast({ title: '带参数模板请先进入模板管理页使用', variant: 'warning' })
      return
    }

    try {
      const result = await applyTemplate(templateId, {})
      setSql(result.sql_query)
      toast({ title: '模板已加载', description: result.template_name })
    } catch (error) {
      toast({
        title: '加载模板失败',
        description: (error as Error).message,
        variant: 'destructive',
      })
    }
  }

  const insertText = (text: string) => {
    setSql((prev) => `${prev}${prev.endsWith('\n') || !prev ? '' : '\n'}${text}`)
  }

  const handlePreviewTable = async (database: string, table: string) => {
    if (!selectedSource) return
    try {
      const result = await previewTableData(selectedSource, database, table)
      const payload = result.data
      setResults(buildQueryResults({
        columns: payload.columns,
        rows: payload.data,
        rowCount: payload.row_count,
      }))
      setResultView('result')
      toast({ title: `预览 ${table}`, description: `返回 ${payload.row_count} 行样例数据` })
    } catch (error) {
      toast({
        title: '表预览失败',
        description: (error as Error).message,
        variant: 'destructive',
      })
    }
  }

  const resultColumns = results?.columns.map((column) => ({
    key: column.name,
    title: buildColumnHeaderTitle(column, results.data),
    dataIndex: column.name,
  })) || []

  const resultData = results?.data.map((row, index) => ({ id: index, ...row })) || []

  return (
    <div className="flex h-full flex-col overflow-auto bg-[#F8FAFC] xl:flex-row xl:overflow-hidden" data-testid="query-center-dashboard-layout">
      <section
        className={cn(
          'order-2 flex shrink-0 flex-col border-t border-slate-200 bg-white transition-all duration-200 ease-in-out xl:order-1 xl:h-full xl:border-r xl:border-t-0',
          schemaCollapsed ? 'w-full xl:w-[56px]' : 'w-full xl:w-[280px]',
        )}
        data-testid="query-center-schema-panel"
      >
        {schemaCollapsed ? (
          <div className="flex h-full flex-col">
            <div className="flex h-11 items-center justify-between border-b border-slate-200 px-3 xl:h-full xl:flex-col xl:justify-center xl:px-0">
              <button
                type="button"
                onClick={() => setSchemaCollapsed(false)}
                className={queryToolbarIconButtonClass}
                aria-label="展开结构树"
              >
                <PanelLeftOpen className="h-3.5 w-3.5" />
              </button>
              <span className="text-[11px] tracking-[0.16em] text-slate-400 xl:[writing-mode:vertical-lr]">数据库结构</span>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="border-b border-slate-200 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <FormSelect
                    value={selectedSource ? String(selectedSource) : undefined}
                    onValueChange={(value) => setSelectedSource(value ? Number(value) : undefined)}
                    options={datasourceSelectOptions}
                    placeholder="选择数据源"
                    className="h-[30px] rounded-md border-0 bg-slate-100 text-sm text-slate-700 shadow-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setSchemaCollapsed((current) => !current)}
                  className={queryToolbarIconButtonClass}
                  aria-label={schemaCollapsed ? '展开结构树' : '折叠结构树'}
                >
                  {schemaCollapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <SchemaBrowser
                datasourceId={selectedSource}
                sourceType={datasources.find((item: DataSource) => item.id === selectedSource)?.source_type}
                title="数据库结构"
                showTitle={false}
                showSearch={false}
                compactTree={true}
                activeDatabase={selectedDatabase}
                hideDatabaseLevel={true}
                autoExpandInitial={false}
                showStatusBar={false}
                collapsible={false}
                onInsert={insertText}
                onDoubleClick={(_node, qualifiedName) => insertText(qualifiedName)}
                onPreview={handlePreviewTable}
                className="h-full border-l-0"
              />
            </div>
          </div>
        )}
      </section>

      <section className="order-1 flex min-w-0 flex-1 flex-col xl:order-2">
        {legacyView ? (
          <div
            data-testid="query-center-legacy-context"
            className="border-b border-blue-100 bg-blue-50/80 px-4 py-3 text-sm"
          >
            <div className="font-medium text-blue-900">{LEGACY_QUERY_VIEW_COPY[legacyView].title}</div>
            <div className="mt-1 text-xs text-blue-700">{LEGACY_QUERY_VIEW_COPY[legacyView].description}</div>
          </div>
        ) : null}
        {intentBanner ? (
          <div className="border-b border-emerald-100 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-800">
            {intentBanner}
          </div>
        ) : null}
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <FormButton onClick={handleExecute} disabled={executing} loading={executing} className="h-[30px] rounded-lg bg-blue-600 px-3 text-xs font-medium">
              <Play className="mr-1.5 h-3.5 w-3.5" />
              运行
            </FormButton>
            <FormButton variant="outline" onClick={handleFormatSql} className="h-[30px] rounded-md border-0 bg-slate-100 px-3 text-xs text-slate-700">
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              SQL 美化
            </FormButton>
            <FormButton variant="outline" onClick={() => setSaveModalVisible(true)} className="h-[30px] rounded-md border-0 bg-slate-100 px-3 text-xs text-slate-700">
              <Save className="mr-1.5 h-3.5 w-3.5" />
              保存
            </FormButton>
            <div className="inline-flex h-[30px] items-center rounded-md bg-slate-100 px-3 text-xs text-slate-700">
              <FileText className="mr-1.5 h-3.5 w-3.5" />
              模版
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex h-[30px] items-center rounded-md bg-slate-100 px-3 font-mono text-[11px] text-slate-700 transition-colors hover:bg-slate-200"
            >
              LIMIT 1000
              <ChevronDown className="ml-1.5 h-3.5 w-3.5 text-slate-500" />
            </button>
            {!templateCollapsed ? (
              <button
                type="button"
                aria-label="折叠模版库"
                onClick={() => setTemplateCollapsed(true)}
                className={queryToolbarIconButtonClass}
              >
                <PanelRightClose className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </div>

        <div ref={splitLayoutRef} className="flex min-h-0 flex-1 flex-col">
          <div
            data-testid="query-editor-pane"
            className="flex min-h-0 flex-col border-b border-slate-200 bg-[#1E293B]"
            style={{ height: `${editorHeightRatio}%` }}
          >
            <div className="border-b border-slate-700 bg-slate-900 px-4 py-2 text-xs text-slate-300">
              示例 SQL，可直接修改
            </div>
            <div className="min-h-[280px] flex-1">
              <Editor
                height="100%"
                defaultLanguage="sql"
                value={sql}
                onChange={(value) => setSql(value || '')}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  wordWrap: 'on',
                }}
              />
            </div>
          </div>

          <button
            type="button"
            data-testid="query-editor-resize-handle"
            aria-label="调整编辑器与结果区高度"
            onMouseDown={(event) => {
              event.preventDefault()
              setIsResizingEditor(true)
            }}
            className="group flex h-3 shrink-0 cursor-row-resize items-center justify-center bg-white"
          >
            <span className={cn(
              'h-[3px] w-14 rounded-full bg-slate-200 transition-colors',
              isResizingEditor ? 'bg-blue-500' : 'group-hover:bg-slate-300',
            )} />
          </button>

          <div className="min-h-0 bg-white" style={{ height: `${100 - editorHeightRatio}%` }}>
          <div className="flex h-9 items-end border-b border-slate-200 px-3">
            <button
              type="button"
              onClick={() => setResultView('result')}
              className={cn(
                'flex h-9 items-center border-b-2 px-3 text-xs',
                resultView === 'result'
                  ? 'border-blue-600 font-medium text-blue-600'
                  : 'border-transparent text-slate-500',
              )}
            >
              结果
            </button>
            <button
              type="button"
              onClick={() => setResultView('visual')}
              className={cn(
                'flex h-9 items-center border-b-2 px-3 text-xs',
                resultView === 'visual'
                  ? 'border-blue-600 font-medium text-blue-600'
                  : 'border-transparent text-slate-500',
              )}
            >
              可视化
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {executing ? (
              <div className="flex h-full items-center justify-center text-slate-500">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                正在执行查询...
              </div>
            ) : resultView === 'visual' ? (
              <div className="flex h-full items-center justify-center px-6">
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-8 text-center">
                  <p className="text-sm font-medium text-slate-900">可视化视图待接入</p>
                  <p className="mt-2 text-xs text-slate-500">当前先保留结果视图联调，后续再补图表渲染能力。</p>
                </div>
              </div>
            ) : results ? (
              <div className="flex h-full flex-col">
                <div className="flex h-9 items-center justify-between border-b border-slate-200 bg-slate-50 px-4 text-xs text-slate-500">
                  <div className="flex items-center gap-4">
                    <span>返回 {results.row_count ?? resultData.length} 行</span>
                    <span>耗时 {results.execution_time_ms || 0}ms</span>
                  </div>
                  <span>{datasources.find((item) => item.id === selectedSource)?.name || '未选择数据源'}</span>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <DataTable
                    columns={resultColumns}
                    data={resultData}
                    density="compact"
                    pageSize={10}
                    showPagination={true}
                    emptyText="查询成功，当前条件下没有返回数据"
                  />
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <Inbox className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                  <p className="text-sm text-slate-500">运行 SQL 或预览表后，结果会显示在这里。</p>
                </div>
              </div>
            )}
          </div>
        </div>
        </div>
      </section>

      <aside
        className={cn(
          'order-3 flex shrink-0 flex-col border-t border-slate-200 bg-white transition-all duration-200 ease-in-out xl:h-full xl:border-l xl:border-t-0',
          templateCollapsed ? 'w-full xl:w-[56px]' : 'w-full xl:w-[320px]',
        )}
        data-testid="query-center-template-panel"
      >
        {templateCollapsed ? (
          <div className="flex h-full flex-col">
            <div className="flex h-11 items-center justify-between border-b border-slate-200 px-3 xl:h-full xl:flex-col xl:justify-center xl:px-0">
              <button
                type="button"
                aria-label="展开模版库"
                onClick={() => setTemplateCollapsed(false)}
                className={queryToolbarIconButtonClass}
              >
                <PanelRightOpen className="h-3.5 w-3.5" />
              </button>
              <span className="text-[11px] tracking-[0.16em] text-slate-400 xl:[writing-mode:vertical-lr]">模版库</span>
            </div>
          </div>
        ) : (
          <>
            <div className="border-b border-slate-200 px-4 py-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">模版库</h2>
                <div className="flex items-center gap-2">
                  <TooltipProvider>
                  <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-500">
                          {templates.length} 条
                        </div>
                      </TooltipTrigger>
                      <TooltipContent><p>当前按搜索条件返回的模版数量</p></TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <FormInput
                    value={templateSearch}
                    onChange={(event) => setTemplateSearch(event.target.value)}
                    placeholder="搜索模版..."
                    className="h-9 pl-9 text-sm"
                  />
                </div>
                <FormSelect
                  value={templateCategory}
                  onValueChange={setTemplateCategory}
                  placeholder="选择分类"
                  options={templateCategories}
                />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <div className="space-y-3">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => handleUseTemplate(template.id, (template.parameters?.length || 0) > 0)}
                    className="w-full rounded-xl border border-slate-200 p-3 text-left transition-colors hover:border-blue-200 hover:bg-slate-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-slate-900">{template.template_name}</span>
                          {template.category ? (
                            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-600">
                              {template.category}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                          {template.template_description || '无描述'}
                        </p>
                      </div>
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] text-slate-500">
                        使用模版
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                      <span>ID:{template.id} · SQL</span>
                      <span>{template.use_count} 次使用</span>
                    </div>
                  </button>
                ))}
                {templates.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-500">
                    当前筛选条件下暂无模版
                  </div>
                ) : null}
              </div>

              <div className="mt-6 border-t border-slate-200 pt-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Clock3 className="h-4 w-4 text-slate-500" />
                  最近执行
                </div>
                <div className="space-y-2">
                  {recentHistories.slice(0, 3).map((history) => (
                    <div key={history.id} className="rounded-lg bg-slate-50 px-3 py-2">
                      <div className="truncate text-xs font-medium text-slate-800">{history.datasource_name || '查询结果'}</div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                        <span>{history.status}</span>
                        <span>{history.execution_time_ms}ms</span>
                      </div>
                    </div>
                  ))}
                  {recentHistories.length === 0 ? (
                    <div className="rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-500">
                      暂无执行历史
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </>
        )}
      </aside>

      <PageModal
        open={saveModalVisible}
        onClose={() => setSaveModalVisible(false)}
        title="保存查询"
        width="520px"
        footer={(
          <div className="flex justify-end gap-3">
            <FormButton variant="outline" onClick={() => setSaveModalVisible(false)}>
              取消
            </FormButton>
            <FormButton onClick={handleSaveQuery} loading={saveMutation.isPending}>
              保存
            </FormButton>
          </div>
        )}
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="query-name">查询名称</Label>
            <Input
              id="query-name"
              value={saveFormData.query_name}
              onChange={(event) => setSaveFormData((prev) => ({ ...prev, query_name: event.target.value }))}
              placeholder="例如：本月订单营收汇总"
            />
          </div>
          <div>
            <Label htmlFor="query-description">描述</Label>
            <Textarea
              id="query-description"
              value={saveFormData.description}
              onChange={(event) => setSaveFormData((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="补充这条查询的用途、口径或使用说明"
              rows={4}
            />
          </div>
        </div>
      </PageModal>
    </div>
  )
}
