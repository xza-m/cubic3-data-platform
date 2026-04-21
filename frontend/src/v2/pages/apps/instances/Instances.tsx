// frontend/src/v2/pages/apps/instances/Instances.tsx
//
// 应用实例列表页（L0）。
// 接口：GET /api/v1/app-instances
// B-back-2: health 列暂不展示，待后端上线 — see plan §3.4

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, RefreshCcw } from 'lucide-react'
import { t } from '@v2/i18n'
import { fmtRelative } from '@v2/lib/format'
import { useInstances, useEnableInstance, useDisableInstance } from '@v2/hooks/instances'
import { InstanceStatusChip, ExecStatusChip, scheduleLabel, InstancePeekContent } from '../_shared/instance-content'
import type { AppInstance } from '@v2/api/instances'

// ============================================================================
// Peek 面板（内联，待 X-Crosscut PeekPanel 接入后可迁移）
// ============================================================================

function PeekPanel({
  instance,
  onClose,
  onDetail,
}: {
  instance: AppInstance
  onClose: () => void
  onDetail: () => void
}) {
  return (
    <div
      className="flex w-72 shrink-0 flex-col border-l"
      style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
    >
      <div
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
            {instance.name}
          </div>
          <div className="text-xs" style={{ color: 'var(--text-3)' }}>
            <code>{instance.app_code}</code>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-ghost ml-2 shrink-0"
          onClick={onClose}
          aria-label={t('action.close', '关闭')}
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        <InstancePeekContent instance={instance} />
      </div>
      <div
        className="flex gap-2 border-t p-3"
        style={{ borderColor: 'var(--border)' }}
      >
        <button type="button" className="btn btn-sm btn-primary flex-1" onClick={onDetail}>
          {t('action.view_detail', '查看详情')}
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// 主页面
// ============================================================================

export default function Instances() {
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')
  const [peek, setPeek] = useState<AppInstance | null>(null)

  const { data: page, isLoading, isError, refetch, isFetching } = useInstances({
    page: 1,
    page_size: 50,
  })
  const instances = page?.items ?? []

  const enableMut = useEnableInstance()
  const disableMut = useDisableInstance()

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    if (!q) return instances
    return instances.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.app_code.toLowerCase().includes(q) ||
        (i.owner ?? '').toLowerCase().includes(q),
    )
  }, [instances, keyword])

  return (
    <div className="flex flex-1 overflow-hidden p-4">
      <div
        className="flex flex-1 flex-col overflow-hidden rounded-md border"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
            {t('instances.title', '应用实例')}
          </span>
          <div className="flex items-center gap-2">
            <input
              className="rounded border px-2 py-1 text-xs outline-none focus:ring-1"
              style={{
                background: 'var(--bg-surface-2)',
                borderColor: 'var(--border)',
                color: 'var(--text-1)',
                width: 200,
              }}
              placeholder={t('instances.search_placeholder', '按名称 / 应用 / 所有者搜索…')}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => refetch()}
            >
              <RefreshCcw size={12} className={isFetching ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => navigate('/apps/instances/new')}
            >
              <Plus size={12} />
              {t('instances.create', '创建实例')}
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-auto">
            {isLoading && (
              <div
                className="flex items-center justify-center py-12 text-xs"
                style={{ color: 'var(--text-3)' }}
              >
                {t('state.loading', '加载中…')}
              </div>
            )}

            {isError && !isLoading && (
              <div className="flex flex-col items-center gap-3 py-12">
                <p className="text-xs" style={{ color: 'var(--danger)' }}>
                  {t('state.load_error', '加载失败')}
                </p>
                <button type="button" className="btn btn-sm" onClick={() => refetch()}>
                  {t('action.retry', '重试')}
                </button>
              </div>
            )}

            {!isLoading && !isError && (
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: 'var(--bg-surface-2)', color: 'var(--text-3)' }}>
                    <th className="px-4 py-2 text-left font-normal">
                      {t('instance.field.name', '实例名称')}
                    </th>
                    <th className="px-4 py-2 text-left font-normal">
                      {t('instance.field.app_code', '应用')}
                    </th>
                    <th className="px-4 py-2 text-left font-normal">
                      {t('instance.field.status', '状态')}
                    </th>
                    {/* B-back-2: health 列暂不展示
                        TODO(B-back-2): 后端 health 字段上线后在此处增加 health 列 */}
                    <th className="px-4 py-2 text-left font-normal">
                      {t('instance.field.schedule', '调度')}
                    </th>
                    <th className="px-4 py-2 text-left font-normal">
                      {t('instance.field.owner', '所有者')}
                    </th>
                    <th className="px-4 py-2 text-left font-normal">
                      {t('instance.field.last_exec', '最近执行')}
                    </th>
                    <th className="px-4 py-2 text-left font-normal">
                      {t('instance.field.last_status', '最近状态')}
                    </th>
                    <th className="px-4 py-2 text-right font-normal">
                      {t('column.actions', '操作')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((inst) => (
                    <tr
                      key={inst.id}
                      className="cursor-pointer border-t transition-colors hover:bg-[color:var(--bg-hover)]"
                      style={{
                        borderColor: 'var(--border)',
                        background: peek?.id === inst.id ? 'var(--accent-soft)' : undefined,
                      }}
                      onClick={() => setPeek(inst.id === peek?.id ? null : inst)}
                    >
                      <td className="px-4 py-2 font-medium" style={{ color: 'var(--text-1)' }}>
                        {inst.name}
                      </td>
                      <td className="px-4 py-2">
                        <code>{inst.app_code}</code>
                      </td>
                      <td className="px-4 py-2">
                        <InstanceStatusChip enabled={inst.enabled} />
                      </td>
                      <td className="px-4 py-2" style={{ color: 'var(--text-3)' }}>
                        {scheduleLabel(inst.schedule_type)}
                      </td>
                      <td className="px-4 py-2" style={{ color: 'var(--text-3)' }}>
                        {inst.owner}
                      </td>
                      <td className="px-4 py-2" style={{ color: 'var(--text-3)' }}>
                        {inst.last_execution_at ? fmtRelative(inst.last_execution_at) : '-'}
                      </td>
                      <td className="px-4 py-2">
                        {inst.last_execution_status ? (
                          <ExecStatusChip status={inst.last_execution_status} />
                        ) : (
                          <span style={{ color: 'var(--text-3)' }}>-</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {inst.enabled ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-ghost"
                              disabled={disableMut.isPending}
                              onClick={(e) => {
                                e.stopPropagation()
                                disableMut.mutate(inst.id)
                              }}
                            >
                              {t('action.disable', '停止')}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              disabled={enableMut.isPending}
                              onClick={(e) => {
                                e.stopPropagation()
                                enableMut.mutate(inst.id)
                              }}
                            >
                              {t('action.enable', '启用')}
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(`/apps/instances/${inst.id}`)
                            }}
                          >
                            {t('action.detail', '详情')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td
                        colSpan={8}
                        className="py-10 text-center text-xs"
                        style={{ color: 'var(--text-3)' }}
                      >
                        {t('state.empty', '暂无实例')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Peek panel */}
          {peek && (
            <PeekPanel
              instance={peek}
              onClose={() => setPeek(null)}
              onDetail={() => navigate(`/apps/instances/${peek.id}`)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
