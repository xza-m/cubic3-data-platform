// frontend/src/v2/pages/queries/visual/QueryVisual.tsx
//
// /queries/visual —— 查询可视化构建。
// 数据集选择 → 勾字段 / 加筛选 → SQL 预览 → 执行 / 跳转 QueryConsole。
//
// 与 QueryConsole 的关系：
//   - 本页面生成 SQL，调 POST /api/v1/queries/execute 就地展示。
//   - 若用户希望切到手写模式，"在查询控制台打开"会通过 sessionStorage
//     `v2:queryVisual:pendingPrefill` 透传 SQL + source_id，QueryConsole 的
//     useEffect 在 mount 时读取并回填（读完即清）。

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Play } from 'lucide-react'
import { useDatasets, useDataset } from '@v2/hooks/datasets'
import { useExecuteQuery, useSubmitExport } from '@v2/hooks/queries'
import type { QueryRunResult } from '@v2/api/queries'
import { useToast } from '@v2/components/ui'
import { t } from '@v2/i18n'
import { FieldTree } from './FieldTree'
import { FilterPanel } from './FilterPanel'
import { SqlPreview } from './SqlPreview'
import { buildSql } from './buildSql'
import { emptyDraft, type QueryDraft } from './types'

/** sessionStorage key — 与 QueryConsole 约定；读完即清。 */
export const V2_QUERY_VISUAL_PREFILL_KEY = 'v2:queryVisual:pendingPrefill'

