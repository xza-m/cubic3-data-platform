// frontend/src/v2/pages/semantic/ontology/Metrics.tsx
//
// 指标列表页。
// 接口：GET /api/v1/ontology/metrics
//       POST /api/v1/ontology/metrics
//
// B-back-6: 全局搜索上线前，本地 filter

import { lazy, Suspense, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, ChevronDown, ChevronRight, Loader2, Play, Plus, Search, X } from 'lucide-react'
// 等待 X-Crosscut：@v2/components/ui
import { Button, Chip, Input } from '@v2/components/ui'
// 等待 X-Crosscut：@v2/components/ResourceListPage
import { ResourceListPage } from '@v2/components/ResourceListPage'
// 等待 X-Crosscut：@v2/components/EntityFormDialog
import { EntityFormDialog } from '@v2/components/EntityFormDialog'
// 等待 X-Crosscut：@v2/i18n
import { t } from '@v2/i18n'
import { useMetricList, useCreateMetric } from '@v2/hooks/ontology'
import { useDryRunMetric } from '@v2/hooks/semantic'
import type { MetricDryRunResult } from '@v2/api/semantic'

// Monaco editor: lazy import（规范 §01 §7 性能预算）
const MonacoEditor = lazy(() => import('@monaco-editor/react'))

export default function OntologyMetrics() {
  const navigate = useNavigate()
  // TODO(B-back-6): 后端搜索上线后改为 API 参数 filter
  const [keyword, setKeyword] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [dryRunMetricName, setDryRunMetricName] = useState<string | null>(null)
  const [dryRunFormula, setDryRunFormula] = useState('')

  const metricsQuery = useMetricList()
  const items = metricsQuery.data?.items ?? []
  const create = useCreateMetric()
  const dryRun = useDryRunMetric()

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    if (!q) return items
    return items.filter((m) =>
      `${m.name} ${m.title ?? ''} ${m.semantic_labels?.join(' ') ?? ''}`.toLowerCase().includes(q),
    )
  }, [items, keyword])

  const handleCreate = async (data: Record<string, string>) => {
    await create.mutateAsync({
      name: data.name,
      title: data.title || undefined,
      description: data.description || undefined,
      object_name: data.object_name,
      semantic_formula: data.semantic_formula || undefined,
      semantic_labels: data.semantic_labels
        ? data.semantic_labels.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined,
    })
    setShowCreate(false)
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ResourceListPage
        title={t('ontology.metrics.title', '指标')}
        total={filtered.length}
        loading={metricsQuery.isLoading}
        error={metricsQuery.isError}
        actions={
          <div className="flex items-center gap-2">
            {/* TODO(B-back-6): 改为 API 全文搜索 */}
            <div className="relative">
              <Search
                size={12}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-3"
                aria-hidden
              />
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder={t('ontology.metrics.search', '搜索指标…')}
                className="w-48 pl-7"
                aria-label={t('ontology.metrics.searchLabel', '搜索指标')}
              />
            </div>
            <Button size="sm" variant="primary" onClick={() => setShowCreate(true)}>
              <Plus size={12} /> {t('ontology.metrics.create', '新建指标')}
            </Button>
          </div>
        }
        emptyText={t('ontology.metrics.empty', '尚无指标定义')}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <Th>{t('col.name', '名称')}</Th>
              <Th>{t('col.object', '所属对象')}</Th>
              {/* drop-frontend: BusinessMetric has no metric_type — substitute with semantic_labels */}
              <Th>{t('ontology.metrics.labels', '语义标签')}</Th>
              <Th>{t('col.expression', '表达式')}</Th>
              <Th>{t('col.status', '状态')}</Th>
              <Th>{t('col.actions', '操作')}</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <MetricRow
                key={m.name}
                m={m}
                isOpen={dryRunMetricName === m.name}
                dryRunFormula={dryRunFormula}
                dryRun={dryRun}
                onNavigate={() => navigate(`/semantic/ontology/objects/${m.object_name}`)}
                onToggleDryRun={() => {
                  if (dryRunMetricName === m.name) {
                    setDryRunMetricName(null)
                  } else {
                    setDryRunMetricName(m.name)
                    setDryRunFormula(m.semantic_formula ?? '')
                    dryRun.reset()
                  }
                }}
                onFormulaChange={setDryRunFormula}
                onClose={() => setDryRunMetricName(null)}
              />
            ))}
          </tbody>
        </table>
      </ResourceListPage>

      <EntityFormDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title={t('ontology.metrics.createTitle', '新建指标')}
        loading={create.isPending}
        onSubmit={handleCreate}
        fields={[
          { key: 'name', label: t('objectCreate.name', '标识符（英文）'), required: true },
          { key: 'title', label: t('objectCreate.title', '显示名称') },
          { key: 'object_name', label: t('ontology.metrics.objectName', '所属对象'), required: true },
          { key: 'semantic_formula', label: t('ontology.metrics.expression', '语义公式') },
          { key: 'semantic_labels', label: t('ontology.metrics.labels', '语义标签（逗号分隔）') },
          { key: 'description', label: t('objectCreate.description', '描述'), type: 'textarea' },
        ]}
      />
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left text-xs font-medium text-3">{children}</th>
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 text-2">{children}</td>
}

// ─── MetricRow: 单行 + 内联 dry-run 展开行 ────────────────────────────────────

import type { BusinessMetric } from '@v2/api/ontology'

