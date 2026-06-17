// frontend/src/v2/pages/semantic/cubes/CubeCreate.tsx
//
// 新建 Cube 页面。
// 接口：
//   POST /api/v1/semantic/cubes               — 直接创建
//   POST /api/v1/semantic/cubes/draft-from-source — 兼容入口，内部先生成字段候选再生成草稿

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Database, Plus } from 'lucide-react'
// 等待 X-Crosscut：@v2/components/ui
import { Button, Card, CardBody, CardHead, Input, Textarea } from '@v2/components/ui'
// 等待 X-Crosscut：@v2/layout/AppShell
import { useAppShell } from '@v2/layout/AppShell'
// 等待 X-Crosscut：@v2/i18n
import { t } from '@v2/i18n'
import { useCreateCube, useDraftCubeFromSource } from '@v2/hooks/semantic'

type Mode = 'manual' | 'from-dataset' | 'from-datasource'

export default function CubeCreate() {
  const navigate = useNavigate()
  const { setBreadcrumbs, setTopBarActions } = useAppShell()
  const [mode, setMode] = useState<Mode>('manual')

  // 表单字段
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [factTable, setFactTable] = useState('')
  const [domainName, setDomainName] = useState('')

  // 来源字段（from-dataset / from-datasource）
  const [datasetId, setDatasetId] = useState('')
  const [sourceId, setSourceId] = useState('')
  const [database, setDatabase] = useState('')
  const [schema, setSchema] = useState('')
  const [table, setTable] = useState('')
  const [createStatusError, setCreateStatusError] = useState(false)

  const createMutation = useCreateCube()
  const draftMutation = useDraftCubeFromSource()

  useEffect(() => {
    setBreadcrumbs([t('nav.semantic', '语义中心'), t('nav.cubes', 'Cube'), t('cube.create', '新建 Cube')])
  }, [setBreadcrumbs])

  useEffect(() => {
    setTopBarActions(
      <Button size="sm" variant="ghost" onClick={() => navigate('/semantic/cubes')}>
        <ArrowLeft size={12} /> {t('action.cancel', '取消')}
      </Button>,
    )
    return () => setTopBarActions(null)
  }, [setTopBarActions, navigate])

  const handleCreate = async () => {
    setCreateStatusError(false)
    if (mode === 'manual') {
      if (!name.trim() || !title.trim()) return
      const result = await createMutation.mutateAsync({
        name: name.trim(),
        title: title.trim(),
        description: description.trim() || undefined,
        fact_table: factTable.trim() || undefined,
        domain_name: domainName.trim() || undefined,
      })
      navigate(`/semantic/cubes/${result.name}`)
    } else {
      const result = await draftMutation.mutateAsync({
        source_kind: mode === 'from-dataset' ? 'dataset' : 'datasource',
        dataset_id: mode === 'from-dataset' ? datasetId.trim() : undefined,
        source_id: mode === 'from-datasource' ? sourceId.trim() : undefined,
        database: database.trim() || undefined,
        schema: schema.trim() || undefined,
        table: table.trim() || undefined,
        name: name.trim() || undefined,
        title: title.trim() || undefined,
        description: description.trim() || undefined,
      })
      const resultName = typeof result.name === 'string' && result.name.trim() ? result.name.trim() : ''
      if (!resultName) {
        setCreateStatusError(true)
        return
      }
      if (result.field_candidate_trace) {
        try {
          sessionStorage.setItem(`cube-draft-field-candidates:${resultName}`, JSON.stringify(result.field_candidate_trace))
        } catch {
          // sessionStorage 不可用时不阻断草稿创建主流程。
        }
      }
      navigate(`/semantic/cubes/${resultName}/edit`)
    }
  }

  const isPending = createMutation.isPending || draftMutation.isPending

  return (
    <div className="flex flex-1 flex-col overflow-auto scroll-thin p-5">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <div>
          <h1 className="text-base font-semibold text-1">{t('cube.create', '新建 Cube')}</h1>
          <p className="mt-0.5 text-xs text-3">{t('cube.createDesc', '在数据集之上定义数据语义层，包含维度与度量。')}</p>
        </div>

        {/* 创建方式 */}
        <Card>
          <CardHead title={t('cube.createMode', '创建方式')} />
          <CardBody className="space-y-2">
            {(
              [
                { id: 'manual', icon: Plus, label: t('cube.mode.manual', '手动创建'), desc: t('cube.mode.manualDesc', '从空白开始手动填写字段') },
                { id: 'from-dataset', icon: Database, label: t('cube.mode.fromDatasetCandidates', '从数据集候选生成'), desc: t('cube.mode.fromDatasetCandidatesDesc', '先生成字段候选并进行风险确认，再生成 Cube 草稿') },
                { id: 'from-datasource', icon: Database, label: t('cube.mode.fromDatasourceCandidates', '从数据源候选生成'), desc: t('cube.mode.fromDatasourceCandidatesDesc', '先生成字段候选并进行风险确认，再生成 Cube 草稿') },
              ] as const
            ).map(({ id, icon: Icon, label, desc }) => (
              <button
                key={id}
                type="button"
                aria-label={label}
                onClick={() => setMode(id as Mode)}
                className="flex w-full items-start gap-3 rounded-md border px-3 py-3 text-left transition-colors"
                style={{
                  borderColor: mode === id ? 'var(--accent)' : 'var(--border)',
                  background: mode === id ? 'color-mix(in srgb, var(--accent) 6%, var(--bg-surface))' : 'var(--bg-surface)',
                }}
              >
                <Icon size={14} style={{ color: mode === id ? 'var(--accent)' : 'var(--text-3)', marginTop: 2 }} />
                <div>
                  <div className="text-sm font-medium text-1">{label}</div>
                  <div className="text-xs text-3">{desc}</div>
                </div>
              </button>
            ))}
          </CardBody>
        </Card>

        {/* 基础信息 */}
        <Card>
          <CardHead title={t('cube.basicInfo', '基础信息')} />
          <CardBody className="space-y-3">
            <FormRow label={t('cube.name', '标识名称')} required>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="cube_name_snake_case"
                required
                id="cube-name"
              />
            </FormRow>
            <FormRow label={t('cube.title', '显示标题')} required>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('cube.titlePlaceholder', '如：订单交易 Cube')}
                required
                id="cube-title"
              />
            </FormRow>
            <FormRow label={t('cube.domain', '业务上下文')}>
              <Input
                value={domainName}
                onChange={(e) => setDomainName(e.target.value)}
                placeholder={t('cube.domainPlaceholder', '如：交易')}
                id="cube-domain"
              />
            </FormRow>
            {mode === 'manual' ? (
              <FormRow label={t('cube.factTable', '事实表')}>
                <Input
                  value={factTable}
                  onChange={(e) => setFactTable(e.target.value)}
                  placeholder="dwd_order_detail_df"
                  id="cube-fact-table"
                />
              </FormRow>
            ) : null}
            <FormRow label={t('cube.description', '描述')}>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder={t('cube.descriptionPlaceholder', '简要描述此 Cube 的业务用途…')}
                id="cube-description"
              />
            </FormRow>
          </CardBody>
        </Card>

        {/* 来源信息（非手动时显示） */}
        {mode !== 'manual' ? (
          <Card>
            <CardHead title={t('cube.sourceInfo', '来源信息')} />
            <CardBody className="space-y-3">
              {mode === 'from-dataset' ? (
                <FormRow label={t('cube.datasetId', '数据集 ID')} required>
                  <Input
                    value={datasetId}
                    onChange={(e) => setDatasetId(e.target.value)}
                    placeholder={t('cube.datasetIdPlaceholder', '数据集 UUID')}
                    required
                    id="cube-dataset-id"
                  />
                </FormRow>
              ) : (
                <>
                  <FormRow label={t('cube.sourceId', '数据源 ID')} required>
                    <Input
                      value={sourceId}
                      onChange={(e) => setSourceId(e.target.value)}
                      placeholder={t('cube.sourceIdPlaceholder', '数据源 UUID')}
                      required
                      id="cube-source-id"
                    />
                  </FormRow>
                  <FormRow label={t('cube.database', '数据库')}>
                    <Input
                      value={database}
                      onChange={(e) => setDatabase(e.target.value)}
                      placeholder="production_db"
                      id="cube-database"
                    />
                  </FormRow>
                  <FormRow label={t('cube.schema', 'Schema')}>
                    <Input
                      value={schema}
                      onChange={(e) => setSchema(e.target.value)}
                      placeholder="public"
                      id="cube-schema"
                    />
                  </FormRow>
                  <FormRow label={t('cube.table', '表名')} required>
                    <Input
                      value={table}
                      onChange={(e) => setTable(e.target.value)}
                      placeholder="dwd_order_detail_df"
                      required
                      id="cube-table"
                    />
                  </FormRow>
                </>
              )}
            </CardBody>
          </Card>
        ) : null}

        {/* 操作按钮 */}
        {createMutation.isError || draftMutation.isError || createStatusError ? (
          <p className="text-xs text-danger">
            {t('error.createFailed', '创建失败，请检查输入后重试')}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => navigate('/semantic/cubes')}>
            {t('action.cancel', '取消')}
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={handleCreate}
            disabled={isPending}
            aria-label={mode === 'manual' ? t('cube.create', '新建 Cube') : t('cube.generateDraft', '生成草稿')}
          >
            {isPending
              ? t('common.loading', '处理中…')
              : mode === 'manual'
                ? t('cube.create', '新建 Cube')
                : t('cube.generateDraft', '生成草稿')}
          </Button>
        </div>
      </div>
    </div>
  )
}

function FormRow({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-center gap-3">
      <label className="text-xs text-3">
        {label}
        {required ? <span className="ml-0.5 text-danger" aria-hidden>*</span> : null}
      </label>
      <div>{children}</div>
    </div>
  )
}
