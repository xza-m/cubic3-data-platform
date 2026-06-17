// frontend/src/v2/pages/semantic/ontology/ObjectEdit.tsx
//
// 业务对象编辑页（Round 4 · R-001-P04）。
// 接口：
//   GET  /api/v1/ontology/objects/:name       — 读取对象当前值
//   POST /api/v1/ontology/objects              — 幂等 upsert（同路径既建又改）
//
// 约定：
//   · `name`（主键/标识符）不可改，只读展示；要"改名"请走删除重建。
//   · dirty diff 以「当前表单值 vs 首次加载时的服务端值」为基准；save
//     成功后以 service 返回的新值重置 baseline。
//   · 校验采用字段级 + 即时反馈；保存按钮依据校验结果 + 是否 dirty 禁用。

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, RotateCcw, Save } from 'lucide-react'
import {
  Button,
  Card,
  CardBody,
  CardHead,
  Chip,
  Input,
  Textarea,
  useToast,
} from '@v2/components/ui'
import { useAppShell } from '@v2/layout/AppShell'
import { t } from '@v2/i18n'
import { useObjectDetail, useUpdateObject } from '@v2/hooks/ontology'
import type { BusinessObject } from '@v2/api/ontology'

// 可编辑字段白名单；其它字段（如 `name`）保持不动
type EditableField = 'title' | 'description' | 'aliases' | 'status'

interface FormState {
  title: string
  description: string
  // aliases 以 UI 友好的逗号分隔字符串存储；提交前 split/trim/dedupe
  aliases: string
  status: string
}

function toFormState(o: BusinessObject | undefined): FormState {
  return {
    title: o?.title ?? '',
    description: o?.description ?? '',
    aliases: (o?.aliases ?? []).join(', '),
    status: o?.status ?? 'active',
  }
}

function parseAliases(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(',').map((p) => p.trim()).filter(Boolean)) {
    if (seen.has(part)) continue
    seen.add(part)
    out.push(part)
  }
  return out
}

interface FieldIssue {
  field: EditableField
  message: string
}

function validate(form: FormState): FieldIssue[] {
  const issues: FieldIssue[] = []
  if (!form.title.trim()) {
    issues.push({
      field: 'title',
      message: t('objectEdit.error.titleRequired', '显示名称不可为空'),
    })
  } else if (form.title.trim().length > 80) {
    issues.push({
      field: 'title',
      message: t('objectEdit.error.titleTooLong', '显示名称过长（最多 80 字）'),
    })
  }
  if (form.description.length > 500) {
    issues.push({
      field: 'description',
      message: t(
        'objectEdit.error.descriptionTooLong',
        '描述过长（最多 500 字）',
      ),
    })
  }
  const aliases = parseAliases(form.aliases)
  for (const a of aliases) {
    if (a.length > 40) {
      issues.push({
        field: 'aliases',
        message: t('objectEdit.error.aliasTooLong', '单个别名过长（最多 40 字）'),
      })
      break
    }
  }
  return issues
}

interface FieldChange {
  field: EditableField
  before: string
  after: string
}

function diffForm(initial: FormState, current: FormState): FieldChange[] {
  const fields: EditableField[] = ['title', 'description', 'aliases', 'status']
  const out: FieldChange[] = []
  for (const f of fields) {
    if (initial[f] !== current[f]) {
      out.push({ field: f, before: initial[f], after: current[f] })
    }
  }
  return out
}

function fieldLabel(f: EditableField): string {
  switch (f) {
    case 'title':
      return t('objectEdit.field.title', '显示名称')
    case 'description':
      return t('objectEdit.field.description', '描述')
    case 'aliases':
      return t('objectEdit.field.aliases', '别名')
    case 'status':
      return t('objectEdit.field.status', '状态')
  }
}

