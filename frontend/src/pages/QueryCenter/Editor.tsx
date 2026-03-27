/**
 * SQL 编辑器页面 - Migrated to shadcn/ui
 * 多Tab功能、Monaco Editor、数据库结构浏览器
 */
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import {
  Play,
  Save,
  Download,
  Wand2,
  ChevronLeft,
  Plus,
  X,
  Table2,
  Loader2,
  Inbox
} from 'lucide-react'
import Editor from '@monaco-editor/react'
import { format } from 'sql-formatter'
import { getDataSources, previewTableData } from '../../api/datasources'
import type { DataSource } from '@/types'
import { executeQuery, createQuery, getQuery, type CreateQueryRequest } from '../../api/queries'
import {
  FormButton,
  FormSelect,
  useToast,
  PageModal,
  DataTable,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  SchemaBrowser,
  SaveAsDatasetDialog
} from '@/components/business'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { ColumnDef } from '@tanstack/react-table'

interface QueryResults {
  columns: string[]
  data: Record<string, unknown>[]
  row_count?: number
  execution_time_ms?: number
}

const normalizeQueryColumns = (columns: unknown): string[] => {
  if (!Array.isArray(columns)) {
    return []
  }

  return columns.map((column) => {
    if (typeof column === 'string') {
      return column
    }
    if (typeof column === 'object' && column !== null && 'name' in column) {
      return String((column as { name: unknown }).name)
    }
    return String(column ?? '')
  })
}

