import { Link } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react'
import { runSchemaSync, type SchemaSyncResult } from '@/api/semantic'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { fmtDate, fmtNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

type SyncStatus = 'ok' | 'warn' | 'error'

function StatusIcon({ status }: { status: SyncStatus }) {
  switch (status) {
    case 'ok':
      return <CheckCircle2 className="h-4 w-4 text-[hsl(var(--semantic-ok))]" />
    case 'warn':
      return <AlertTriangle className="h-4 w-4 text-[hsl(var(--semantic-warn))]" />
    case 'error':
      return <XCircle className="h-4 w-4 text-[hsl(var(--semantic-error))]" />
  }
}

function StatusLabel({ status }: { status: SyncStatus }) {
  const labels = { ok: '正常', warn: '警告', error: '错误' }
  const colors = {
    ok: 'text-[hsl(var(--semantic-ok))]',
    warn: 'text-[hsl(var(--semantic-warn))]',
    error: 'text-[hsl(var(--semantic-error))]',
  }
  return <span className={cn('text-xs font-medium', colors[status])}>{labels[status]}</span>
}

function severityToStatus(severity: string | undefined): SyncStatus {
  if (severity === 'error') return 'error'
  if (severity === 'warn') return 'warn'
  return 'ok'
}

export function SchemaSyncTab() {
  const { toast } = useToast()
  const [filter, setFilter] = useState<'all' | SyncStatus>('all')

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await runSchemaSync()
      return res.data as SchemaSyncResult
    },
    onError: (err: Error) => {
      toast({ title: 'Schema 检测失败', description: err.message, variant: 'destructive' })
    },
  })

  const report = syncMutation.data
  const drifts = report?.drifts ?? []

  const filtered = useMemo(() => {
    if (filter === 'all') return drifts
    return drifts.filter((item) => severityToStatus(item.severity) === filter)
  }, [drifts, filter])

  const counts = useMemo(
    () => ({
      ok: report ? Math.max(report.checked_cubes - drifts.length, 0) : 0,
      warn: drifts.filter((item) => severityToStatus(item.severity) === 'warn').length,
      error: drifts.filter((item) => severityToStatus(item.severity) === 'error').length,
    }),
    [drifts, report],
  )

  if (!report && syncMutation.isPending) {
    return (
      <div className="mt-4 space-y-4">
        <div className="flex gap-4">
          <Skeleton className="h-16 flex-1 rounded-lg" />
          <Skeleton className="h-16 flex-1 rounded-lg" />
          <Skeleton className="h-16 flex-1 rounded-lg" />
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-5">
      <div className="rounded-xl border bg-muted/20 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="text-sm font-medium">Schema Drift 定义</div>
            <p className="max-w-3xl text-sm text-muted-foreground">
              指语义模型定义与物理表结构不一致，包括缺列、多列、类型不匹配、Join 引用失效、跨源 Join、View 引用失效等问题。
            </p>
          </div>
          {report?.checked_at && (
            <div className="rounded-lg border bg-background px-3 py-2 text-right">
              <div className="text-xs text-muted-foreground">最近检测</div>
              <div className="text-sm font-medium">{fmtDate(report.checked_at)}</div>
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>检测范围：Cube / View 运行时定义</span>
          <span>入口统一：详情页只展示摘要，完整分析在当前页面</span>
          <Link to="/semantic/cubes" className="text-primary hover:underline">
            返回 Cube 模块
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex flex-1 gap-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {(['ok', 'warn', 'error'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilter(filter === status ? 'all' : status)}
              className={cn(
                'flex-1 cursor-pointer rounded-lg border p-3 text-center transition-all hover:shadow-sm',
                filter === status && 'ring-2 ring-ring',
              )}
            >
              <div className="mb-1 flex items-center justify-center gap-2">
                <StatusIcon status={status} />
                <span className="text-xl font-bold">{counts[status]}</span>
              </div>
              <StatusLabel status={status} />
            </button>
          ))}
        </div>

        <Button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          aria-label="立即执行 Schema 漂移检测"
        >
          {syncMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              检测中…
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              立即检测
            </>
          )}
        </Button>
      </div>

      {!report && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <RefreshCw className="mb-3 h-10 w-10 text-muted-foreground/30" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">点击“立即检测”执行真实 Schema Drift 检测</p>
        </div>
      )}

      {report && drifts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CheckCircle2 className="mb-4 h-12 w-12 text-[hsl(var(--semantic-ok))]/50" aria-hidden="true" />
          <h2 className="mb-1 text-lg font-semibold">当前未发现 Schema 漂移</h2>
          <p className="text-sm text-muted-foreground">
            共检查 {fmtNumber(report.checked_cubes)} 个对象，跳过 {fmtNumber(report.skipped_cubes.length)} 个。
          </p>
        </div>
      )}

      {report && (
        <div className="grid gap-3 md:grid-cols-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">已检查对象</div>
            <div className="mt-2 text-lg font-semibold">{fmtNumber(report.checked_cubes)}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">跳过对象</div>
            <div className="mt-2 text-lg font-semibold">{fmtNumber(report.skipped_cubes.length)}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">检测时间</div>
            <div className="mt-2 text-sm font-medium">{fmtDate(report.checked_at)}</div>
          </div>
        </div>
      )}

      {report && drifts.length > 0 && (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="px-4 py-2.5 text-left font-medium">对象</th>
                <th className="px-4 py-2.5 text-left font-medium">物理表</th>
                <th className="px-4 py-2.5 text-left font-medium">问题</th>
                <th className="px-4 py-2.5 text-left font-medium">状态</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, index) => {
                const status = severityToStatus(item.severity)
                return (
                  <tr
                    key={`${item.object_name}-${item.kind}-${item.column}-${index}`}
                    className="border-t transition-colors hover:bg-muted/30"
                  >
                    <td className="px-4 py-2.5">
                      <div className="text-sm font-medium">{item.object_name}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {item.object_type} · {item.cube}
                      </div>
                    </td>
                    <td className="max-w-[240px] truncate px-4 py-2.5 font-mono text-xs text-muted-foreground">
                      {item.table || '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="mb-1 font-mono text-xs text-muted-foreground">
                        {item.kind} / {item.column}
                      </div>
                      <div className="text-xs leading-5">{item.detail}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <StatusIcon status={status} />
                        <StatusLabel status={status} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="border-t px-4 py-8 text-center text-sm text-muted-foreground">
              当前筛选条件下没有匹配的问题项。
            </div>
          )}
        </div>
      )}
    </div>
  )
}
