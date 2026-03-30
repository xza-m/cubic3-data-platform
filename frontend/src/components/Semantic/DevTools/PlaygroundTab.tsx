import { useState, useMemo, useCallback, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  Play,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Code,
  Table2,
  Copy,
  Check,
  Route,
} from 'lucide-react'
import Editor from '@monaco-editor/react'
import {
  listCubes,
  compileDsl,
  querySemantic,
  type CubeDetail,
  describeCube,
} from '@/api/semantic'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'

function CompileDiagnostics({
  sql,
  primaryCube,
  joinedCubes,
}: {
  sql: string
  primaryCube: string
  joinedCubes: string[]
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(sql).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [sql])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">编译后 SQL</h3>
        <Button variant="ghost" size="sm" onClick={handleCopy} aria-label="复制 SQL">
          {copied ? (
            <Check className="w-3.5 h-3.5 mr-1" />
          ) : (
            <Copy className="w-3.5 h-3.5 mr-1" />
          )}
          {copied ? '已复制' : '复制'}
        </Button>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <Editor
          height="240px"
          language="sql"
          value={sql}
          theme={document.documentElement.classList.contains('dark') ? 'vs-dark' : 'vs'}
          options={{
            readOnly: true,
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            minimap: { enabled: false },
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
          }}
        />
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">编译诊断</h3>
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-2 text-[hsl(var(--semantic-ok))]">
            <CheckCircle2 className="w-3.5 h-3.5" />
            字段引用合法
          </div>
          <div className="flex items-center gap-2 text-[hsl(var(--semantic-ok))]">
            <CheckCircle2 className="w-3.5 h-3.5" />
            主 Cube: {primaryCube}
          </div>
          {joinedCubes.length > 0 && (
            <div className="flex items-center gap-2 text-[hsl(var(--semantic-ok))]">
              <CheckCircle2 className="w-3.5 h-3.5" />
              JOIN: {joinedCubes.join(' → ')}
            </div>
          )}
          <div className="flex items-center gap-2 text-[hsl(var(--semantic-ok))]">
            <CheckCircle2 className="w-3.5 h-3.5" />
            SQL 已生成
          </div>
        </div>
      </div>
    </div>
  )
}

