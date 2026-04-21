// frontend/src/v2/hooks/ontology.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('@v2/api/ontology', () => ({
  getWorkbenchObjects: vi.fn(),
  getWorkbenchObjectOverview: vi.fn(),
  getWorkbenchGovernance: vi.fn(),
  listObjects: vi.fn(),
  getObject: vi.fn(),
  createObject: vi.fn(),
  listProperties: vi.fn(),
  getProperty: vi.fn(),
  createProperty: vi.fn(),
  listMetrics: vi.fn(),
  getMetric: vi.fn(),
  getMetricLinks: vi.fn(),
  createMetric: vi.fn(),
  listRelations: vi.fn(),
  getRelation: vi.fn(),
  createRelation: vi.fn(),
  listActions: vi.fn(),
  getAction: vi.fn(),
  createAction: vi.fn(),
  listPolicies: vi.fn(),
  getPolicy: vi.fn(),
  getPolicyImpact: vi.fn(),
  getPolicyAudit: vi.fn(),
  createPolicy: vi.fn(),
  listGlossary: vi.fn(),
  createGlossary: vi.fn(),
  publishEntity: vi.fn(),
  getEntityImpact: vi.fn(),
  getEntityHistory: vi.fn(),
}))

import * as api from '@v2/api/ontology'
import {
  useWorkbenchObjects,
  useWorkbenchObjectOverview,
  useWorkbenchGovernance,
  useObjectList,
  useObjectDetail,
  useCreateObject,
  usePropertyList,
  usePropertyDetail,
  useCreateProperty,
  useMetricList,
  useMetricDetail,
  useMetricLinks,
  useCreateMetric,
  useRelationList,
  useRelationDetail,
  useCreateRelation,
  useActionList,
  useActionDetail,
  useCreateAction,
  usePolicyList,
  usePolicyDetail,
  usePolicyImpact,
  usePolicyAudit,
  useCreatePolicy,
  useGlossaryList,
  useCreateGlossary,
  usePublishEntity,
  useEntityImpact,
  useEntityHistory,
} from './ontology'
import { makeWrapper } from './test-utils'

beforeEach(() => vi.clearAllMocks())

const fakeOk = (m: ReturnType<typeof vi.fn>) => m.mockResolvedValue([])

describe('ontology - workbench/list queries', () => {
  it('useWorkbenchObjects', async () => {
    fakeOk(api.getWorkbenchObjects as ReturnType<typeof vi.fn>)
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useWorkbenchObjects(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('useWorkbenchObjectOverview gated by name', async () => {
    fakeOk(api.getWorkbenchObjectOverview as ReturnType<typeof vi.fn>)
    const { wrapper } = makeWrapper()
    renderHook(() => useWorkbenchObjectOverview(undefined), { wrapper })
    expect(api.getWorkbenchObjectOverview).not.toHaveBeenCalled()
    const { result } = renderHook(() => useWorkbenchObjectOverview('a'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('useWorkbenchGovernance', async () => {
    fakeOk(api.getWorkbenchGovernance as ReturnType<typeof vi.fn>)
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useWorkbenchGovernance(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it.each([
    ['useObjectList', useObjectList, api.listObjects],
    ['usePropertyList', usePropertyList, api.listProperties],
    ['useMetricList', useMetricList, api.listMetrics],
    ['useRelationList', useRelationList, api.listRelations],
    ['useActionList', useActionList, api.listActions],
    ['usePolicyList', usePolicyList, api.listPolicies],
    ['useGlossaryList', useGlossaryList, api.listGlossary],
  ] as const)('%s fetches', async (_, hook, fn) => {
    fakeOk(fn as ReturnType<typeof vi.fn>)
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => hook(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it.each([
    ['useObjectDetail', useObjectDetail, api.getObject],
    ['usePropertyDetail', usePropertyDetail, api.getProperty],
    ['useMetricDetail', useMetricDetail, api.getMetric],
    ['useMetricLinks', useMetricLinks, api.getMetricLinks],
    ['useRelationDetail', useRelationDetail, api.getRelation],
    ['useActionDetail', useActionDetail, api.getAction],
    ['usePolicyDetail', usePolicyDetail, api.getPolicy],
    ['usePolicyImpact', usePolicyImpact, api.getPolicyImpact],
  ] as const)('%s gated by name', async (_, hook, fn) => {
    fakeOk(fn as ReturnType<typeof vi.fn>)
    const { wrapper } = makeWrapper()
    renderHook(() => hook(undefined), { wrapper })
    expect(fn).not.toHaveBeenCalled()
    const { result } = renderHook(() => hook('x'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('usePolicyAudit gated by name', async () => {
    (api.getPolicyAudit as ReturnType<typeof vi.fn>).mockResolvedValue([])
    const { wrapper } = makeWrapper()
    renderHook(() => usePolicyAudit(undefined), { wrapper })
    expect(api.getPolicyAudit).not.toHaveBeenCalled()
    const { result } = renderHook(() => usePolicyAudit('p', { decision: 'allow' }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.getPolicyAudit).toHaveBeenCalledWith('p', { decision: 'allow' })
  })

  it('useEntityImpact gated', async () => {
    (api.getEntityImpact as ReturnType<typeof vi.fn>).mockResolvedValue({})
    const { wrapper } = makeWrapper()
    renderHook(() => useEntityImpact('objects', undefined), { wrapper })
    expect(api.getEntityImpact).not.toHaveBeenCalled()
    const { result } = renderHook(() => useEntityImpact('objects', 'a'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('useEntityHistory gated', async () => {
    (api.getEntityHistory as ReturnType<typeof vi.fn>).mockResolvedValue([])
    const { wrapper } = makeWrapper()
    renderHook(() => useEntityHistory('objects', undefined), { wrapper })
    expect(api.getEntityHistory).not.toHaveBeenCalled()
    const { result } = renderHook(() => useEntityHistory('objects', 'a'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})

describe('ontology - mutations', () => {
  it.each([
    ['useCreateObject', useCreateObject, api.createObject],
    ['useCreateProperty', useCreateProperty, api.createProperty],
    ['useCreateMetric', useCreateMetric, api.createMetric],
    ['useCreateRelation', useCreateRelation, api.createRelation],
    ['useCreateAction', useCreateAction, api.createAction],
    ['useCreatePolicy', useCreatePolicy, api.createPolicy],
    ['useCreateGlossary', useCreateGlossary, api.createGlossary],
  ] as const)('%s invalidates ontology key', async (_, hook, fn) => {
    (fn as ReturnType<typeof vi.fn>).mockResolvedValue({})
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => hook(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({} as never)
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['ontology'] })
  })

  it('usePublishEntity tracks and invalidates', async () => {
    (api.publishEntity as ReturnType<typeof vi.fn>).mockResolvedValue({})
    const { qc, wrapper } = makeWrapper()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => usePublishEntity(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ entityType: 'objects', entityName: 'a' })
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['ontology'] })
  })
})
