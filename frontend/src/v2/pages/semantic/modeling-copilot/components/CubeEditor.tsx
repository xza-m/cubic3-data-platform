// frontend/src/v2/pages/semantic/modeling-copilot/components/CubeEditor.tsx
//
// 工作台核心组件：Cube spec 可编辑 / 只读两态共用。
// - editable=true：dimensions / measures 表格化增删改，name/source 可编辑；
//   onChange 触发 debounced PATCH /sessions/<id>/spec 由父组件回写
// - editable=false（readonly）：用于 SavedCard 等审计场景，只展示
//
// 设计决定：
// - 不在组件内部做 debounce / PATCH，让父组件持有 mutation；CubeEditor 只
//   产 onChange(patch) 事件，便于复用与测试
// - dimensions/measures 表格用受控 input；name 重复 / 必填等 inline error 由
//   父组件传入 validation issues prop 渲染（per-field icon）
import { useMemo, type ReactNode } from 'react'
import { Plus, Trash2, AlertTriangle } from 'lucide-react'

export interface CubeDimensionRow {
  name?: string
  type?: string
  expr?: string
  primary?: boolean
}

export interface CubeMeasureRow {
  name?: string
  type?: string
  sql?: string
  time_dimension?: string
}

export interface CubeSpecValue {
  name?: string
  title?: string
  source?: string
  description?: string
  dimensions?: CubeDimensionRow[]
  measures?: CubeMeasureRow[]
  [k: string]: unknown
}

export interface CubeFieldIssue {
  /** dot path，例如 "cube.measures[0].sql" */
  path: string
  severity: 'error' | 'warning' | 'info'
  message: string
}

interface CubeEditorProps {
  value: CubeSpecValue
  editable?: boolean
  issues?: CubeFieldIssue[]
  onChange?: (next: CubeSpecValue) => void
  onSwapSource?: () => void
}

const PATH_PREFIX = 'cube'

function rowIssue(issues: CubeFieldIssue[] | undefined, prefix: string, idx: number, field: string): CubeFieldIssue | undefined {
  if (!issues?.length) return undefined
  const target = `${PATH_PREFIX}.${prefix}[${idx}].${field}`
  return issues.find((it) => it.path === target)
}

function fieldIssue(issues: CubeFieldIssue[] | undefined, field: string): CubeFieldIssue | undefined {
  if (!issues?.length) return undefined
  const target = `${PATH_PREFIX}.${field}`
  return issues.find((it) => it.path === target)
}

function ErrorIcon({ tone }: { tone: 'error' | 'warning' | 'info' }) {
  return (
    <AlertTriangle
      size={12}
      className={tone === 'error' ? 'text-red-500' : tone === 'warning' ? 'text-amber-500' : 'text-blue-500'}
      aria-hidden
    />
  )
}

function Cell({
  children,
  width,
  align = 'left',
}: {
  children: ReactNode
  width?: number | string
  align?: 'left' | 'right' | 'center'
}) {
  return (
    <div
      className="flex items-center gap-1 px-2 py-1 text-[12.5px]"
      style={{ width, justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : undefined }}
    >
      {children}
    </div>
  )
}

