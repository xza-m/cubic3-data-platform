import { useState, useMemo, useCallback, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Play, Loader2, AlertTriangle, Code2, Table2, Route } from 'lucide-react'
import Editor from '@monaco-editor/react'
import { listCubes, compileDsl, querySemantic, type CubeDetail, describeCube } from '@/api/semantic'
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

type OutputTab = 'dsl' | 'sql'

export function PlaygroundTab({
  preferredCube,
  hideCubeSelect = false,
}: {
  preferredCube?: string
  hideCubeSelect?: boolean
} = {}) {
  const { toast } = useToast()
  const [selectedCube, setSelectedCube] = useState<string>(preferredCube ?? '')
  const [selectedMeasures, setSelectedMeasures] = useState<string[]>([])
  const [selectedDims, setSelectedDims] = useState<string[]>([])
  const [timeDim, setTimeDim] = useState<string>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [granularity, setGranularity] = useState<string>('')
  const [joinPathInput, setJoinPathInput] = useState<string>('')
  const [outputTab, setOutputTab] = useState<OutputTab>('dsl')

  const { data: cubesData } = useQuery({
    queryKey: ['semantic', 'cubes'],
    queryFn: async () => (await listCubes()).data,
  })

  const cubes = cubesData?.cubes ?? []
  const defaultCubeName = cubes[0]?.name ?? ''
  const effectiveCube = selectedCube || preferredCube || defaultCubeName

  useEffect(() => {
    if (preferredCube && selectedCube !== preferredCube) {
      setSelectedCube(preferredCube)
      return
    }

    if (!preferredCube && !selectedCube && defaultCubeName) {
      setSelectedCube(defaultCubeName)
      return
    }

    if (selectedCube && cubes.length > 0 && !cubes.some((cube) => cube.name === selectedCube)) {
      setSelectedCube(defaultCubeName)
    }
  }, [preferredCube, selectedCube, cubes, defaultCubeName])

  const { data: cubeDetail } = useQuery({
    queryKey: ['semantic', 'cube', effectiveCube],
    queryFn: async () => (await describeCube(effectiveCube)).data as CubeDetail,
    enabled: !!effectiveCube,
  })

  useEffect(() => {
    setSelectedMeasures([])
    setSelectedDims([])
    setTimeDim('')
    setDateFrom('')
    setDateTo('')
    setGranularity('')
    setJoinPathInput('')
    setOutputTab('dsl')
  }, [effectiveCube])

  const joinPath = useMemo(
    () =>
      joinPathInput
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean),
    [joinPathInput],
  )

  const previewMode = joinPath.length >= 2 ? 'joined' : 'single'

  const dsl = useMemo(() => {
    if (!effectiveCube) return {}

    const result: Record<string, unknown> = { limit: 100 }

    if (selectedMeasures.length > 0) {
      result.measures = selectedMeasures.map((measure) => `${effectiveCube}.${measure}`)
    }

    if (selectedDims.length > 0) {
      result.dimensions = selectedDims.map((dimension) => `${effectiveCube}.${dimension}`)
    }

    if (timeDim) {
      const timeDimension: Record<string, unknown> = {
        dimension: `${effectiveCube}.${timeDim}`,
      }
      if (granularity) timeDimension.granularity = granularity
      if (dateFrom && dateTo) timeDimension.date_range = [dateFrom, dateTo]
      result.time_dimensions = [timeDimension]
    }

    if (joinPath.length >= 2) {
      result.join_path = joinPath
    }

    return result
  }, [dateFrom, dateTo, effectiveCube, granularity, joinPath, selectedDims, selectedMeasures, timeDim])

  const dslJson = useMemo(() => JSON.stringify(dsl, null, 2), [dsl])

  const compileMutation = useMutation({
    mutationFn: async (dslInput: Record<string, unknown>) => {
      const response = await compileDsl(dslInput)
      return response.data
    },
    onSuccess: () => setOutputTab('sql'),
    onError: (error: Error) => {
      toast({ title: '预览失败', description: error.message, variant: 'destructive' })
    },
  })

  const queryMutation = useMutation({
    mutationFn: async (dslInput: Record<string, unknown>) => {
      const response = await querySemantic(dslInput)
      return response.data
    },
    onSuccess: () => setOutputTab('sql'),
    onError: (error: Error) => {
      toast({ title: '执行失败', description: error.message, variant: 'destructive' })
    },
  })

  const handleCompile = useCallback(() => {
    if (!effectiveCube) return
    compileMutation.mutate(dsl as Record<string, unknown>)
  }, [compileMutation, dsl, effectiveCube])

  const handleExecute = useCallback(() => {
    if (!effectiveCube) return
    queryMutation.mutate(dsl as Record<string, unknown>)
  }, [dsl, effectiveCube, queryMutation])

  const metricEntries = cubeDetail
    ? Object.entries(cubeDetail.measures).sort((a, b) => {
        const ac = a[1].certified ? 1 : 0
        const bc = b[1].certified ? 1 : 0
        return bc - ac || a[0].localeCompare(b[0])
      })
    : []

  const dimensionEntries = cubeDetail
    ? Object.entries(cubeDetail.dimensions).filter(([, dimension]) => dimension.type !== 'time')
    : []

  const timeDims = cubeDetail
    ? Object.entries(cubeDetail.dimensions)
        .filter(([, dimension]) => dimension.type === 'time')
        .map(([key]) => key)
    : []

  const editorTheme = document.documentElement.classList.contains('dark') ? 'vs-dark' : 'vs'
  const sqlText = compileMutation.data?.sql ?? '-- 生成预览后将在这里显示 SQL'

  return (
    <div className="mt-4 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(340px,420px)_minmax(0,1fr)]">
      <section className="overflow-hidden rounded-xl border border-[hsl(var(--workbench-outline))] bg-white shadow-sm">
        <div className="flex max-h-[calc(100vh-18rem)] flex-col">
          <div data-testid="playground-config-scroll" className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
            {!hideCubeSelect ? (
              <div className="space-y-2">
                <Label htmlFor="cube-select" className="text-sm font-medium">
                  Cube
                </Label>
                <Select value={effectiveCube} onValueChange={setSelectedCube}>
                  <SelectTrigger id="cube-select">
                    <SelectValue placeholder="选择 Cube…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Cubes</SelectLabel>
                      {cubes.map((cube) => (
                        <SelectItem key={cube.name} value={cube.name}>
                          {cube.title} ({cube.name})
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {cubeDetail ? (
              <>
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-[hsl(var(--workbench-ink))]">指标</h3>
                  <div className="space-y-2">
                    {metricEntries.map(([key, measure]) => (
                      <label key={key} htmlFor={`measure-${key}`} className="flex cursor-pointer items-start gap-3 rounded-lg border border-transparent px-2 py-2 transition-colors hover:bg-[hsl(var(--workbench-surface))]">
                        <Checkbox
                          id={`measure-${key}`}
                          checked={selectedMeasures.includes(key)}
                          onCheckedChange={(checked) => {
                            setSelectedMeasures((prev) =>
                              checked ? [...prev, key] : prev.filter((item) => item !== key),
                            )
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs text-[hsl(var(--workbench-muted-foreground))]">{key}</span>
                            <span className="text-sm font-medium text-[hsl(var(--workbench-ink))]">{measure.title}</span>
                            {measure.certified ? (
                              <span className="text-[10px] font-medium text-[hsl(var(--semantic-ok))]">认证</span>
                            ) : null}
                          </div>
                          {measure.description ? (
                            <p className="mt-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">{measure.description}</p>
                          ) : null}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-[hsl(var(--workbench-ink))]">维度</h3>
                  <div className="space-y-2">
                    {dimensionEntries.map(([key, dimension]) => (
                      <label key={key} htmlFor={`dimension-${key}`} className="flex cursor-pointer items-start gap-3 rounded-lg border border-transparent px-2 py-2 transition-colors hover:bg-[hsl(var(--workbench-surface))]">
                        <Checkbox
                          id={`dimension-${key}`}
                          checked={selectedDims.includes(key)}
                          onCheckedChange={(checked) => {
                            setSelectedDims((prev) =>
                              checked ? [...prev, key] : prev.filter((item) => item !== key),
                            )
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs text-[hsl(var(--workbench-muted-foreground))]">{key}</span>
                            <span className="text-sm font-medium text-[hsl(var(--workbench-ink))]">{dimension.title}</span>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-[hsl(var(--workbench-ink))]">时间范围</h3>
                  <div className="space-y-2">
                    <Select value={timeDim} onValueChange={setTimeDim}>
                      <SelectTrigger>
                        <SelectValue placeholder="选择时间维度…" />
                      </SelectTrigger>
                      <SelectContent>
                        {timeDims.map((dimension) => (
                          <SelectItem key={dimension} value={dimension}>
                            {dimension}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {timeDim ? (
                      <>
                        <div className="flex gap-2">
                          <Input
                            placeholder="起始日期 (yyyyMMdd)"
                            value={dateFrom}
                            onChange={(event) => setDateFrom(event.target.value)}
                            autoComplete="off"
                          />
                          <Input
                            placeholder="结束日期 (yyyyMMdd)"
                            value={dateTo}
                            onChange={(event) => setDateTo(event.target.value)}
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
                    ) : null}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-1.5">
                    <Route className="h-3.5 w-3.5 text-[hsl(var(--workbench-muted-foreground))]" />
                    <h3 className="text-sm font-semibold text-[hsl(var(--workbench-ink))]">JOIN 路径</h3>
                    <span className="text-xs text-[hsl(var(--workbench-muted-foreground))]">（可选）</span>
                  </div>
                  <Input
                    placeholder="逗号分隔 Cube 名称，如 answer_records, student, school"
                    value={joinPathInput}
                    onChange={(event) => setJoinPathInput(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono text-xs"
                  />
                  <p className="text-xs leading-5 text-[hsl(var(--workbench-muted-foreground))]">
                    留空时按单 Cube 生成预览；指定后会按照路径生成多 Cube JOIN。
                  </p>
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-[hsl(var(--workbench-outline))] px-4 py-6 text-sm text-[hsl(var(--workbench-muted-foreground))]">
                当前没有可预览的 Cube，请先在左侧选择资源。
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div data-testid="playground-result-toolbar" className="flex items-center justify-between gap-3">
          <div
            data-testid="playground-mode-badge"
            className="inline-flex items-center rounded-full border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] px-3 py-1 text-xs font-medium text-[hsl(var(--workbench-muted-foreground))]"
          >
            当前模式：{previewMode === 'joined' ? 'Joined Cube' : '单 Cube'}
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleCompile} disabled={compileMutation.isPending || !effectiveCube}>
              {compileMutation.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  生成预览中…
                </>
              ) : (
                <>
                  <Code2 className="mr-1.5 h-4 w-4" />
                  生成预览
                </>
              )}
            </Button>
            <Button variant="secondary" onClick={handleExecute} disabled={queryMutation.isPending || !effectiveCube}>
              {queryMutation.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  执行中…
                </>
              ) : (
                <>
                  <Table2 className="mr-1.5 h-4 w-4" />
                  预览并执行
                </>
              )}
            </Button>
          </div>
        </div>

        <div
          data-testid="playground-output-panel"
          className="overflow-hidden rounded-xl border border-[hsl(var(--workbench-outline))] bg-white shadow-sm"
        >
          <div
            data-testid="playground-output-tabs"
            className="flex items-center justify-between gap-3 border-b border-[hsl(var(--workbench-outline))] px-3 py-2"
          >
            <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setOutputTab('dsl')}
              className={
                outputTab === 'dsl'
                  ? 'rounded-md bg-[hsl(var(--workbench-accent))] px-3 py-1.5 text-xs font-medium text-white'
                  : 'rounded-md px-3 py-1.5 text-xs text-[hsl(var(--workbench-muted-foreground))] hover:bg-[hsl(var(--workbench-surface))]'
              }
            >
              DSL JSON
            </button>
            <button
              type="button"
              onClick={() => setOutputTab('sql')}
              className={
                outputTab === 'sql'
                  ? 'rounded-md bg-[hsl(var(--workbench-accent))] px-3 py-1.5 text-xs font-medium text-white'
                  : 'rounded-md px-3 py-1.5 text-xs text-[hsl(var(--workbench-muted-foreground))] hover:bg-[hsl(var(--workbench-surface))]'
              }
            >
              SQL
            </button>
            </div>
            <p className="text-xs text-[hsl(var(--workbench-muted-foreground))]">
              DSL 基于左侧选项即时生成，生成预览后在此处查看 SQL。
            </p>
          </div>
          <Editor
            height="260px"
            language={outputTab === 'dsl' ? 'json' : 'sql'}
            value={outputTab === 'dsl' ? dslJson : sqlText}
            theme={editorTheme}
            options={{
              readOnly: true,
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              minimap: { enabled: false },
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              tabSize: 2,
            }}
          />
        </div>

        {compileMutation.isError ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertTriangle className="h-4 w-4" />
              预览失败
            </div>
            <p className="mt-2 text-sm text-[hsl(var(--workbench-muted-foreground))]">{compileMutation.error.message}</p>
          </div>
        ) : null}

        {queryMutation.isError ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertTriangle className="h-4 w-4" />
              执行失败
            </div>
            <p className="mt-2 text-sm text-[hsl(var(--workbench-muted-foreground))]">{queryMutation.error.message}</p>
          </div>
        ) : null}

        {queryMutation.data ? (
          <div
            data-testid="playground-execution-summary"
            className="space-y-3 rounded-xl border border-[hsl(var(--workbench-outline))] bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[hsl(var(--workbench-ink))]">执行结果</h3>
                <p className="mt-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">
                  {queryMutation.data.row_count} 行 · {queryMutation.data.execution_time_ms} ms
                </p>
              </div>
              {queryMutation.data.message ? (
                <span className="text-xs text-[hsl(var(--workbench-muted-foreground))]">{queryMutation.data.message}</span>
              ) : null}
            </div>
            <div className="overflow-x-auto rounded-lg border border-[hsl(var(--workbench-outline))]">
              <table className="w-full text-xs">
                <thead className="bg-[hsl(var(--workbench-surface))]">
                  <tr>
                    {queryMutation.data.columns.map((column) => (
                      <th key={column} className="px-3 py-2 text-left font-medium text-[hsl(var(--workbench-muted-foreground))]">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {queryMutation.data.data.slice(0, 20).map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-t border-[hsl(var(--workbench-outline))]">
                      {row.map((cell, cellIndex) => (
                        <td key={`${rowIndex}-${cellIndex}`} className="px-3 py-2 font-mono text-[hsl(var(--workbench-ink))]">
                          {String(cell ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {!compileMutation.data && !queryMutation.data && !compileMutation.isError && !queryMutation.isError ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-[hsl(var(--workbench-outline))] bg-white px-6 text-center">
            <Play className="mb-3 h-10 w-10 text-[hsl(var(--workbench-muted-foreground))]/30" />
            <p className="text-sm text-[hsl(var(--workbench-muted-foreground))]">
              选择 Cube 和指标，点击生成预览查看 SQL，或直接预览并执行。
            </p>
          </div>
        ) : null}
      </section>
    </div>
  )
}
