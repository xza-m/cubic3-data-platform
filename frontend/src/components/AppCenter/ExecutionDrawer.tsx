/**
 * 执行详情抽屉
 */
import { format } from 'date-fns'
import { Clock, Calendar, AlertCircle, CheckCircle } from 'lucide-react'
import { PageDrawer, Badge, Alert, AlertDescription } from '@/components/business'
import type { AppExecution } from '../../api/appCenter'

// 扩展执行类型，包含API可能返回的额外字段
interface ExecutionWithDetails extends AppExecution {
  error?: string
  result?: Record<string, unknown>
}

interface ExecutionDrawerProps {
  open: boolean
  execution: ExecutionWithDetails | null
  onClose: () => void
}

export default function ExecutionDrawer({ open, execution, onClose }: ExecutionDrawerProps) {
  if (!execution) return null

  const getStatusBadge = (status: string) => {
    const statusMap = {
      pending: { text: '等待中', variant: 'outline' as const },
      running: { text: '运行中', variant: 'default' as const },
      success: { text: '成功', variant: 'secondary' as const },
      failed: { text: '失败', variant: 'destructive' as const },
    }
    const config = statusMap[status as keyof typeof statusMap] || { text: status, variant: 'outline' as const }
    return <Badge variant={config.variant}>{config.text}</Badge>
  }

  return (
    <PageDrawer
      open={open}
      onOpenChange={(isOpen) => !isOpen && onClose()}
      title="执行详情"
      side="right"
    >
      <div className="space-y-6">
        {/* 基本信息 */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">基本信息</h3>
          <div className="space-y-3 border rounded-lg p-4">
            <div className="grid grid-cols-3 gap-2 py-2 border-b">
              <span className="text-sm text-gray-500">执行 ID</span>
              <span className="col-span-2 text-sm font-medium">#{execution.id}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 py-2 border-b">
              <span className="text-sm text-gray-500">实例名称</span>
              <span className="col-span-2 text-sm font-medium">
                {execution.instance_name || `实例 #${execution.instance_id}`}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 py-2 border-b">
              <span className="text-sm text-gray-500">应用类型</span>
              <span className="col-span-2 text-sm font-medium">{execution.app_name || '-'}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 py-2 border-b">
              <span className="text-sm text-gray-500">触发类型</span>
              <span className="col-span-2 text-sm font-medium">
                {execution.trigger_type === 'scheduled'
                  ? '定时'
                  : execution.trigger_type === 'manual'
                  ? '手动'
                  : '事件'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 py-2">
              <span className="text-sm text-gray-500">执行状态</span>
              <span className="col-span-2">{getStatusBadge(execution.status)}</span>
            </div>
          </div>
        </div>

        {/* 时间信息 */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">时间信息</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="text-gray-600">创建时间：</span>
              <span className="text-gray-900">
                {format(new Date(execution.created_at), 'yyyy-MM-dd HH:mm:ss')}
              </span>
            </div>
            {execution.started_at && (
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-gray-400" />
                <span className="text-gray-600">开始时间：</span>
                <span className="text-gray-900">
                  {format(new Date(execution.started_at), 'yyyy-MM-dd HH:mm:ss')}
                </span>
              </div>
            )}
            {execution.ended_at && (
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-gray-400" />
                <span className="text-gray-600">结束时间：</span>
                <span className="text-gray-900">
                  {format(new Date(execution.ended_at), 'yyyy-MM-dd HH:mm:ss')}
                </span>
              </div>
            )}
            {execution.duration_ms && (
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-gray-400" />
                <span className="text-gray-600">执行耗时：</span>
                <span className="text-gray-900">{(execution.duration_ms / 1000).toFixed(2)}秒</span>
              </div>
            )}
          </div>
        </div>

        {/* 执行日志 */}
        {execution.logs && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">执行日志</h3>
            <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
              <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono">{execution.logs}</pre>
            </div>
          </div>
        )}

        {/* 错误信息 */}
        {execution.status === 'failed' && execution.error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="font-semibold mb-1">执行失败</div>
              <div className="text-sm">{execution.error}</div>
            </AlertDescription>
          </Alert>
        )}

        {/* 执行结果 */}
        {execution.status === 'success' && execution.result && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              执行结果
            </h3>
            <div className="bg-green-50 rounded-lg p-4">
              <pre className="text-xs text-green-900 whitespace-pre-wrap font-mono">
                {JSON.stringify(execution.result, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </PageDrawer>
  )
}
