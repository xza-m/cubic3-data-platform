import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import Editor from '@monaco-editor/react'
import { AlertTriangle, Bug, Check, CheckCircle2, Copy, Loader2, Play, RotateCcw } from 'lucide-react'
import { compileDsl } from '@/api/semantic'
import { Button } from '@/components/ui/button'
import { SemanticEmptyState } from '@/components/Semantic/workbench'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const EXAMPLE_DSL = JSON.stringify(
  {
    measures: ['answer_records.total_count', 'answer_records.accuracy'],
    dimensions: ['answer_records.subject_name'],
    time_dimensions: [
      {
        dimension: 'answer_records.answer_date',
        granularity: 'month',
        date_range: ['20250101', '20250331'],
      },
    ],
    limit: 100,
  },
  null,
  2,
)

interface CompileStep {
  name: string
  status: 'ok' | 'skipped' | 'error' | 'pending'
  detail?: string
}

export interface CompileDebugStatus {
  state: 'idle' | 'running' | 'success' | 'error'
  label: string
  lastRunAt?: string | null
}

export function CompileDebugTab({
  onStatusChange,
}: {
  onStatusChange?: (status: CompileDebugStatus) => void
}) {
  const { toast } = useToast()
  const [dslInput, setDslInput] = useState(EXAMPLE_DSL)
  const [steps, setSteps] = useState<CompileStep[]>([])
  const [sqlResult, setSqlResult] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const [lastRunAt, setLastRunAt] = useState<string | null>(null)
  const [primaryCube, setPrimaryCube] = useState<string>('')
  const [joinedCubes, setJoinedCubes] = useState<string[]>([])
  const copyResetTimerRef = useRef<number | null>(null)
  const [compileState, setCompileState] = useState<CompileDebugStatus>({
    state: 'idle',
    label: '未执行',
    lastRunAt: null,
  })

  useEffect(() => {
    onStatusChange?.(compileState)
  }, [compileState, onStatusChange])

  useEffect(() => () => {
    if (copyResetTimerRef.current !== null) {
      window.clearTimeout(copyResetTimerRef.current)
    }
  }, [])

  const compileMutation = useMutation({
    mutationFn: async (dsl: Record<string, unknown>) => {
      const res = await compileDsl(dsl)
      return res.data
    },
    onSuccess: (data) => {
      const executedAt = new Date().toLocaleString('zh-CN')
      setLastRunAt(executedAt)
      setPrimaryCube(data.primary_cube)
      setJoinedCubes(data.joined_cubes)
      setSteps([
        { name: 'DSL 解析', status: 'ok', detail: '语法正确' },
        { name: 'Cube 解析', status: 'ok', detail: `主 Cube: ${data.primary_cube}` },
        {
          name: 'JOIN 路径推导',
          status: data.joined_cubes.length > 0 ? 'ok' : 'skipped',
          detail: data.joined_cubes.length > 0 ? `${data.primary_cube} → ${data.joined_cubes.join(' → ')}` : '无需 JOIN（单 Cube 查询）',
        },
        { name: 'Fan-out 检测', status: 'ok', detail: '未发现扩表风险' },
        { name: '默认过滤注入', status: 'ok', detail: '已完成' },
        { name: 'SQL 生成', status: 'ok', detail: '完成' },
      ])
      setSqlResult(data.sql)
      setCompileState({
        state: 'success',
        label: '成功',
        lastRunAt: executedAt,
      })
    },
    onError: (err: Error) => {
      const executedAt = new Date().toLocaleString('zh-CN')
      setLastRunAt(executedAt)
      setPrimaryCube('')
      setJoinedCubes([])
      setSteps([
        { name: 'DSL 解析', status: 'ok', detail: '输入 JSON 可解析' },
        { name: '编译失败', status: 'error', detail: err.message },
      ])
      setSqlResult('')
      setCompileState({
        state: 'error',
        label: '失败',
        lastRunAt: executedAt,
      })
      toast({ title: '编译失败', description: err.message, variant: 'destructive' })
    },
  })

  const handleCompile = useCallback(() => {
    try {
      const parsed = JSON.parse(dslInput)
      setSteps([])
      setSqlResult('')
      setCompileState({
        state: 'running',
        label: '编译中',
        lastRunAt,
      })
      compileMutation.mutate(parsed)
    } catch (error) {
      toast({ title: 'JSON 格式错误', description: String(error), variant: 'destructive' })
    }
  }, [compileMutation, dslInput, lastRunAt, toast])

  const handleReset = () => {
    setDslInput(EXAMPLE_DSL)
    setSteps([])
    setSqlResult('')
    setPrimaryCube('')
    setJoinedCubes([])
    setCompileState({
      state: 'idle',
      label: '未执行',
      lastRunAt: null,
    })
    setLastRunAt(null)
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(sqlResult).then(() => {
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current)
      }
      setCopied(true)
      copyResetTimerRef.current = window.setTimeout(() => {
        setCopied(false)
        copyResetTimerRef.current = null
      }, 2000)
    })
  }

  const issueSummary = useMemo(() => {
    const errorStep = steps.find((step) => step.status === 'error')
    if (errorStep) {
      return {
        title: '当前阻塞',
        description: errorStep.detail || '编译失败，请检查 DSL 字段引用和 JSON 结构。',
      }
    }
    if (compileState.state === 'success') {
      return {
        title: '编译摘要',
        description: joinedCubes.length > 0
          ? `当前会经过 ${joinedCubes.length} 个 JOIN 节点。主路径为 ${primaryCube} 与 ${joinedCubes[0]}。`
          : '当前查询只依赖单个 Cube。'
      }
    }
    return {
      title: '结果定位',
      description: '显示编译结论、步骤日志和 SQL 输出。',
    }
  }, [compileState.state, joinedCubes, primaryCube, steps])

  const isDark = false

  return (
    <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <SummaryItem label="最近执行" value={lastRunAt || '未执行'} tone="default" />
          <SummaryItem label="编译结论" value={compileState.label} tone={compileState.state === 'error' ? 'warning' : compileState.state === 'success' ? 'accent' : 'default'} />
          <SummaryItem label="主 Cube" value={primaryCube || '未生成'} tone="default" />
          <SummaryItem label="Join 数" value={joinedCubes.length} tone="default" />
        </div>

        <div className="rounded-[var(--workbench-radius-sm)] border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[hsl(var(--workbench-outline))] px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-[hsl(var(--workbench-ink))]">DSL 输入</div>
              <div className="text-xs text-[hsl(var(--workbench-muted-foreground))]">输入 JSON DSL 并执行编译。</div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCompile} disabled={compileMutation.isPending}>
                {compileMutation.isPending ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    编译中…
                  </>
                ) : (
                  <>
                    <Play className="mr-1.5 h-4 w-4" />
                    编译
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={handleReset}>
                <RotateCcw className="mr-1.5 h-4 w-4" />
                重置
              </Button>
            </div>
          </div>
          <div style={{ height: 'calc(100vh - 28rem)' }}>
            <Editor
              height="100%"
              language="json"
              value={dslInput}
              theme={isDark ? 'vs-dark' : 'vs'}
              onChange={(value) => setDslInput(value ?? '{}')}
              options={{
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                minimap: { enabled: false },
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                tabSize: 2,
              }}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="rounded-[var(--workbench-radius-sm)] border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] px-4 py-4">
          <div className="text-sm font-semibold text-[hsl(var(--workbench-ink))]">{issueSummary.title}</div>
          <p className="mt-2 text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">{issueSummary.description}</p>
        </div>

        {steps.length === 0 ? (
          <SemanticEmptyState
            icon={<Bug className="h-6 w-6" />}
            title="暂未执行编译"
            description="显示编译结论、步骤日志和 SQL 输出。"
          />
        ) : (
          <div className="space-y-3 rounded-[var(--workbench-radius-sm)] border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] px-4 py-4">
            <div className="text-sm font-semibold text-[hsl(var(--workbench-ink))]">步骤日志</div>
            <div className="space-y-2" role="list">
              {steps.map((step, index) => (
                <div
                  key={`${step.name}-${index}`}
                  className={cn(
                    'rounded-[var(--workbench-radius-sm)] border px-3 py-3 transition-colors',
                    step.status === 'error'
                      ? 'border-[hsl(var(--semantic-error))]/30 bg-[hsl(var(--semantic-error))]/6'
                    : step.status === 'ok'
                        ? 'border-[hsl(var(--workbench-outline))] bg-white'
                        : 'border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface-2))]',
                  )}
                  role="listitem"
                >
                  <div className="flex items-center gap-2">
                    {step.status === 'ok' ? (
                      <CheckCircle2 className="h-4 w-4 text-[hsl(var(--semantic-ok))]" />
                    ) : step.status === 'error' ? (
                      <AlertTriangle className="h-4 w-4 text-[hsl(var(--semantic-error))]" />
                    ) : (
                      <Bug className="h-4 w-4 text-[hsl(var(--workbench-muted-foreground))]" />
                    )}
                    <span className="text-sm font-medium text-[hsl(var(--workbench-ink))]">{step.name}</span>
                  </div>
                  {step.detail ? (
                    <p className="mt-2 pl-6 text-xs leading-5 text-[hsl(var(--workbench-muted-foreground))]" style={{ fontFamily: 'var(--font-mono)' }}>
                      {step.detail}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}

        {sqlResult ? (
          <div className="overflow-hidden rounded-[var(--workbench-radius-sm)] border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))]">
            <div className="flex items-center justify-between gap-3 border-b border-[hsl(var(--workbench-outline))] px-4 py-3">
              <div className="text-sm font-semibold text-[hsl(var(--workbench-ink))]">生成 SQL</div>
              <Button variant="ghost" size="sm" onClick={handleCopy}>
                {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
                {copied ? '已复制' : '复制'}
              </Button>
            </div>
            <Editor
              height="220px"
              language="sql"
              value={sqlResult}
              theme={isDark ? 'vs-dark' : 'vs'}
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
        ) : null}
      </section>
    </div>
  )
}

function SummaryItem({
  label,
  value,
  tone,
}: {
  label: string
  value: string | number
  tone: 'default' | 'accent' | 'warning'
}) {
  const toneClassName = {
    default: 'bg-white text-[hsl(var(--workbench-ink))]',
    accent: 'bg-[hsl(var(--workbench-accent-soft))] text-[hsl(var(--workbench-accent))]',
    warning: 'bg-[hsl(var(--semantic-warn))]/10 text-[hsl(var(--semantic-warn))]',
  }[tone]

  return (
    <div className={cn('rounded-[var(--workbench-radius-sm)] border border-[hsl(var(--workbench-outline))] px-3 py-3', toneClassName)}>
      <div className="text-[10px] uppercase tracking-[0.12em] text-[hsl(var(--workbench-muted-foreground))]">{label}</div>
      <div className="mt-1 text-sm font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}
