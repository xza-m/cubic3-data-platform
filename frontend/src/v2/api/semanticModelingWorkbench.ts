import type { AxiosRequestConfig } from 'axios'
import { apiClient } from '@v2/api/client'

interface Envelope<T> {
  code: number
  message: string
  data: T
  trace_id?: string | null
}

const get = <T>(url: string, params?: Record<string, unknown>): Promise<T> =>
  apiClient.get<Envelope<T>>(url, { params }).then((response) => response.data.data)

const post = <T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> =>
  apiClient.post<Envelope<T>>(url, body, config).then((response) => response.data.data)

const patch = <T>(url: string, body?: unknown): Promise<T> =>
  apiClient.patch<Envelope<T>>(url, body).then((response) => response.data.data)

export type SemanticBuildProjectStatus = 'draft' | 'scanned' | 'in_review' | 'published' | 'archived'
export type SemanticAssetPackageStatus =
  | 'ready_for_review'
  | 'needs_scope'
  | 'high_risk'
  | 'duplicate_candidate'
  | 'deferred'
  | 'in_review'
  | 'published'
export type SemanticAssetPackageRisk = 'low' | 'medium' | 'high'
export type SemanticAssetPackageType = 'fact' | 'dimension' | 'metric' | 'object'
export type SemanticBuildTarget = 'semantic_center'
export type SemanticFieldCandidateAction = 'pending' | 'accepted' | 'ignored' | 'renamed' | 'deferred'
export type SemanticAssetPackageAction = 'defer' | 'mark_duplicate' | 'regenerate' | 'split' | 'merge'

export interface SemanticFieldCandidate {
  id: string
  field: string
  label?: string | null
  role?: string | null
  aggregation?: string | null
  semantic_type?: string | null
  cube_binding?: Record<string, unknown>
  ontology_binding?: Record<string, unknown>
  confidence?: number | null
  evidence?: string[]
  risk: SemanticAssetPackageRisk
  action: SemanticFieldCandidateAction
}

export interface SemanticFieldReviewSummary {
  total: number
  accepted: number
  pending: number
  ignored: number
  renamed: number
  deferred: number
  high_risk: number
  blocking: number
  can_bulk_accept: number
  can_generate_proposal: boolean
  blocking_reasons: string[]
}

export interface SemanticProposalReadiness {
  status: 'blocked' | 'ready'
  required_bindings: string[]
  blocking_reasons: string[]
  next_actions: string[]
}

export interface SemanticAssetPackage {
  id: string
  project_id: string
  title: string
  package_type: SemanticAssetPackageType
  target: SemanticBuildTarget
  source: string
  grain: string
  confidence: number
  risk: SemanticAssetPackageRisk
  status: SemanticAssetPackageStatus
  primary_action: string
  evidence: string[]
  ontology_suggestions?: Array<Record<string, unknown>>
  cube_suggestions?: Record<string, unknown>
  field_candidates?: SemanticFieldCandidate[]
  review_summary?: SemanticFieldReviewSummary
  proposal_readiness?: SemanticProposalReadiness
  operation_history?: Array<Record<string, unknown>>
  split_from_package_id?: string | null
  merged_from_package_ids?: string[]
  created_at?: string
  updated_at?: string
}

export interface SemanticBuildProject {
  id: string
  name: string
  business_domain: string
  target: SemanticBuildTarget
  status: SemanticBuildProjectStatus
  scope?: Record<string, unknown>
  asset_package_ids?: string[]
  asset_package_count: number
  risk_summary: Record<string, number>
  asset_packages?: SemanticAssetPackage[]
  created_at?: string
  updated_at?: string
}

export interface SemanticBuildProjectListResponse {
  items: SemanticBuildProject[]
  total: number
}

export interface CreateSemanticBuildProjectBody {
  name: string
  business_domain?: string
  scope?: Record<string, unknown>
}

export interface ScanSemanticBuildProjectBody {
  strategy?: 'conservative' | 'balanced' | 'exploratory'
}

export interface UpdateSemanticAssetPackageBody {
  status?: SemanticAssetPackageStatus
  risk?: SemanticAssetPackageRisk
  evidence?: string[]
  ontology_suggestions?: Array<Record<string, unknown>>
  cube_suggestions?: Record<string, unknown>
}

export interface SemanticAssetPackageSplitResult {
  source_package: SemanticAssetPackage
  created_package: SemanticAssetPackage
}

export interface SemanticAssetPackageMergeResult {
  target_package: SemanticAssetPackage
  source_package: SemanticAssetPackage
}

export type SemanticAssetPackageActionResult =
  | SemanticAssetPackage
  | SemanticAssetPackageSplitResult
  | SemanticAssetPackageMergeResult

export type SemanticAssetPackageActionBody =
  | {
      action: 'defer' | 'mark_duplicate' | 'regenerate'
      reason?: string
    }
  | {
      action: 'split'
      reason?: string
      field_candidate_ids: string[]
      title?: string
      package_type?: SemanticAssetPackageType
    }
  | {
      action: 'merge'
      reason?: string
      target_package_id: string
    }

export const listSemanticBuildProjects = () =>
  get<SemanticBuildProjectListResponse>('/semantic/modeling-workbench/projects')

export const createSemanticBuildProject = (body: CreateSemanticBuildProjectBody) =>
  post<SemanticBuildProject>('/semantic/modeling-workbench/projects', body)

export const getSemanticBuildProject = (projectId: string) =>
  get<SemanticBuildProject>(`/semantic/modeling-workbench/projects/${encodeURIComponent(projectId)}`)

export const scanSemanticBuildProject = (projectId: string, body: ScanSemanticBuildProjectBody) =>
  post<SemanticBuildProject>(`/semantic/modeling-workbench/projects/${encodeURIComponent(projectId)}/scan`, body)

export const getSemanticAssetPackage = (projectId: string, packageId: string) =>
  get<SemanticAssetPackage>(
    `/semantic/modeling-workbench/projects/${encodeURIComponent(projectId)}/packages/${encodeURIComponent(packageId)}`,
  )

export const updateSemanticAssetPackage = (
  projectId: string,
  packageId: string,
  body: UpdateSemanticAssetPackageBody,
) =>
  patch<SemanticAssetPackage>(
    `/semantic/modeling-workbench/projects/${encodeURIComponent(projectId)}/packages/${encodeURIComponent(packageId)}`,
    body,
  )

export const applySemanticAssetPackageAction = (
  projectId: string,
  packageId: string,
  body: SemanticAssetPackageActionBody,
) =>
  post<SemanticAssetPackageActionResult>(
    `/semantic/modeling-workbench/projects/${encodeURIComponent(projectId)}/packages/${encodeURIComponent(packageId)}/actions`,
    body,
  )
