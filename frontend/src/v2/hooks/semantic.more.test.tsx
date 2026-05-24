// frontend/src/v2/hooks/semantic.more.test.tsx
//
// 大批量 semantic hooks 测试，覆盖 cubes / views / domains / files / 校验类。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('@v2/api/semantic', () => ({
  activateCube: vi.fn(),
  addCubeToDomain: vi.fn(),
  compileDsl: vi.fn(),
  acceptSemanticModelingCopilotCubeDraft: vi.fn(),
  applySemanticModelingProposal: vi.fn(),
  approveSemanticModelingProposal: vi.fn(),
  closeSemanticModelingProposal: vi.fn(),
  confirmSemanticModelingCopilotAssumption: vi.fn(),
  createCube: vi.fn(),
  createDomain: vi.fn(),
  createSemanticModelingCopilotSession: vi.fn(),
  createSemanticModelingProposal: vi.fn(),
  deprecateCube: vi.fn(),
  deleteSemanticModelingCopilotSession: vi.fn(),
  describeCube: vi.fn(),
  describeDomain: vi.fn(),
  describeView: vi.fn(),
  draftSemanticModelingProposal: vi.fn(),
  draftCubeFromSource: vi.fn(),
  getDomainCanvas: vi.fn(),
  previewDomainContext: vi.fn(),
  getDomainPublishHistory: vi.fn(),
  getMaterializeStatus: vi.fn(),
  getSemanticGraph: vi.fn(),
  getSemanticModelingCopilotReview: vi.fn(),
  getSemanticModelingCopilotSession: vi.fn(),
  getSemanticModelingProposal: vi.fn(),
  getSemanticModelingProposalGapView: vi.fn(),
  getViewMaterializeRuns: vi.fn(),
  listCatalogs: vi.fn(),
  listCubes: vi.fn(),
  listDomains: vi.fn(),
  listSemanticModelingCopilotSessions: vi.fn(),
  listViews: vi.fn(),
  materializeView: vi.fn(),
  patchSemanticModelingCopilotSpec: vi.fn(),
  publishDomain: vi.fn(),
  publishSemanticModelingCopilotProposal: vi.fn(),
  publishSemanticModelingProposal: vi.fn(),
  previewSemanticModelingCopilotSandbox: vi.fn(),
  readSemanticFile: vi.fn(),
  renameSemanticModelingCopilotSession: vi.fn(),
  saveSemanticModelingCopilotProposal: vi.fn(),
  schemaSyncCube: vi.fn(),
  sendSemanticModelingCopilotMessage: vi.fn(),
  updateCube: vi.fn(),
  updateDomain: vi.fn(),
  validateSemanticModelingProposal: vi.fn(),
  validateCubeFields: vi.fn(),
  validateSemanticFile: vi.fn(),
  writeSemanticFile: vi.fn(),
  dryRunMetric: vi.fn(),
}))

import * as api from '@v2/api/semantic'
import {
  useCubeList,
  useCubeDetail,
  useCubeYaml,
  useCreateCube,
  useUpdateCube,
  useActivateCube,
  useDeprecateCube,
  useDraftCubeFromSource,
  useWriteCubeYaml,
  useValidateCubeYaml,
  useSchemaSyncCube,
  useViewList,
  useViewDetail,
  useViewMaterializeStatus,
  useMaterializeView,
  useDomainList,
  useDomainDetail,
  useDomainCanvas,
  useDomainContextPreview,
  useCatalogList,
  useCreateDomain,
  useUpdateDomain,
  usePublishDomain,
  useAddCubeToDomain,
  useCompileDsl,
  useSemanticFile,
  useSemanticModelingProposal,
  useSemanticModelingProposalGapView,
  useCreateSemanticModelingProposal,
  useDraftSemanticModelingProposal,
  useValidateSemanticModelingProposal,
  useApproveSemanticModelingProposal,
  useApplySemanticModelingProposal,
  usePublishSemanticModelingProposal,
  useCloseSemanticModelingProposal,
  useSemanticModelingCopilotSession,
  useSemanticModelingCopilotReview,
  useCreateSemanticModelingCopilotSession,
  useSemanticModelingCopilotSessions,
  useDeleteSemanticModelingCopilotSession,
  useRenameSemanticModelingCopilotSession,
  useSendSemanticModelingCopilotMessage,
  useConfirmSemanticModelingCopilotAssumption,
  useAcceptSemanticModelingCopilotCubeDraft,
  usePreviewSemanticModelingCopilotSandbox,
  useSaveSemanticModelingCopilotProposal,
  usePublishSemanticModelingCopilotProposal,
  useUpdateSemanticModelingCopilotSpec,
  useValidateCubeFields,
  useDryRunMetric,
  useSemanticGraph,
  useDomainPublishHistory,
  useViewMaterializeRuns,
} from './semantic'
import { makeWrapper } from './test-utils'

