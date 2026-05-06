// frontend/src/v2/hooks/semantic.test.tsx
//
// Semantic 域 hooks 单元测试（W3 新增：P4/P5/P6/P7/P8）
// 每个 hook 至少 1 个 happy-path 测试，mock apiClient / api 层函数。

import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

// ─── Mock API 层 ──────────────────────────────────────────────────────────────

vi.mock('@v2/api/semantic', () => ({
  validateCubeFields: vi.fn(),
  dryRunMetric: vi.fn(),
  getSemanticGraph: vi.fn(),
  getDomainPublishHistory: vi.fn(),
  getViewMaterializeRuns: vi.fn(),
  listCubes: vi.fn(),
  describeCube: vi.fn(),
  listDomains: vi.fn(),
  listViews: vi.fn(),
  describeDomain: vi.fn(),
  describeView: vi.fn(),
  publishDomain: vi.fn(),
  getDomainCanvas: vi.fn(),
  getMaterializeStatus: vi.fn(),
  materializeView: vi.fn(),
  listCatalogs: vi.fn(),
  createCube: vi.fn(),
  updateCube: vi.fn(),
  activateCube: vi.fn(),
  deprecateCube: vi.fn(),
  draftCubeFromSource: vi.fn(),
  readSemanticFile: vi.fn(),
  writeSemanticFile: vi.fn(),
  validateSemanticFile: vi.fn(),
  schemaSyncCube: vi.fn(),
  compileDsl: vi.fn(),
  createDomain: vi.fn(),
  updateDomain: vi.fn(),
  addCubeToDomain: vi.fn(),
}))

import {
  validateCubeFields,
  dryRunMetric,
  getSemanticGraph,
  getDomainPublishHistory,
  getViewMaterializeRuns,
} from '@v2/api/semantic'

import {
  useValidateCubeFields,
  useDryRunMetric,
  useSemanticGraph,
  useDomainPublishHistory,
  useViewMaterializeRuns,
} from './semantic'

// ─── 测试工具 ─────────────────────────────────────────────────────────────────

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: 0 }, mutations: { retry: 0 } },
  })
  return {
    qc,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  }
}

const mockValidate = validateCubeFields as ReturnType<typeof vi.fn>
const mockDryRun = dryRunMetric as ReturnType<typeof vi.fn>
const mockGraph = getSemanticGraph as ReturnType<typeof vi.fn>
const mockHistory = getDomainPublishHistory as ReturnType<typeof vi.fn>
const mockRuns = getViewMaterializeRuns as ReturnType<typeof vi.fn>

afterEach(() => {
  vi.clearAllMocks()
})

// ─── P4: useValidateCubeFields ────────────────────────────────────────────────

describe('useValidateCubeFields', () => {
  it('calls validateCubeFields and returns result', async () => {
    const mockResult = {
      ok: false,
      issues: [{ field: 'order_date', code: 'TYPE_MISMATCH', message: '类型不一致', severity: 'error' as const }],
    }
    mockValidate.mockResolvedValue(mockResult)

    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useValidateCubeFields(), { wrapper })

    act(() => { result.current.mutate('my_cube') })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockValidate).toHaveBeenCalledWith('my_cube')
    expect(result.current.data).toEqual(mockResult)
    expect(result.current.data?.ok).toBe(false)
    expect(result.current.data?.issues).toHaveLength(1)
  })

  it('ok=true when no issues', async () => {
    mockValidate.mockResolvedValue({ ok: true, issues: [] })

    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useValidateCubeFields(), { wrapper })

    act(() => { result.current.mutate('clean_cube') })

    await waitFor(() => {
      expect(result.current.data?.ok).toBe(true)
      expect(result.current.data?.issues).toHaveLength(0)
    })
  })
})

// ─── P5: useDryRunMetric ──────────────────────────────────────────────────────

