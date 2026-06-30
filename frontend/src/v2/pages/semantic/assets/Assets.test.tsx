import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const mockApiClientGet = vi.hoisted(() => vi.fn())

vi.mock('@v2/layout/AppShell', () => ({
  useAppShell: () => ({
    setBreadcrumbs: vi.fn(),
    setTopBarActions: vi.fn(),
    setContextPanel: vi.fn(),
  }),
}))

vi.mock('@v2/api/client', () => ({
  apiClient: {
    get: mockApiClientGet,
  },
}))

vi.mock('@v2/api/semantic', async () => {
  const actual = await vi.importActual<typeof import('@v2/api/semantic')>('@v2/api/semantic')
  return {
    ...actual,
    getDataAssetRadar: vi.fn(),
    getDataAssetTableEvidence: vi.fn(),
    getDataAssetTableFields: vi.fn(),
    listDataAssetSyncRuns: vi.fn(),
    listDataAssetPhysicalTables: vi.fn(),
    syncDataAssetMetadata: vi.fn(),
  }
})

import {
  getDataAssetRadar,
  getDataAssetTableEvidence,
  getDataAssetTableFields,
  listDataAssetSyncRuns,
  listDataAssetPhysicalTables,
  syncDataAssetMetadata,
} from '@v2/api/semantic'
import Assets, { AssetWorkspace } from './Assets'

const mockGetDataAssetRadar = vi.mocked(getDataAssetRadar)
const mockGetDataAssetTableEvidence = vi.mocked(getDataAssetTableEvidence)
const mockGetDataAssetTableFields = vi.mocked(getDataAssetTableFields)
const mockListDataAssetSyncRuns = vi.mocked(listDataAssetSyncRuns)
const mockListDataAssetPhysicalTables = vi.mocked(listDataAssetPhysicalTables)
const mockSyncDataAssetMetadata = vi.mocked(syncDataAssetMetadata)

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

function twoPhysicalTables() {
  return {
    tables: [
      {
        id: 'table.orders',
        datasource_name: '生产 PostgreSQL',
        database: 'warehouse',
        schema: 'public',
        table_name: 'dwd_order_fact',
        display_name: '订单事实表',
        owner: '数据平台',
        sync_status: 'synced',
        field_count: 38,
        row_count: 120000,
        updated_at: '2026-05-23T08:00:00Z',
      },
      {
        id: 'table.comments',
        datasource_name: 'MaxCompute',
        database: 'df_cb_258187',
        schema: 'dw',
        table_name: 'dwd_interaction_comment_reports_df',
        display_name: '学生评论举报事实表',
        owner: '数据平台',
        sync_status: 'synced',
        field_count: 47,
        row_count: 880000,
        updated_at: '2026-05-23T09:00:00Z',
      },
    ],
    total: 2,
    page: 1,
    page_size: 20,
    page_count: 1,
  }
}

