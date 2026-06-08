import type {
  CopilotCandidateCard,
  CopilotConfirmation,
  CopilotEvidenceItem,
  CopilotSandboxPreview,
  CopilotSourceCandidate,
  SemanticModelingCopilotSession,
  SemanticModelingCopilotWorkbenchState,
} from '@v2/api/semantic'

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent'

type Canvas = NonNullable<SemanticModelingCopilotWorkbenchState['semantic_canvas']>

export type AssistantCard =
  | { type: 'discovered'; canvas: Canvas; candidates: CopilotCandidateCard[] }
  | { type: 'source_candidates'; candidates: CopilotSourceCandidate[] }
  | { type: 'cube_draft'; cube: Record<string, unknown>; candidateTable?: string; accepted: boolean }
  | { type: 'confirmation'; confirmations: CopilotConfirmation[] }
  | { type: 'sandbox_result'; preview: CopilotSandboxPreview }
  | {
      type: 'saved'
      proposalId?: string
      proposalSummary?: Record<string, unknown>
      nextSteps?: SemanticModelingCopilotWorkbenchState['next_steps']
      published: boolean
      publishResult?: Record<string, unknown>
    }

export function buildAssistantCards(session: SemanticModelingCopilotSession): AssistantCard[] {
  const state = session.workbench_state || {}
  const cards: AssistantCard[] = []
  const canvas = state.semantic_canvas
  const candidates = state.candidate_cards ?? []
  if (canvas && countCanvasAssets(state) + candidates.length > 0) {
    cards.push({ type: 'discovered', canvas, candidates })
  }
  if ((state.source_candidates ?? []).length > 0) {
    cards.push({ type: 'source_candidates', candidates: state.source_candidates ?? [] })
  }
  const cube = extractCubeDraft(state)
  if (cube) {
    cards.push({
      type: 'cube_draft',
      cube,
      candidateTable: candidateTableFromState(state),
      accepted: isCubeDraftAccepted(state),
    })
  }
  const confirmations = state.required_confirmations ?? []
  if (confirmations.length > 0) {
    cards.push({ type: 'confirmation', confirmations })
  }
  if (state.sandbox_preview) {
    cards.push({ type: 'sandbox_result', preview: state.sandbox_preview })
  }
  const proposalSummary = asRecord(state.proposal_summary)
  const proposalId = state.save_result?.proposal_id || proposalSummary?.id || session.current_proposal_id || undefined
  const publishResult = asRecord(state.publish_result)
  if (proposalId || publishResult) {
    cards.push({
      type: 'saved',
      proposalId: proposalId ? String(proposalId) : undefined,
      proposalSummary: proposalSummary ?? undefined,
      nextSteps: state.next_steps,
      published: publishResult?.status === 'published',
      publishResult: publishResult ?? undefined,
    })
  }
  return cards
}

export function countCanvasAssets(state?: SemanticModelingCopilotWorkbenchState): number {
  const canvas = state?.semantic_canvas
  if (!canvas) return 0
  return (
    (canvas.objects?.length ?? 0) +
    (canvas.metrics?.length ?? 0) +
    (canvas.dimensions?.length ?? 0) +
    (canvas.bindings?.length ?? 0) +
    (canvas.policies?.length ?? 0) +
    (state?.candidate_cards?.length ?? 0)
  )
}

export function dumpCubeYaml(value: Record<string, unknown>): string {
  return stringifyYaml(value).trimEnd()
}

export function entryTypeLabel(value?: string | null): string {
  switch (value) {
    case 'table_known':
      return '已知数仓表'
    case 'semantic_gap':
      return '未命中 Trace'
    case 'business_question':
      return '业务问题'
    default:
      return value ? String(value) : '业务问题'
  }
}

export function evidenceLevel(item: CopilotEvidenceItem): 'P0' | 'P1' | 'P2' | 'P3' {
  const level = String(item.trust_level ?? '').toUpperCase()
  if (level === 'P0' || level === 'P1' || level === 'P2' || level === 'P3') return level
  if (item.source_uri) return 'P1'
  if (item.extracted_claim || item.text) return 'P2'
  return 'P3'
}

export function extractCubeDraft(state?: SemanticModelingCopilotWorkbenchState): Record<string, unknown> | null {
  const rawSpec = asRecord(state?.raw_spec)
  const cube = asRecord(rawSpec?.cube)
  if (cube) return cube
  const cubes = Array.isArray(rawSpec?.cubes) ? rawSpec.cubes : []
  const firstCube = asRecord(cubes[0])
  if (firstCube) return firstCube
  return asRecord(state?.cube_draft) ?? null
}

export function hasCubeDraft(state?: SemanticModelingCopilotWorkbenchState): boolean {
  return extractCubeDraft(state) !== null
}

export function inferEntryType(text: string): 'table_known' | 'business_question' | 'semantic_gap' {
  const normalized = text.trim().toLowerCase()
  if (/\b[a-z][\w]*\.[a-z][\w]*\b/.test(normalized) || /\bdwd_|ods_|ads_|dim_|fact_/.test(normalized)) {
    return 'table_known'
  }
  if (
    normalized.includes('没听懂') ||
    normalized.includes('补语义') ||
    normalized.includes('未命中') ||
    normalized.includes('miss_trace')
  ) {
    return 'semantic_gap'
  }
  return 'business_question'
}

export function isCubeDraftAccepted(state?: SemanticModelingCopilotWorkbenchState): boolean {
  const value = state?.cube_draft_accepted ?? state?.accepted_cube_draft
  if (typeof value === 'boolean') return value
  return (state?.required_confirmations ?? []).some((item) => item.id === 'accept_cube_draft' && item.confirmed)
}

