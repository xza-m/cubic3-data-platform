import type { SemanticModelingCopilotSession } from '@v2/api/semantic'

export type BuilderStepId =
  | 'scope'
  | 'source_evidence'
  | 'field_candidates'
  | 'semantic_draft'
  | 'publish_check'
  | 'publish_result'

export interface BuilderStep {
  id: BuilderStepId
  label: string
  description: string
}

export const BUILDER_STEPS: BuilderStep[] = [
  { id: 'scope', label: '建设范围', description: '确认建设目标、业务范围和入口上下文。' },
  { id: 'source_evidence', label: '来源证据', description: '沉淀可用于建模的数据来源和证据线索。' },
  { id: 'field_candidates', label: '字段候选', description: '审阅候选指标、维度和字段风险。' },
  { id: 'semantic_draft', label: '语义草案', description: '形成可继续校验的语义模型草案。' },
  { id: 'publish_check', label: '发布校验', description: '复核待发布资产和发布前阻断项。' },
  { id: 'publish_result', label: '发布结果', description: '查看发布结果和后续消费者验证。' },
]

export function getActiveBuilderStepId(
  session: SemanticModelingCopilotSession | null | undefined,
): BuilderStepId {
  if (!session) return 'scope'

  const state = session.workbench_state || {}
  if (state.publish_result) return 'publish_result'
  if (session.current_proposal_id) return 'publish_check'
  if (hasSemanticDraft(state.raw_spec)) return 'semantic_draft'
  if (hasFieldCandidateTrace(state)) return 'field_candidates'
  if (hasSourceEvidence(state)) return 'source_evidence'
  return 'scope'
}

function hasSemanticDraft(rawSpec: unknown): boolean {
  if (!isRecord(rawSpec)) return false
  return Boolean(rawSpec.cube || rawSpec.cubes || rawSpec.spec_version)
}

function hasFieldCandidateTrace(state: SemanticModelingCopilotSession['workbench_state']): boolean {
  const rawSpec = isRecord(state.raw_spec) ? state.raw_spec : {}
  const cube = isRecord(rawSpec.cube) ? rawSpec.cube : {}
  const cubes = Array.isArray(rawSpec.cubes) ? rawSpec.cubes : []
  const firstCube = isRecord(cubes[0]) ? cubes[0] : {}

  return Boolean(
    fieldCandidateSetId(state.field_candidate_trace) ||
      fieldCandidateSetId(cube.field_candidate_trace) ||
      fieldCandidateSetId(firstCube.field_candidate_trace),
  )
}

function fieldCandidateSetId(value: unknown): string | null {
  if (!isRecord(value)) return null
  const candidateSetId = value.candidate_set_id
  return typeof candidateSetId === 'string' && candidateSetId.trim() ? candidateSetId : null
}

function hasSourceEvidence(state: SemanticModelingCopilotSession['workbench_state']): boolean {
  return Boolean((state.source_candidates ?? []).length > 0 || state.source_evidence)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
