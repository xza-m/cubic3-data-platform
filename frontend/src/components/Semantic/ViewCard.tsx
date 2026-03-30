import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, Layers, Database, Loader2, CheckCircle2, RefreshCw } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { fmtDate } from '@/lib/format'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import type { ViewSummary, MaterializeStatus, BatchMaterializeStatus } from '@/api/semantic'
import { materializeView } from '@/api/semantic'

interface ViewCardProps {
  view: ViewSummary
  materializeStatus?: MaterializeStatus
  style?: React.CSSProperties
}

export function ViewCard({ view, materializeStatus, style }: ViewCardProps) {
  const { toast } = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)

  const isMaterialized = materializeStatus?.materialized === true

  const mutation = useMutation({
    mutationFn: () => materializeView(view.name),
    onSuccess: (res) => {
      const data = res.data
      const nextStatus: MaterializeStatus = {
        materialized: true,
        publish_status: data.publish_status ?? 'published',
        view_name: view.name,
        dataset_id: data.dataset_id,
        dataset_code: data.dataset_code,
        dataset_name: view.title,
        sql_query: data.sql_query,
        updated_at: new Date().toISOString(),
        published_at: data.published_at ?? new Date().toISOString(),
        source_view: data.source_view,
        field_mappings: data.field_mappings,
        definition_hash: data.definition_hash ?? null,
        definition_summary: data.definition_summary ?? null,
      }

      queryClient.setQueryData(
        ['semantic', 'materialize-status'],
        (prev: BatchMaterializeStatus | undefined) => ({
          ...(prev ?? {}),
          [view.name]: {
            ...(prev?.[view.name] ?? {}),
            ...nextStatus,
          },
        }),
      )
      queryClient.setQueryData(['semantic', 'view-mat-status', view.name], nextStatus)

      toast({
        title: data.action === 'created' ? '发布成功' : '数据集已更新',
        description: `数据集 ${data.dataset_code}（${data.field_count} 个字段）`,
      })
      queryClient.invalidateQueries({ queryKey: ['semantic', 'materialize-status'] })
      queryClient.invalidateQueries({ queryKey: ['semantic', 'view-mat-status', view.name] })
      setDialogOpen(false)
    },
    onError: (err: unknown) => {
      const errorMessage = err instanceof Error ? err.message : '未知错误'
      toast({
        title: '发布失败',
        description: errorMessage,
        variant: 'destructive',
      })
    },
  })

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/semantic/views/${view.name}`)}
      onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/semantic/views/${view.name}`) }}
      className={cn(
        'group rounded-xl border p-5 transition-all cursor-pointer',
        'hover:shadow-md hover:border-primary/20',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        'animate-fade-in opacity-0 fill-mode-forwards',
      )}
      style={style}
    >
      {/* header */}
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-teal-50 text-teal-600 dark:bg-teal-950 dark:text-teal-400"
          aria-hidden="true"
        >
          <Eye className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3
              className="font-semibold text-sm truncate"
              style={{ textWrap: 'balance' } as React.CSSProperties}
            >
              {view.title}
            </h3>
            {!view.public && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                私有
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate" style={{ fontFamily: 'var(--font-mono)' }}>
            {view.name}
          </p>
        </div>
      </div>

      {/* description */}
      {view.description && (
        <p className="text-xs text-muted-foreground mb-3 line-clamp-2 leading-relaxed">
          {view.description.split('\n')[0]}
        </p>
      )}

      {/* stats */}
      <div
        className="flex gap-4 text-xs text-muted-foreground mb-4"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        <span className="flex items-center gap-1">
          <Layers className="w-3 h-3" aria-hidden="true" />
          {view.cube_count}&nbsp;Cube 引用
        </span>
      </div>

      {/* materialize status + action */}
      <div className="flex items-center justify-between gap-2">
        {isMaterialized ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 text-xs text-[hsl(var(--semantic-ok))]">
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>已发布</span>
                  {(materializeStatus?.published_at || materializeStatus?.updated_at) && (
                    <span className="text-muted-foreground ml-1">
                      {fmtDate(materializeStatus.published_at ?? materializeStatus.updated_at)}
                    </span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs max-w-xs">
                <p>数据集 ID: {materializeStatus?.dataset_id}</p>
                <p className="font-mono">{materializeStatus?.dataset_code}</p>
                {materializeStatus?.publish_status && (
                  <p>发布状态: {materializeStatus.publish_status}</p>
                )}
                {materializeStatus?.state_summary?.last_drift_status && (
                  <p>漂移状态: {materializeStatus.state_summary.last_drift_status}</p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Database className="w-3.5 h-3.5" aria-hidden="true" />
            <span>未发布</span>
          </div>
        )}

        <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <AlertDialogTrigger asChild>
            <Button
              onClick={(e) => e.stopPropagation()}
              variant={isMaterialized ? 'outline' : 'default'}
              size="sm"
              className="h-7 text-xs"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" aria-hidden="true" />
                  发布中…
                </>
              ) : isMaterialized ? (
                <>
                  <RefreshCw className="w-3 h-3 mr-1" aria-hidden="true" />
                  重新发布
                </>
              ) : (
                <>
                  <Database className="w-3 h-3 mr-1" aria-hidden="true" />
                  发布为数据集
                </>
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {isMaterialized ? '重新发布 View' : '发布 View 为数据集'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {isMaterialized
                  ? `将重新编译 "${view.title}" 的 SQL 并更新已有数据集。`
                  : `将 "${view.title}" 展开为 SQL 查询并创建虚拟数据集（dataset_code: view_${view.name}）。`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault()
                  mutation.mutate()
                }}
                disabled={mutation.isPending}
              >
                {mutation.isPending ? '处理中…' : '确认发布'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
