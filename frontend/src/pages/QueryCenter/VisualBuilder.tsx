/**
 * 可视化查询构建器 - Migrated to shadcn/ui
 */
import { useState, useMemo } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Group,
  ArrowUpDown,
  Eye,
  Code,
  Play,
  Plus,
  Trash2
} from 'lucide-react'
import { getDataSources } from '../../api/datasources'
import { executeQuery } from '../../api/queries'
import FilterBuilder from '../../components/FilterBuilder/FilterBuilder'
import { generateSQLFromConfig, validateVisualQueryConfig, type VisualQueryConfig } from '../../utils/visualQueryGenerator'
import type { FieldMeta } from '../../types/filter'
import type { QueryResultData } from '@/types'
import { FormButton, FormSelect, DataTable, useToast } from '@/components/business'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { ColumnDef } from '@tanstack/react-table'
import { cn } from '@/lib/utils'

export default function VisualBuilder() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [config, setConfig] = useState<VisualQueryConfig>({
    sourceId: undefined,
    table: '',
    fields: [],
    filters: { logic: 'AND', filters: [{ field: '', operator: '', value: null }], groups: [] },
    groupBy: [],
    aggregations: [],
    orderBy: [],
    limit: 100
  })
  
  const [availableFields] = useState<FieldMeta[]>([])
  const [results, setResults] = useState<QueryResultData | null>(null)
  
  // 获取数据源列表
  const { data: datasourcesData } = useQuery({
    queryKey: ['datasources'],
    queryFn: () => getDataSources({ page: 1, page_size: 100 })
  })
  
  const datasources = datasourcesData?.data?.items || []
  
  // 生成 SQL
  const generatedSQL = useMemo(() => {
    if (!config.table) return ''
    return generateSQLFromConfig(config, availableFields)
  }, [config, availableFields])
  
  // 执行查询
  const executeMutation = useMutation({
    mutationFn: executeQuery,
    onSuccess: (data) => {
      setResults(data.data)
      toast({ title: `查询成功: ${data.data.row_count} 行` })
    },
    onError: (error: unknown) => {
      const err = error as Error
      toast({ title: '查询执行失败', description: err.message, variant: 'destructive' })
    }
  })
  
  const handleExecute = () => {
    const validation = validateVisualQueryConfig(config)
    if (!validation.valid) {
      toast({ title: '配置错误', description: validation.errors[0], variant: 'destructive' })
      return
    }
    
    if (!config.sourceId) {
      toast({ title: '请先选择数据源', variant: 'warning' })
      return
    }
    
    executeMutation.mutate({
      source_id: config.sourceId,
      sql_query: generatedSQL,
      limit: config.limit
    })
  }
  
  const handleSwitchToEditor = () => {
    navigate(`/queries/editor`, {
      state: { sql: generatedSQL, sourceId: config.sourceId }
    })
  }
  
  // 添加聚合函数
  const handleAddAggregation = () => {
    setConfig({
      ...config,
      aggregations: [
        ...config.aggregations,
        { func: 'COUNT', field: '', alias: `agg_${config.aggregations.length + 1}` }
      ]
    })
  }
  
  // 添加排序
  const handleAddOrderBy = () => {
    setConfig({
      ...config,
      orderBy: [
        ...config.orderBy,
        { field: '', direction: 'DESC' }
      ]
    })
  }

  // 构建结果表格列
  const resultColumns: ColumnDef<Record<string, unknown>>[] = results?.columns?.map((col: string) => ({
    accessorKey: col,
    header: col,
  })) || []

  // 构建结果数据
  const resultData = results?.data?.map((row: unknown[], index: number) => {
    const obj: Record<string, unknown> = { id: index }
    results.columns.forEach((col: string, i: number) => {
      obj[col] = row[i]
    })
    return obj
  }) || []
  
  return (
    <div className="h-full flex flex-col">
      {/* 页面标题 */}
      <div className="px-6 py-4 bg-white border-b border-gray-200">
        <h1 className="text-2xl font-bold text-gray-900">可视化查询构建器</h1>
        <p className="text-sm text-gray-500 mt-1">无需编写 SQL，通过可视化方式构建查询</p>
      </div>
      
      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-6 space-y-6">
          {/* Step 1: 选择数据源和表 */}
          <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold">
                1
              </div>
              <h2 className="text-lg font-semibold text-gray-900">选择数据源和表</h2>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>数据源</Label>
                <FormSelect
                  placeholder="选择数据源"
                  value={config.sourceId?.toString() || ''}
                  onValueChange={(value) => setConfig({ ...config, sourceId: Number(value), table: '', fields: [] })}
                  options={datasources.map((ds: { id: number; name: string; source_type: string }) => ({
                    value: ds.id.toString(),
                    label: `${ds.name} (${ds.source_type})`
                  }))}
                  className="mt-1"
                />
              </div>
              
              <div>
                <Label>数据表</Label>
                <FormSelect
                  placeholder="选择数据表"
                  value={config.table}
                  onValueChange={(value) => setConfig({ ...config, table: value })}
                  disabled={!config.sourceId}
                  options={[
                    { value: 'users', label: 'users (示例)' },
                    { value: 'orders', label: 'orders (示例)' },
                    { value: 'products', label: 'products (示例)' }
                  ]}
                  className="mt-1"
                />
              </div>
            </div>
          </div>
          
          {/* Step 2: 选择字段 */}
          <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white font-bold">
                2
              </div>
              <h2 className="text-lg font-semibold text-gray-900">选择字段</h2>
            </div>
            
            <div className="grid grid-cols-3 gap-3">
              {['id', 'user_id', 'user_name', 'email', 'created_at', 'updated_at', 'status', 'amount', 'count'].map((field) => (
                <div key={field} className="flex items-center space-x-2">
                  <Checkbox
                    id={field}
                    checked={config.fields.includes(field)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setConfig({ ...config, fields: [...config.fields, field] })
                      } else {
                        setConfig({ ...config, fields: config.fields.filter(f => f !== field) })
                      }
                    }}
                  />
                  <label htmlFor={field} className="text-sm font-medium cursor-pointer">
                    {field}
                  </label>
                </div>
              ))}
            </div>
          </div>
          
          {/* Step 3: 筛选条件 */}
          <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold">
                3
              </div>
              <h2 className="text-lg font-semibold text-gray-900">筛选条件</h2>
            </div>
            
            <FilterBuilder
              fields={availableFields}
              value={config.filters}
              onChange={(filters) => setConfig({ ...config, filters })}
            />
          </div>
          
          {/* Step 4: 分组与聚合 */}
          <Accordion
            type="single"
            collapsible
            className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl"
          >
            <AccordionItem value="grouping" className="border-none">
              <AccordionTrigger className="px-6 py-4 hover:no-underline">
                <div className="flex items-center gap-2">
                  <Group className="w-5 h-5 text-gray-500" />
                  <span className="font-semibold">分组与聚合（可选）</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-6">
                <div className="space-y-4">
                  <div>
                    <Label>分组字段</Label>
                    <FormSelect
                      placeholder="选择分组字段"
                      value={config.groupBy[0] || ''}
                      onValueChange={(val) => setConfig({ ...config, groupBy: val ? [val] : [] })}
                      options={config.fields.map(f => ({ value: f, label: f }))}
                      className="mt-1"
                    />
                  </div>
                  
                  <div>
                    <Label>聚合函数</Label>
                    {config.aggregations.map((agg, index) => (
                      <div key={index} className="flex items-center gap-2 mb-2">
                        <FormSelect
                          value={agg.func}
                          onValueChange={(func) => {
                            const newAggs = [...config.aggregations]
                            newAggs[index] = { ...agg, func: func as 'COUNT' | 'SUM' | 'AVG' | 'MAX' | 'MIN' }
                            setConfig({ ...config, aggregations: newAggs })
                          }}
                          options={[
                            { value: 'COUNT', label: 'COUNT' },
                            { value: 'SUM', label: 'SUM' },
                            { value: 'AVG', label: 'AVG' },
                            { value: 'MAX', label: 'MAX' },
                            { value: 'MIN', label: 'MIN' }
                          ]}
                          className="w-[120px]"
                        />
                        <FormSelect
                          placeholder="选择字段"
                          value={agg.field}
                          onValueChange={(field) => {
                            const newAggs = [...config.aggregations]
                            newAggs[index] = { ...agg, field }
                            setConfig({ ...config, aggregations: newAggs })
                          }}
                          options={config.fields.map(f => ({ value: f, label: f }))}
                          className="flex-1"
                        />
                        <span className="text-gray-500">AS</span>
                        <Input
                          value={agg.alias}
                          onChange={(e) => {
                            const newAggs = [...config.aggregations]
                            newAggs[index] = { ...agg, alias: e.target.value }
                            setConfig({ ...config, aggregations: newAggs })
                          }}
                          className="w-[150px]"
                        />
                        <FormButton
                          variant="destructive"
                          size="icon"
                          onClick={() => {
                            setConfig({
                              ...config,
                              aggregations: config.aggregations.filter((_, i) => i !== index)
                            })
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </FormButton>
                      </div>
                    ))}
                    <FormButton
                      variant="outline"
                      onClick={handleAddAggregation}
                      className="w-full"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      添加聚合函数
                    </FormButton>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
          
          {/* Step 5: 排序与限制 */}
          <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <ArrowUpDown className="w-5 h-5 text-gray-500" />
              <h2 className="text-lg font-semibold text-gray-900">排序与限制</h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <Label>排序</Label>
                {config.orderBy.map((order, index) => (
                  <div key={index} className="flex items-center gap-2 mb-2">
                    <FormSelect
                      placeholder="选择字段"
                      value={order.field}
                      onValueChange={(field) => {
                        const newOrders = [...config.orderBy]
                        newOrders[index] = { ...order, field }
                        setConfig({ ...config, orderBy: newOrders })
                      }}
                      options={config.fields.map(f => ({ value: f, label: f }))}
                      className="flex-1"
                    />
                    <FormSelect
                      value={order.direction}
                      onValueChange={(direction) => {
                        const newOrders = [...config.orderBy]
                        newOrders[index] = { ...order, direction: direction as 'ASC' | 'DESC' }
                        setConfig({ ...config, orderBy: newOrders })
                      }}
                      options={[
                        { value: 'ASC', label: '升序' },
                        { value: 'DESC', label: '降序' }
                      ]}
                      className="w-[120px]"
                    />
                    <FormButton
                      variant="destructive"
                      size="icon"
                      onClick={() => {
                        setConfig({
                          ...config,
                          orderBy: config.orderBy.filter((_, i) => i !== index)
                        })
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </FormButton>
                  </div>
                ))}
                <FormButton
                  variant="outline"
                  onClick={handleAddOrderBy}
                  className="w-full"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  添加排序
                </FormButton>
              </div>
              
              <div>
                <Label htmlFor="limit">限制行数</Label>
                <Input
                  id="limit"
                  type="number"
                  value={config.limit}
                  onChange={(e) => setConfig({ ...config, limit: Number(e.target.value) || 100 })}
                  min={1}
                  max={10000}
                  className="mt-1"
                />
              </div>
            </div>
          </div>
          
          {/* SQL 预览 */}
          <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Code className="w-5 h-5 text-gray-500" />
                <h2 className="text-lg font-semibold text-gray-900">生成的 SQL</h2>
              </div>
              
              <div className="flex gap-2">
                <FormButton
                  variant="outline"
                  onClick={handleSwitchToEditor}
                >
                  <Code className="w-4 h-4 mr-2" />
                  切换到 SQL 编辑器
                </FormButton>
                <FormButton
                  onClick={handleExecute}
                  loading={executeMutation.isPending}
                  className="bg-gradient-to-r from-blue-500 to-purple-500"
                >
                  <Play className="w-4 h-4 mr-2" />
                  运行查询
                </FormButton>
              </div>
            </div>
            
            <pre className="bg-gray-50 p-4 rounded-lg font-mono text-sm text-gray-700 overflow-x-auto border border-gray-200">
              {generatedSQL || '-- 请配置查询条件'}
            </pre>
          </div>
          
          {/* 结果展示 */}
          {results && (
            <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Eye className="w-5 h-5 text-gray-500" />
                  <h2 className="text-lg font-semibold text-gray-900">查询结果</h2>
                </div>
                <span className="text-sm text-gray-500">
                  {results.row_count} 行 · 耗时 {(results.execution_time_ms / 1000).toFixed(2)}s
                </span>
              </div>
              
              <DataTable
                columns={resultColumns}
                data={resultData}
                pageSize={20}
                showPagination={true}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