export function CubeEditor({
  value,
  editable = true,
  issues,
  onChange,
  onSwapSource,
}: CubeEditorProps) {
  const dims = useMemo(() => Array.isArray(value.dimensions) ? value.dimensions : [], [value.dimensions])
  const measures = useMemo(() => Array.isArray(value.measures) ? value.measures : [], [value.measures])

  const apply = (patch: Partial<CubeSpecValue>) => {
    if (!editable || !onChange) return
    onChange({ ...value, ...patch })
  }

  const updateDim = (idx: number, patch: Partial<CubeDimensionRow>) => {
    if (!editable || !onChange) return
    const next = dims.map((d, i) => (i === idx ? { ...d, ...patch } : d))
    apply({ dimensions: next })
  }

  const removeDim = (idx: number) => {
    if (!editable || !onChange) return
    apply({ dimensions: dims.filter((_, i) => i !== idx) })
  }

  const addDim = () => {
    if (!editable || !onChange) return
    apply({ dimensions: [...dims, { name: '', type: 'string', expr: '' }] })
  }

  const updateMeasure = (idx: number, patch: Partial<CubeMeasureRow>) => {
    if (!editable || !onChange) return
    const next = measures.map((m, i) => (i === idx ? { ...m, ...patch } : m))
    apply({ measures: next })
  }

  const removeMeasure = (idx: number) => {
    if (!editable || !onChange) return
    apply({ measures: measures.filter((_, i) => i !== idx) })
  }

  const addMeasure = () => {
    if (!editable || !onChange) return
    apply({ measures: [...measures, { name: '', type: 'count', sql: '' }] })
  }

  return (
    <div className="flex flex-col gap-3" data-testid="cube-editor">
      <div className="flex flex-col gap-2">
        <KvField label="Cube 名称" issue={fieldIssue(issues, 'name')}>
          <Input
            value={value.name ?? ''}
            editable={editable}
            onChange={(v) => apply({ name: v })}
            placeholder="snake_case，例如 student_comment_cube"
          />
        </KvField>
        <KvField label="来源表" issue={fieldIssue(issues, 'source')}>
          <div className="flex items-center gap-2">
            <Input
              value={value.source ?? ''}
              editable={editable}
              onChange={(v) => apply({ source: v })}
              placeholder="catalog.schema.table"
            />
            {editable && onSwapSource ? (
              <button
                type="button"
                onClick={onSwapSource}
                className="text-[12px] text-3 hover:text-1 underline-offset-2 hover:underline"
              >
                换源表
              </button>
            ) : null}
          </div>
        </KvField>
      </div>

      <Section title="维度（Dimensions）" count={dims.length} onAdd={editable ? addDim : undefined}>
        <Header cols={[
          { label: '字段', width: 160 },
          { label: '类型', width: 90 },
          { label: 'expr / 列名', width: 220 },
          { label: '主键', width: 56, align: 'center' },
          { label: '', width: 32 },
        ]} />
        {dims.length === 0 ? (
          <div className="px-2 py-3 text-[12px] text-3">{editable ? '点击「新增」添加维度。' : '（无维度）'}</div>
        ) : (
          dims.map((d, i) => {
            const nameIssue = rowIssue(issues, 'dimensions', i, 'name')
            const exprIssue = rowIssue(issues, 'dimensions', i, 'expr')
            return (
              <Row key={`${i}-${d.name}`}>
                <Cell width={160}>
                  <Input value={d.name ?? ''} editable={editable} onChange={(v) => updateDim(i, { name: v })} />
                  {nameIssue ? <ErrorIcon tone={nameIssue.severity} /> : null}
                </Cell>
                <Cell width={90}>
                  <select
                    value={d.type ?? 'string'}
                    disabled={!editable}
                    onChange={(e) => updateDim(i, { type: e.target.value })}
                    className="w-full bg-transparent text-[12.5px] text-1 outline-none disabled:opacity-70"
                  >
                    {['string', 'number', 'date', 'datetime', 'boolean'].map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </Cell>
                <Cell width={220}>
                  <Input value={d.expr ?? ''} editable={editable} onChange={(v) => updateDim(i, { expr: v })} placeholder="SQL 表达式或列名" />
                  {exprIssue ? <ErrorIcon tone={exprIssue.severity} /> : null}
                </Cell>
                <Cell width={56} align="center">
                  <input
                    type="checkbox"
                    checked={!!d.primary}
                    disabled={!editable}
                    onChange={(e) => updateDim(i, { primary: e.target.checked })}
                  />
                </Cell>
                <Cell width={32} align="right">
                  {editable ? (
                    <button
                      type="button"
                      aria-label="删除维度"
                      onClick={() => removeDim(i)}
                      className="text-3 hover:text-red-500"
                    >
                      <Trash2 size={12} />
                    </button>
                  ) : null}
                </Cell>
              </Row>
            )
          })
        )}
      </Section>

      <Section title="度量（Measures）" count={measures.length} onAdd={editable ? addMeasure : undefined}>
        <Header cols={[
          { label: '字段', width: 160 },
          { label: '类型', width: 90 },
          { label: 'SQL 表达式', width: 220 },
          { label: '时间字段', width: 120 },
          { label: '', width: 32 },
        ]} />
        {measures.length === 0 ? (
          <div className="px-2 py-3 text-[12px] text-3">{editable ? '点击「新增」添加度量。' : '（无度量）'}</div>
        ) : (
          measures.map((m, i) => {
            const nameIssue = rowIssue(issues, 'measures', i, 'name')
            const sqlIssue = rowIssue(issues, 'measures', i, 'sql')
            return (
              <Row key={`${i}-${m.name}`}>
                <Cell width={160}>
                  <Input value={m.name ?? ''} editable={editable} onChange={(v) => updateMeasure(i, { name: v })} />
                  {nameIssue ? <ErrorIcon tone={nameIssue.severity} /> : null}
                </Cell>
                <Cell width={90}>
                  <select
                    value={m.type ?? 'count'}
                    disabled={!editable}
                    onChange={(e) => updateMeasure(i, { type: e.target.value })}
                    className="w-full bg-transparent text-[12.5px] text-1 outline-none disabled:opacity-70"
                  >
                    {['count', 'count_distinct', 'sum', 'avg', 'min', 'max', 'number'].map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </Cell>
                <Cell width={220}>
                  <Input value={m.sql ?? ''} editable={editable} onChange={(v) => updateMeasure(i, { sql: v })} placeholder="例如 count(distinct user_id)" />
                  {sqlIssue ? <ErrorIcon tone={sqlIssue.severity} /> : null}
                </Cell>
                <Cell width={120}>
                  <Input value={m.time_dimension ?? ''} editable={editable} onChange={(v) => updateMeasure(i, { time_dimension: v })} placeholder="可选" />
                </Cell>
                <Cell width={32} align="right">
                  {editable ? (
                    <button
                      type="button"
                      aria-label="删除度量"
                      onClick={() => removeMeasure(i)}
                      className="text-3 hover:text-red-500"
                    >
                      <Trash2 size={12} />
                    </button>
                  ) : null}
                </Cell>
              </Row>
            )
          })
        )}
      </Section>
    </div>
  )
}

function Section({
  title,
  count,
  onAdd,
  children,
}: {
  title: string
  count: number
  onAdd?: () => void
  children: ReactNode
}) {
  return (
    <div
      className="rounded border"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
    >
      <div
        className="flex items-center justify-between border-b px-3 py-2 text-[12.5px] text-1"
        style={{ borderColor: 'var(--border)' }}
      >
        <span className="font-medium">
          {title} <span className="text-3">({count})</span>
        </span>
        {onAdd ? (
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-1 text-[12px] text-3 hover:text-1"
          >
            <Plus size={12} /> 新增
          </button>
        ) : null}
      </div>
      <div>{children}</div>
    </div>
  )
}

function Row({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex border-b last:border-b-0"
      style={{ borderColor: 'var(--border)' }}
    >
      {children}
    </div>
  )
}

function Header({
  cols,
}: {
  cols: { label: string; width: number; align?: 'left' | 'center' | 'right' }[]
}) {
  return (
    <div
      className="flex border-b text-[11px] uppercase tracking-wide text-3"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)' }}
    >
      {cols.map((c) => (
        <div
          key={c.label}
          className="px-2 py-1.5"
          style={{
            width: c.width,
            textAlign: c.align === 'right' ? 'right' : c.align === 'center' ? 'center' : 'left',
          }}
        >
          {c.label}
        </div>
      ))}
    </div>
  )
}

function KvField({
  label,
  issue,
  children,
}: {
  label: string
  issue?: CubeFieldIssue
  children: ReactNode
}) {
  return (
    <div className="flex items-baseline gap-3 text-[12.5px]">
      <span className="w-16 text-3">{label}</span>
      <div className="flex flex-1 items-center gap-1">
        {children}
        {issue ? <ErrorIcon tone={issue.severity} /> : null}
      </div>
      {issue ? (
        <span className={`text-[11.5px] ${issue.severity === 'error' ? 'text-red-500' : 'text-amber-500'}`}>
          {issue.message}
        </span>
      ) : null}
    </div>
  )
}

function Input({
  value,
  editable,
  onChange,
  placeholder,
}: {
  value: string
  editable: boolean
  onChange?: (v: string) => void
  placeholder?: string
}) {
  if (!editable) {
    return (
      <span className="text-[12.5px] text-1" style={{ wordBreak: 'break-all' }}>
        {value || <span className="text-3">—</span>}
      </span>
    )
  }
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded border bg-transparent px-2 py-1 text-[12.5px] text-1 outline-none focus:border-blue-500"
      style={{ borderColor: 'var(--border)' }}
    />
  )
}