function MetricRow({
  m,
  isOpen,
  dryRunFormula,
  dryRun,
  onNavigate,
  onToggleDryRun,
  onFormulaChange,
  onClose,
}: {
  m: BusinessMetric
  isOpen: boolean
  dryRunFormula: string
  dryRun: DryRunMutation
  onNavigate: () => void
  onToggleDryRun: () => void
  onFormulaChange: (f: string) => void
  onClose: () => void
}) {
  return (
    <>
      <tr className="cursor-pointer transition hover:bg-hover" onClick={onNavigate}>
        <Td>
          <div className="font-medium text-1">{m.title || m.name}</div>
          <div className="font-mono text-xs text-3">{m.name}</div>
        </Td>
        <Td>{m.object_name}</Td>
        <Td>
          {m.semantic_labels?.length
            ? m.semantic_labels.map((l) => (
                <Chip key={l} tone="neutral" className="mr-1">
                  {l}
                </Chip>
              ))
            : '—'}
        </Td>
        <Td>
          <code className="rounded px-1 text-xs" style={{ background: 'var(--bg-hover)' }}>
            {m.semantic_formula || '—'}
          </code>
        </Td>
        <Td>
          <StatusChip status={m.status} />
        </Td>
        <Td>
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation()
              onToggleDryRun()
            }}
          >
            {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {t('metric.dryRun', '预览')}
          </Button>
        </Td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={6} className="px-0 py-0">
            <MetricDryRunPanel
              metricName={m.name}
              formula={dryRunFormula}
              onFormulaChange={onFormulaChange}
              dryRunMutation={dryRun}
              onClose={onClose}
            />
          </td>
        </tr>
      )}
    </>
  )
}

function StatusChip({ status }: { status: string }) {
  if (status === 'active') return <Chip tone="success">{t('status.active', '已发布')}</Chip>
  if (status === 'deprecated') return <Chip tone="danger">{t('status.deprecated', '已废弃')}</Chip>
  return <Chip tone="neutral">{t('status.draft', '草稿')}</Chip>
}

// ─── P5: 指标公式 dry-run 面板 ────────────────────────────────────────────────

interface DryRunMutation {
  mutateAsync: (args: { name: string; formula: string }) => Promise<MetricDryRunResult>
  isPending: boolean
  data?: MetricDryRunResult
  reset: () => void
}

function MetricDryRunPanel({
  metricName,
  formula,
  onFormulaChange,
  dryRunMutation,
  onClose,
}: {
  metricName: string
  formula: string
  onFormulaChange: (f: string) => void
  dryRunMutation: DryRunMutation
  onClose: () => void
}) {
  const result = dryRunMutation.data

  return (
    <div
      className="border-t border-b px-4 py-3 space-y-3"
      style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)' }}
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-1">
          {t('metric.dryRun.title', '公式预览')} · <code className="text-[11px]">{metricName}</code>
        </span>
        <button type="button" className="rail-btn" onClick={onClose} aria-label={t('action.close', '关闭')}>
          <X size={12} />
        </button>
      </div>

      {/* 公式输入 */}
      <div className="space-y-1">
        <label className="text-[11px] text-3">{t('metric.dryRun.formula', '语义公式')}</label>
        <div className="flex items-center gap-2">
          <input
            value={formula}
            onChange={(e) => onFormulaChange(e.target.value)}
            placeholder="COUNT(DISTINCT user_id)"
            className="fake-input flex-1 text-xs font-mono"
            style={{ background: 'var(--bg-surface)' }}
          />
          <Button
            size="sm"
            variant="primary"
            disabled={dryRunMutation.isPending}
            onClick={() => dryRunMutation.mutateAsync({ name: metricName, formula })}
          >
            {dryRunMutation.isPending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Play size={12} />
            )}
            {t('metric.dryRun.run', '运行')}
          </Button>
        </div>
      </div>

      {/* 结果 */}
      {result && (
        <>
          {/* 错误列表 */}
          {result.errors && result.errors.length > 0 && (
            <div className="space-y-1">
              {result.errors.map((err, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded border px-2 py-1.5 text-xs"
                  style={{ borderColor: 'var(--danger)', background: 'var(--danger-soft, rgba(239,68,68,.08))' }}
                >
                  <AlertCircle size={12} style={{ color: 'var(--danger)' }} />
                  <span className="text-2">{err.message}</span>
                  <Chip tone="danger">{err.code}</Chip>
                </div>
              ))}
            </div>
          )}

          {/* SQL 预览 */}
          {result.sql_preview && (
            <div className="space-y-1">
              <div className="text-[11px] text-3">{t('metric.dryRun.sqlPreview', 'SQL 预览')}</div>
              <div className="overflow-hidden rounded border" style={{ borderColor: 'var(--border)', height: 120 }}>
                <Suspense fallback={<div className="p-2 text-xs text-3">{t('metric.dryRun.loadingEditor', '加载编辑器…')}</div>}>
                  <MonacoEditor
                    value={result.sql_preview}
                    language="sql"
                    theme="vs-dark"
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      lineNumbers: 'off',
                      scrollBeyondLastLine: false,
                      fontSize: 12,
                      padding: { top: 6, bottom: 6 },
                    }}
                    height={120}
                  />
                </Suspense>
              </div>
            </div>
          )}

          {/* 样本数据 */}
          {result.sample_rows && result.sample_rows.length > 0 && (
            <div className="space-y-1">
              <div className="text-[11px] text-3">
                {t('metric.dryRun.sampleRows', '样本数据')} ({Math.min(result.sample_rows.length, 10)} {t('metric.dryRun.rows', '行')})
              </div>
              <div className="overflow-auto rounded border text-xs" style={{ borderColor: 'var(--border)', maxHeight: 120 }}>
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                      {Object.keys(result.sample_rows[0]).map((col) => (
                        <th key={col} className="px-2 py-1 text-left text-[11px] font-medium text-3">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.sample_rows.slice(0, 10).map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        {Object.values(row).map((val, j) => (
                          <td key={j} className="px-2 py-1 text-2">
                            {String(val)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
