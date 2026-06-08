import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'

const mockGet = vi.hoisted(() => vi.fn())
const mockPost = vi.hoisted(() => vi.fn())
const mockPatch = vi.hoisted(() => vi.fn())

vi.mock('@v2/api/client', () => ({
  apiClient: {
    get: mockGet,
    post: mockPost,
    patch: mockPatch,
  },
}))

import {
  applySemanticAssetPackageAction,
  createSemanticBuildProject,
  getSemanticAssetPackage,
  getSemanticBuildProject,
  scanSemanticBuildProject,
  updateSemanticAssetPackage,
  type SemanticAssetPackage,
  type SemanticAssetPackageActionBody,
  type SemanticAssetPackageActionResult,
  type SemanticAssetPackageMergeResult,
  type SemanticAssetPackageRisk,
  type SemanticAssetPackageSplitResult,
  type SemanticBuildProject,
  type UpdateSemanticAssetPackageBody,
} from '@v2/api/semanticModelingWorkbench'

describe('semanticModelingWorkbench api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockResolvedValue({ data: { data: {} } })
    mockPost.mockResolvedValue({ data: { data: {} } })
    mockPatch.mockResolvedValue({ data: { data: {} } })
  })

  it('creates and scans build projects through the workbench API', async () => {
    await createSemanticBuildProject({ name: '学情分析', business_domain: '学情分析' })
    await scanSemanticBuildProject('build-learning', { strategy: 'balanced' })

    expect(mockPost).toHaveBeenNthCalledWith(1, '/semantic/modeling-workbench/projects', {
      name: '学情分析',
      business_domain: '学情分析',
    }, undefined)
    expect(mockPost).toHaveBeenNthCalledWith(
      2,
      '/semantic/modeling-workbench/projects/build-learning/scan',
      { strategy: 'balanced' },
      undefined,
    )
  })

  it('loads and updates asset packages with encoded route ids', async () => {
    await getSemanticBuildProject('build learning')
    await getSemanticAssetPackage('build learning', 'build-learning:fact:dwd_learning_activity_df')
    await updateSemanticAssetPackage('build learning', 'build-learning:fact:dwd_learning_activity_df', {
      status: 'in_review',
    })

    expect(mockGet).toHaveBeenNthCalledWith(1, '/semantic/modeling-workbench/projects/build%20learning', {
      params: undefined,
    })
    expect(mockGet).toHaveBeenNthCalledWith(
      2,
      '/semantic/modeling-workbench/projects/build%20learning/packages/build-learning%3Afact%3Adwd_learning_activity_df',
      { params: undefined },
    )
    expect(mockPatch).toHaveBeenCalledWith(
      '/semantic/modeling-workbench/projects/build%20learning/packages/build-learning%3Afact%3Adwd_learning_activity_df',
      { status: 'in_review' },
    )
  })

  it('posts asset package actions with encoded ids', async () => {
    const body: SemanticAssetPackageActionBody = {
      action: 'defer',
      reason: '等待业务 owner 确认',
    }

    await applySemanticAssetPackageAction('build learning', 'build-learning:fact:dwd_learning_activity_df', body)

    expect(mockPost).toHaveBeenCalledWith(
      '/semantic/modeling-workbench/projects/build%20learning/packages/build-learning%3Afact%3Adwd_learning_activity_df/actions',
      body,
      undefined,
    )
  })

  it('types package action bodies and action results precisely', () => {
    const updateBody: UpdateSemanticAssetPackageBody = {
      risk: 'high',
    }
    expectTypeOf(updateBody.risk).toEqualTypeOf<SemanticAssetPackageRisk | undefined>()

    const splitBody: SemanticAssetPackageActionBody = {
      action: 'split',
      field_candidate_ids: ['field-candidate-1'],
      title: '学情事实拆分包',
      package_type: 'fact',
    }
    const mergeBody: SemanticAssetPackageActionBody = {
      action: 'merge',
      target_package_id: 'build-learning:fact:dwd_learning_activity_df',
    }

    const typedSplitBody: Extract<SemanticAssetPackageActionBody, { action: 'split' }> = splitBody
    const typedMergeBody: Extract<SemanticAssetPackageActionBody, { action: 'merge' }> = mergeBody

    const typedPackage = {} as SemanticAssetPackage
    const splitResult: SemanticAssetPackageSplitResult = {
      source_package: typedPackage,
      created_package: typedPackage,
    }
    const mergeResult: SemanticAssetPackageMergeResult = {
      target_package: typedPackage,
      source_package: typedPackage,
    }

    const splitActionResult: SemanticAssetPackageActionResult = splitResult
    const mergeActionResult: SemanticAssetPackageActionResult = mergeResult
    const actionResultPromise = {} as ReturnType<typeof applySemanticAssetPackageAction>
    const typedActionResultPromise: Promise<SemanticAssetPackageActionResult> = actionResultPromise
    void typedSplitBody
    void typedMergeBody
    void splitActionResult
    void mergeActionResult
    void typedActionResultPromise

    // @ts-expect-error split actions must include field_candidate_ids.
    const invalidSplitBody: SemanticAssetPackageActionBody = { action: 'split' }
    // @ts-expect-error merge actions must include target_package_id.
    const invalidMergeBody: SemanticAssetPackageActionBody = { action: 'merge' }
    void invalidSplitBody
    void invalidMergeBody
  })

  it('defines project type with semantic center target', () => {
    const project: SemanticBuildProject = {
      id: 'build-learning',
      name: '学情分析',
      business_domain: '学情分析',
      target: 'semantic_center',
      status: 'scanned',
      asset_package_count: 3,
      risk_summary: { low: 1, medium: 1, high: 0 },
      asset_packages: [],
    }

    expect(project.target).toBe('semantic_center')
  })
})