export default function ObjectEdit() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const { setBreadcrumbs, setTopBarActions } = useAppShell()

  const detail = useObjectDetail(name)
  const update = useUpdateObject()

  const [initial, setInitial] = useState<FormState | null>(null)
  const [form, setForm] = useState<FormState | null>(null)

  // 当 detail 首次加载完成，或用户保存后返回新的 baseline 时，重置表单
  useEffect(() => {
    if (!detail.data || initial) return
    const snap = toFormState(detail.data)
    setInitial(snap)
    setForm(snap)
  }, [detail.data, initial])

  const issues = useMemo(() => (form ? validate(form) : []), [form])
  const changes = useMemo(
    () => (initial && form ? diffForm(initial, form) : []),
    [initial, form],
  )
  const dirty = changes.length > 0
  const hasErrors = issues.length > 0
  const issueFor = (f: EditableField) => issues.find((i) => i.field === f)

  const handleReset = useCallback(() => {
    if (!initial) return
    setForm(initial)
  }, [initial])

  const handleSave = useCallback(async () => {
    if (!name || !form || !initial || !dirty || hasErrors) return
    const body: Partial<BusinessObject> = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      aliases: parseAliases(form.aliases),
      status: form.status.trim() || 'active',
    }
    try {
      const saved = await update.mutateAsync({
        name,
        body,
        changedFields: changes.map((c) => c.field),
      })
      const snap = toFormState(saved)
      setInitial(snap)
      setForm(snap)
      toast.show({
        tone: 'success',
        title: t('objectEdit.toast.saved', '已保存业务对象'),
        description: name,
      })
      navigate(`/semantic/ontology/objects/${name}`)
    } catch (err) {
      toast.show({
        tone: 'danger',
        title: t('objectEdit.toast.saveFailed', '保存失败'),
        description: err instanceof Error ? err.message : String(err),
      })
    }
  }, [name, form, initial, dirty, hasErrors, changes, update, toast, navigate])

  useEffect(() => {
    setBreadcrumbs([
      t('nav.semantic', '语义中心'),
      t('nav.ontology', '本体工作台'),
      t('nav.objects', '业务对象'),
      name ?? '',
      t('action.edit', '编辑'),
    ])
  }, [setBreadcrumbs, name])

  useEffect(() => {
    setTopBarActions(
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => navigate(`/semantic/ontology/objects/${name}`)}
        >
          <ArrowLeft size={12} /> {t('action.backToDetail', '返回详情')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!dirty || update.isPending}
          onClick={handleReset}
          data-testid="object-edit-reset"
        >
          <RotateCcw size={12} /> {t('action.undoAll', '撤销全部')}
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={!dirty || hasErrors || update.isPending}
          loading={update.isPending}
          onClick={handleSave}
          data-testid="object-edit-save"
        >
          <Save size={12} /> {t('action.save', '保存')}
        </Button>
      </div>,
    )
    return () => setTopBarActions(null)
  }, [setTopBarActions, navigate, name, dirty, hasErrors, update.isPending, handleReset, handleSave])

  if (detail.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-3">
        {t('common.loading', '加载中…')}
      </div>
    )
  }

  if (detail.isError || !detail.data || !form || !initial) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-danger">
        {t('error.loadFailed', '加载失败')}
      </div>
    )
  }

  const patch = (k: keyof FormState, v: string) =>
    setForm((prev) => (prev ? { ...prev, [k]: v } : prev))

  return (
    <div className="flex flex-1 flex-col overflow-auto scroll-thin p-5">
      <div className="mx-auto grid w-full max-w-[880px] grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHead className="flex items-center justify-between">
            <span>{t('objectEdit.title', '编辑业务对象')}</span>
            {dirty ? (
              <Chip tone="warning" data-testid="object-edit-dirty-chip">
                {t('objectEdit.dirty', '未保存')}
              </Chip>
            ) : null}
          </CardHead>
          <CardBody>
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault()
                void handleSave()
              }}
              noValidate
            >
              <Field label={t('objectCreate.name', '标识符（英文）')} hint={t('objectEdit.nameReadonly', '主键不可修改')}>
                <Input
                  value={detail.data.name}
                  readOnly
                  aria-readonly
                  className="surface-2"
                  data-testid="object-edit-name"
                />
              </Field>

              <Field
                label={t('objectCreate.title', '显示名称')}
                required
                error={issueFor('title')?.message}
              >
                <Input
                  value={form.title}
                  onChange={(e) => patch('title', e.target.value)}
                  placeholder={t('objectCreate.titlePlaceholder', '如：学生画像')}
                  aria-invalid={issueFor('title') ? true : undefined}
                  aria-describedby={issueFor('title') ? 'objectEdit-title-error' : undefined}
                  data-testid="object-edit-title"
                />
              </Field>

              <Field
                label={t('objectCreate.description', '描述')}
                error={issueFor('description')?.message}
              >
                <Textarea
                  value={form.description}
                  onChange={(e) => patch('description', e.target.value)}
                  rows={3}
                  aria-invalid={issueFor('description') ? true : undefined}
                  placeholder={t('objectCreate.descriptionPlaceholder', '业务含义简介')}
                  data-testid="object-edit-description"
                />
              </Field>

              <Field
                label={t('objectEdit.aliases', '别名（逗号分隔）')}
                error={issueFor('aliases')?.message}
                hint={t('objectEdit.aliasesHint', '用于术语查找同义词；示例：stu, student_profile')}
              >
                <Input
                  value={form.aliases}
                  onChange={(e) => patch('aliases', e.target.value)}
                  placeholder="stu, student_profile"
                  aria-invalid={issueFor('aliases') ? true : undefined}
                  data-testid="object-edit-aliases"
                />
              </Field>

              <Field label={t('objectEdit.status', '状态')}>
                <Input
                  value={form.status}
                  onChange={(e) => patch('status', e.target.value)}
                  placeholder="active / deprecated"
                  data-testid="object-edit-status"
                />
              </Field>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHead>{t('objectEdit.diff.title', '变更对比')}</CardHead>
          <CardBody>
            {changes.length === 0 ? (
              <p className="text-xs text-3" data-testid="object-edit-diff-empty">
                {t('objectEdit.diff.empty', '尚未有改动')}
              </p>
            ) : (
              <ul className="flex flex-col gap-3" data-testid="object-edit-diff-list">
                {changes.map((c) => (
                  <li key={c.field} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-2">{fieldLabel(c.field)}</span>
                      <Chip tone="warning">{t('objectEdit.diff.changed', '已修改')}</Chip>
                    </div>
                    <div className="surface-2 flex flex-col gap-1 rounded border border-app p-2 text-[11px] leading-relaxed">
                      <span className="text-3">
                        <span className="mr-1 opacity-60">−</span>
                        {c.before || (
                          <em className="opacity-60">
                            {t('objectEdit.diff.emptyValue', '（空）')}
                          </em>
                        )}
                      </span>
                      <span style={{ color: 'var(--success)' }}>
                        <span className="mr-1 opacity-60">+</span>
                        {c.after || (
                          <em className="opacity-60">
                            {t('objectEdit.diff.emptyValue', '（空）')}
                          </em>
                        )}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}

function Field({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string
  required?: boolean
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-2">
        {label}
        {required ? <span className="ml-0.5 text-danger">*</span> : null}
      </label>
      {children}
      {error ? (
        <p
          id="objectEdit-title-error"
          role="alert"
          className="text-[11px] text-danger"
          data-testid="object-edit-error"
        >
          {error}
        </p>
      ) : hint ? (
        <p className="text-[11px] text-3">{hint}</p>
      ) : null}
    </div>
  )
}
