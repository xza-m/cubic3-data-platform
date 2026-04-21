// frontend/src/v2/pages/data/DatasetCreate.tsx
//
// 注册数据集（/datasets/new）。多步向导：
//   Step 0 选择源  →  Step 1 选择表（物理）/ 上传文件（文件）  →  Step 2 字段确认 + 命名  →  Step 3 完成
// 对接：
//   POST /api/v1/data-center/datasets (create)
//   POST /api/v1/data-center/datasets/preview (fetch schema preview)
//   GET  /api/v1/data-center/datasources (source selector)

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, FileUp, Table } from 'lucide-react'
import { useCreateDataset, usePreviewDataset } from '@v2/hooks/datasets'
import { useDatasources } from '@v2/hooks/datasources'
import type { DatasetField } from '@v2/api/datasets'
// import { t } from '@v2/i18n'  // TODO: pending X-Crosscut delivery

// X-Crosscut 提供（编译错误留待 Phase 3 修复）
import { useAppShell } from '@v2/layout/AppShell'

type Mode = 'choose' | 'physical' | 'file'

const STEPS_PHYSICAL = ['选择数据源', '选择表', '字段确认', '完成']
const STEPS_FILE      = ['上传文件', '解析预览', '字段映射', '完成']

export default function DatasetCreate() {
  const navigate = useNavigate()
  const { setBreadcrumbs, setTopBarActions } = useAppShell()
  const createDataset = useCreateDataset()
  const previewDataset = usePreviewDataset()
  const { data: sourcesData } = useDatasources({ page: 1, page_size: 100 })

  const [mode, setMode] = useState<Mode>('choose')
  const [step, setStep] = useState(0)
  const [sourceId, setSourceId] = useState<number | null>(null)
  const [database, setDatabase] = useState('')
  const [table, setTable] = useState('')
  const [datasetName, setDatasetName] = useState('')
  const [owner, setOwner] = useState('')
  const [previewFields, setPreviewFields] = useState<DatasetField[]>([])
  const [, setDone] = useState(false)

  const steps = mode === 'file' ? STEPS_FILE : STEPS_PHYSICAL
  const sources = sourcesData?.items ?? []

  useEffect(() => {
    setBreadcrumbs(['数据', '数据集', '注册'])
    setTopBarActions(
      <button
        type="button"
        onClick={() => navigate('/data-center/datasets')}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs"
        style={{ color: 'var(--text-2)' }}
      >
        <ArrowLeft size={12} /> 返回列表
      </button>,
    )
    return () => setTopBarActions(null)
  }, [setBreadcrumbs, setTopBarActions, navigate])

  // 拉取预览 schema
  const handlePreview = async () => {
    if (!sourceId || !database || !table) return
    try {
      const result = await previewDataset.mutateAsync({ datasource_id: sourceId, database, table })
      // result.columns 转换为 DatasetField[]
      const fields: DatasetField[] = (result.columns ?? []).map((col: string) => ({
        physical_name: col,
        data_type: 'VARCHAR',
        display_name: null,
        business_type: 'dimension',
        sensitivity_level: 'public',
        is_sensitive: false,
        mask_rule: null,
        comment: null,
        field_order: 0,
      }))
      setPreviewFields(fields)
      setDatasetName(table)
      setStep(2)
    } catch {
      // error displayed inline
    }
  }

  const handleSubmit = async () => {
    if (!sourceId || !table || !datasetName) return
    try {
      await createDataset.mutateAsync({
        dataset_name: datasetName,
        source_id: sourceId,
        physical_table: `${database}.${table}`,
        fields: previewFields,
        owner: owner || undefined,
        dataset_type: 'physical',
      })
      setDone(true)
      setStep(3)
    } catch {
      // error displayed inline
    }
  }

  if (mode === 'choose') {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="grid w-full max-w-2xl grid-cols-2 gap-4">
          <ModeCard
            icon={<Table size={24} style={{ color: 'var(--accent)' }} />}
            title="从已接入的库表注册"
            description="从 MaxCompute / MySQL / PG 等数据源选择物理表"
            onClick={() => setMode('physical')}
          />
          <ModeCard
            icon={<FileUp size={24} style={{ color: 'var(--violet)' }} />}
            title="从文件上传注册"
            description="支持 CSV / Excel，自动推断 schema"
            onClick={() => setMode('file')}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden p-4">
      <div
        className="flex flex-1 flex-col overflow-hidden rounded-lg border"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
      >
        {/* 步进器头部 */}
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <span className="text-xs font-medium" style={{ color: 'var(--text-1)' }}>
            {mode === 'physical' ? '从库表注册数据集' : '从文件注册数据集'}
          </span>
          <ol className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-3)' }}>
            {steps.map((s, i) => (
              <li key={s} className="flex items-center gap-2">
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full text-[10px]"
                  style={{
                    background: i <= step ? 'var(--accent)' : 'var(--bg-surface-2)',
                    color: i <= step ? 'var(--on-accent)' : 'var(--text-3)',
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ color: i === step ? 'var(--text-1)' : undefined }}>{s}</span>
                {i < steps.length - 1 ? <ArrowRight size={10} /> : null}
              </li>
            ))}
          </ol>
        </div>

        {/* 步骤内容 */}
        <div className="flex-1 overflow-auto p-4">
          {mode === 'physical' && step === 0 && (
            <div className="space-y-3">
              <Field label="选择数据源">
                <select
                  value={sourceId ?? ''}
                  onChange={(e) => setSourceId(Number(e.target.value))}
                  style={inputStyle}
                >
                  <option value="">请选择…</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.source_type})
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}

          {mode === 'physical' && step === 1 && (
            <div className="space-y-3">
              <Field label="数据库">
                <input
                  value={database}
                  onChange={(e) => setDatabase(e.target.value)}
                  placeholder="如 default"
                  style={inputStyle}
                />
              </Field>
              <Field label="表名">
                <input
                  value={table}
                  onChange={(e) => setTable(e.target.value)}
                  placeholder="如 dwd_order_df"
                  style={inputStyle}
                />
              </Field>
              {previewDataset.isError && (
                <p className="text-xs" style={{ color: 'var(--danger)' }}>
                  {previewDataset.error instanceof Error ? previewDataset.error.message : '预览失败'}
                </p>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <Field label="数据集名称">
                <input value={datasetName} onChange={(e) => setDatasetName(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="负责人">
                <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="可选" style={inputStyle} />
              </Field>
              {previewFields.length > 0 && (
                <div>
                  <p className="mb-1 text-[11px]" style={{ color: 'var(--text-3)' }}>
                    字段预览（{previewFields.length} 个）
                  </p>
                  <div className="max-h-64 overflow-auto rounded-md border" style={{ borderColor: 'var(--border)' }}>
                    {previewFields.slice(0, 20).map((f) => (
                      <div
                        key={f.physical_name}
                        className="flex items-center gap-3 border-b px-3 py-1.5 text-xs"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        <code style={{ color: 'var(--text-1)', flex: 1 }}>{f.physical_name}</code>
                        <span style={{ color: 'var(--text-3)' }}>{f.data_type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-full"
                style={{ background: 'var(--success-soft)', color: 'var(--success)' }}
              >
                <Check size={24} />
              </div>
              <div className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
                注册成功
              </div>
              <p className="max-w-sm text-xs" style={{ color: 'var(--text-3)' }}>
                <strong>{datasetName}</strong> 已成功注册为数据集。
              </p>
              <button
                type="button"
                onClick={() => navigate('/data-center/datasets')}
                className="rounded-md px-4 py-2 text-xs font-medium"
                style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
              >
                返回数据集列表
              </button>
            </div>
          )}

          {mode === 'file' && step < 3 && (
            <div className="flex items-center justify-center py-12">
              <div
                className="rounded-lg border-2 border-dashed p-8 text-center"
                style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}
              >
                <FileUp size={24} className="mx-auto mb-2" />
                <p className="text-xs">文件上传功能开发中</p>
              </div>
            </div>
          )}
        </div>

        {/* 底部导航 */}
        {step < 3 && (
          <div
            className="flex items-center justify-end gap-2 border-t px-4 py-3"
            style={{ borderColor: 'var(--border)' }}
          >
            <button
              type="button"
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              className="rounded-md border px-4 py-2 text-xs"
              style={{ borderColor: 'var(--border)', color: 'var(--text-2)', opacity: step === 0 ? 0.5 : 1 }}
            >
              上一步
            </button>
            {step < steps.length - 1 ? (
              <button
                type="button"
                onClick={() => {
                  if (mode === 'physical' && step === 1) {
                    handlePreview()
                  } else {
                    setStep((s) => s + 1)
                  }
                }}
                disabled={previewDataset.isPending}
                className="inline-flex items-center gap-1 rounded-md px-4 py-2 text-xs font-medium"
                style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
              >
                {previewDataset.isPending ? '加载中…' : '下一步'} <ArrowRight size={12} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={createDataset.isPending || !datasetName}
                className="rounded-md px-4 py-2 text-xs font-medium"
                style={{
                  background: 'var(--accent)',
                  color: 'var(--on-accent)',
                  opacity: createDataset.isPending || !datasetName ? 0.6 : 1,
                }}
              >
                {createDataset.isPending ? '注册中…' : '完成注册'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── 内部辅助 ──────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--bg-surface)',
  color: 'var(--text-1)',
  padding: '6px 10px',
  fontSize: 12,
}

function ModeCard({ icon, title, description, onClick }: { icon: React.ReactNode; title: string; description: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border p-6 text-left"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
    >
      {icon}
      <div className="mt-3 text-sm font-medium" style={{ color: 'var(--text-1)' }}>{title}</div>
      <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>{description}</p>
    </button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-3">
      <div className="pt-1.5 text-xs" style={{ color: 'var(--text-3)' }}>{label}</div>
      <div>{children}</div>
    </div>
  )
}
