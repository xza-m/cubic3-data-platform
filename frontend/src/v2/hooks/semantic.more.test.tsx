// frontend/src/v2/hooks/semantic.more.test.tsx
//
// 大批量 semantic hooks 测试，覆盖 cubes / views / domains / files / 校验类。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('@v2/api/semantic', () => ({
  activateCube: vi.fn(),
  addCubeToDomain: vi.fn(),
  checkSemanticModelingAgentReady: vi.fn(),
  compileDsl: vi.fn(),
  createCube: vi.fn(),
  createDomain: vi.fn(),
  createSemanticModelingAgentSpecDraft: vi.fn(),
  deprecateCube: vi.fn(),
  describeCube: vi.fn(),
  describeDomain: vi.fn(),
  describeView: vi.fn(),
  draftSemanticModelingAgentFromSpec: vi.fn(),
  draftCubeFromSource: vi.fn(),
  getDomainCanvas: vi.fn(),
  previewDomainContext: vi.fn(),
  getDomainPublishHistory: vi.fn(),
  getMaterializeStatus: vi.fn(),
  getSemanticGraph: vi.fn(),
  getViewMaterializeRuns: vi.fn(),
  listCatalogs: vi.fn(),
  listCubes: vi.fn(),
  listDomains: vi.fn(),
  listViews: vi.fn(),
  materializeView: vi.fn(),
  publishDomain: vi.fn(),
  publishSemanticModelingAgent: vi.fn(),
  readSemanticFile: vi.fn(),
  schemaSyncCube: vi.fn(),
  updateCube: vi.fn(),
  updateDomain: vi.fn(),
  applySemanticModelingAgent: vi.fn(),
  validateSemanticModelingAgent: vi.fn(),
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
  useCreateSemanticModelingAgentSpecDraft,
  useDraftSemanticModelingAgentFromSpec,
  useValidateSemanticModelingAgent,
  useCheckSemanticModelingAgentReady,
  useApplySemanticModelingAgent,
  usePublishSemanticModelingAgent,
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

describe('semantic - modeling agent', () => {
  it('modeling agent mutations call API and invalidate saved assets', async () => {
    ok(api.createSemanticModelingAgentSpecDraft as ReturnType<typeof vi.fn>, { spec: { spec_version: 'v1' } })
    ok(api.draftSemanticModelingAgentFromSpec as ReturnType<typeof vi.fn>, { cube: { name: 'student_comments' } })
    ok(api.validateSemanticModelingAgent as ReturnType<typeof vi.fn>, { status: 'ready' })
    ok(api.checkSemanticModelingAgentReady as ReturnType<typeof vi.fn>, { status: 'ready' })
    ok(api.applySemanticModelingAgent as ReturnType<typeof vi.fn>, { published: false })
    ok(api.publishSemanticModelingAgent as ReturnType<typeof vi.fn>, { publish_targets: { cube: true, ontology: false } })
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')

    const specDraft = renderHook(() => useCreateSemanticModelingAgentSpecDraft(), { wrapper })
    await act(async () => {
      await specDraft.result.current.mutateAsync({ table: 'dwd_student_comment_events' } as never)
    })

    const draftFromSpec = renderHook(() => useDraftSemanticModelingAgentFromSpec(), { wrapper })
    await act(async () => {
      await draftFromSpec.result.current.mutateAsync({ spec_version: 'v1' } as never)
    })

    const validate = renderHook(() => useValidateSemanticModelingAgent(), { wrapper })
    await act(async () => {
      await validate.result.current.mutateAsync({ spec_version: 'v1' } as never)
    })

    const agentReady = renderHook(() => useCheckSemanticModelingAgentReady(), { wrapper })
    await act(async () => {
      await agentReady.result.current.mutateAsync({ spec_version: 'v1' } as never)
    })

    const apply = renderHook(() => useApplySemanticModelingAgent(), { wrapper })
    await act(async () => {
      await apply.result.current.mutateAsync({ spec_version: 'v1' } as never)
    })

    const publish = renderHook(() => usePublishSemanticModelingAgent(), { wrapper })
    await act(async () => {
      await publish.result.current.mutateAsync({
        spec: { spec_version: 'v1' },
        publish_targets: { cube: true },
      } as never)
    })

    expect(api.createSemanticModelingAgentSpecDraft).toHaveBeenCalledWith({ table: 'dwd_student_comment_events' })
    expect(api.draftSemanticModelingAgentFromSpec).toHaveBeenCalledWith({ spec_version: 'v1' })
    expect(api.validateSemanticModelingAgent).toHaveBeenCalledWith({ spec_version: 'v1' })
    expect(api.checkSemanticModelingAgentReady).toHaveBeenCalledWith({ spec_version: 'v1' })
    expect(api.applySemanticModelingAgent).toHaveBeenCalledWith({ spec_version: 'v1' })
    expect(api.publishSemanticModelingAgent).toHaveBeenCalledWith({ spec: { spec_version: 'v1' }, publish_targets: { cube: true } })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['semantic'] })
  })
})