const normalizeQueryRows = (columns: string[], rows: unknown): Record<string, unknown>[] => {
  if (!Array.isArray(rows)) {
    return []
  }

  return rows.map((row) => {
    if (Array.isArray(row)) {
      return columns.reduce<Record<string, unknown>>((acc, column, index) => {
        acc[column] = row[index]
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
  return {
    columns: normalizedColumns,
    data: normalizeQueryRows(normalizedColumns, rows),
    row_count: rowCount,
    execution_time_ms: executionTimeMs,
  }
}

interface QueryTab {
  id: string
  name: string
  sql: string
  sourceId?: number
  results?: QueryResults
  executedSql?: string
  executedSourceId?: number
  modified?: boolean
}

let tabIdCounter = 1

export default function QueryEditor() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const location = useLocation()
  const { toast } = useToast()
  const [searchParams] = useSearchParams()
  const queryId = searchParams.get('id')
  const sqlParam = searchParams.get('sql')
  const sourceIdParam = searchParams.get('source_id')

  const [tabs, setTabs] = useState<QueryTab[]>([
    { id: `tab-${tabIdCounter}`, name: '查询 1', sql: '-- 编写您的 SQL 查询\nSELECT * FROM your_table\nLIMIT 100' }
  ])
  const [activeTabId, setActiveTabId] = useState('tab-1')
  const [selectedSource, setSelectedSource] = useState<number>()
  const [executing, setExecuting] = useState(false)
  const [saveModalVisible, setSaveModalVisible] = useState(false)
  const [saveFormData, setSaveFormData] = useState({ query_name: '', description: '' })
  const [datasetDialogOpen, setDatasetDialogOpen] = useState(false)

  const currentTab = tabs.find(t => t.id === activeTabId)
  const sql = currentTab?.sql || ''
  const currentResultRowCount = currentTab?.results
    ? (typeof currentTab.results.row_count === 'number'
        ? currentTab.results.row_count
        : currentTab.results.data.length)
    : 0
  const hasMatchingExecutionContext = Boolean(
    currentTab?.results &&
    currentTab.executedSql === sql &&
    currentTab.executedSourceId === selectedSource
  )

  // 获取数据源列表
  const { data: datasourcesData } = useQuery({
    queryKey: ['datasources'],
    queryFn: () => getDataSources({ page: 1, page_size: 100 })
  })

  const datasources = datasourcesData?.data?.items || []

  // 加载已保存的查询或模板
  useEffect(() => {
    const templateState = location.state as { sql?: string; name?: string } | null
    if (templateState?.sql) {
      tabIdCounter++
      setTabs([{
        id: `tab-${tabIdCounter}`,
        name: templateState.name || '新查询',
        sql: templateState.sql,
        modified: true
      }])
      setActiveTabId(`tab-${tabIdCounter}`)
      toast({ title: '模板已加载' })
      navigate(location.pathname, { replace: true, state: null })
      return
    }

    if (queryId) {
      getQuery(Number(queryId)).then(query => {
        setTabs([{
          id: 'tab-1',
          name: query.query_name,
          sql: query.sql_query,
          sourceId: query.source_id
        }])
        setSelectedSource(query.source_id)
      }).catch(() => {
        toast({ title: '加载查询失败', variant: 'destructive' })
      })
      return
    }

    if (sqlParam) {
      const nextSourceId = sourceIdParam ? Number(sourceIdParam) : undefined
      setTabs([{
        id: 'tab-1',
        name: '历史回放',
        sql: sqlParam,
        sourceId: Number.isFinite(nextSourceId) ? nextSourceId : undefined,
        modified: true,
      }])
      setActiveTabId('tab-1')
      if (Number.isFinite(nextSourceId)) {
        setSelectedSource(nextSourceId)
      }
      return
    }

    if (sourceIdParam) {
      const nextSourceId = Number(sourceIdParam)
      if (Number.isFinite(nextSourceId)) {
        setSelectedSource(nextSourceId)
      }
    }
  }, [location.pathname, location.state, navigate, queryId, sourceIdParam, sqlParam, toast])

  const handleSqlChange = (value: string | undefined) => {
    setTabs(tabs.map(t => t.id === activeTabId ? { ...t, sql: value || '', modified: true } : t))
  }

  const handleFormatSQL = () => {
    try {
      const formatted = format(sql, {
        language: 'sql',
        tabWidth: 2,
        keywordCase: 'upper'
      })
      handleSqlChange(formatted)
      toast({ title: 'SQL 格式化成功' })
    } catch (error: unknown) {
      toast({ title: `格式化失败: ${(error as Error).message}`, variant: 'destructive' })
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
      const result = await executeQuery({
        source_id: selectedSource,
        sql_query: sql
      })

      const payload = result.data
      const normalizedPayload = buildQueryResults({
        columns: payload?.columns,
        rows: payload?.data,
        rowCount: payload?.row_count,
        executionTimeMs: payload?.execution_time_ms,
      })
      setTabs(prevTabs => prevTabs.map(t => (
        t.id === activeTabId
          ? {
              ...t,
              results: normalizedPayload,
              executedSql: sql,
              executedSourceId: selectedSource,
            }
          : t
      )))
      toast({
        title: '查询成功',
        description: `返回 ${normalizedPayload.row_count || 0} 行数据（耗时 ${normalizedPayload.execution_time_ms || 0}ms）`
      })
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } }; message?: string }
      toast({
        title: '查询失败',
        description: err.response?.data?.message || err.message,
        variant: 'destructive'
      })
    } finally {
      setExecuting(false)
    }
  }

  const handleSave = () => {
    setSaveFormData({ query_name: currentTab?.name || '', description: '' })
    setSaveModalVisible(true)
  }

  const saveMutation = useMutation({
    mutationFn: (data: CreateQueryRequest) => createQuery(data),
    onSuccess: () => {
      toast({ title: '查询已保存' })
      setSaveModalVisible(false)
      setSaveFormData({ query_name: '', description: '' })
      queryClient.invalidateQueries({ queryKey: ['queries'] })
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } }; message?: string }
      toast({
        title: '保存失败',
        description: err.response?.data?.message || err.message,
        variant: 'destructive'
      })
    }
  })

  const handleSaveQuery = () => {
    if (!saveFormData.query_name) {
      toast({ title: '请输入查询名称', variant: 'warning' })
      return
    }

    saveMutation.mutate({
      query_name: saveFormData.query_name,
      description: saveFormData.description,
      sql_query: sql,
      source_id: selectedSource
    })
  }

  const handleExport = () => {
    if (!currentTab?.results) {
      toast({ title: '没有可导出的结果', variant: 'warning' })
      return
    }

    const colNames = currentTab.results.columns
    const csvContent = [
      colNames.join(','),
      ...currentTab.results.data.map((row: Record<string, unknown>) =>
        colNames.map((name: string) => String(row[name] ?? '')).join(',')
      )
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `query_result_${Date.now()}.csv`
    link.click()
    URL.revokeObjectURL(url)

    toast({ title: '导出成功' })
  }

  const handleNewTab = () => {
    tabIdCounter++
    const newTab: QueryTab = {
      id: `tab-${tabIdCounter}`,
      name: `查询 ${tabIdCounter}`,
      sql: '-- 编写您的 SQL 查询\nSELECT * FROM your_table\nLIMIT 100'
    }
    setTabs([...tabs, newTab])
    setActiveTabId(newTab.id)
  }

  const handleCloseTab = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (tabs.length === 1) return

    const index = tabs.findIndex(t => t.id === id)
    const newTabs = tabs.filter(t => t.id !== id)
    setTabs(newTabs)

    if (activeTabId === id) {
      setActiveTabId(newTabs[Math.max(0, index - 1)].id)
    }
  }

  const insertTableName = (tableName: string) => {
    handleSqlChange(sql + (sql ? '\n' : '') + tableName)
    toast({ title: '表名已插入' })
  }

  const handleOpenDatasetDialog = () => {
    if (!selectedSource) {
      toast({ title: '请先选择数据源后再保存为虚拟数据集', variant: 'warning' })
      return
    }
    if (!sql.trim()) {
      toast({ title: '请先输入 SQL 后再保存为虚拟数据集', variant: 'warning' })
      return
    }
    if (!hasMatchingExecutionContext) {
      toast({ title: '请先执行查询，再保存为虚拟数据集', variant: 'warning' })
      return
    }
    if (currentResultRowCount <= 0) {
      toast({ title: '查询结果为空，无法保存为虚拟数据集', variant: 'warning' })
      return
    }
    setDatasetDialogOpen(true)
  }

  // DataTable columns for query results
  const resultColumns: ColumnDef<Record<string, unknown>>[] = currentTab?.results?.columns.map((col: string) => ({
    accessorKey: col,
    header: col,
  })) || []

  const resultData = currentTab?.results?.data.map((row: Record<string, unknown>, idx: number) => ({
    id: idx,
    ...row
  })) || []

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      navigate(-1)
      return
    }
    navigate('/queries/my')
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-gray-50" data-testid="query-editor-layout">
      {/* 工具栏 */}
      <div className="px-4 py-3 bg-white border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FormButton
            variant="ghost"
            size="icon"
            onClick={handleBack}
          >
            <ChevronLeft className="w-5 h-5" />
          </FormButton>

          <FormSelect
            value={selectedSource?.toString()}
            onValueChange={(val) => setSelectedSource(Number(val))}
            placeholder="选择数据源"
            options={datasources.map((ds: DataSource) => ({
              value: ds.id.toString(),
              label: `${ds.name} (${ds.source_type})`
            }))}
            className="w-64"
          />
        </div>

        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <FormButton variant="outline" size="icon" onClick={handleFormatSQL}>
                  <Wand2 className="w-4 h-4" />
                </FormButton>
              </TooltipTrigger>
              <TooltipContent><p>格式化 SQL</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <FormButton variant="outline" size="icon" onClick={handleSave}>
                  <Save className="w-4 h-4" />
                </FormButton>
              </TooltipTrigger>
              <TooltipContent><p>保存查询</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <FormButton variant="outline" size="icon" onClick={handleExport} disabled={!currentTab?.results}>
                  <Download className="w-4 h-4" />
                </FormButton>
              </TooltipTrigger>
              <TooltipContent><p>导出结果</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <FormButton
                  variant="outline"
                  size="icon"
                  onClick={handleOpenDatasetDialog}
                >
                  <Table2 className="w-4 h-4" />
                </FormButton>
              </TooltipTrigger>
              <TooltipContent><p>保存为虚拟数据集</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <FormButton onClick={handleExecute} disabled={executing} loading={executing}>
            <Play className="w-4 h-4 mr-2" />
            执行查询
          </FormButton>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 编辑器区域 */}
        <div className="flex-1 flex flex-col">
          {/* Tab 栏 */}
          <div className="bg-white border-b border-gray-200 flex items-center px-2">
            {tabs.map(tab => (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 cursor-pointer border-b-2 transition-colors",
                  activeTabId === tab.id
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-transparent hover:bg-gray-50"
                )}
              >
                <span className="text-sm font-medium">
                  {tab.name}
                  {tab.modified && <span className="text-orange-500 ml-1">*</span>}
                </span>
                {tabs.length > 1 && (
                  <FormButton
                    variant="ghost"
                    size="icon"
                    onClick={(e) => handleCloseTab(tab.id, e)}
                    className="h-5 w-5 p-0"
                  >
                    <X className="w-3 h-3" />
                  </FormButton>
                )}
              </div>
            ))}
            <FormButton variant="ghost" size="icon" onClick={handleNewTab} className="h-8 w-8">
              <Plus className="w-4 h-4" />
            </FormButton>
          </div>

          {/* Monaco Editor */}
          <div className="flex-1 min-h-[200px] border-b border-gray-200">
            <Editor
              height="100%"
              defaultLanguage="sql"
              value={sql}
              onChange={handleSqlChange}
              theme="vs-light"
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                wordWrap: 'on',
                formatOnPaste: true,
                formatOnType: true
              }}
            />
          </div>

          {/* 查询结果 */}
          <div className="h-64 bg-white overflow-hidden flex flex-col">
            <div className="px-4 py-2 border-t border-gray-200 font-semibold text-gray-700">
              查询结果
            </div>
            {executing ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400 mr-2" />
                <span className="text-gray-500">执行中...</span>
              </div>
            ) : currentTab?.results ? (
              <div className="flex-1 overflow-hidden">
                <DataTable
                  columns={resultColumns}
                  data={resultData}
                  pageSize={10}
                  showPagination={true}
                />
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">执行查询后结果将显示在这里</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 数据库结构浏览器 - 使用 SchemaBrowser 组件 */}
        <SchemaBrowser
          datasourceId={selectedSource}
          sourceType={datasources.find((ds: DataSource) => ds.id === selectedSource)?.source_type}
          collapsible={true}
          title="数据库结构"
          onDoubleClick={(_node, qualifiedName) => {
            insertTableName(qualifiedName)
          }}
          onInsert={(text) => {
            handleSqlChange(sql + '\n' + text)
          }}
          onPreview={async (database, table) => {
            if (!selectedSource) return
            try {
              toast({ title: `正在加载 ${table} 预览数据...` })
              const result = await previewTableData(selectedSource, database, table)
              const payload = (result as { data: { columns: Array<{ name: string; type: string }>; data: Array<Record<string, unknown>>; row_count: number; table_name: string } }).data
              const normalizedPayload = buildQueryResults({
                columns: payload.columns,
                rows: payload.data,
                rowCount: payload.row_count,
              })
              setTabs(prevTabs => prevTabs.map(t => (
                t.id === activeTabId ? {
                  ...t,
                  results: normalizedPayload,
                  executedSql: undefined,
                  executedSourceId: undefined,
                } : t
              )))
              toast({ title: `预览: ${table}`, description: `共 ${payload.row_count} 行` })
            } catch (err) {
              toast({ title: '预览失败', description: (err as Error).message, variant: 'destructive' })
            }
          }}
        />
      </div>

      {/* 保存查询弹窗 */}
      <PageModal
        open={saveModalVisible}
        onOpenChange={setSaveModalVisible}
        title="保存查询"
        description="将此查询保存到我的查询列表"
        footer={
          <div className="flex justify-end gap-2">
            <FormButton variant="outline" onClick={() => setSaveModalVisible(false)}>
              取消
            </FormButton>
            <FormButton onClick={handleSaveQuery} loading={saveMutation.isPending}>
              保存
            </FormButton>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <Label>查询名称 *</Label>
            <Input
              value={saveFormData.query_name}
              onChange={(e) => setSaveFormData({ ...saveFormData, query_name: e.target.value })}
              placeholder="例如：用户活跃度统计"
              className="mt-1"
            />
          </div>
          <div>
            <Label>描述</Label>
            <Input
              value={saveFormData.description}
              onChange={(e) => setSaveFormData({ ...saveFormData, description: e.target.value })}
              placeholder="简要描述此查询的用途"
              className="mt-1"
            />
          </div>
        </div>
      </PageModal>

      {/* 保存为虚拟数据集弹窗 */}
      {selectedSource && (
        <SaveAsDatasetDialog
          open={datasetDialogOpen}
          onOpenChange={setDatasetDialogOpen}
          sql={sql}
          sourceId={selectedSource}
          sourceType={datasources.find((ds: DataSource) => ds.id === selectedSource)?.source_type}
        />
      )}
    </div>
  )
}
