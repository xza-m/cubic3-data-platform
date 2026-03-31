import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Clock3, PlayCircle, PlusCircle, RefreshCw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { executeTask, getTasks, updateTask } from '../../api/extraction'
import type { ExtractionTask } from '@/types'
import { FormButton, Skeleton, useToast } from '@/components/business'

const STATUS_LABELS: Record<string, string> = {
  success: '最近执行成功',
  failed: '最近执行失败',
  pending: '等待执行',
}

export default function ScheduledQueries() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data, isLoading } = useQuery({
    queryKey: ['scheduled-query-tasks'],
    queryFn: () => getTasks({ page: 1, page_size: 100, task_type: 'scheduled' }),
  })

  const executeMutation = useMutation({
    mutationFn: (taskId: number) => executeTask(taskId),
    onSuccess: () => {
      toast({ title: '定时查询已提交执行' })
      queryClient.invalidateQueries({ queryKey: ['scheduled-query-tasks'] })
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ taskId, isActive }: { taskId: number; isActive: boolean }) =>
      updateTask(taskId, { is_active: isActive }),
    onSuccess: (_, variables) => {
      toast({ title: variables.isActive ? '定时查询已启用' : '定时查询已停用' })
      queryClient.invalidateQueries({ queryKey: ['scheduled-query-tasks'] })
    },
  })

  const tasks = data?.data?.items || []
  const stats = useMemo(
    () => ({
      total: tasks.length,
      active: tasks.filter((task: ExtractionTask) => task.is_active).length,
      paused: tasks.filter((task: ExtractionTask) => !task.is_active).length,
    }),
    [tasks],
  )

  return (
    <div className="flex h-full flex-col bg-[#F8FAFC]">
      <div className="border-b border-[#E2E8F0] bg-white px-8 py-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <button
              type="button"
              className="mt-1 rounded-full border border-[#E2E8F0] p-2 text-[#334155] transition hover:bg-[#F8FAFC]"
              onClick={() => navigate('/queries')}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-2xl font-semibold text-[#0F172A]">定时查询</h1>
              <p className="mt-2 text-sm text-[#64748B]">保留独立调度工作区，集中管理周期执行、立即重跑和启停状态。</p>
            </div>
          </div>

          <FormButton onClick={() => navigate('/extraction/config?taskType=scheduled')}>
            <PlusCircle className="mr-2 h-4 w-4" />
            新建定时查询
          </FormButton>
        </div>

        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3 text-sm text-[#1D4ED8]">
          <Clock3 className="mt-0.5 h-5 w-5 shrink-0" />
          <p>即时查询继续在 SQL 工作台执行；定时查询由调度任务引擎承载，这里只展示 `scheduled` 任务，避免旧入口再次混入手工提取任务。</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-[#E2E8F0] bg-white p-5">
            <div className="text-sm text-[#64748B]">调度总数</div>
            <div className="mt-2 text-3xl font-semibold text-[#0F172A]">{stats.total}</div>
          </div>
          <div className="rounded-3xl border border-[#E2E8F0] bg-white p-5">
            <div className="text-sm text-[#64748B]">启用中</div>
            <div className="mt-2 text-3xl font-semibold text-[#0F172A]">{stats.active}</div>
          </div>
          <div className="rounded-3xl border border-[#E2E8F0] bg-white p-5">
            <div className="text-sm text-[#64748B]">已停用</div>
            <div className="mt-2 text-3xl font-semibold text-[#0F172A]">{stats.paused}</div>
          </div>
        </div>

        <div className="mt-6">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-32 w-full rounded-3xl" />
              ))}
            </div>
          ) : tasks.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[#CBD5E1] bg-white px-6 py-12 text-center">
              <RefreshCw className="mx-auto h-10 w-10 text-[#94A3B8]" />
              <h2 className="mt-4 text-lg font-medium text-[#0F172A]">暂无定时查询</h2>
              <p className="mt-2 text-sm text-[#64748B]">可以先新建一个周期任务，把固定查询交给调度器自动执行。</p>
            </div>
          ) : (
            <div className="space-y-4">
              {tasks.map((task: ExtractionTask & { dataset_name?: string }) => (
                <article
                  key={task.id}
                  className="rounded-3xl border border-[#E2E8F0] bg-white p-6 shadow-[0_12px_40px_-24px_rgba(15,23,42,0.35)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3">
                        <h2 className="text-lg font-semibold text-[#0F172A]">{task.task_name}</h2>
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${task.is_active ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#F1F5F9] text-[#475569]'}`}>
                          {task.is_active ? '启用中' : '已停用'}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-4 text-sm text-[#64748B]">
                        <span>数据集：{task.dataset_name || `#${task.dataset_id}`}</span>
                        <span>任务类型：{task.task_type}</span>
                        <span>行数上限：{task.row_limit}</span>
                        <span>{STATUS_LABELS[task.last_run_status || 'pending'] || `最近状态：${task.last_run_status}`}</span>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col gap-2">
                      <FormButton
                        loading={executeMutation.isPending}
                        onClick={() => executeMutation.mutate(task.id)}
                      >
                        <PlayCircle className="mr-2 h-4 w-4" />
                        立即执行
                      </FormButton>
                      <FormButton
                        variant="outline"
                        loading={toggleMutation.isPending}
                        onClick={() => toggleMutation.mutate({ taskId: task.id, isActive: !task.is_active })}
                      >
                        {task.is_active ? '停用调度' : '启用调度'}
                      </FormButton>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