export function readinessLabel(session: SemanticModelingCopilotSession | null | undefined): string {
  if (!session) return '等你描述需求'
  const readiness = session.workbench_state?.readiness
  if ((session.workbench_state?.publish_result as Record<string, unknown> | undefined)?.status === 'published') return '已发布 · 消费者可验证'
  if (session.current_proposal_id) return '语义已就绪 · 待发布'
  const requiredCount = session.workbench_state?.required_confirmations?.length ?? 0
  if (requiredCount > 0) return `请确认 ${requiredCount} 项口径`
  if (hasCubeDraft(session.workbench_state) && !isCubeDraftAccepted(session.workbench_state)) return 'Cube 草稿待接受'
  if (readiness?.canonical_ready) return '正式可用'
  if (readiness?.exploratory_ready || countCanvasAssets(session.workbench_state) > 0) return '可应用语义'
  if ((readiness?.reasons ?? []).length > 0) return '已阻塞'
  return session.status === 'completed' ? '已完成' : '进行中'
}

export function readinessTone(session: SemanticModelingCopilotSession | null | undefined): Tone {
  if (!session) return 'neutral'
  const readiness = session.workbench_state?.readiness
  if (readiness?.canonical_ready || (session.workbench_state?.publish_result as Record<string, unknown> | undefined)?.status === 'published') return 'success'
  if (session.current_proposal_id) return 'accent'
  if ((session.workbench_state?.required_confirmations ?? []).length > 0) return 'warning'
  if (hasCubeDraft(session.workbench_state) && !isCubeDraftAccepted(session.workbench_state)) return 'warning'
  if (readiness?.exploratory_ready) return 'accent'
  if ((readiness?.reasons ?? []).length > 0) return 'warning'
  return 'neutral'
}

export function sandboxFriendlyMessage(
  preview: CopilotSandboxPreview,
  state?: SemanticModelingCopilotWorkbenchState,
): { tone: 'success' | 'warning' | 'danger'; headline: string; hint?: string } {
  const status = String(preview.status ?? '').toLowerCase()
  if (status === 'failed' || status === 'error') {
    return { tone: 'danger', headline: preview.summary || '沙盒预演失败', hint: '请先修复 spec 或后端返回的校验问题。' }
  }
  if (status === 'blocked' && hasCubeDraft(state) && !isCubeDraftAccepted(state)) {
    return {
      tone: 'warning',
      headline: '沙盒预演被阻塞：Cube 草稿还没接受',
      hint: '可以先点击「接受草稿」锁定当前 spec，也可以直接应用语义生成 Proposal。',
    }
  }
  if (preview.pollutes_official_route || status === 'blocked') {
    return { tone: 'warning', headline: preview.summary || '沙盒预演被阻断', hint: '当前草稿不会污染正式 runtime。' }
  }
  if (!hasCubeDraft(state) && !preview.summary) {
    return { tone: 'warning', headline: '还没有可预演的 Cube 草稿', hint: '先让 Copilot 生成或确认语义定义。' }
  }
  return { tone: 'success', headline: preview.summary || '沙盒预演通过', hint: '预演只验证草稿，不会发布正式语义资产。' }
}

export function sessionTitle(session: SemanticModelingCopilotSession | null | undefined): string {
  if (!session) return '准备开始'
  const title = String(session.title || session.user_goal || session.id || '')
  return title.length > 24 ? `${title.slice(0, 23)}…` : title
}

export function statusTone(value?: string | null): Tone {
  const text = String(value ?? '').toLowerCase()
  if (!text) return 'neutral'
  if (text === 'p0' || text === 'p1') return 'success'
  if (text === 'p2' || text.includes('draft') || text.includes('proposed')) return 'warning'
  if (['candidate', 'restricted'].some((token) => text.includes(token))) return 'accent'
  if (['active', 'linked', 'ready', 'success', 'completed', 'published', 'approved'].some((token) => text.includes(token))) return 'success'
  if (['blocked', 'failed', 'error', 'denied', 'danger', 'rejected'].some((token) => text.includes(token))) return 'danger'
  if (['warning', 'pending', 'review'].some((token) => text.includes(token))) return 'warning'
  return 'neutral'
}

function candidateTableFromState(state: SemanticModelingCopilotWorkbenchState): string | undefined {
  const patch = asRecord(state.proposal_patch)
  const fromPatch = patch?.candidate_table ?? patch?.source_table
  if (fromPatch) return String(fromPatch)
  const sourceTable = asRecord(state.source_evidence?.source_table)
  const name = sourceTable?.name ?? sourceTable?.table
  return name ? String(name) : undefined
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function stringifyYaml(value: unknown, depth = 0): string {
  const indent = '  '.repeat(depth)
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]\n'
    return value.map((item) => {
      if (asRecord(item) || Array.isArray(item)) {
        return `${indent}-\n${stringifyYaml(item, depth + 1)}`
      }
      return `${indent}- ${formatScalar(item)}\n`
    }).join('')
  }
  const record = asRecord(value)
  if (record) {
    const entries = Object.entries(record)
    if (entries.length === 0) return '{}\n'
    return entries.map(([key, item]) => {
      if (asRecord(item) || Array.isArray(item)) {
        return `${indent}${key}:\n${stringifyYaml(item, depth + 1)}`
      }
      return `${indent}${key}: ${formatScalar(item)}\n`
    }).join('')
  }
  return `${indent}${formatScalar(value)}\n`
}

function formatScalar(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  const text = String(value)
  if (!text || /[:#\n\r\t]|^\s|\s$/.test(text)) return JSON.stringify(text)
  return text
}