export function PlaygroundTab({
  preferredCube,
  hideCubeSelect = false,
}: {
  preferredCube?: string
  hideCubeSelect?: boolean
} = {}) {
  const { toast } = useToast()
  const [selectedCube, setSelectedCube] = useState<string>('')
  const [selectedMeasures, setSelectedMeasures] = useState<string[]>([])
  const [selectedDims, setSelectedDims] = useState<string[]>([])
  const [timeDim, setTimeDim] = useState<string>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [granularity, setGranularity] = useState<string>('')
  const [joinPathInput, setJoinPathInput] = useState<string>('')
  const [dslJson, setDslJson] = useState<string>('{}')

  const { data: cubesData } = useQuery({
    queryKey: ['semantic', 'cubes'],
    queryFn: async () => (await listCubes()).data,
  })

  const { data: cubeDetail } = useQuery({
    queryKey: ['semantic', 'cube', selectedCube],
    queryFn: async () => (await describeCube(selectedCube)).data as CubeDetail,
    enabled: !!selectedCube,
  })

  const cubes = cubesData?.cubes ?? []

  useEffect(() => {
    if (!preferredCube) return
    setSelectedCube(preferredCube)
  }, [preferredCube])

  useEffect(() => {
    setSelectedMeasures([])
    setSelectedDims([])
    setTimeDim('')
    setDateFrom('')
    setDateTo('')
    setGranularity('')
    setJoinPathInput('')
  }, [selectedCube])

  const dsl = useMemo(() => {
    if (!selectedCube) return {}
    const result: Record<string, unknown> = {}

    if (selectedMeasures.length > 0) {
      result.measures = selectedMeasures.map((m) => `${selectedCube}.${m}`)
    }
    if (selectedDims.length > 0) {
      result.dimensions = selectedDims.map((d) => `${selectedCube}.${d}`)
    }
    if (timeDim) {
      const td: Record<string, unknown> = { dimension: `${selectedCube}.${timeDim}` }
      if (granularity) td.granularity = granularity
      if (dateFrom && dateTo) td.date_range = [dateFrom, dateTo]
      result.time_dimensions = [td]
    }
    if (joinPathInput.trim()) {
      const parts = joinPathInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      if (parts.length >= 2) {
        result.join_path = parts
      }
    }
    result.limit = 100
    return result
  }, [selectedCube, selectedMeasures, selectedDims, timeDim, dateFrom, dateTo, granularity, joinPathInput])

  useEffect(() => {
    const json = JSON.stringify(dsl, null, 2)
    setDslJson(json)
  }, [dsl])

  const compileMutation = useMutation({
    mutationFn: async (dslInput: Record<string, unknown>) => {
      const res = await compileDsl(dslInput)
      return res.data
    },
    onError: (err: Error) => {
      toast({ title: '编译失败', description: err.message, variant: 'destructive' })
    },
  })

  const queryMutation = useMutation({
    mutationFn: async (dslInput: Record<string, unknown>) => {
      const res = await querySemantic(dslInput)
      return res.data
    },
    onError: (err: Error) => {
      toast({ title: '执行失败', description: err.message, variant: 'destructive' })
    },
  })

  const handleCompile = useCallback(() => {
    try {
      const parsed = JSON.parse(dslJson)
      compileMutation.mutate(parsed)
    } catch (e) {
      toast({ title: 'DSL JSON 格式错误', description: String(e), variant: 'destructive' })
    }
  }, [dslJson, compileMutation, toast])

  const handleExecute = useCallback(() => {
    try {
      const parsed = JSON.parse(dslJson)
      queryMutation.mutate(parsed)
    } catch (e) {
      toast({ title: 'DSL JSON 格式错误', description: String(e), variant: 'destructive' })
    }
  }, [dslJson, queryMutation, toast])

  const timeDims = cubeDetail
    ? Object.entries(cubeDetail.dimensions)
        .filter(([, d]) => d.type === 'time')
        .map(([k]) => k)
    : []

  const metricEntries = cubeDetail
    ? Object.entries(cubeDetail.measures).sort((a, b) => {
        const ac = a[1].certified ? 1 : 0
        const bc = b[1].certified ? 1 : 0
        return bc - ac || a[0].localeCompare(b[0])
      })
    : []

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
      {/* 左侧: DSL 构建器 */}
      <div className="space-y-5">
        {/* Cube 选择 */}
        {!hideCubeSelect && (
          <div>
            <Label htmlFor="cube-select" className="text-sm font-medium mb-1.5 block">
              Cube
            </Label>
            <Select value={selectedCube} onValueChange={setSelectedCube}>
              <SelectTrigger id="cube-select">
                <SelectValue placeholder="选择 Cube…" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Cubes</SelectLabel>
                  {cubes.map((c) => (
                    <SelectItem key={c.name} value={c.name}>
                      {c.title} ({c.name})
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* 指标 */}
        {cubeDetail && (
          <div>
            <h3 className="text-sm font-semibold mb-2">指标</h3>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {metricEntries.map(([key, m]) => (
                <div key={key} className="flex items-center gap-2">
                  <Checkbox
                    id={`m-${key}`}
                    checked={selectedMeasures.includes(key)}
                    onCheckedChange={(checked) => {
                      setSelectedMeasures((prev) =>
                        checked ? [...prev, key] : prev.filter((k) => k !== key),
                      )
                    }}
                  />
                  <Label htmlFor={`m-${key}`} className="text-sm cursor-pointer">
                    <span className="font-mono text-xs text-muted-foreground mr-1.5">{key}</span>
                    {m.title}
                    {m.certified && (
                      <span className="ml-1.5 text-[10px] text-[hsl(var(--semantic-ok))]">认证</span>
                    )}
                  </Label>
                  {m.description && (
                    <span className="text-xs text-muted-foreground truncate">{m.description}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 维度 */}
        {cubeDetail && (
          <div>
            <h3 className="text-sm font-semibold mb-2">维度</h3>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {Object.entries(cubeDetail.dimensions)
                .filter(([, d]) => d.type !== 'time')
                .map(([key, d]) => (
                  <div key={key} className="flex items-center gap-2">
                    <Checkbox
                      id={`d-${key}`}
                      checked={selectedDims.includes(key)}
                      onCheckedChange={(checked) => {
                        setSelectedDims((prev) =>
                          checked ? [...prev, key] : prev.filter((k) => k !== key),
                        )
                      }}
                    />
                    <Label htmlFor={`d-${key}`} className="text-sm cursor-pointer">
                      <span className="font-mono text-xs text-muted-foreground mr-1.5">{key}</span>
                      {d.title}
                    </Label>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* 时间范围 */}
        {cubeDetail && timeDims.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-2">时间范围</h3>
            <div className="space-y-2">
              <Select value={timeDim} onValueChange={setTimeDim}>
                <SelectTrigger>
                  <SelectValue placeholder="选择时间维度…" />
                </SelectTrigger>
                <SelectContent>
                  {timeDims.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {timeDim && (
                <>
                  <div className="flex gap-2">
                    <Input
                      placeholder="起始日期 (yyyyMMdd)"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      autoComplete="off"
                    />
                    <Input
                      placeholder="结束日期 (yyyyMMdd)"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                  <Select value={granularity} onValueChange={setGranularity}>
                    <SelectTrigger>
                      <SelectValue placeholder="粒度（可选）" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="day">日</SelectItem>
                      <SelectItem value="week">周</SelectItem>
                      <SelectItem value="month">月</SelectItem>
                      <SelectItem value="quarter">季</SelectItem>
                      <SelectItem value="year">年</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>
          </div>
        )}

        {/* JOIN 路径（可选） */}
        {cubeDetail && Object.keys(cubeDetail.joins || {}).length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Route className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
              <h3 className="text-sm font-semibold">JOIN 路径</h3>
              <span className="text-xs text-muted-foreground">（可选）</span>
            </div>
            <Input
              placeholder="逗号分隔 Cube 名称，如 answer_records, student, school"
              value={joinPathInput}
              onChange={(e) => setJoinPathInput(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground mt-1">
              留空则自动推导；指定后将按此路径生成 JOIN（用于解决多路径歧义）
            </p>
          </div>
        )}

        {/* DSL JSON 编辑 */}
        <div>
          <h3 className="text-sm font-semibold mb-2">DSL JSON</h3>
          <div className="rounded-lg border overflow-hidden">
            <Editor
              height="200px"
              language="json"
              value={dslJson}
              theme={document.documentElement.classList.contains('dark') ? 'vs-dark' : 'vs'}
              onChange={(v) => setDslJson(v ?? '{}')}
              options={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                minimap: { enabled: false },
                lineNumbers: 'off',
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                tabSize: 2,
              }}
            />
          </div>
        </div>
      </div>

      {/* 右侧: 编译结果 */}
      <div className="space-y-4">
        <div className="flex gap-2">
          <Button
            onClick={handleCompile}
            disabled={compileMutation.isPending || !selectedCube}
          >
            {compileMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-1.5" aria-hidden="true" />
                编译中…
              </>
            ) : (
              <>
                <Code className="w-4 h-4 mr-1.5" aria-hidden="true" />
                编译
              </>
            )}
          </Button>
          <Button
            variant="secondary"
            onClick={handleExecute}
            disabled={queryMutation.isPending || !selectedCube}
          >
            {queryMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-1.5" aria-hidden="true" />
                执行中…
              </>
            ) : (
              <>
                <Table2 className="w-4 h-4 mr-1.5" aria-hidden="true" />
                编译并执行
              </>
            )}
          </Button>
        </div>

        {compileMutation.isError && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
            <div className="flex items-center gap-2 text-sm text-destructive font-medium mb-1">
              <AlertTriangle className="w-4 h-4" />
              编译失败
            </div>
            <p className="text-xs text-muted-foreground">
              {compileMutation.error?.message}。请检查 DSL 字段引用拼写。
            </p>
          </div>
        )}

        {compileMutation.data && (
          <CompileDiagnostics
            sql={compileMutation.data.sql}
            primaryCube={compileMutation.data.primary_cube}
            joinedCubes={compileMutation.data.joined_cubes}
          />
        )}

        {queryMutation.data && (
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">执行结果</h3>
              <div className="text-xs text-muted-foreground">
                {queryMutation.data.row_count} 行 · {queryMutation.data.execution_time_ms} ms
              </div>
            </div>
            {queryMutation.data.message && (
              <p className="text-xs text-muted-foreground">{queryMutation.data.message}</p>
            )}
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    {queryMutation.data.columns.map((column) => (
                      <th key={column} className="px-3 py-2 text-left font-medium">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {queryMutation.data.data.slice(0, 20).map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-t">
                      {row.map((cell, cellIndex) => (
                        <td key={`${rowIndex}-${cellIndex}`} className="px-3 py-2 font-mono">
                          {String(cell ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!compileMutation.data && !queryMutation.data && !compileMutation.isError && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Play className="w-10 h-10 text-muted-foreground/30 mb-3" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              选择 Cube 和指标，点击编译查看 SQL，或直接编译并执行
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
