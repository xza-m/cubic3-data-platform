import { useMemo, useState } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, FileCode2, Rocket, Save, ShieldCheck, Sparkles } from 'lucide-react'
import { Button, Card, CardBody, CardHead, Input, Select, Textarea } from '@v2/components/ui'
import {
  useApplySemanticModelingAgent,
  useCheckSemanticModelingAgentReady,
  useCreateSemanticModelingAgentSpecDraft,
  useDraftSemanticModelingAgentFromSpec,
  usePublishSemanticModelingAgent,
  useValidateSemanticModelingAgent,
} from '@v2/hooks/semantic'
import type { SemanticModelingAgentSpec } from '@v2/api/semantic'

type SourceKind = 'physical_table' | 'dataset'

export default function ModelingAgent() {
  const [sourceKind, setSourceKind] = useState<SourceKind>('physical_table')
  const [sourceId, setSourceId] = useState('')
  const [datasetId, setDatasetId] = useState('')
  const [database, setDatabase] = useState('')
  const [schema, setSchema] = useState('')
  const [table, setTable] = useState('')
  const [subject, setSubject] = useState('')
  const [useCases, setUseCases] = useState('')
  const [roles, setRoles] = useState('')
  const [sensitivity, setSensitivity] = useState('restricted')
  const [spec, setSpec] = useState<SemanticModelingAgentSpec | null>(null)
  const [specText, setSpecText] = useState('')
  const [draftSummary, setDraftSummary] = useState<unknown | null>(null)
  const [validation, setValidation] = useState<unknown | null>(null)
  const [agentReady, setAgentReady] = useState<unknown | null>(null)
  const [applySummary, setApplySummary] = useState<unknown | null>(null)
  const [publishSummary, setPublishSummary] = useState<unknown | null>(null)
  const [localError, setLocalError] = useState('')

  const specDraft = useCreateSemanticModelingAgentSpecDraft()
  const draftFromSpec = useDraftSemanticModelingAgentFromSpec()
  const validateAgent = useValidateSemanticModelingAgent()
  const checkAgentReady = useCheckSemanticModelingAgentReady()
  const applyAgent = useApplySemanticModelingAgent()
  const publishAgent = usePublishSemanticModelingAgent()

  const parsedSpec = useMemo(() => {
    if (!specText.trim()) return spec
    try {
      return JSON.parse(specText) as SemanticModelingAgentSpec
    } catch {
      return null
    }
  }, [spec, specText])

  const cubeName = String(parsedSpec?.cube?.name ?? '')
  const objectName = String((parsedSpec?.ontology as Record<string, unknown> | undefined)?.object
    ? ((parsedSpec?.ontology as { object?: { name?: string } }).object?.name ?? '')
    : '')
  const isPending =
    specDraft.isPending ||
    draftFromSpec.isPending ||
    validateAgent.isPending ||
    checkAgentReady.isPending ||
    applyAgent.isPending ||
    publishAgent.isPending

  const handleGenerateSpec = async () => {
    setLocalError('')
    const result = await specDraft.mutateAsync({
      source_kind: sourceKind,
      source_id: sourceKind === 'physical_table' ? sourceId.trim() || undefined : undefined,
      dataset_id: sourceKind === 'dataset' ? datasetId.trim() || undefined : undefined,
      database: database.trim() || undefined,
      schema: schema.trim() || undefined,
      table: table.trim() || undefined,
      business_subject: subject.trim() || undefined,
      use_cases: splitList(useCases),
      default_roles: splitList(roles),
      sensitivity_level: sensitivity,
    })
    setSpec(result.spec)
    setSpecText(JSON.stringify(result.spec, null, 2))
    setDraftSummary(null)
    setValidation(null)
    setAgentReady(null)
    setApplySummary(null)
    setPublishSummary(null)
  }

  const handleDraftFromSpec = async () => {
    const nextSpec = getEditableSpec(parsedSpec, setLocalError)
    if (!nextSpec) return
    setDraftSummary(await draftFromSpec.mutateAsync(nextSpec))
  }

  const handleValidate = async () => {
    const nextSpec = getEditableSpec(parsedSpec, setLocalError)
    if (!nextSpec) return
    setValidation(await validateAgent.mutateAsync(nextSpec))
  }

  const handleAgentReady = async () => {
    const nextSpec = getEditableSpec(parsedSpec, setLocalError)
    if (!nextSpec) return
    setAgentReady(await checkAgentReady.mutateAsync(nextSpec))
  }

  const handleApply = async () => {
    const nextSpec = getEditableSpec(parsedSpec, setLocalError)
    if (!nextSpec) return
    const result = await applyAgent.mutateAsync(nextSpec)
    setApplySummary(result)
    if (result.spec) {
      setSpec(result.spec)
      setSpecText(JSON.stringify(result.spec, null, 2))
    }
  }

  const handlePublishCube = async () => {
    const nextSpec = getEditableSpec(parsedSpec, setLocalError)
    if (!nextSpec) return
    setPublishSummary(
      await publishAgent.mutateAsync({
        spec: nextSpec,
        publish_targets: { cube: true, ontology: false },
      }),
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-auto scroll-thin p-5">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-base font-semibold text-1">建模助手 Agent</h1>
            <p className="mt-1 text-xs text-3">
              从事实表和业务意图一次生成 Cube 技术语义与 Ontology 业务语义草稿。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="btn btn-sm" to="/semantic/cubes">Cube</Link>
            <Link className="btn btn-sm" to="/semantic/ontology">Ontology</Link>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-4">
            <Card>
              <CardHead
                title={<span className="flex items-center gap-2"><Sparkles size={14} />构建输入</span>}
                subtitle="选择建模源并填写少量业务意图"
              />
              <CardBody className="space-y-3">
                <FormRow label="建模源" htmlFor="modeling-agent-source-kind">
                  <Select
                    id="modeling-agent-source-kind"
                    value={sourceKind}
                    onChange={(event) => setSourceKind(event.target.value as SourceKind)}
                  >
                    <option value="physical_table">物理事实表</option>
                    <option value="dataset">数据集</option>
                  </Select>
                </FormRow>
                {sourceKind === 'dataset' ? (
                  <FormRow label="数据集 ID" htmlFor="modeling-agent-dataset-id">
                    <Input id="modeling-agent-dataset-id" value={datasetId} onChange={(event) => setDatasetId(event.target.value)} />
                  </FormRow>
                ) : (
                  <>
                    <FormRow label="数据源 ID" htmlFor="modeling-agent-source-id">
                      <Input id="modeling-agent-source-id" value={sourceId} onChange={(event) => setSourceId(event.target.value)} />
                    </FormRow>
                    <FormRow label="数据库" htmlFor="modeling-agent-database">
                      <Input id="modeling-agent-database" value={database} onChange={(event) => setDatabase(event.target.value)} />
                    </FormRow>
                    <FormRow label="Schema" htmlFor="modeling-agent-schema">
                      <Input id="modeling-agent-schema" value={schema} onChange={(event) => setSchema(event.target.value)} />
                    </FormRow>
                    <FormRow label="事实表" htmlFor="modeling-agent-table">
                      <Input
                        id="modeling-agent-table"
                        value={table}
                        onChange={(event) => setTable(event.target.value)}
                        placeholder="dwd_student_comment_events"
                      />
                    </FormRow>
                  </>
                )}
                <FormRow label="业务主题" htmlFor="modeling-agent-subject">
                  <Input id="modeling-agent-subject" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="学生评论" />
                </FormRow>
                <FormRow label="使用场景" htmlFor="modeling-agent-use-cases">
                  <Textarea id="modeling-agent-use-cases" value={useCases} onChange={(event) => setUseCases(event.target.value)} rows={3} />
                </FormRow>
                <FormRow label="默认角色" htmlFor="modeling-agent-roles">
                  <Input id="modeling-agent-roles" value={roles} onChange={(event) => setRoles(event.target.value)} placeholder="teacher_ops, content_audit" />
                </FormRow>
                <FormRow label="敏感等级" htmlFor="modeling-agent-sensitivity">
                  <Select id="modeling-agent-sensitivity" value={sensitivity} onChange={(event) => setSensitivity(event.target.value)}>
                    <option value="restricted">restricted</option>
                    <option value="public">public</option>
                    <option value="private">private</option>
                  </Select>
                </FormRow>
                <Button variant="primary" className="w-full justify-center" disabled={isPending} {...taskActivation(handleGenerateSpec)}>
                  <Sparkles size={13} /> 生成 Spec
                </Button>
              </CardBody>
            </Card>

            <Card>
              <CardHead title={<span className="flex items-center gap-2"><ShieldCheck size={14} />发布策略</span>} />
              <CardBody className="space-y-2 text-xs text-3">
                <StatusLine label="默认发布" value="Cube only" />
                <StatusLine label="本体发布" value="需业务确认" />
                <StatusLine label="Agent 正式命中" value="仅消费已发布 Ontology" />
              </CardBody>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHead
                title={<span className="flex items-center gap-2"><FileCode2 size={14} />SemanticModelingAgentSpec</span>}
                subtitle="可轻量修改后继续生成草稿"
                actions={cubeName ? <code className="text-xs text-2">{cubeName}</code> : null}
              />
              <CardBody className="space-y-3">
                <Textarea
                  aria-label="SemanticModelingAgentSpec"
                  value={specText}
                  onChange={(event) => {
                    setSpecText(event.target.value)
                    setLocalError('')
                  }}
                  rows={18}
                  className="font-mono text-xs"
                  placeholder="生成 Spec 后可在这里微调 JSON"
                />
                {objectName ? (
                  <div className="flex flex-wrap gap-2 text-xs text-3">
                    <span>业务对象</span>
                    <code className="text-2">{objectName}</code>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={!specText || isPending} {...taskActivation(handleDraftFromSpec)}>
                    <FileCode2 size={12} /> 生成草稿
                  </Button>
                  <Button size="sm" disabled={!specText || isPending} {...taskActivation(handleValidate)}>
                    <CheckCircle2 size={12} /> 校验
                  </Button>
                  <Button size="sm" disabled={!specText || isPending} {...taskActivation(handleAgentReady)}>
                    <ShieldCheck size={12} /> Agent-ready
                  </Button>
                  <Button size="sm" disabled={!specText || isPending} {...taskActivation(handleApply)}>
                    <Save size={12} /> 保存草稿
                  </Button>
                  <Button size="sm" variant="primary" disabled={!specText || isPending} {...taskActivation(handlePublishCube)}>
                    <Rocket size={12} /> 发布 Cube
                  </Button>
                </div>
                {localError ? <div className="text-xs text-danger">{localError}</div> : null}
              </CardBody>
            </Card>

            <div className="grid gap-3 md:grid-cols-2">
              <ResultPanel title="草稿生成" data={draftSummary} empty="等待生成草稿" />
              <ResultPanel title="校验结果" data={validation} empty="等待校验" highlightKey="status" />
              <ResultPanel title="Agent-ready" data={agentReady} empty="等待 Agent-ready 检查" highlightKey="status" />
              <ResultPanel title="保存结果" data={applySummary} empty="等待保存草稿" />
              <ResultPanel title="发布结果" data={publishSummary} empty="等待发布 Cube" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function FormRow({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-2" htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  )
}

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className="font-medium text-1">{value}</span>
    </div>
  )
}

function ResultPanel({
  title,
  data,
  empty,
  highlightKey,
}: {
  title: string
  data: unknown | null
  empty: string
  highlightKey?: string
}) {
  const highlight = highlightKey && isRecord(data) ? String(data[highlightKey] ?? '') : ''
  return (
    <Card>
      <CardHead title={title} actions={highlight ? <code className="text-xs text-2">{highlight}</code> : null} />
      <CardBody>
        {data ? (
          <pre className="max-h-48 overflow-auto text-xs leading-5 text-2">{JSON.stringify(data, null, 2)}</pre>
        ) : (
          <div className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-3" style={{ borderColor: 'var(--border)' }}>
            {empty}
          </div>
        )}
      </CardBody>
    </Card>
  )
}

function splitList(value: string): string[] {
  return value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function taskActivation(
  handler: () => void | Promise<void>,
): Pick<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'onPointerUp'> {
  const activate = () => {
    void handler()
  }
  if (import.meta.env.VITE_BROWSER_E2E_FIXTURES === '1') {
    return { onPointerUp: activate }
  }
  return { onClick: activate }
}

function getEditableSpec(
  value: SemanticModelingAgentSpec | null,
  setLocalError: (message: string) => void,
): SemanticModelingAgentSpec | null {
  if (!value) {
    setLocalError('请先生成并确认 SemanticModelingAgentSpec')
    return null
  }
  setLocalError('')
  return value
}
