// frontend/src/v2/pages/data/DatasetCreate.tsx
//
// 登记数据资产（/data-center/assets/register）。多步向导：
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
import { datasourceTypeLabel } from '@v2/lib/datasourceTypes'
import { t } from '@v2/i18n'

// X-Crosscut 提供（编译错误留待 Phase 3 修复）
import { useAppShell } from '@v2/layout/AppShell'

type Mode = 'choose' | 'physical' | 'file'

function stepsPhysical() {
  return [
    t('datasetCreate.step.pickSource', '选择连接'),
    t('datasetCreate.step.pickTable', '选择表'),
    t('datasetCreate.step.confirmFields', '字段确认'),
    t('datasetCreate.step.done', '完成'),
  ]
}

function stepsFile() {
  return [
    t('datasetCreate.step.upload', '上传文件'),
    t('datasetCreate.step.parsePreview', '解析预览'),
    t('datasetCreate.step.fieldMapping', '字段映射'),
    t('datasetCreate.step.done', '完成'),
  ]
}

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

  const steps = mode === 'file' ? stepsFile() : stepsPhysical()
  const sources = sourcesData?.items ?? []

  useEffect(() => {
    setBreadcrumbs([
      t('datasetCreate.breadcrumb.data', '数据'),
      t('datasetCreate.breadcrumb.datasets', '资产目录'),
      t('datasetCreate.breadcrumb.register', '登记'),
    ])
    setTopBarActions(
      <button
        type="button"
        onClick={() => navigate('/data-center/assets')}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs"
        style={{ color: 'var(--text-2)' }}
      >
        <ArrowLeft size={12} /> {t('datasetCreate.action.back', '返回列表')}
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
        <div className="w-full max-w-2xl">
          <div className="mb-5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-3">
              {t('datasetCreate.eyebrow', '数据资产登记')}
            </p>
            <h1 className="mt-1 text-[20px] font-semibold text-1">
              {t('datasetCreate.title', '登记数据资产')}
            </h1>
            <p className="mt-1 text-[12px] leading-5 text-2">
              {t('datasetCreate.desc', '选择物理表或文件作为事实源，补齐字段与负责人信息后沉淀到资产目录。')}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ModeCard
              icon={<Table size={24} style={{ color: 'var(--accent)' }} />}
              title={t('datasetCreate.mode.physicalTitle', '从已接入的库表登记')}
              description={t('datasetCreate.mode.physicalDesc', '从 MaxCompute / MySQL / PG 等连接选择物理表')}
              onClick={() => setMode('physical')}
            />
            <ModeCard
              icon={<FileUp size={24} style={{ color: 'var(--violet)' }} />}
              title={t('datasetCreate.mode.fileTitle', '从文件上传登记')}
              description={t('datasetCreate.mode.fileDesc', '支持 CSV / Excel，自动推断 schema')}
              onClick={() => setMode('file')}
            />
          </div>
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
            {mode === 'physical'
              ? t('datasetCreate.title.physical', '从库表登记数据资产')
              : t('datasetCreate.title.file', '从文件登记数据资产')}
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
              <Field label={t('datasetCreate.field.source', '选择连接')}>
                <select
                  value={sourceId ?? ''}
                  onChange={(e) => setSourceId(Number(e.target.value))}
                  style={inputStyle}
                >
                  <option value="">{t('datasetCreate.field.pickPlaceholder', '请选择…')}</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({datasourceTypeLabel(s.source_type)})
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}

          {mode === 'physical' && step === 1 && (
            <div className="space-y-3">
              <Field label={t('datasetCreate.field.database', '数据库')}>
                <input
                  value={database}
                  onChange={(e) => setDatabase(e.target.value)}
                  placeholder={t('datasetCreate.placeholder.database', '如 default')}
                  style={inputStyle}
                />
              </Field>
              <Field label={t('datasetCreate.field.table', '表名')}>
                <input
                  value={table}
                  onChange={(e) => setTable(e.target.value)}
                  placeholder={t('datasetCreate.placeholder.table', '如 dwd_order_df')}
                  style={inputStyle}
                />
              </Field>
              {previewDataset.isError && (
                <p className="text-xs" style={{ color: 'var(--danger)' }}>
                  {previewDataset.error instanceof Error
                    ? previewDataset.error.message
                    : t('datasetCreate.state.previewFailed', '预览失败')}
                </p>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <Field label={t('datasetCreate.field.datasetName', '数据资产名称')}>
                <input value={datasetName} onChange={(e) => setDatasetName(e.target.value)} style={inputStyle} />
              </Field>
              <Field label={t('datasetCreate.field.owner', '负责人')}>
                <input
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  placeholder={t('datasetCreate.placeholder.optional', '可选')}
                  style={inputStyle}
                />
              </Field>
              {previewFields.length > 0 && (
                <div>
                  <p className="mb-1 text-[11px]" style={{ color: 'var(--text-3)' }}>
                    {t('datasetCreate.preview.fields', '字段预览（{n} 个）', { n: previewFields.length })}
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
                {t('datasetCreate.done.title', '注册成功')}
              </div>
              <p className="max-w-sm text-xs" style={{ color: 'var(--text-3)' }}>
                <strong>{datasetName}</strong>{' '}
                {t('datasetCreate.done.descSuffix', '已成功登记为数据资产。')}
              </p>
              <button
                type="button"
                onClick={() => navigate('/data-center/assets')}
                className="rounded-md px-4 py-2 text-xs font-medium"
                style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
              >
                {t('datasetCreate.done.backToList', '返回资产目录')}
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
                <p className="text-xs">
                  {t('datasetCreate.file.wip', '文件上传功能开发中')}
                </p>
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
              {t('datasetCreate.action.prev', '上一步')}
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
                {previewDataset.isPending
                  ? t('datasetCreate.action.loading', '加载中…')
                  : t('datasetCreate.action.next', '下一步')}{' '}
                <ArrowRight size={12} />
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
                {createDataset.isPending
                  ? t('datasetCreate.action.submitting', '注册中…')
                  : t('datasetCreate.action.submit', '完成注册')}
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

function ModeCard({ icon, title, description, onClick }: { icon: React.ReactNode; title: React.ReactNode; description: React.ReactNode; onClick: () => void }) {
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

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-3">
      <div className="pt-1.5 text-xs" style={{ color: 'var(--text-3)' }}>{label}</div>
      <div>{children}</div>
    </div>
  )
}