beforeEach(() => vi.clearAllMocks())

const ok = (m: ReturnType<typeof vi.fn>, val: unknown = {}) => m.mockResolvedValue(val)

describe('semantic - cube queries', () => {
  it('useCubeList', async () => {
    ok(api.listCubes as ReturnType<typeof vi.fn>, { items: [] })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useCubeList({ q: 'x' }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('useCubeDetail gated', async () => {
    ok(api.describeCube as ReturnType<typeof vi.fn>, {})
    const { wrapper } = makeWrapper()
    renderHook(() => useCubeDetail(undefined), { wrapper })
    expect(api.describeCube).not.toHaveBeenCalled()
    const { result } = renderHook(() => useCubeDetail('a'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('useCubeYaml gated', async () => {
    ok(api.readSemanticFile as ReturnType<typeof vi.fn>, '')
    const { wrapper } = makeWrapper()
    renderHook(() => useCubeYaml(undefined), { wrapper })
    expect(api.readSemanticFile).not.toHaveBeenCalled()
    const { result } = renderHook(() => useCubeYaml('a'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})

describe('semantic - cube mutations', () => {
  it('useCreateCube tracks and invalidates', async () => {
    ok(api.createCube as ReturnType<typeof vi.fn>, {})
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useCreateCube(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ name: 'c' } as never)
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['semantic'] })
  })

  it('useCreateCube handles missing name (unknown)', async () => {
    ok(api.createCube as ReturnType<typeof vi.fn>, {})
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useCreateCube(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({} as never)
    })
  })

  it('useUpdateCube invalidates', async () => {
    ok(api.updateCube as ReturnType<typeof vi.fn>, {})
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useUpdateCube('c'), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({} as never)
    })
    expect(spy).toHaveBeenCalled()
  })

  it.each([
    ['useActivateCube', useActivateCube, api.activateCube],
    ['useDeprecateCube', useDeprecateCube, api.deprecateCube],
    ['useSchemaSyncCube', useSchemaSyncCube, api.schemaSyncCube],
  ] as const)('%s invalidates', async (_, hook, fn) => {
    ok(fn as ReturnType<typeof vi.fn>, {})
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => hook(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync('c')
    })
    expect(spy).toHaveBeenCalled()
  })

  it('useDraftCubeFromSource calls api', async () => {
    ok(api.draftCubeFromSource as ReturnType<typeof vi.fn>, {})
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useDraftCubeFromSource(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({} as never)
    })
    expect(api.draftCubeFromSource).toHaveBeenCalled()
  })

  it('useWriteCubeYaml invalidates', async () => {
    ok(api.writeSemanticFile as ReturnType<typeof vi.fn>, {})
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useWriteCubeYaml('c'), { wrapper })
    await act(async () => {
      await result.current.mutateAsync('content')
    })
    expect(spy).toHaveBeenCalled()
  })

  it('useValidateCubeYaml calls api', async () => {
    ok(api.validateSemanticFile as ReturnType<typeof vi.fn>, {})
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useValidateCubeYaml('c'), { wrapper })
    await act(async () => {
      await result.current.mutateAsync('content')
    })
    expect(api.validateSemanticFile).toHaveBeenCalledWith('cubes', 'c', 'content')
  })
})

describe('semantic - views', () => {
  it('useViewList', async () => {
    ok(api.listViews as ReturnType<typeof vi.fn>, { items: [] })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useViewList(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('useViewDetail gated', async () => {
    ok(api.describeView as ReturnType<typeof vi.fn>, {})
    const { wrapper } = makeWrapper()
    renderHook(() => useViewDetail(undefined), { wrapper })
    expect(api.describeView).not.toHaveBeenCalled()
    const { result } = renderHook(() => useViewDetail('v', true), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.describeView).toHaveBeenCalledWith('v', true)
  })

  it('useViewMaterializeStatus gated', async () => {
    ok(api.getMaterializeStatus as ReturnType<typeof vi.fn>, {})
    const { wrapper } = makeWrapper()
    renderHook(() => useViewMaterializeStatus(undefined), { wrapper })
    expect(api.getMaterializeStatus).not.toHaveBeenCalled()
    const { result } = renderHook(() => useViewMaterializeStatus('v'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('useMaterializeView invalidates', async () => {
    ok(api.materializeView as ReturnType<typeof vi.fn>, {})
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useMaterializeView(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ name: 'v', sourceId: 's' })
    })
    expect(spy).toHaveBeenCalled()
  })

  it('useViewMaterializeRuns gated', async () => {
    ok(api.getViewMaterializeRuns as ReturnType<typeof vi.fn>, { items: [] })
    const { wrapper } = makeWrapper()
    renderHook(() => useViewMaterializeRuns(undefined), { wrapper })
    expect(api.getViewMaterializeRuns).not.toHaveBeenCalled()
    const { result } = renderHook(() => useViewMaterializeRuns(1, { page: 1 }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})

describe('semantic - domains', () => {
  it('useDomainList', async () => {
    ok(api.listDomains as ReturnType<typeof vi.fn>, { items: [] })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useDomainList({ q: 'x' }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('useDomainDetail gated', async () => {
    ok(api.describeDomain as ReturnType<typeof vi.fn>, {})
    const { wrapper } = makeWrapper()
    renderHook(() => useDomainDetail(undefined), { wrapper })
    expect(api.describeDomain).not.toHaveBeenCalled()
    const { result } = renderHook(() => useDomainDetail('d'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('useDomainCanvas gated', async () => {
    ok(api.getDomainCanvas as ReturnType<typeof vi.fn>, {})
    const { wrapper } = makeWrapper()
    renderHook(() => useDomainCanvas(undefined), { wrapper })
    expect(api.getDomainCanvas).not.toHaveBeenCalled()
    const { result } = renderHook(() => useDomainCanvas('d'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('useDomainContextPreview calls api without treating joins as truth source', async () => {
    ok(api.previewDomainContext as ReturnType<typeof vi.fn>, {
      role: 'business_context',
      candidate_scope: { cube_refs: ['student_comments'], ontology_refs: { objects: ['student_comment'] } },
    })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useDomainContextPreview(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync('academic')
    })
    expect(api.previewDomainContext).toHaveBeenCalledWith('academic')
  })

  it('useCatalogList', async () => {
    ok(api.listCatalogs as ReturnType<typeof vi.fn>, [])
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useCatalogList(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it.each([
    ['useCreateDomain', useCreateDomain, api.createDomain],
  ] as const)('%s invalidates', async (_, hook, fn) => {
    ok(fn as ReturnType<typeof vi.fn>, {})
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => hook(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({} as never)
    })
    expect(spy).toHaveBeenCalled()
  })

  it('useUpdateDomain invalidates', async () => {
    ok(api.updateDomain as ReturnType<typeof vi.fn>, {})
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useUpdateDomain('d'), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({} as never)
    })
    expect(spy).toHaveBeenCalled()
  })

  it('usePublishDomain invalidates', async () => {
    ok(api.publishDomain as ReturnType<typeof vi.fn>, {})
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => usePublishDomain(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ id: 'd', body: { cubes: [] } })
    })
    expect(spy).toHaveBeenCalled()
  })

  it('useAddCubeToDomain invalidates', async () => {
    ok(api.addCubeToDomain as ReturnType<typeof vi.fn>, {})
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useAddCubeToDomain(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ domainId: 'd', cubeName: 'c' })
    })
    expect(spy).toHaveBeenCalled()
  })

  it('useDomainPublishHistory gated', async () => {
    ok(api.getDomainPublishHistory as ReturnType<typeof vi.fn>, [])
    const { wrapper } = makeWrapper()
    renderHook(() => useDomainPublishHistory(undefined), { wrapper })
    expect(api.getDomainPublishHistory).not.toHaveBeenCalled()
    const { result } = renderHook(() => useDomainPublishHistory('d'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})

describe('semantic - misc', () => {
  it('useCompileDsl calls api', async () => {
    ok(api.compileDsl as ReturnType<typeof vi.fn>, {})
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useCompileDsl(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync('dsl')
    })
    expect(api.compileDsl).toHaveBeenCalledWith('dsl')
  })

  it('useSemanticFile gated', async () => {
    ok(api.readSemanticFile as ReturnType<typeof vi.fn>, '')
    const { wrapper } = makeWrapper()
    renderHook(() => useSemanticFile('cubes', undefined), { wrapper })
    expect(api.readSemanticFile).not.toHaveBeenCalled()
    const { result } = renderHook(() => useSemanticFile('cubes', 'a'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('useValidateCubeFields calls api', async () => {
    ok(api.validateCubeFields as ReturnType<typeof vi.fn>, { ok: true })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useValidateCubeFields(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync('c')
    })
    expect(api.validateCubeFields).toHaveBeenCalledWith('c')
  })

  it('useDryRunMetric success path', async () => {
    ok(api.dryRunMetric as ReturnType<typeof vi.fn>, { errors: [] })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useDryRunMetric(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ name: 'm', formula: 'sum(x)' })
    })
    expect(api.dryRunMetric).toHaveBeenCalled()
  })

  it('useDryRunMetric tracks ok=false when errors present', async () => {
    ok(api.dryRunMetric as ReturnType<typeof vi.fn>, { errors: ['e'] })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useDryRunMetric(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ name: 'm', formula: 'x' })
    })
  })

  it('useDryRunMetric error path', async () => {
    (api.dryRunMetric as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('x'))
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useDryRunMetric(), { wrapper })
    await expect(
      act(async () => {
        await result.current.mutateAsync({ name: 'm', formula: 'x' })
      }),
    ).rejects.toThrow('x')
  })

  it('useSemanticGraph', async () => {
    ok(api.getSemanticGraph as ReturnType<typeof vi.fn>, {})
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useSemanticGraph(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})

describe('semantic - modeling proposals', () => {
  it('proposal queries gate on proposal id', async () => {
    ok(api.getSemanticModelingProposal as ReturnType<typeof vi.fn>, { id: 'p1' })
    ok(api.getSemanticModelingProposalGapView as ReturnType<typeof vi.fn>, { id: 'p1' })
    const { wrapper } = makeWrapper()

    renderHook(() => useSemanticModelingProposal(undefined), { wrapper })
    renderHook(() => useSemanticModelingProposalGapView(undefined), { wrapper })
    expect(api.getSemanticModelingProposal).not.toHaveBeenCalled()
    expect(api.getSemanticModelingProposalGapView).not.toHaveBeenCalled()

    const proposal = renderHook(() => useSemanticModelingProposal('p1'), { wrapper })
    const gapView = renderHook(() => useSemanticModelingProposalGapView('p1'), { wrapper })
    await waitFor(() => expect(proposal.result.current.isSuccess).toBe(true))
    await waitFor(() => expect(gapView.result.current.isSuccess).toBe(true))
  })

  it('proposal mutations call API and invalidate semantic cache', async () => {
    ok(api.createSemanticModelingProposal as ReturnType<typeof vi.fn>, { id: 'p1' })
    ok(api.draftSemanticModelingProposal as ReturnType<typeof vi.fn>, { id: 'p1' })
    ok(api.validateSemanticModelingProposal as ReturnType<typeof vi.fn>, { id: 'p1' })
    ok(api.approveSemanticModelingProposal as ReturnType<typeof vi.fn>, { id: 'p1' })
    ok(api.applySemanticModelingProposal as ReturnType<typeof vi.fn>, { id: 'p1' })
    ok(api.publishSemanticModelingProposal as ReturnType<typeof vi.fn>, { id: 'p1' })
    ok(api.closeSemanticModelingProposal as ReturnType<typeof vi.fn>, { id: 'p1' })
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')

    const create = renderHook(() => useCreateSemanticModelingProposal(), { wrapper })
    await act(async () => {
      await create.result.current.mutateAsync({ table: 'dwd_student_comment_events' } as never)
    })

    const draft = renderHook(() => useDraftSemanticModelingProposal(), { wrapper })
    await act(async () => {
      await draft.result.current.mutateAsync('p1')
    })

    const validate = renderHook(() => useValidateSemanticModelingProposal(), { wrapper })
    await act(async () => {
      await validate.result.current.mutateAsync('p1')
    })

    const approve = renderHook(() => useApproveSemanticModelingProposal(), { wrapper })
    await act(async () => {
      await approve.result.current.mutateAsync({ proposalId: 'p1', comment: 'ok' })
    })

    const apply = renderHook(() => useApplySemanticModelingProposal(), { wrapper })
    await act(async () => {
      await apply.result.current.mutateAsync('p1')
    })

    const publish = renderHook(() => usePublishSemanticModelingProposal(), { wrapper })
    await act(async () => {
      await publish.result.current.mutateAsync({ proposalId: 'p1', publishTargets: { cube: true } })
    })

    const close = renderHook(() => useCloseSemanticModelingProposal(), { wrapper })
    await act(async () => {
      await close.result.current.mutateAsync({ proposalId: 'p1', closeReason: 'abandoned', comment: 'later' })
    })

    expect(api.createSemanticModelingProposal).toHaveBeenCalledWith({ table: 'dwd_student_comment_events' })
    expect(api.draftSemanticModelingProposal).toHaveBeenCalledWith('p1')
    expect(api.validateSemanticModelingProposal).toHaveBeenCalledWith('p1')
    expect(api.approveSemanticModelingProposal).toHaveBeenCalledWith('p1', { comment: 'ok' })
    expect(api.applySemanticModelingProposal).toHaveBeenCalledWith('p1')
    expect(api.publishSemanticModelingProposal).toHaveBeenCalledWith('p1', { publish_targets: { cube: true } })
    expect(api.closeSemanticModelingProposal).toHaveBeenCalledWith('p1', { comment: 'later', close_reason: 'abandoned' })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['semantic'] })
  })
})

describe('semantic - modeling copilot sessions', () => {
  const session = {
    id: 's1',
    user_goal: '创建语义模型',
    entry_type: 'business_question',
    status: 'active',
    workbench_state: {},
  }

  it('session queries gate on session id and list sessions', async () => {
    ok(api.getSemanticModelingCopilotSession as ReturnType<typeof vi.fn>, session)
    ok(api.getSemanticModelingCopilotReview as ReturnType<typeof vi.fn>, { session_id: 's1' })
    ok(api.listSemanticModelingCopilotSessions as ReturnType<typeof vi.fn>, { items: [session], total: 1 })
    const { wrapper } = makeWrapper()

    renderHook(() => useSemanticModelingCopilotSession(undefined), { wrapper })
    renderHook(() => useSemanticModelingCopilotReview(undefined), { wrapper })
    expect(api.getSemanticModelingCopilotSession).not.toHaveBeenCalled()
    expect(api.getSemanticModelingCopilotReview).not.toHaveBeenCalled()

    const detail = renderHook(() => useSemanticModelingCopilotSession('s1'), { wrapper })
    const review = renderHook(() => useSemanticModelingCopilotReview('s1'), { wrapper })
    const list = renderHook(() => useSemanticModelingCopilotSessions({ include_legacy: false }), { wrapper })
    await waitFor(() => expect(detail.result.current.isSuccess).toBe(true))
    await waitFor(() => expect(review.result.current.isSuccess).toBe(true))
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true))
  })

  it('session mutations call Copilot APIs and update caches', async () => {
    ok(api.createSemanticModelingCopilotSession as ReturnType<typeof vi.fn>, session)
    ok(api.deleteSemanticModelingCopilotSession as ReturnType<typeof vi.fn>, { deleted: true, id: 's1' })
    ok(api.renameSemanticModelingCopilotSession as ReturnType<typeof vi.fn>, { ...session, title: '新标题' })
    ok(api.sendSemanticModelingCopilotMessage as ReturnType<typeof vi.fn>, session)
    ok(api.confirmSemanticModelingCopilotAssumption as ReturnType<typeof vi.fn>, session)
    ok(api.acceptSemanticModelingCopilotCubeDraft as ReturnType<typeof vi.fn>, session)
    ok(api.previewSemanticModelingCopilotSandbox as ReturnType<typeof vi.fn>, session)
    ok(api.saveSemanticModelingCopilotProposal as ReturnType<typeof vi.fn>, session)
    ok(api.publishSemanticModelingCopilotProposal as ReturnType<typeof vi.fn>, session)
    ok(api.patchSemanticModelingCopilotSpec as ReturnType<typeof vi.fn>, session)
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')

    const create = renderHook(() => useCreateSemanticModelingCopilotSession(), { wrapper })
    await act(async () => {
      await create.result.current.mutateAsync({ user_goal: '创建语义模型' })
    })

    const rename = renderHook(() => useRenameSemanticModelingCopilotSession(), { wrapper })
    await act(async () => {
      await rename.result.current.mutateAsync({ sessionId: 's1', title: '新标题' })
    })

    const send = renderHook(() => useSendSemanticModelingCopilotMessage(), { wrapper })
    await act(async () => {
      await send.result.current.mutateAsync({ sessionId: 's1', message: '继续' })
    })

    const confirm = renderHook(() => useConfirmSemanticModelingCopilotAssumption(), { wrapper })
    await act(async () => {
      await confirm.result.current.mutateAsync({ sessionId: 's1', confirmationId: 'c1', value: true })
    })

    const accept = renderHook(() => useAcceptSemanticModelingCopilotCubeDraft(), { wrapper })
    await act(async () => {
      await accept.result.current.mutateAsync({ sessionId: 's1', body: { source: 'cube' } })
    })

    const preview = renderHook(() => usePreviewSemanticModelingCopilotSandbox(), { wrapper })
    await act(async () => {
      await preview.result.current.mutateAsync({ sessionId: 's1', body: { dry_run: true } })
    })

    const save = renderHook(() => useSaveSemanticModelingCopilotProposal(), { wrapper })
    await act(async () => {
      await save.result.current.mutateAsync({ sessionId: 's1', body: { reviewer: 'test' } })
    })

    const publish = renderHook(() => usePublishSemanticModelingCopilotProposal(), { wrapper })
    await act(async () => {
      await publish.result.current.mutateAsync({ sessionId: 's1', body: { publish_targets: { cube: true } } })
    })

    const updateSpec = renderHook(() => useUpdateSemanticModelingCopilotSpec(), { wrapper })
    await act(async () => {
      await updateSpec.result.current.mutateAsync({ sessionId: 's1', body: { spec: { spec_version: 'v1' } } })
    })

    const remove = renderHook(() => useDeleteSemanticModelingCopilotSession(), { wrapper })
    await act(async () => {
      await remove.result.current.mutateAsync('s1')
    })

    expect(api.createSemanticModelingCopilotSession).toHaveBeenCalledWith({ user_goal: '创建语义模型' })
    expect(api.renameSemanticModelingCopilotSession).toHaveBeenCalledWith('s1', '新标题')
    expect(api.sendSemanticModelingCopilotMessage).toHaveBeenCalledWith('s1', { message: '继续' })
    expect(api.confirmSemanticModelingCopilotAssumption).toHaveBeenCalledWith('s1', { confirmation_id: 'c1', value: true })
    expect(api.acceptSemanticModelingCopilotCubeDraft).toHaveBeenCalledWith('s1', { source: 'cube' })
    expect(api.previewSemanticModelingCopilotSandbox).toHaveBeenCalledWith('s1', { dry_run: true })
    expect(api.saveSemanticModelingCopilotProposal).toHaveBeenCalledWith('s1', { reviewer: 'test' })
    expect(api.publishSemanticModelingCopilotProposal).toHaveBeenCalledWith('s1', { publish_targets: { cube: true } })
    expect(api.patchSemanticModelingCopilotSpec).toHaveBeenCalledWith('s1', { spec: { spec_version: 'v1' } })
    expect(api.deleteSemanticModelingCopilotSession).toHaveBeenCalledWith('s1')
    expect(spy).toHaveBeenCalled()
  })
})
