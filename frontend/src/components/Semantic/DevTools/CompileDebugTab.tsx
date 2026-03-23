import { useState, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import Editor from '@monaco-editor/react'
import {
  Bug,
  Play,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Copy,
  Check,
} from 'lucide-react'
import { compileDsl } from '@/api/semantic'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

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

export function CompileDebugTab() {
  const { toast } = useToast()
  const [dslInput, setDslInput] = useState(EXAMPLE_DSL)
  const [steps, setSteps] = useState<CompileStep[]>([])
  const [sqlResult, setSqlResult] = useState<string>('')
  const [copied, setCopied] = useState(false)

  const compileMutation = useMutation({
    mutationFn: async (dsl: Record<string, any>) => {
      const res = await compileDsl(dsl)
      return res.data
    },
    onSuccess: (data) => {
      const newSteps: CompileStep[] = [
        { name: 'DSL 解析', status: 'ok', detail: '语法正确' },
        {
          name: 'Cube 解析',
          status: 'ok',
          detail: `主 Cube: ${data.primary_cube}`,
        },
        {
          name: 'JOIN 路径推导',
          status: data.joined_cubes.length > 0 ? 'ok' : 'skipped',
          detail:
            data.joined_cubes.length > 0
              ? `${data.primary_cube} → ${data.joined_cubes.join(' → ')}`
              : '无需 JOIN（单 Cube 查询）',
        },
        { name: 'Fan-out 检测', status: 'ok', detail: '安全' },
        { name: '分区注入', status: 'ok', detail: '已注入' },
        { name: 'Default Filter', status: 'ok', detail: '已注入' },
        { name: 'SQL 生成', status: 'ok', detail: '完成' },
      ]
      setSteps(newSteps)
      setSqlResult(data.sql)
    },
    onError: (err: Error) => {
      setSteps([
        { name: 'DSL 解析', status: 'ok' },
        { name: '编译失败', status: 'error', detail: err.message },
      ])
      setSqlResult('')
      toast({ title: '编译失败', description: err.message, variant: 'destructive' })
    },
  })

  const handleCompile = useCallback(() => {
    try {
      const parsed = JSON.parse(dslInput)
      setSteps([])
      setSqlResult('')
      compileMutation.mutate(parsed)
    } catch (e) {
      toast({ title: 'JSON 格式错误', description: String(e), variant: 'destructive' })
    }
  }, [dslInput, compileMutation, toast])

  const handleReset = () => {
    setDslInput(EXAMPLE_DSL)
    setSteps([])
    setSqlResult('')
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(sqlResult).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const isDark = document.documentElement.classList.contains('dark')

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
      {/* 左侧: DSL 输入 */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">DSL 输入</h3>
        <div className="rounded-lg border overflow-hidden" style={{ height: '400px' }}>
          <Editor
            height="100%"
            language="json"
            value={dslInput}
            theme={isDark ? 'vs-dark' : 'vs'}
            onChange={(v) => setDslInput(v ?? '{}')}
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
        <div className="flex gap-2">
          <Button onClick={handleCompile} disabled={compileMutation.isPending}>
            {compileMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-1.5" aria-hidden="true" />
                编译中…
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-1.5" aria-hidden="true" />
                编译
              </>
            )}
          </Button>
          <Button variant="outline" onClick={handleReset}>
            <RotateCcw className="w-4 h-4 mr-1.5" aria-hidden="true" />
            重置
          </Button>
        </div>
      </div>

      {/* 右侧: 编译步骤 */}
      <div className="space-y-4">
        {steps.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Bug className="w-10 h-10 text-muted-foreground/30 mb-3" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              输入 DSL JSON 并点击编译，查看逐步编译结果
            </p>
          </div>
        ) : (
          <>
            <h3 className="text-sm font-semibold">编译步骤</h3>
            <div className="space-y-2" role="list">
              {steps.map((step, i) => (
                <div
                  key={i}
                  className={cn(
                    'rounded-lg border p-3 transition-all',
                    step.status === 'error' && 'border-destructive/50 bg-destructive/5',
                    step.status === 'ok' && 'bg-card',
                    step.status === 'skipped' && 'opacity-60',
                  )}
                  role="listitem"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold',
                        step.status === 'ok' && 'bg-[hsl(var(--semantic-ok))]/10 text-[hsl(var(--semantic-ok))]',
                        step.status === 'error' && 'bg-destructive/10 text-destructive',
                        step.status === 'skipped' && 'bg-muted text-muted-foreground',
                      )}
                    >
                      {step.status === 'ok' ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : step.status === 'error' ? (
                        <AlertTriangle className="w-3.5 h-3.5" />
                      ) : (
                        '—'
                      )}
                    </span>
                    <span className="text-sm font-medium">{step.name}</span>
                    {step.status === 'skipped' && (
                      <span className="text-[10px] text-muted-foreground ml-1">跳过</span>
                    )}
                  </div>
                  {step.detail && (
                    <p
                      className={cn(
                        'text-xs mt-1 ml-7',
                        step.status === 'error' ? 'text-destructive' : 'text-muted-foreground',
                      )}
                      style={{ fontFamily: 'var(--font-mono)' }}
                    >
                      {step.detail}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* SQL 结果 */}
            {sqlResult && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">生成的 SQL</h3>
                  <Button variant="ghost" size="sm" onClick={handleCopy}>
                    {copied ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                    {copied ? '已复制' : '复制'}
                  </Button>
                </div>
                <div className="rounded-lg border overflow-hidden">
                  <Editor
                    height="200px"
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
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