describe('useDryRunMetric', () => {
  it('calls dryRunMetric with name and formula', async () => {
    const mockResult = {
      sql_preview: 'SELECT COUNT(*) FROM orders',
      sample_rows: [{ count: 42 }],
      errors: [],
    }
    mockDryRun.mockResolvedValue(mockResult)

    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useDryRunMetric(), { wrapper })

    act(() => { result.current.mutate({ name: 'my_metric', formula: 'COUNT(*)' }) })

    await waitFor(() => {
      expect(result.current.data?.sql_preview).toContain('SELECT')
    })
    expect(mockDryRun).toHaveBeenCalledWith('my_metric', 'COUNT(*)')
    expect(result.current.data?.sample_rows).toHaveLength(1)
  })

  it('returns errors when formula is empty', async () => {
    mockDryRun.mockResolvedValue({
      sql_preview: '',
      errors: [{ code: 'EMPTY_FORMULA', message: '公式不能为空' }],
    })

    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useDryRunMetric(), { wrapper })

    act(() => { result.current.mutate({ name: 'bad_metric', formula: '' }) })

    await waitFor(() => {
      expect(result.current.data?.errors).toHaveLength(1)
    })
    expect(result.current.data?.errors?.[0].code).toBe('EMPTY_FORMULA')
  })
})

// ─── P6: useSemanticGraph ─────────────────────────────────────────────────────

describe('useSemanticGraph', () => {
  it('fetches graph data with nodes and edges', async () => {
    const mockData = {
      nodes: [
        { id: 'orders', title: '订单', type: 'fact', dimensions: 5, measures: 3 },
        { id: 'users', title: '用户', type: 'dimension', dimensions: 4, measures: 0 },
      ],
      edges: [
        { source: 'orders', target: 'users', relationship: 'N:1', join_type: 'left' },
      ],
    }
    mockGraph.mockResolvedValue(mockData)

    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useSemanticGraph(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockGraph).toHaveBeenCalledTimes(1)
    expect(result.current.data?.nodes).toHaveLength(2)
    expect(result.current.data?.edges).toHaveLength(1)
    expect(result.current.data?.nodes[0].type).toBe('fact')
  })

  it('returns empty arrays when no data', async () => {
    mockGraph.mockResolvedValue({ nodes: [], edges: [] })

    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useSemanticGraph(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.nodes).toHaveLength(0)
    expect(result.current.data?.edges).toHaveLength(0)
  })
})

// ─── P7: useDomainPublishHistory ──────────────────────────────────────────────

describe('useDomainPublishHistory', () => {
  it('fetches publish history records', async () => {
    const mockData = {
      records: [
        {
          version: 'v3',
          published_at: '2026-04-21T10:00:00Z',
          published_by: 'admin',
          status: 'success' as const,
          diff_summary: '+2 cubes',
        },
      ],
      total: 1,
    }
    mockHistory.mockResolvedValue(mockData)

    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useDomainPublishHistory('domain-123'), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockHistory).toHaveBeenCalledWith('domain-123')
    expect(result.current.data?.records).toHaveLength(1)
    expect(result.current.data?.records[0].version).toBe('v3')
    expect(result.current.data?.total).toBe(1)
  })

  it('does not fetch when id is undefined', async () => {
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useDomainPublishHistory(undefined), { wrapper })

    expect(result.current.fetchStatus).toBe('idle')
    expect(mockHistory).not.toHaveBeenCalled()
  })
})

// ─── P8: useViewMaterializeRuns ──────────────────────────────────────────────

describe('useViewMaterializeRuns', () => {
  it('fetches runs for a given view id', async () => {
    const mockData = {
      runs: [
        {
          id: 1,
          view_id: 42,
          status: 'success',
          started_at: '2026-04-21T08:00:00Z',
          finished_at: '2026-04-21T08:05:00Z',
          rows: 10000,
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
      page_count: 1,
    }
    mockRuns.mockResolvedValue(mockData)

    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useViewMaterializeRuns(42, { page: 1 }), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockRuns).toHaveBeenCalledWith(42, { page: 1 })
    expect(result.current.data?.runs).toHaveLength(1)
    expect(result.current.data?.runs[0].status).toBe('success')
    expect(result.current.data?.runs[0].rows).toBe(10000)
  })

  it('does not fetch when viewId is undefined', async () => {
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useViewMaterializeRuns(undefined), { wrapper })

    expect(result.current.fetchStatus).toBe('idle')
    expect(mockRuns).not.toHaveBeenCalled()
  })
})
