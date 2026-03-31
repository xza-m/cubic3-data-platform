import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { Code2, PlayCircle, Wand2 } from 'lucide-react'
import { getDataSources } from '../../api/datasources'
import { executeQuery } from '../../api/queries'
import { DataTable, FormButton, FormSelect, useToast } from '@/components/business'

const TABLE_FIELDS: Record<string, string[]> = {
  lesson_progress: ['lesson_name', 'student_count', 'progress_ratio', 'dt'],
  lesson_activity: ['class_name', 'active_students', 'avg_duration', 'dt'],
  answer_records: ['question_id', 'student_id', 'correct_rate', 'dt'],
}

const TABLE_OPTIONS = [
  { value: 'lesson_progress', label: 'lesson_progress' },
  { value: 'lesson_activity', label: 'lesson_activity' },
  { value: 'answer_records', label: 'answer_records' },
]

export default function VisualBuilder() {
  const navigate = useNavigate()
  const location = useLocation()
  const { toast } = useToast()
  const initialParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const initialSourceId = initialParams.get('source_id') || initialParams.get('sourceId')
  const [selectedSource, setSelectedSource] = useState<number | undefined>(
    initialSourceId ? Number(initialSourceId) : undefined,
  )
  const [selectedTable, setSelectedTable] = useState('lesson_progress')
  const [selectedFields, setSelectedFields] = useState<string[]>(['lesson_name'])
  const [result, setResult] = useState<{ columns: string[]; data: unknown[][] } | null>(null)

  const { data } = useQuery({
    queryKey: ['visual-builder-datasources'],
    queryFn: () => getDataSources({ page: 1, page_size: 100 }),
  })

  const datasources = data?.data?.items || []
  const datasourceOptions = datasources.map((datasource: { id: number; name: string; source_type: string }) => ({
    value: String(datasource.id),
    label: `${datasource.name} (${datasource.source_type})`,
  }))

  useEffect(() => {
    if (!selectedSource && datasources.length > 0) {
      setSelectedSource(datasources[0].id)
    }
  }, [datasources, selectedSource])

  useEffect(() => {
    if (!selectedSource || datasources.length === 0) {
      return
    }

    const hasCurrentSource = datasources.some((datasource: { id: number }) => datasource.id === selectedSource)
    if (!hasCurrentSource) {
      setSelectedSource(datasources[0].id)
    }
  }, [datasources, selectedSource])

  const availableFields = TABLE_FIELDS[selectedTable] || []
  const sql = useMemo(() => {
    const fields = selectedFields.length ? selectedFields.join(', ') : '*'
    return [`SELECT ${fields}`, `FROM ${selectedTable}`, 'LIMIT 100'].join('\n')
  }, [selectedFields, selectedTable])

  const executeMutation = useMutation({
    mutationFn: executeQuery,
    onSuccess: (response) => {
      setResult({
        columns: response.data.columns,
        data: response.data.data,
      })
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : '查询执行失败'
      toast({ title: '查询执行失败', description: message, variant: 'destructive' })
    },
  })

  const resultColumns = useMemo<ColumnDef<Record<string, unknown>>[]>(
    () =>
      (result?.columns || []).map((column) => ({
        accessorKey: column,
        header: column,
      })),
    [result],
  )

  const resultRows = useMemo(
    () =>
      (result?.data || []).map((row) =>
        result?.columns.reduce<Record<string, unknown>>((record, column, index) => {
          record[column] = row[index]
          return record
        }, {}) || {},
      ),
    [result],
  )

  const handleToggleField = (field: string) => {
    setSelectedFields((previous) =>
      previous.includes(field)
        ? previous.filter((item) => item !== field)
        : [...previous, field],
    )
  }

  const handleExecute = async () => {
    if (!selectedSource) {
      toast({ title: '请先选择数据源', variant: 'warning' })
      return
    }

    if (!selectedTable) {
      toast({ title: '请先选择数据表', variant: 'warning' })
      return
    }

    await executeMutation.mutateAsync({
      source_id: selectedSource,
      sql_query: sql,
      limit: 100,
    })
  }

  const handleSwitchToEditor = () => {
    const params = new URLSearchParams()
    params.set('sql', sql)
    if (selectedSource) {
      params.set('sourceId', String(selectedSource))
      params.set('source_id', String(selectedSource))
    }

    navigate({
      pathname: '/queries/editor',
      search: `?${params.toString()}`,
    })
  }

  return (
    <div className="flex h-full flex-col bg-[#F8FAFC]">
      <div className="border-b border-[#E2E8F0] bg-white px-8 py-6">
        <h1 className="text-2xl font-semibold text-[#0F172A]">可视化查询构建器</h1>
        <p className="mt-2 text-sm text-[#64748B]">无需编写 SQL，通过可视化方式构建查询。</p>
      </div>

      <div className="grid flex-1 gap-6 overflow-auto px-8 py-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <section className="space-y-5 rounded-3xl border border-[#E2E8F0] bg-white p-6">
          <div>
            <div className="text-sm font-medium text-[#0F172A]">数据源</div>
            <FormSelect
              value={selectedSource ? String(selectedSource) : ''}
              onValueChange={(value) => setSelectedSource(value ? Number(value) : undefined)}
              options={datasourceOptions}
              placeholder="选择数据源"
              className="mt-2"
            />
          </div>

          <div>
            <div className="text-sm font-medium text-[#0F172A]">数据表</div>
            <FormSelect
              value={selectedTable}
              onValueChange={(value) => {
                setSelectedTable(value)
                setSelectedFields(TABLE_FIELDS[value]?.slice(0, 1) || [])
              }}
              options={TABLE_OPTIONS}
              placeholder="选择数据表"
              className="mt-2"
            />
          </div>

          <div>
            <div className="text-sm font-medium text-[#0F172A]">字段</div>
            <div className="mt-3 grid gap-2">
              {availableFields.map((field) => (
                <label
                  key={field}
                  className="flex items-center gap-2 rounded-2xl border border-[#E2E8F0] px-3 py-2 text-sm text-[#334155]"
                >
                  <input
                    aria-label={`field-${field}`}
                    type="checkbox"
                    checked={selectedFields.includes(field)}
                    onChange={() => handleToggleField(field)}
                  />
                  <span>{field}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <FormButton loading={executeMutation.isPending} onClick={handleExecute}>
              <PlayCircle className="mr-2 h-4 w-4" />
              执行查询
            </FormButton>
            <FormButton
              variant="outline"
              onClick={handleSwitchToEditor}
            >
              <Code2 className="mr-2 h-4 w-4" />
              切换到 SQL 编辑器
            </FormButton>
          </div>
        </section>

        <section className="space-y-5">
          <div className="rounded-3xl border border-[#E2E8F0] bg-white p-6">
            <div className="flex items-center gap-2 text-sm font-medium text-[#0F172A]">
              <Wand2 className="h-4 w-4 text-[#2563EB]" />
              生成 SQL
            </div>
            <pre className="mt-4 overflow-auto rounded-2xl bg-[#0F172A] p-5 text-xs leading-6 text-[#E2E8F0]">
              {sql}
            </pre>
          </div>

          <div className="rounded-3xl border border-[#E2E8F0] bg-white p-6">
            <div className="text-sm font-medium text-[#0F172A]">查询结果</div>
            <div className="mt-4">
              {result ? (
                <DataTable data={resultRows} columns={resultColumns} />
              ) : (
                <div className="rounded-2xl border border-dashed border-[#CBD5E1] px-6 py-12 text-center text-sm text-[#64748B]">
                  选择数据源并执行查询后，这里会展示结果集。
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
