import { Database, GitBranch, Save, Wand2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { CubeDetail, CubeDraftPayload, DimensionInfo, DomainSummary, MeasureInfo } from '@/api/semantic'
import { SchemaBrowser } from '@/components/business'
import { SemanticIssueList } from '@/components/Semantic/SemanticIssueList'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { TreeNode } from '@/components/business/SchemaBrowser/types'
import type { DataSource } from '@/types'
import { SemanticActionBar, type SemanticValidationSummary } from '@/components/Semantic/workbench'
import type { CubeStudioStepKey } from './CubeStudioStepRail'

function TaskAssistPanel({
  title,
  description,
  items = [],
  testId,
}: {
  title: string
  description: string
  items?: Array<{ label: string; value: string }>
  testId?: string
}) {
  return (
    <div
      className="rounded-[var(--workbench-radius-sm)] border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] px-4 py-4"
      data-testid={testId}
    >
      <div className="text-sm font-semibold text-[hsl(var(--workbench-ink))]">{title}</div>
      <p className="mt-1 text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">{description}</p>
      {items.length ? (
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] leading-4 text-[hsl(var(--workbench-muted-foreground))]">
          {items.map((item) => (
            <span
              key={item.label}
              className="rounded-full border border-[hsl(var(--workbench-outline))] bg-white/84 px-2.5 py-1"
            >
              {item.label}：{item.value}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function renderDimensionRows(dimensions: Record<string, DimensionInfo & { sql?: string }>) {
  const entries = Object.entries(dimensions || {})
  if (entries.length === 0) {
    return <div className="rounded-xl border border-dashed p-4 text-sm text-[hsl(var(--workbench-muted-foreground))]">当前还没有自动识别出的维度。</div>
  }
  return (
    <div className="overflow-hidden rounded-xl border border-[hsl(var(--workbench-outline))]">
      <table className="w-full text-sm">
        <thead className="bg-[hsl(var(--workbench-panel))]">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium">维度</th>
            <th className="px-4 py-2.5 text-left font-medium">类型</th>
            <th className="px-4 py-2.5 text-left font-medium">说明</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([key, dimension]) => (
            <tr key={key} className="border-t border-[hsl(var(--workbench-outline))]">
              <td className="px-4 py-2.5 font-mono text-xs">{key}</td>
              <td className="px-4 py-2.5">{dimension.type}</td>
              <td className="px-4 py-2.5 text-xs text-[hsl(var(--workbench-muted-foreground))]">
                {dimension.title || dimension.sql || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function renderMeasureRows(measures: Record<string, MeasureInfo & { sql?: string }>) {
  const entries = Object.entries(measures || {})
  if (entries.length === 0) {
    return <div className="rounded-xl border border-dashed p-4 text-sm text-[hsl(var(--workbench-muted-foreground))]">当前还没有自动识别出的指标。</div>
  }
  return (
    <div className="overflow-hidden rounded-xl border border-[hsl(var(--workbench-outline))]">
      <table className="w-full text-sm">
        <thead className="bg-[hsl(var(--workbench-panel))]">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium">指标</th>
            <th className="px-4 py-2.5 text-left font-medium">聚合类型</th>
            <th className="px-4 py-2.5 text-left font-medium">说明</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([key, measure]) => (
            <tr key={key} className="border-t border-[hsl(var(--workbench-outline))]">
              <td className="px-4 py-2.5 font-mono text-xs">{key}</td>
              <td className="px-4 py-2.5">{measure.type}</td>
              <td className="px-4 py-2.5 text-xs text-[hsl(var(--workbench-muted-foreground))]">
                {measure.title || measure.sql || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PanelFrame({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-[var(--workbench-radius)] border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] p-5 shadow-sm">
      <div className="mb-5 space-y-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--workbench-muted-foreground))]">
          {eyebrow}
        </div>
        <div className="text-lg font-semibold text-[hsl(var(--workbench-ink))]" style={{ fontFamily: 'var(--font-workbench-display)' }}>
          {title}
        </div>
        <p className="text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">{description}</p>
      </div>
      {children}
    </section>
  )
}

interface CubeStudioTaskPanelProps {
  activeStep: CubeStudioStepKey
  isEditMode: boolean
  datasources: DataSource[]
  domains: DomainSummary[]
  selectedSource: string
  selectedDomain: string
  selectedTable: { table: string; database: string; schema?: string } | null
  draft: CubeDraftPayload | null
  cubeDetail?: CubeDetail
  editForm: {
    title: string
    description: string
    status: string
    domain_id: string
    grain: string
    entity_key: string
  }
  selectedDataSource?: DataSource
  summary: SemanticValidationSummary
  isEditDirty: boolean
  createDraftPending: boolean
  createCubePending: boolean
  updateCubePending: boolean
  activatePending: boolean
  deprecatePending: boolean
  onSourceChange: (value: string) => void
  onDomainChange: (value: string) => void
  onSchemaSelect: (node: TreeNode) => void
  onDraftChange: (nextDraft: CubeDraftPayload) => void
  onEditFormChange: (patch: Partial<CubeStudioTaskPanelProps['editForm']>) => void
  onGenerateDraft: () => void
  onCreateCube: () => void
  onSaveCube: () => void
  onActivate: () => void
  onDeprecate: () => void
}

export function CubeStudioTaskPanel(props: CubeStudioTaskPanelProps) {
  const {
    activeStep,
    isEditMode,
    datasources,
    domains,
    selectedSource,
    selectedDomain,
    selectedTable,
    draft,
    cubeDetail,
    editForm,
    selectedDataSource,
    summary,
    isEditDirty,
    createDraftPending,
    createCubePending,
    updateCubePending,
    activatePending,
    deprecatePending,
    onSourceChange,
    onDomainChange,
    onSchemaSelect,
    onDraftChange,
    onEditFormChange,
    onGenerateDraft,
    onCreateCube,
    onSaveCube,
    onActivate,
    onDeprecate,
  } = props

  const currentDomainValue = draft?.domain_id || editForm.domain_id || selectedDomain || '__none__'
  const draftOrDetailDimensions = draft ? draft.dimensions : cubeDetail?.dimensions || {}
  const draftOrDetailMeasures = draft ? draft.measures : cubeDetail?.measures || {}
  const grainValue = draft?.grain || editForm.grain || ''
  const entityKeyValue = draft?.entity_key || editForm.entity_key || ''

  if (activeStep === 'basic') {
    return (
      <PanelFrame
        eyebrow="Step 1"
        title="基础信息"
        description="维护 Cube 名称、说明和领域归属。"
      >
        <TaskAssistPanel
          title={draft || cubeDetail ? '人工补充当前定义' : '自动带入基础信息'}
          description={
            draft || cubeDetail
              ? '名称、显示名称和领域归属已经带入当前草稿，当前只需要修正显示名称、领域和说明。'
              : '新建模式下，基础信息会在生成草稿后自动带入。当前步骤只保留显示名称、领域和说明等少量人工补充项。'
          }
          items={[
            { label: 'Cube 名称', value: draft || cubeDetail ? '已带入' : '等待草稿' },
            { label: '显示名称', value: draft?.title || editForm.title ? '可编辑' : '等待草稿' },
            { label: '所属领域', value: currentDomainValue !== '__none__' ? '可设置' : '可后补' },
          ]}
          testId="cube-studio-basic-assist"
        />
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="mb-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">Cube 名称</div>
            <Input
              data-testid="cube-draft-name"
              value={draft?.name || cubeDetail?.name || ''}
              disabled={!draft}
              onChange={(event) => draft && onDraftChange({ ...draft, name: event.target.value })}
              placeholder={!draft ? '生成草稿后自动带入' : undefined}
            />
          </div>
          <div>
            <div className="mb-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">显示名称</div>
            <Input
              data-testid="cube-draft-title"
              value={draft?.title || editForm.title}
              disabled={!draft && !cubeDetail}
              onChange={(event) => {
                if (draft) {
                  onDraftChange({ ...draft, title: event.target.value })
                } else {
                  onEditFormChange({ title: event.target.value })
                }
              }}
              placeholder={!draft && !cubeDetail ? '生成草稿后自动带入' : undefined}
            />
          </div>
          <div>
            <div className="mb-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">所属领域</div>
            <Select value={currentDomainValue} onValueChange={(value) => {
              const nextValue = value === '__none__' ? '' : value
              if (draft) {
                onDraftChange({ ...draft, domain_id: nextValue || undefined })
              } else {
                onDomainChange(nextValue)
                onEditFormChange({ domain_id: nextValue })
              }
            }}>
              <SelectTrigger>
                <SelectValue placeholder="暂不归入领域" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">暂不归入领域</SelectItem>
                {domains.map((domain) => (
                  <SelectItem key={domain.id || domain.code} value={String(domain.id || domain.code)}>
                    {domain.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="mb-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">当前状态</div>
            <Input value={draft?.status || editForm.status || cubeDetail?.status || 'draft'} disabled />
          </div>
        </div>
        <div className="mt-4">
          <div className="mb-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">说明</div>
          <Textarea
            value={draft?.description || editForm.description}
            disabled={!draft && !cubeDetail}
            onChange={(event) => {
              if (draft) {
                onDraftChange({ ...draft, description: event.target.value })
              } else {
                onEditFormChange({ description: event.target.value })
              }
            }}
            rows={4}
            placeholder={!draft && !cubeDetail ? '用于补充业务说明。' : undefined}
          />
        </div>
      </PanelFrame>
    )
  }

  if (activeStep === 'source') {
    return (
      <PanelFrame
        eyebrow="Step 2"
        title="来源绑定"
        description="维护数据源、物理表和当前绑定摘要。"
      >
        <div className="space-y-5">
          <TaskAssistPanel
            title="自动生成草稿"
            description={
              isEditMode
                ? '编辑模式下显示当前来源上下文，不在这里重新维护字段结构。'
                : '确认数据源和物理表后直接生成初始 Cube。后续主要校对自动识别结果，而不是从空白开始手工配置。'
            }
            items={
              isEditMode
                ? [
                    { label: '当前来源', value: cubeDetail?.source_binding_summary?.source_name || '未绑定' },
                    { label: '物理表', value: cubeDetail?.table || '未记录' },
                  ]
                : [
                    { label: '数据源', value: selectedDataSource?.name || '未选择' },
                    { label: '物理表', value: selectedTable?.table || '未选择' },
                    { label: '草稿', value: draft ? '已生成' : '待生成' },
                  ]
            }
            testId="cube-studio-source-assist"
          />

          {!isEditMode ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">数据源</div>
                  <Select value={selectedSource} onValueChange={onSourceChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择数据源" />
                    </SelectTrigger>
                    <SelectContent>
                      {datasources.map((ds) => (
                        <SelectItem key={ds.id} value={String(ds.id)}>
                          {ds.name} · {ds.source_type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="rounded-[var(--workbench-radius-sm)] border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-[hsl(var(--workbench-muted-foreground))]">当前绑定</div>
                  <div className="mt-1.5 text-sm font-medium text-[hsl(var(--workbench-ink))]">
                    {selectedTable?.table || '尚未选择物理表'}
                  </div>
                  <div className="mt-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">
                    {selectedDataSource?.name || '未选择数据源'}
                  </div>
                </div>
              </div>

              <div className="rounded-[var(--workbench-radius)] border border-[hsl(var(--workbench-outline))] bg-white/84 p-4">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-[hsl(var(--workbench-ink))]">物理结构浏览器</div>
                    <p className="text-xs leading-5 text-[hsl(var(--workbench-muted-foreground))]">
                      显示所选数据源中的物理表和字段。
                    </p>
                  </div>
                  <Badge variant="outline">{selectedDataSource?.name || '未选数据源'}</Badge>
                </div>
                <SchemaBrowser
                  datasourceId={selectedSource ? Number(selectedSource) : undefined}
                  sourceType={selectedDataSource?.source_type}
                  collapsible={false}
                  title="物理表结构"
                  className="border-l-0"
                  onSelect={onSchemaSelect}
                />
              </div>
            </>
          ) : (
            <div className="rounded-[var(--workbench-radius)] border border-[hsl(var(--workbench-outline))] bg-white/84 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--workbench-ink))]">
                <Database className="h-4 w-4 text-[hsl(var(--workbench-muted-foreground))]" />
                当前来源绑定
              </div>
              <div className="mt-3 text-sm font-medium text-[hsl(var(--workbench-ink))]">
                {cubeDetail?.source_binding_summary?.source_name || cubeDetail?.source_binding_summary?.source_type || '未绑定数据源'}
              </div>
              <div className="mt-1 text-xs leading-5 text-[hsl(var(--workbench-muted-foreground))]">
                {cubeDetail?.source_binding_summary?.database || cubeDetail?.source_database || '—'}
                {cubeDetail?.source_binding_summary?.schema ? ` / ${cubeDetail.source_binding_summary.schema}` : ''}
                {cubeDetail?.table ? ` / ${cubeDetail.table}` : ''}
              </div>
            </div>
          )}

          <SemanticActionBar
            title="来源绑定动作"
            description={isEditMode ? '显示当前来源上下文。' : '执行草稿生成前的来源与物理表绑定。'}
            status={summary.status}
            primaryAction={!isEditMode ? {
              label: '生成 Cube 草稿',
              onClick: onGenerateDraft,
              icon: <Wand2 className="mr-1.5 h-4 w-4" />,
              disabled: !selectedSource || !selectedTable || createDraftPending,
              testId: 'cube-generate-draft',
            } : undefined}
          />
        </div>
      </PanelFrame>
    )
  }

  if (activeStep === 'structure') {
    return (
      <PanelFrame
        eyebrow="Step 3"
        title="维度 / 指标"
        description="显示自动识别出的维度和指标。"
      >
        <TaskAssistPanel
          title="自动识别结果"
          description="当前维度和指标来自物理结构自动识别。优先确认差异和命名是否合理，再决定是否继续补充规则。"
          items={[
            { label: '维度', value: String(Object.keys(draftOrDetailDimensions).length) },
            { label: '指标', value: String(Object.keys(draftOrDetailMeasures).length) },
            { label: '处理方式', value: draft || cubeDetail ? '校对为主' : '先生成草稿' },
          ]}
          testId="cube-studio-structure-assist"
        />
        {draft || cubeDetail ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-3">
              <div className="text-sm font-semibold text-[hsl(var(--workbench-ink))]">维度预览</div>
              {renderDimensionRows(draftOrDetailDimensions)}
            </div>
            <div className="space-y-3">
              <div className="text-sm font-semibold text-[hsl(var(--workbench-ink))]">指标预览</div>
              {renderMeasureRows(draftOrDetailMeasures)}
            </div>
          </div>
        ) : (
          <SemanticIssueList
            hints={['生成草稿后显示自动识别结果。']}
            emptyText="当前还没有结构可供校对。"
          />
        )}
      </PanelFrame>
    )
  }

  if (activeStep === 'rules') {
    return (
      <PanelFrame
        eyebrow="Step 4"
        title="语义规则"
        description="维护默认粒度和实体主键。"
      >
        <TaskAssistPanel
          title="只维护必要规则"
          description="当前阶段只保留默认粒度和实体主键两个高频规则，减少人工配置负担。"
          items={[
            { label: '默认粒度', value: grainValue ? '已填写' : '可后补' },
            { label: '实体主键', value: entityKeyValue ? '已填写' : '可后补' },
          ]}
          testId="cube-studio-rules-assist"
        />
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="mb-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">默认粒度</div>
            <Input
              value={grainValue}
              disabled={!draft && !cubeDetail}
              onChange={(event) => {
                if (draft) {
                  onDraftChange({ ...draft, grain: event.target.value || undefined })
                } else {
                  onEditFormChange({ grain: event.target.value })
                }
              }}
              placeholder="如 day / user / order"
            />
          </div>
          <div>
            <div className="mb-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">实体主键</div>
            <Input
              value={entityKeyValue}
              disabled={!draft && !cubeDetail}
              onChange={(event) => {
                if (draft) {
                  onDraftChange({ ...draft, entity_key: event.target.value || undefined })
                } else {
                  onEditFormChange({ entity_key: event.target.value })
                }
              }}
              placeholder="如 user_id / order_id"
            />
          </div>
        </div>
        <div className="mt-4 rounded-[var(--workbench-radius-sm)] border border-dashed border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] px-4 py-4 text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">
          当前开放默认粒度和实体主键两个规则项。
        </div>
      </PanelFrame>
    )
  }

  if (activeStep === 'validation') {
    return (
      <PanelFrame
        eyebrow="Step 5"
        title="校验与预览"
        description="显示阻塞项、提醒项和结构摘要。"
      >
        <div className="space-y-5">
          <SemanticIssueList blockers={summary.blockers} hints={summary.hints} emptyText="当前没有阻塞项。" />

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {(summary.stats || []).map((item) => (
              <div
                key={item.label}
                className="rounded-[var(--workbench-radius-sm)] border border-[hsl(var(--workbench-outline))] bg-white/86 px-4 py-3"
              >
                <div className="text-[10px] uppercase tracking-[0.12em] text-[hsl(var(--workbench-muted-foreground))]">{item.label}</div>
                <div className="mt-1.5 text-sm font-semibold text-[hsl(var(--workbench-ink))]">{item.value}</div>
              </div>
            ))}
          </div>

          <div className="rounded-[var(--workbench-radius-sm)] border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] px-4 py-4 text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">
            当前校验范围包括命名、来源、结构和核心规则。
          </div>
        </div>
      </PanelFrame>
    )
  }

  return (
    <PanelFrame
      eyebrow="Step 6"
      title="保存与发布"
      description="执行保存和生命周期动作。"
    >
      <div className="space-y-5">
        <SemanticActionBar
          title={isEditMode ? '保存当前修改' : '保存当前草稿'}
          description={isEditMode ? '保存属性修改后，可按需要激活或弃用当前模型。' : '确认结构和规则后，将当前草稿保存为 Draft Cube。'}
          status={summary.status}
          primaryAction={
            isEditMode
              ? {
                label: '保存当前修改',
                onClick: onSaveCube,
                icon: <Save className="mr-1.5 h-4 w-4" />,
                disabled: !isEditDirty || updateCubePending,
                testId: 'semantic-primary-action',
              }
              : {
                label: '保存为 Draft Cube',
                onClick: onCreateCube,
                icon: <Save className="mr-1.5 h-4 w-4" />,
                disabled: createCubePending || summary.status === 'blocked',
                testId: 'cube-save-draft',
              }
          }
          secondaryActions={
            isEditMode ? (
              <>
                <Button variant="outline" onClick={onActivate} disabled={cubeDetail?.status === 'active' || activatePending}>
                  激活
                </Button>
                <Button variant="outline" onClick={onDeprecate} disabled={cubeDetail?.status === 'deprecated' || deprecatePending}>
                  弃用
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={onGenerateDraft} disabled={!selectedSource || !selectedTable || createDraftPending}>
                <Wand2 className="mr-1.5 h-4 w-4" />
                重新生成草稿
              </Button>
            )
          }
        />

        <div className="rounded-[var(--workbench-radius-sm)] border border-dashed border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] px-4 py-4 text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">
          领域关系、 Join 和发布链路在领域建模页维护。
          <div className="mt-3">
            <Button asChild variant="outline">
              <Link to="/semantic/modeling">
                <GitBranch className="mr-1.5 h-4 w-4" />
                打开领域画布
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </PanelFrame>
  )
}