export default function QueryVisual() {
  const navigate = useNavigate()
  const toast = useToast()

  // Dataset list — 选择器用
  const datasetsQ = useDatasets({ page: 1, page_size: 200 })
  const datasetList = useMemo(
    () => (Array.isArray(datasetsQ.data?.items) ? datasetsQ.data!.items : []),
    [datasetsQ.data],
  )

  const [draft, setDraft] = useState<QueryDraft>(emptyDraft)

  // 选了数据集后，再拉字段详情（includeFields=true）
  const datasetDetailQ = useDataset(draft.datasetId ?? -1, true)
  const dataset = datasetDetailQ.data ?? null
  const fields = useMemo(() => dataset?.fields ?? [], [dataset])

  // 切换 dataset 时重置字段勾选 / 筛选
  useEffect(() => {
    setDraft((prev) => ({
      ...prev,
      selectedFields: [],
      filters: [],
      filterGroups: [],
      filterGroupLogic: 'AND',
    }))
  }, [draft.datasetId])

  // 首次进入自动选第一个 dataset，便于 smoke
  useEffect(() => {
    if (draft.datasetId == null && datasetList.length > 0) {
      setDraft((prev) => ({ ...prev, datasetId: datasetList[0].id }))
    }
  }, [datasetList, draft.datasetId])

  // SQL 生成 —— 纯函数，可放 useMemo
  const sqlResult = useMemo(() => buildSql({ dataset, draft }), [dataset, draft])

  // 执行
  const executeMut = useExecuteQuery()
  const submitExportMut = useSubmitExport()
  const [result, setResult] = useState<QueryRunResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const canRun =
    !!dataset &&
    !!dataset.source_id &&
    !!dataset.physical_table &&
    sqlResult.selectedCount >= 0 /* >=0 因为允许 SELECT * */ &&
    !executeMut.isPending

  const handleRun = async () => {
    if (!dataset || dataset.source_id == null) {
      alert(t('queryVisual.alert.noSource', '数据集未绑定数据源，无法执行'))
      return
    }
    if (!dataset.physical_table) {
      alert(t('queryVisual.alert.noTable', '数据集未绑定物理表，无法执行'))
      return
    }
    setErrorMsg(null)
    try {
      const res = await executeMut.mutateAsync({
        source_id: dataset.source_id,
        sql_query: sqlResult.sql,
        limit: draft.limit,
      })
      setResult(res)
    } catch (err) {
      setResult(null)
      setErrorMsg(err instanceof Error ? err.message : t('queryVisual.state.execFailed', '执行失败'))
    }
  }

  const handleOpenInConsole = () => {
    if (!dataset) return
    try {
      sessionStorage.setItem(
        V2_QUERY_VISUAL_PREFILL_KEY,
        JSON.stringify({
          sql: sqlResult.sql,
          source_id: dataset.source_id ?? null,
          origin: 'visual',
          created_at: Date.now(),
        }),
      )
    } catch {
      // sessionStorage 不可用则放弃，直接跳转（用户可在 console 手动粘贴）
    }
    navigate('/queries')
  }

  const handleExport = async () => {
    if (!dataset || dataset.source_id == null) {
      toast.show({
        tone: 'danger',
        title: t('queryExport.toast.noSource', '数据集未绑定数据源，无法导出'),
      })
      return
    }
    try {
      const exportRecord = await submitExportMut.mutateAsync({
        source_id: dataset.source_id,
        sql_query: sqlResult.sql,
      })
      toast.show({
        tone: 'success',
        title: t('queryExport.toast.submitted', '导出任务已提交'),
        description: t(
          'queryExport.toast.submittedDesc',
          '任务 #{id} 正在后台执行，前往"我的导出"查看进度',
          { id: String(exportRecord.id) },
        ),
      })
      navigate('/queries/exports')
    } catch (err) {
      toast.show({
        tone: 'danger',
        title: t('queryExport.toast.submitFailed', '提交导出任务失败'),
        description: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden" data-testid="v2-query-visual">
      {/* Header / toolbar */}
      <div
        className="flex flex-wrap items-center gap-3 border-b px-4 py-3"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        <div>
          <div className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
            {t('queryVisual.title', '可视化构建')}
          </div>
          <div className="text-xs" style={{ color: 'var(--text-3)' }}>
            {t(
              'queryVisual.subtitle',
              '选数据集 → 勾字段 → 加筛选 → 执行；SQL 实时预览，可切换到查询控制台手工精修。',
            )}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="text-xs" style={{ color: 'var(--text-3)' }} htmlFor="v2-query-visual-limit">
            LIMIT
          </label>
          <input
            id="v2-query-visual-limit"
            data-testid="v2-query-visual-limit"
            type="number"
            min={1}
            max={10000}
            value={draft.limit}
            onChange={(e) =>
              setDraft((prev) => ({
                ...prev,
                limit: Number.parseInt(e.target.value, 10) || 1000,
              }))
            }
            className="w-20 rounded border bg-transparent px-2 py-1 text-xs"
            style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
          />
          <button
            type="button"
            onClick={handleRun}
            disabled={!canRun}
            data-testid="v2-query-visual-run"
            className="flex items-center gap-1.5 rounded-md bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
          >
            {executeMut.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Play className="h-3 w-3" />
            )}
            {t('queryVisual.action.run', '执行')}
          </button>
        </div>
      </div>

      {/* Body grid */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left: dataset and FieldTree */}
        <div
          className="flex w-72 flex-shrink-0 flex-col border-r"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
        >
          <div className="border-b p-3" style={{ borderColor: 'var(--border)' }}>
            <label
              className="mb-1.5 block text-xs font-semibold"
              style={{ color: 'var(--text-1)' }}
              htmlFor="v2-query-visual-dataset"
            >
              {t('queryVisual.dataset.label', '数据集')}
            </label>
            <select
              id="v2-query-visual-dataset"
              data-testid="v2-query-visual-dataset-select"
              value={draft.datasetId ?? ''}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  datasetId: e.target.value ? Number(e.target.value) : null,
                }))
              }
              className="w-full rounded border bg-transparent px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[color:var(--accent)]"
              style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
            >
              {datasetsQ.isLoading ? (
                <option value="">{t('queryVisual.dataset.loading', '加载中…')}</option>
              ) : datasetList.length === 0 ? (
                <option value="">{t('queryVisual.dataset.empty', '无可用数据集')}</option>
              ) : (
                <>
                  <option value="">{t('queryVisual.dataset.placeholder', '选择数据集…')}</option>
                  {datasetList.map((ds) => (
                    <option key={ds.id} value={ds.id}>
                      {ds.dataset_name} · {ds.physical_table ?? '—'}
                    </option>
                  ))}
                </>
              )}
            </select>
            <div className="mt-2 min-h-8 text-[11px]" style={{ color: 'var(--text-3)' }}>
              {dataset ? (
                <>
                  <div className="truncate font-medium" style={{ color: 'var(--text-2)' }}>
                    {dataset.dataset_name}
                  </div>
                  <div className="truncate font-mono">
                    {dataset.physical_table ??
                      t('queryVisual.dataset.noPhysicalTable', '未绑定物理表')}
                  </div>
                </>
              ) : (
                t('queryVisual.dataset.pickFromTree', '先选数据集，再在下方勾选字段。')
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1">
            {datasetDetailQ.isFetching && fields.length === 0 ? (
              <div
                className="flex h-full items-center justify-center text-xs"
                style={{ color: 'var(--text-3)' }}
              >
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                {t('queryVisual.state.loadingFields', '加载字段中…')}
              </div>
            ) : (
              <FieldTree
                fields={fields}
                selected={draft.selectedFields}
                onSelectedChange={(next) =>
                  setDraft((prev) => ({ ...prev, selectedFields: next }))
                }
                disabled={!dataset}
              />
            )}
          </div>
        </div>

        {/* Right stack: filters (top) + SQL preview (middle) + result table (bottom) */}
        <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-auto p-4">
          <FilterPanel
            fields={fields}
            groups={draft.filterGroups ?? []}
            groupLogic={draft.filterGroupLogic ?? 'AND'}
            onGroupsChange={(next) =>
              setDraft((prev) => ({ ...prev, filters: [], filterGroups: next }))
            }
            onGroupLogicChange={(next) =>
              setDraft((prev) => ({ ...prev, filterGroupLogic: next }))
            }
            disabled={!dataset}
          />

          <div className="min-h-[200px] flex-shrink-0">
            <SqlPreview
              sql={sqlResult.sql}
              issues={sqlResult.issues}
              onOpenInConsole={handleOpenInConsole}
              onExport={handleExport}
              exportPending={submitExportMut.isPending}
              disabled={!dataset}
            />
          </div>

          {/* Result area */}
          <div
            className="flex-1 overflow-auto rounded border"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
            data-testid="v2-query-visual-result"
          >
            {executeMut.isPending ? (
              <div
                className="flex h-full items-center justify-center gap-2 py-8 text-xs"
                style={{ color: 'var(--text-3)' }}
              >
                <Loader2 className="h-3 w-3 animate-spin" />
                {t('queryVisual.state.executing', '执行中…')}
              </div>
            ) : errorMsg ? (
              <div className="flex h-full items-center justify-center px-6 py-8 text-center text-xs text-red-500 dark:text-red-400">
                {errorMsg}
              </div>
            ) : result ? (
              <MiniResultTable columns={result.columns} rows={result.data} />
            ) : (
              <div
                className="flex h-full items-center justify-center py-8 text-xs"
                style={{ color: 'var(--text-3)' }}
              >
                {t('queryVisual.state.idle', '调整筛选后点右上角「执行」；结果将展示在此。')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 内部简化结果表 ──────────────────────────────────────────────────────────

function MiniResultTable({
  columns,
  rows,
}: {
  columns: string[]
  rows: Record<string, unknown>[]
}) {
  return (
    <div className="h-full overflow-auto">
      <table className="w-full border-collapse text-xs" data-testid="v2-query-visual-result-table">
        <thead
          className="sticky top-0"
          style={{
            background: 'color-mix(in srgb, var(--accent) 9%, var(--bg-surface))',
            color: 'var(--text-1)',
          }}
        >
          <tr>
            {columns.map((c) => (
              <th
                key={c}
                className="border-b px-3 py-2 text-left font-semibold"
                style={{
                  borderColor: 'color-mix(in srgb, var(--accent) 28%, var(--border))',
                }}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length || 1}
                className="px-3 py-6 text-center"
                style={{ color: 'var(--text-3)' }}
              >
                {t('queryVisual.result.empty', '无返回行')}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={i}
                style={{ borderBottom: '1px solid var(--border)' }}
                className="transition-colors hover:bg-[color:var(--bg-hover)]"
              >
                {columns.map((c) => {
                  const v = row[c]
                  return (
                    <td
                      key={c}
                      className="max-w-xs truncate px-3 py-2"
                      style={{ color: 'var(--text-1)' }}
                    >
                      {v == null ? (
                        <span style={{ color: 'var(--text-4)' }}>NULL</span>
                      ) : typeof v === 'object' ? (
                        <code className="text-xs">{JSON.stringify(v)}</code>
                      ) : (
                        String(v)
                      )}
                    </td>
                  )
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
