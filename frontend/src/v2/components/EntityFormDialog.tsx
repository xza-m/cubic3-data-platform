// frontend/src/v2/components/EntityFormDialog.tsx
//
// Schema-driven 实体表单对话框：用于"新建/编辑"任意实体。
//
// 使用示例：
//   <EntityFormDialog
//     open={open}
//     onClose={...}
//     title="新建查询"
//     schema={[
//       { name: 'name', label: '名称', type: 'text', required: true },
//       { name: 'source', label: '数据源', type: 'select', options: [...] },
//     ]}
//     onSubmit={async (values) => mutate(values)}
//   />
//
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Button, Dialog, Input, Select, Switch, Textarea } from '@v2/components/ui'

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'switch'
  | 'tags'

export interface FieldOption {
  value: string
  label: string
}

export interface FieldSpec {
  /** 字段标识。为了兼容 `key` 别名调用约定，二者任选其一即可。 */
  name?: string
  /** `name` 的别名，便于和 React `key` prop 风格对齐。 */
  key?: string
  label: ReactNode
  /** 字段输入类型。默认 `text`。 */
  type?: FieldType
  required?: boolean
  placeholder?: string
  help?: ReactNode
  options?: FieldOption[]
  defaultValue?: unknown
  span?: 'full' | 'half'
  validate?: (value: unknown, all: Record<string, unknown>) => string | null | undefined
}

/** 内部归一化后的字段：保证 `name` 与 `type` 必填。 */
interface NormalizedField extends Omit<FieldSpec, 'name' | 'key' | 'type'> {
  name: string
  type: FieldType
}

function normalizeFields(fields: FieldSpec[] | undefined): NormalizedField[] {
  if (!fields) return []
  return fields.map((f) => {
    const name = f.name ?? f.key
    if (!name) {
      throw new Error('EntityFormDialog: field requires `name` or `key`')
    }
    return { ...f, name, type: f.type ?? 'text' }
  })
}

export interface EntityFormDialogProps<T extends Record<string, unknown>> {
  open: boolean
  onClose: () => void
  title: ReactNode
  submitLabel?: ReactNode
  /** 字段定义。`fields` 为别名（与 `schema` 等价，二者任选其一）。 */
  schema?: FieldSpec[]
  fields?: FieldSpec[]
  initialValues?: Partial<T>
  onSubmit: (values: T) => Promise<void> | void
  width?: number
  description?: ReactNode
  /** 外部受控 loading：常用于受 useMutation.isPending 驱动 */
  loading?: boolean
}

function buildInitial(fields: NormalizedField[], initial?: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of fields) {
    if (initial && Object.prototype.hasOwnProperty.call(initial, f.name)) {
      out[f.name] = initial[f.name]
      continue
    }
    if (f.defaultValue !== undefined) {
      out[f.name] = f.defaultValue
      continue
    }
    switch (f.type) {
      case 'switch':
        out[f.name] = false
        break
      case 'number':
        out[f.name] = ''
        break
      case 'tags':
        out[f.name] = []
        break
      default:
        out[f.name] = ''
    }
  }
  return out
}

export function EntityFormDialog<T extends Record<string, unknown>>({
  open,
  onClose,
  title,
  submitLabel = '保存',
  schema,
  fields,
  initialValues,
  onSubmit,
  width = 560,
  description,
  loading = false,
}: EntityFormDialogProps<T>) {
  const normalized = useMemo(() => normalizeFields(schema ?? fields), [schema, fields])
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    buildInitial(normalized, initialValues as Record<string, unknown> | undefined),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [internalSubmitting, setInternalSubmitting] = useState(false)
  const submitting = internalSubmitting || loading
  const setSubmitting = setInternalSubmitting

  useEffect(() => {
    if (open) {
      setValues(buildInitial(normalized, initialValues as Record<string, unknown> | undefined))
      setErrors({})
    }
  }, [open, normalized, initialValues])

  const setField = useCallback((name: string, v: unknown) => {
    setValues((cur) => ({ ...cur, [name]: v }))
    setErrors((cur) => {
      if (!cur[name]) return cur
      const next = { ...cur }
      delete next[name]
      return next
    })
  }, [])

  const runValidate = useCallback((): Record<string, string> => {
    const errs: Record<string, string> = {}
    for (const f of normalized) {
      const v = values[f.name]
      if (f.required) {
        const empty =
          v === undefined ||
          v === null ||
          v === '' ||
          (Array.isArray(v) && v.length === 0)
        if (empty) {
          errs[f.name] = '必填'
          continue
        }
      }
      if (f.validate) {
        const msg = f.validate(v, values)
        if (msg) errs[f.name] = msg
      }
    }
    return errs
  }, [normalized, values])

  const handleSubmit = useCallback(async () => {
    if (submitting) return
    const errs = runValidate()
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }
    setSubmitting(true)
    try {
      await onSubmit(values as T)
      onClose()
    } finally {
      setSubmitting(false)
    }
  }, [submitting, runValidate, onSubmit, values, onClose])

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        void handleSubmit()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, handleSubmit])

  const grid = useMemo(() => normalized.map((f) => ({ field: f, span: f.span ?? 'full' })), [normalized])

  return (
    <Dialog
      open={open}
      onClose={submitting ? () => undefined : onClose}
      title={title}
      width={width}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? '保存中…' : submitLabel}
          </Button>
        </>
      }
    >
      {description ? <div className="mb-3 text-[12px] text-3">{description}</div> : null}
      <div className="grid grid-cols-2 gap-3">
        {grid.map(({ field, span }) => (
          <div key={field.name} className={span === 'half' ? 'col-span-1' : 'col-span-2'}>
            <FieldRow
              field={field}
              value={values[field.name]}
              error={errors[field.name]}
              onChange={(v) => setField(field.name, v)}
            />
          </div>
        ))}
      </div>
      <div className="mt-3 text-right text-[11px] text-3">⌘↵ 提交 · Esc 取消</div>
    </Dialog>
  )
}

function FieldRow({
  field,
  value,
  error,
  onChange,
}: {
  field: FieldSpec
  value: unknown
  error?: string
  onChange: (v: unknown) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-2">
        {field.label}
        {field.required ? <span className="ml-0.5 text-[color:var(--danger)]">*</span> : null}
      </span>
      <FieldControl field={field} value={value} onChange={onChange} />
      {error ? (
        <span className="text-[11px]" style={{ color: 'var(--danger)' }}>
          {error}
        </span>
      ) : field.help ? (
        <span className="text-[11px] text-3">{field.help}</span>
      ) : null}
    </label>
  )
}

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: FieldSpec
  value: unknown
  onChange: (v: unknown) => void
}) {
  switch (field.type) {
    case 'textarea':
      return (
        <Textarea
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={4}
        />
      )
    case 'number':
      return (
        <Input
          type="number"
          value={(value as string | number) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
        />
      )
    case 'select':
      return (
        <Select value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">请选择…</option>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      )
    case 'switch':
      return (
        <div className="flex h-7 items-center">
          <Switch checked={Boolean(value)} onChange={(v) => onChange(v)} />
        </div>
      )
    case 'tags': {
      const arr = Array.isArray(value) ? (value as string[]) : []
      return (
        <Input
          value={arr.join(', ')}
          onChange={(e) => {
            const next = e.target.value
              .split(/[,，]/)
              .map((s) => s.trim())
              .filter(Boolean)
            onChange(next)
          }}
          placeholder={field.placeholder ?? '英文逗号分隔'}
        />
      )
    }
    default:
      return (
        <Input
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
        />
      )
  }
}