describe('数据资产底座工作区', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetDataAssetRadar.mockResolvedValue({
      summary: {
        physical_table_count: 18,
        synced_table_count: 16,
        field_count: 246,
        lineage_edge_count: 41,
        quality_issue_count: 3,
        last_sync_at: '2026-05-23T08:30:00Z',
      },
      health: {
        score: 92,
        level: 'healthy',
        label: '健康',
      },
    })
    mockListDataAssetPhysicalTables.mockResolvedValue({
      tables: [
        {
          id: 'table.orders',
          datasource_name: '生产 PostgreSQL',
          database: 'warehouse',
          schema: 'public',
          table_name: 'dwd_order_fact',
          display_name: '订单事实表',
          owner: '数据平台',
          sync_status: 'synced',
          field_count: 38,
          row_count: 120000,
          updated_at: '2026-05-23T08:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
      page_count: 1,
    })
    mockGetDataAssetTableFields.mockResolvedValue({
      items: [
        {
          id: 'field-school',
          name: 'school_id',
          data_type: 'BIGINT',
          nullable: false,
          comment: '学校 ID',
          profile: { null_rate: 0, cardinality: 3 },
        },
        {
          id: 'field-comment',
          name: 'comment_count',
          data_type: 'BIGINT',
          nullable: false,
          comment: '评论数',
          profile: { null_rate: 0.02, cardinality: 32 },
        },
      ],
      total: 2,
    })
    mockGetDataAssetTableEvidence.mockResolvedValue({
      runtime_truth: false,
      sample_profile: {
        row_count: 120000,
        partition_count: 7,
        profile_status: 'fresh',
        field_profiles: {
          school_id: { null_rate: 0, cardinality: 3 },
          comment_count: { null_rate: 0, cardinality: 32 },
        },
      },
      usage_evidence: [
        {
          source_type: 'sql_history',
          source_ref: 'smoke_query_data_asset_foundation',
          usage_count: 5,
        },
      ],
      lineage_evidence: [
        {
          target_type: 'cube',
          target_ref: 'student_comment_cube',
          relation_type: 'downstream',
        },
      ],
    })
    mockApiClientGet.mockResolvedValue({ data: { data: { items: [] } } })
    mockListDataAssetSyncRuns.mockResolvedValue({
      items: [
        {
          id: 'sync-20260523-001',
          source_id: 'maxcompute-prod',
          status: 'success',
          started_at: '2026-05-23T08:40:00Z',
          finished_at: '2026-05-23T08:41:00Z',
          stats: { table_count: 1, field_count: 2 },
        },
      ],
      total: 1,
      page: 1,
      page_size: 10,
      page_count: 1,
    })
    mockSyncDataAssetMetadata.mockResolvedValue({
      sync_run_id: 'sync-20260523-001',
      status: 'success',
      submitted_at: '2026-05-23T08:40:00Z',
      finished_at: '2026-05-23T08:41:00Z',
      error_message: null,
      stats: { table_count: 1, field_count: 2, failed_source_count: 0 },
    })
  })

  it('资产雷达只展示底座概览，不重复展示物理表列表', async () => {
    render(
      <MemoryRouter>
        <Assets />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: '资产雷达' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: '数据资产底座页面' })).not.toBeInTheDocument()
    expect(screen.queryByText('资产功能索引')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /字段画像/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /元数据同步/ })).not.toBeInTheDocument()
    expect(await screen.findByText('底座健康概览')).toBeInTheDocument()
    expect(screen.getByText('18')).toBeInTheDocument()
    expect(screen.getByText('92')).toBeInTheDocument()
    expect(screen.queryByText('最近同步：成功，写入 1 张表 / 2 个字段')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '刷新同步记录' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '同步元数据' })).not.toBeInTheDocument()
    expect(screen.queryByText('物理表列表')).not.toBeInTheDocument()
    expect(screen.queryByText('订单事实表')).not.toBeInTheDocument()
    expect(mockListDataAssetPhysicalTables).not.toHaveBeenCalled()
  })

  it('资产雷达无 Schema 漂移问题时不展示漂移摘要', async () => {
    render(
      <MemoryRouter>
        <AssetWorkspace view="radar" />
      </MemoryRouter>,
    )

    expect(await screen.findByText('底座健康概览')).toBeInTheDocument()
    expect(screen.queryByText('Schema 漂移风险')).not.toBeInTheDocument()
  })

  it('资产雷达展示复用语义治理的 Schema 漂移摘要', async () => {
    mockApiClientGet.mockResolvedValueOnce({
      data: {
        data: {
          items: [
            {
              id: 'schema-drift-1',
              code: 'schema_drift_missing_in_physical',
              severity: 'warn',
              object_type: 'physical_table',
              object_name: 'dwd_order_fact',
              message: '语义字段 order_amount 在资产快照中缺失',
            },
          ],
        },
      },
    })

    render(
      <MemoryRouter>
        <AssetWorkspace view="radar" />
      </MemoryRouter>,
    )

    const driftSummary = (await screen.findByText('Schema 漂移风险')).closest('.card')
    expect(driftSummary).not.toBeNull()
    expect(within(driftSummary as HTMLElement).getByText('dwd_order_fact')).toBeInTheDocument()
    expect(within(driftSummary as HTMLElement).getByText('语义字段 order_amount 在资产快照中缺失')).toBeInTheDocument()
    expect(within(driftSummary as HTMLElement).getByText('warn')).toHaveClass('chip-warning')
    expect(mockApiClientGet).toHaveBeenCalledWith('/semantic/governance/issues', {
      params: { schema_source: 'asset_snapshot' },
    })
  })

  it('资产雷达 Schema 漂移摘要支持卡内分页', async () => {
    const user = userEvent.setup()
    mockApiClientGet.mockResolvedValueOnce({
      data: {
        data: {
          items: Array.from({ length: 6 }, (_, index) => ({
            id: `schema-drift-${index + 1}`,
            code: 'schema_drift_type_changed',
            severity: 'warn',
            object_type: 'physical_table',
            object_name: `student_comment_cube_${index + 1}`,
            message: `漂移风险 ${index + 1}`,
          })),
        },
      },
    })

    render(
      <MemoryRouter>
        <AssetWorkspace view="radar" />
      </MemoryRouter>,
    )

    const driftSummary = (await screen.findByText('Schema 漂移风险')).closest('.card')
    expect(driftSummary).not.toBeNull()
    const summary = within(driftSummary as HTMLElement)
    expect(summary.getByText('student_comment_cube_1')).toBeInTheDocument()
    expect(summary.getByText('student_comment_cube_5')).toBeInTheDocument()
    expect(summary.queryByText('student_comment_cube_6')).not.toBeInTheDocument()
    expect(summary.getByText('1-5 / 6 条')).toBeInTheDocument()

    await user.click(summary.getByRole('button', { name: '下一页' }))

    expect(summary.getByText('student_comment_cube_6')).toBeInTheDocument()
    expect(summary.queryByText('student_comment_cube_1')).not.toBeInTheDocument()
    expect(summary.getByText('6-6 / 6 条')).toBeInTheDocument()
  })

  it('资产雷达兼容语义治理 issues 响应并展示 Schema 漂移摘要', async () => {
    mockApiClientGet.mockResolvedValueOnce({
      data: {
        data: {
          issues: [
            {
              id: 'schema-drift-legacy-1',
              code: 'schema_drift_type_changed',
              severity: 'warn',
              object_type: 'physical_table',
              object_name: 'dwd_order_fact',
              message: '旧契约 issues 分支仍应展示',
            },
          ],
        },
      },
    })

    render(
      <MemoryRouter>
        <AssetWorkspace view="radar" />
      </MemoryRouter>,
    )

    const driftSummary = (await screen.findByText('Schema 漂移风险')).closest('.card')
    expect(driftSummary).not.toBeNull()
    expect(within(driftSummary as HTMLElement).getByText('dwd_order_fact')).toBeInTheDocument()
    expect(within(driftSummary as HTMLElement).getByText('旧契约 issues 分支仍应展示')).toBeInTheDocument()
  })

  it('语义治理 issues 失败时不阻断资产雷达核心数据', async () => {
    mockApiClientGet.mockRejectedValueOnce(new Error('governance unavailable'))

    render(
      <MemoryRouter>
        <AssetWorkspace view="radar" />
      </MemoryRouter>,
    )

    expect(await screen.findByText('底座健康概览')).toBeInTheDocument()
    expect(screen.getByText('18')).toBeInTheDocument()
    expect(screen.queryByText('物理表列表')).not.toBeInTheDocument()
    expect(mockListDataAssetPhysicalTables).not.toHaveBeenCalled()
    expect(screen.queryByText('资产底座数据加载失败，请稍后重试。')).not.toBeInTheDocument()
  })

  it('最近同步提示展示失败数据源名称', async () => {
    mockListDataAssetSyncRuns.mockResolvedValueOnce({
      items: [
        {
          id: 'sync-20260523-002',
          source_id: 'all',
          status: 'success',
          started_at: '2026-05-23T08:40:00Z',
          finished_at: '2026-05-23T08:41:00Z',
          stats: {
            table_count: 4,
            field_count: 12,
            failed_source_count: 1,
            source_errors: [
              {
                source_id: '生产环境MaxCompute',
                message: 'AccessKeyStatusError',
              },
            ],
          },
        },
      ],
      total: 1,
    })

    render(
      <MemoryRouter>
        <AssetWorkspace view="sync-runs" />
      </MemoryRouter>,
    )

    expect(
      await screen.findByText('最近同步：成功，写入 4 张表 / 12 个字段，失败数据源：生产环境MaxCompute'),
    ).toBeInTheDocument()
  })

  it('点击同步元数据按钮触发 API', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AssetWorkspace view="sync-runs" />
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('button', { name: '同步元数据' }))

    await waitFor(() => expect(mockSyncDataAssetMetadata).toHaveBeenCalledWith({ scope: 'all' }))
    expect(await screen.findByText('同步完成：写入 1 张表 / 2 个字段')).toBeInTheDocument()
  })

  it('物理表页不重复展示资产雷达概览', async () => {
    render(
      <MemoryRouter>
        <AssetWorkspace view="tables" />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: '物理表' })).toBeInTheDocument()
    expect(screen.queryByText('物理表列表')).not.toBeInTheDocument()
    expect(await screen.findByText('共 1 张表')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '资产雷达' })).not.toBeInTheDocument()
    expect(screen.queryByText('底座健康概览')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '刷新同步记录' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '同步元数据' })).not.toBeInTheDocument()
    expect(screen.getByText('1 / 1')).toBeInTheDocument()
  })

  it('物理表页支持按关键字筛选', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AssetWorkspace view="tables" />
      </MemoryRouter>,
    )

    await user.type(await screen.findByLabelText('筛选物理表'), 'order')

    await waitFor(() =>
      expect(mockListDataAssetPhysicalTables).toHaveBeenLastCalledWith({
        q: 'order',
        page: 1,
        page_size: 20,
      }),
    )
  })

  it('物理表页支持数据源、库、Schema 和同步状态筛选', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AssetWorkspace view="tables" />
      </MemoryRouter>,
    )

    await user.type(await screen.findByLabelText('筛选数据源'), 'maxcompute-prod')
    await user.type(await screen.findByLabelText('筛选库'), 'df_cb_258187')
    await user.type(await screen.findByLabelText('筛选 Schema'), 'dw')
    await user.selectOptions(await screen.findByLabelText('筛选同步状态'), 'success')

    await waitFor(() =>
      expect(mockListDataAssetPhysicalTables).toHaveBeenLastCalledWith({
        q: undefined,
        page: 1,
        page_size: 20,
        source_id: 'maxcompute-prod',
        database: 'df_cb_258187',
        schema: 'dw',
        sync_status: 'success',
      }),
    )
  })

  it('物理表页支持分页切换', async () => {
    const user = userEvent.setup()
    mockListDataAssetPhysicalTables.mockResolvedValue({
      tables: [
        {
          id: 'table.orders',
          datasource_name: '生产 PostgreSQL',
          database: 'warehouse',
          schema: 'public',
          table_name: 'dwd_order_fact',
          display_name: '订单事实表',
          owner: '数据平台',
          sync_status: 'synced',
          field_count: 38,
          row_count: 120000,
          updated_at: '2026-05-23T08:00:00Z',
        },
      ],
      total: 25,
      page: 1,
      page_size: 20,
      page_count: 2,
    })

    render(
      <MemoryRouter>
        <AssetWorkspace view="tables" />
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('button', { name: '下一页' }))

    await waitFor(() =>
      expect(mockListDataAssetPhysicalTables).toHaveBeenLastCalledWith({
        q: undefined,
        page: 2,
        page_size: 20,
      }),
    )
  })

  it('表画像页展示画像摘要', async () => {
    render(
      <MemoryRouter>
        <AssetWorkspace view="quality" />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: '表画像' })).toBeInTheDocument()
    expect(await screen.findByText('表画像明细')).toBeInTheDocument()
    expect(screen.getByText('120,000')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('fresh')).toBeInTheDocument()
  })

  it('字段画像页展示字段 profile', async () => {
    render(
      <MemoryRouter>
        <AssetWorkspace view="fields" />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: '字段画像' })).toBeInTheDocument()
    expect(await screen.findByText('字段画像明细')).toBeInTheDocument()
    expect(screen.getByText('school_id')).toBeInTheDocument()
    expect(screen.getByText('空值率 0')).toBeInTheDocument()
    expect(screen.getByText('基数 3')).toBeInTheDocument()
  })

  it('字段画像页按选中的物理表加载字段和证据', async () => {
    const user = userEvent.setup()
    mockListDataAssetPhysicalTables.mockResolvedValue(twoPhysicalTables())

    render(
      <MemoryRouter>
        <AssetWorkspace view="fields" />
      </MemoryRouter>,
    )

    await user.selectOptions(await screen.findByLabelText('选择画像物理表'), 'table.comments')

    await waitFor(() => expect(mockGetDataAssetTableFields).toHaveBeenLastCalledWith('table.comments'))
    await waitFor(() => expect(mockGetDataAssetTableEvidence).toHaveBeenLastCalledWith('table.comments'))
  })

  it('字段画像页切换物理表后忽略旧详情请求', async () => {
    const user = userEvent.setup()
    const staleOrderFields = deferred<Awaited<ReturnType<typeof getDataAssetTableFields>>>()
    const staleOrderEvidence = deferred<Awaited<ReturnType<typeof getDataAssetTableEvidence>>>()

    mockListDataAssetPhysicalTables.mockResolvedValue(twoPhysicalTables())
    mockGetDataAssetTableFields.mockImplementation((tableId) => {
      if (tableId === 'table.orders') return staleOrderFields.promise
      return Promise.resolve({
        items: [
          {
            id: 'field-comment',
            name: 'comment_id',
            data_type: 'STRING',
            nullable: false,
            comment: '评论 ID',
            profile: { null_rate: 0, cardinality: 880000 },
          },
        ],
        total: 1,
      })
    })
    mockGetDataAssetTableEvidence.mockImplementation((tableId) => {
      if (tableId === 'table.orders') return staleOrderEvidence.promise
      return Promise.resolve({
        runtime_truth: false,
        sample_profile: { row_count: 880000, partition_count: 31, profile_status: 'comments-fresh' },
        usage_evidence: [],
        lineage_evidence: [],
      })
    })

    render(
      <MemoryRouter>
        <AssetWorkspace view="fields" />
      </MemoryRouter>,
    )

    const selector = await screen.findByLabelText('选择画像物理表')
    await user.selectOptions(selector, 'table.comments')

    await waitFor(() => expect(selector).toHaveValue('table.comments'))
    expect(await screen.findByText('comment_id')).toBeInTheDocument()
    await waitFor(() => expect(mockGetDataAssetTableFields).toHaveBeenLastCalledWith('table.comments'))
    await waitFor(() => expect(mockGetDataAssetTableEvidence).toHaveBeenLastCalledWith('table.comments'))

    staleOrderFields.resolve({
      items: [
        {
          id: 'field-order',
          name: 'order_id',
          data_type: 'BIGINT',
          nullable: false,
          comment: '订单 ID',
          profile: { null_rate: 0, cardinality: 120000 },
        },
      ],
      total: 1,
    })
    staleOrderEvidence.resolve({
      runtime_truth: false,
      sample_profile: { row_count: 120000, partition_count: 7, profile_status: 'orders-stale' },
      usage_evidence: [],
      lineage_evidence: [],
    })

    await waitFor(() => expect(selector).toHaveValue('table.comments'))
    expect(screen.getByText('comment_id')).toBeInTheDocument()
    expect(screen.queryByText('order_id')).not.toBeInTheDocument()
  })

  it('表画像页把 evidence 渲染到选中的物理表卡片', async () => {
    const user = userEvent.setup()
    mockListDataAssetPhysicalTables.mockResolvedValue(twoPhysicalTables())
    mockGetDataAssetTableEvidence.mockImplementation((tableId) => Promise.resolve({
      runtime_truth: false,
      sample_profile: tableId === 'table.comments'
        ? { row_count: 880000, partition_count: 31, profile_status: 'comments-fresh' }
        : { row_count: 120000, partition_count: 7, profile_status: 'orders-fresh' },
      usage_evidence: [],
      lineage_evidence: [],
    }))

    render(
      <MemoryRouter>
        <AssetWorkspace view="quality" />
      </MemoryRouter>,
    )

    await user.selectOptions(await screen.findByLabelText('选择画像物理表'), 'table.comments')

    const commentsCard = screen.getByText('学生评论举报事实表').closest('div.rounded-md')
    const ordersCard = screen.getByText('订单事实表').closest('div.rounded-md')
    expect(commentsCard).not.toBeNull()
    expect(ordersCard).not.toBeNull()
    await waitFor(() => expect(within(commentsCard as HTMLElement).getByText('880,000')).toBeInTheDocument())
    expect(within(commentsCard as HTMLElement).getByText('31')).toBeInTheDocument()
    expect(within(commentsCard as HTMLElement).getByText('comments-fresh')).toBeInTheDocument()
    expect(within(ordersCard as HTMLElement).queryByText('880,000')).not.toBeInTheDocument()
    expect(within(ordersCard as HTMLElement).queryByText('31')).not.toBeInTheDocument()
    expect(within(ordersCard as HTMLElement).queryByText('comments-fresh')).not.toBeInTheDocument()
  })

  it('旧同步记录响应不会覆盖当前同步页结果', async () => {
    const user = userEvent.setup()
    const staleSyncRuns = deferred<Awaited<ReturnType<typeof listDataAssetSyncRuns>>>()

    mockListDataAssetSyncRuns
      .mockImplementationOnce(() => staleSyncRuns.promise)
      .mockResolvedValue({
        items: [
          {
            id: 'sync-current',
            source_id: 'all',
            status: 'success',
            started_at: '2026-05-24T08:40:00Z',
            finished_at: '2026-05-24T08:41:00Z',
            stats: { table_count: 2, field_count: 4 },
          },
        ],
        total: 1,
      })

    render(
      <MemoryRouter>
        <AssetWorkspace view="sync-runs" />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: '刷新同步记录' }))
    expect(await screen.findByText('sync-current')).toBeInTheDocument()

    staleSyncRuns.resolve({
      items: [
        {
          id: 'sync-stale',
          source_id: 'all',
          status: 'success',
          started_at: '2026-05-23T08:40:00Z',
          finished_at: '2026-05-23T08:41:00Z',
          stats: { table_count: 1, field_count: 2 },
        },
      ],
      total: 1,
    })
    await staleSyncRuns.promise

    expect(screen.getByText('sync-current')).toBeInTheDocument()
    expect(screen.queryByText('sync-stale')).not.toBeInTheDocument()
  })

  it('旧 evidence 不会覆盖当前选中表画像', async () => {
    const user = userEvent.setup()
    const staleOrderEvidence = deferred<Awaited<ReturnType<typeof getDataAssetTableEvidence>>>()

    mockListDataAssetPhysicalTables.mockResolvedValue(twoPhysicalTables())
    mockGetDataAssetTableEvidence.mockImplementation((tableId) => {
      if (tableId === 'table.orders') return staleOrderEvidence.promise
      return Promise.resolve({
        runtime_truth: false,
        sample_profile: { row_count: 880000, partition_count: 31, profile_status: 'comments-fresh' },
        usage_evidence: [],
        lineage_evidence: [],
      })
    })

    render(
      <MemoryRouter>
        <AssetWorkspace view="quality" />
      </MemoryRouter>,
    )

    await user.selectOptions(await screen.findByLabelText('选择画像物理表'), 'table.comments')

    const commentsCard = screen.getByText('学生评论举报事实表').closest('div.rounded-md')
    expect(commentsCard).not.toBeNull()
    await waitFor(() => expect(within(commentsCard as HTMLElement).getByText('comments-fresh')).toBeInTheDocument())

    staleOrderEvidence.resolve({
      runtime_truth: false,
      sample_profile: { row_count: 120000, partition_count: 7, profile_status: 'orders-stale' },
      usage_evidence: [],
      lineage_evidence: [],
    })

    await waitFor(() => expect(within(commentsCard as HTMLElement).getByText('comments-fresh')).toBeInTheDocument())
    expect(within(commentsCard as HTMLElement).queryByText('orders-stale')).not.toBeInTheDocument()
    expect(within(commentsCard as HTMLElement).queryByText('120,000')).not.toBeInTheDocument()
    expect(within(commentsCard as HTMLElement).queryByText('7')).not.toBeInTheDocument()
  })

  it('血缘使用页展示 lineage 和 usage', async () => {
    render(
      <MemoryRouter>
        <AssetWorkspace view="lineage" />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: '血缘使用' })).toBeInTheDocument()
    expect(await screen.findByText('血缘使用明细')).toBeInTheDocument()
    expect(screen.getByText('student_comment_cube')).toBeInTheDocument()
    expect(screen.getByText('smoke_query_data_asset_foundation')).toBeInTheDocument()
  })

  it('元数据同步页展示同步记录', async () => {
    render(
      <MemoryRouter>
        <AssetWorkspace view="sync-runs" />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: '元数据同步' })).toBeInTheDocument()
    expect(await screen.findByText('元数据同步记录')).toBeInTheDocument()
    expect(screen.getByText('sync-20260523-001')).toBeInTheDocument()
    expect(screen.getByText('success')).toBeInTheDocument()
    expect(screen.getByText('1-1 / 1 条')).toBeInTheDocument()
    expect(mockListDataAssetSyncRuns).toHaveBeenLastCalledWith({ page: 1, page_size: 10 })
  })

  it('元数据同步页支持分页切换', async () => {
    const user = userEvent.setup()
    mockListDataAssetSyncRuns.mockResolvedValue({
      items: [
        {
          id: 'sync-page-1',
          source_id: 'data-asset-smoke',
          status: 'success',
          started_at: '2026-05-24T08:40:00Z',
          finished_at: '2026-05-24T08:41:00Z',
          stats: { table_count: 1, field_count: 2 },
        },
      ],
      total: 21,
      page: 1,
      page_size: 10,
      page_count: 3,
    })

    render(
      <MemoryRouter>
        <AssetWorkspace view="sync-runs" />
      </MemoryRouter>,
    )

    expect(await screen.findByText('sync-page-1')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '下一页' }))

    await waitFor(() =>
      expect(mockListDataAssetSyncRuns).toHaveBeenLastCalledWith({
        page: 2,
        page_size: 10,
      }),
    )
  })

  it('元数据同步页展示失败数据源明细', async () => {
    mockListDataAssetSyncRuns.mockResolvedValue({
      items: [
        {
          id: 'sync-20260524-001',
          source_id: 'all',
          status: 'failed',
          started_at: '2026-05-24T08:40:00Z',
          finished_at: '2026-05-24T08:41:00Z',
          error_message: '所有数据源同步失败',
          stats: {
            table_count: 0,
            field_count: 0,
            failed_source_count: 1,
            source_errors: [{ source_id: '生产环境MaxCompute', message: 'AccessKeyStatusError' }],
          },
        },
      ],
      total: 1,
      page: 1,
      page_size: 10,
      page_count: 1,
    })

    render(
      <MemoryRouter>
        <AssetWorkspace view="sync-runs" />
      </MemoryRouter>,
    )

    expect(await screen.findByText('生产环境MaxCompute')).toBeInTheDocument()
    expect(screen.getByText('AccessKeyStatusError')).toBeInTheDocument()
    expect(screen.getByText('同步批次 sync-20260524-001')).toBeInTheDocument()
  })
})
