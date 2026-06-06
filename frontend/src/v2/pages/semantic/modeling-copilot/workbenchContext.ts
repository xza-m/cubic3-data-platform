import type { BatchModelingQueueItem, BatchModelingRiskLevel, BatchModelingTarget } from './batchModeling'

export const DEFAULT_BATCH_PROJECT_ID = 'batch-project'

export type WorkbenchMode = 'quick' | 'batch'

export interface WorkbenchCandidateState {
  workbenchMode: WorkbenchMode
  projectId: string
  candidateId: string
  candidateTitle: string
  target: BatchModelingTarget
  source: string
  grain: string
  risk: BatchModelingRiskLevel
  evidence: string[]
  modelingSource?: Record<string, unknown>
}

export interface WorkbenchRouteTarget {
  pathname: string
  state: WorkbenchCandidateState
}

export function normalizeWorkbenchProjectId(value: string | null | undefined): string {
  const source = (value || '').trim()
  if (!source) return DEFAULT_BATCH_PROJECT_ID
  return (
    source
      .normalize('NFKD')
      .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
      .replace(/[\u4e00-\u9fa5]/g, (char) => `-${PINYIN_SLUGS[char] || chineseCodePointSlug(char)}-`)
      .replace(/_+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || DEFAULT_BATCH_PROJECT_ID
  )
}

export function createWorkbenchCandidateTarget(
  item: BatchModelingQueueItem,
  options: { projectId?: string | null; mode?: WorkbenchMode } = {},
): WorkbenchRouteTarget {
  const projectId = (options.projectId || '').trim() || DEFAULT_BATCH_PROJECT_ID
  const projectPathSegment = encodeURIComponent(projectId)
  const candidatePathSegment = encodeURIComponent(item.id.trim() || 'candidate')
  return {
    pathname: `/semantic/modeling-workbench/${projectPathSegment}/candidate/${candidatePathSegment}`,
    state: {
      workbenchMode: options.mode || 'batch',
      projectId,
      candidateId: item.id,
      candidateTitle: item.title,
      target: item.target,
      source: item.source,
      grain: item.grain,
      risk: item.risk,
      evidence: item.evidence,
      ...(isRecord(item.modelingSource) ? { modelingSource: item.modelingSource } : {}),
    },
  }
}

export function readWorkbenchCandidateState(value: unknown): WorkbenchCandidateState | null {
  if (!value || typeof value !== 'object') return null
  const state = value as Partial<WorkbenchCandidateState>
  if (
    !isWorkbenchMode(state.workbenchMode) ||
    !isNonEmptyString(state.projectId) ||
    !isNonEmptyString(state.candidateId) ||
    !isNonEmptyString(state.candidateTitle) ||
    state.target !== 'semantic_center' ||
    !isNonEmptyString(state.source) ||
    !isNonEmptyString(state.grain) ||
    !isBatchModelingRiskLevel(state.risk) ||
    !Array.isArray(state.evidence)
  ) {
    return null
  }
  return {
    workbenchMode: state.workbenchMode,
    projectId: state.projectId,
    candidateId: state.candidateId,
    candidateTitle: state.candidateTitle,
    target: state.target,
    source: state.source,
    grain: state.grain,
    risk: state.risk,
    evidence: state.evidence.map(String),
    ...(isRecord(state.modelingSource) ? { modelingSource: state.modelingSource } : {}),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isWorkbenchMode(value: unknown): value is WorkbenchMode {
  return value === 'quick' || value === 'batch'
}

function isBatchModelingRiskLevel(value: unknown): value is BatchModelingRiskLevel {
  return value === 'low' || value === 'medium' || value === 'high'
}

function chineseCodePointSlug(value: string): string {
  return `u${value.codePointAt(0)?.toString(16) || '0'}`
}

const PINYIN_SLUGS: Record<string, string> = {
  学: 'xue',
  情: 'qing',
  分: 'fen',
  析: 'xi',
}
