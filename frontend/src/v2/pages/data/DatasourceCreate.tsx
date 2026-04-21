// frontend/src/v2/pages/data/DatasourceCreate.tsx
//
// 新建数据源页面（/datasources/new）。
// 对接 POST /api/v1/data-center/datasources。
// 支持 source_type: maxcompute | clickhouse | postgresql | mysql。

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check } from 'lucide-react'
import { useCreateDatasource, useDatasourceTypes } from '@v2/hooks/datasources'
// import { t } from '@v2/i18n'  // TODO: pending X-Crosscut delivery

// X-Crosscut 提供（编译错误留待 Phase 3 修复）
import { useAppShell } from '@v2/layout/AppShell'

const DEFAULT_CONFIGS: Record<string, Record<string, string>> = {
  postgresql:  { host: '', port: '5432', database: '', user: '', password: '' },
  mysql:       { host: '', port: '3306', database: '', user: '', password: '' },
  clickhouse:  { host: '', port: '8123', database: 'default', user: 'default', password: '' },
  maxcompute:  { endpoint: '', project: '', access_id: '', access_key: '' },
}

export default function DatasourceCreate() {
  const navigate = useNavigate()
  const { setBreadcrumbs, setTopBarActions } = useAppShell()
  const createDatasource = useCreateDatasource()
  const { data: types } = useDatasourceTypes()

  const [name, setName] = useState('')
  const [sourceType, setSourceType] = useState('postgresql')
  const [description, setDescription] = useState('')
  const [connConfig, setConnConfig] = useState<Record<string, string>>(
    DEFAULT_CONFIGS.postgresql,
  )
  const [done, setDone] = useState(false)

  // 切换类型时重置连接配置
  const handleTypeChange = (t: string) => {
    setSourceType(t)
    setConnConfig(DEFAULT_CONFIGS[t] ?? {})
  }

  useEffect(() => {
    setBreadcrumbs(['数据', '数据源', '新建'])
    setTopBarActions(
      <button
        type="button"
        onClick={() => navigate('/data-center/datasources')}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs"
        style={{ color: 'var(--text-2)' }}
      >
        <ArrowLeft size={12} /> 返回列表
      </button>,
    )
    return () => setTopBarActions(null)
  }, [setBreadcrumbs, setTopBarActions, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createDatasource.mutateAsync({
        name,
        source_type: sourceType,
        description: description || undefined,
        connection_config: connConfig as Record<string, unknown>,
      })
      setDone(true)
    } catch {
      // mutation onError 由全局 toast 处理（X-Crosscut 提供）
    }
  }

  if (done) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-full"
          style={{ background: 'var(--success-soft)', color: 'var(--success)' }}
        >
          <Check size={24} />
        </div>
        <div className="text-base font-medium" style={{ color: 'var(--text-1)' }}>
          数据源创建成功
        </div>
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>
          已接入 <strong>{name}</strong>（{sourceType}），目录同步任务已入队。
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate('/data-center/datasources')}
            className="rounded-md border px-4 py-2 text-xs"
            style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
          >
            返回列表
          </button>
          <button
            type="button"
            onClick={() => {
              setDone(false)
              setName('')
              setDescription('')
              setConnConfig(DEFAULT_CONFIGS[sourceType] ?? {})
            }}
            className="rounded-md px-4 py-2 text-xs font-medium"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            再建一个
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 justify-center overflow-auto px-4 py-8">
      <form onSubmit={handleSubmit} className="w-full max-w-xl space-y-5">
        <div
          className="rounded-lg border p-6"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
        >
          <h1 className="mb-5 text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
            新建数据源
          </h1>

          <Field label="名称" required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="如 prod-maxcompute"
              className="field-input"
              style={inputStyle}
            />
          </Field>

          <Field label="类型" required>
            <select
              value={sourceType}
              onChange={(e) => handleTypeChange(e.target.value)}
              className="field-input"
              style={inputStyle}
            >
              {types
                ? types.map((t) => (
                    <option key={t.type} value={t.type}>
                      {t.display_name}
                    </option>
                  ))
                : Object.keys(DEFAULT_CONFIGS).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
            </select>
          </Field>

          <Field label="描述">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="可选"
              style={inputStyle}
            />
          </Field>

          <div
            className="mt-4 rounded-md border p-3"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)' }}
          >
            <div
              className="mb-3 text-[10px] font-medium uppercase tracking-wide"
              style={{ color: 'var(--text-3)' }}
            >
              连接配置
            </div>
            <div className="space-y-2">
              {Object.entries(connConfig).map(([key, val]) => (
                <Field key={key} label={key}>
                  <input
                    value={val}
                    onChange={(e) =>
                      setConnConfig((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                    type={key.includes('password') || key.includes('key') ? 'password' : 'text'}
                    placeholder={key}
                    style={inputStyle}
                  />
                </Field>
              ))}
            </div>
          </div>
        </div>

        {createDatasource.isError ? (
          <p className="text-xs" style={{ color: 'var(--danger)' }}>
            {createDatasource.error instanceof Error
              ? createDatasource.error.message
              : '创建失败'}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => navigate('/data-center/datasources')}
            className="rounded-md border px-4 py-2 text-xs"
            style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
          >
            取消
          </button>
          <button
            type="submit"
            disabled={createDatasource.isPending || !name}
            className="rounded-md px-4 py-2 text-xs font-medium"
            style={{
              background: 'var(--accent)',
              color: 'var(--on-accent)',
              opacity: createDatasource.isPending || !name ? 0.6 : 1,
            }}
          >
            {createDatasource.isPending ? '创建中…' : '创建数据源'}
          </button>
        </div>
      </form>
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
  outline: 'none',
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-3 py-1.5">
      <label className="pt-1.5 text-xs" style={{ color: 'var(--text-3)' }}>
        {label}
        {required && <span style={{ color: 'var(--danger)' }}>*</span>}
      </label>
      <div>{children}</div>
    </div>
  )
}
