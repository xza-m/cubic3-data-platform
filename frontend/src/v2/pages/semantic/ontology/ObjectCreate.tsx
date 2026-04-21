// frontend/src/v2/pages/semantic/ontology/ObjectCreate.tsx
//
// 新建业务对象表单页。
// 接口：POST /api/v1/ontology/objects

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
// 等待 X-Crosscut：@v2/components/ui
import { Button, Card, CardBody, CardHead, Input, Textarea } from '@v2/components/ui'
// 等待 X-Crosscut：@v2/layout/AppShell
import { useAppShell } from '@v2/layout/AppShell'
// 等待 X-Crosscut：@v2/i18n
import { t } from '@v2/i18n'
import { useCreateObject } from '@v2/hooks/ontology'

export default function ObjectCreate() {
  const navigate = useNavigate()
  const { setBreadcrumbs } = useAppShell()
  const create = useCreateObject()

  const [form, setForm] = useState({
    name: '',
    title: '',
    description: '',
    domain: '',
    primary_key: '',
    source_table: '',
    owner: '',
  })

  useEffect(() => {
    setBreadcrumbs([
      t('nav.semantic', '语义中心'),
      t('nav.ontology', '本体工作台'),
      t('nav.objects', '业务对象'),
      t('action.create', '新建'),
    ])
  }, [setBreadcrumbs])

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // drop-frontend: backend BusinessObject only accepts name/title/description/aliases/status —
    // domain / primary_key / source_table / owner inputs are kept in the form for now but not sent.
    const res = await create.mutateAsync({
      name: form.name.trim(),
      title: form.title.trim() || undefined,
      description: form.description.trim() || undefined,
    })
    navigate(`/semantic/ontology/objects/${res.name}`)
  }

  return (
    <div className="flex flex-1 flex-col overflow-auto scroll-thin p-5">
      <div className="mx-auto w-full max-w-lg">
        <Card>
          <CardHead>{t('objectCreate.title', '新建业务对象')}</CardHead>
          <CardBody>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <FormField label={t('objectCreate.name', '标识符（英文）')} required>
                <Input
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="e.g. student_profile"
                  required
                  pattern="^[a-z][a-z0-9_]*$"
                />
              </FormField>

              <FormField label={t('objectCreate.title', '显示名称')}>
                <Input
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                  placeholder={t('objectCreate.titlePlaceholder', '如：学生画像')}
                />
              </FormField>

              <FormField label={t('objectCreate.domain', '数据域')}>
                <Input
                  value={form.domain}
                  onChange={(e) => set('domain', e.target.value)}
                  placeholder={t('objectCreate.domainPlaceholder', '如：learning')}
                />
              </FormField>

              <FormField label={t('objectCreate.primaryKey', '主键字段')}>
                <Input
                  value={form.primary_key}
                  onChange={(e) => set('primary_key', e.target.value)}
                  placeholder={t('objectCreate.primaryKeyPlaceholder', '如：student_id')}
                />
              </FormField>

              <FormField label={t('objectCreate.sourceTable', '来源表')}>
                <Input
                  value={form.source_table}
                  onChange={(e) => set('source_table', e.target.value)}
                  placeholder={t('objectCreate.sourceTablePlaceholder', 'schema.table_name')}
                />
              </FormField>

              <FormField label={t('objectCreate.owner', '负责人')}>
                <Input
                  value={form.owner}
                  onChange={(e) => set('owner', e.target.value)}
                  placeholder={t('objectCreate.ownerPlaceholder', '如：liming@company.com')}
                />
              </FormField>

              <FormField label={t('objectCreate.description', '描述')}>
                <Textarea
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  rows={3}
                  placeholder={t('objectCreate.descriptionPlaceholder', '业务含义简介')}
                />
              </FormField>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/semantic/ontology/objects')}
                >
                  {t('action.cancel', '取消')}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  loading={create.isPending}
                  disabled={!form.name.trim()}
                >
                  {t('action.create', '创建')}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}

function FormField({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-2">
        {label}
        {required ? <span className="ml-0.5 text-danger">*</span> : null}
      </label>
      {children}
    </div>
  )
}
