import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CubeDraftPayload } from '@/api/semantic'
import { WorkbenchCubeDraftStarter } from './WorkbenchCubeDraftStarter'

const semanticApiMocks = vi.hoisted(() => ({
  createCubeDraftFromSource: vi.fn(),
  createCube: vi.fn(),
}))

const datasourceApiMocks = vi.hoisted(() => ({
  getDataSources: vi.fn(),
}))

const navigateMock = vi.hoisted(() => vi.fn())
const toastMock = vi.hoisted(() => vi.fn())

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

vi.mock('@/api/semantic', async () => {
  const actual = await vi.importActual<typeof import('@/api/semantic')>('@/api/semantic')
  return {
    ...actual,
    createCubeDraftFromSource: semanticApiMocks.createCubeDraftFromSource,
    createCube: semanticApiMocks.createCube,
  }
})

vi.mock('@/api/datasources', () => ({
  getDataSources: datasourceApiMocks.getDataSources,
}))

vi.mock('@/components/business', async () => {
  const actual = await vi.importActual<typeof import('@/components/business')>('@/components/business')
  return {
    ...actual,
    SchemaBrowser: ({ onSelect }: { onSelect?: (node: Record<string, unknown>) => void }) => (
      <div data-testid="mock-schema-browser">
        <button
          type="button"
          onClick={() =>
            onSelect?.({
              type: 'schema',
              name: 'public',
              metadata: { database: 'dw', schema: 'public' },
            })}
        >
          选择 schema
        </button>
        <button
          type="button"
          onClick={() =>
            onSelect?.({
              type: 'table',
              name: 'orders',
              metadata: {
                database: 'dw',
                schema: 'public',
                table: 'orders',
                comment: '订单事实表',
              },
            })}
        >
          选择 orders
        </button>
      </div>
    ),
    useToast: () => ({ toast: toastMock }),
  }
})

function buildDraftPayload(overrides: Partial<CubeDraftPayload> = {}): CubeDraftPayload {
  return {
    name: 'orders_cube__revision_draft',
    title: '订单分析草稿',
    description: '订单事实表',
    table: 'orders',
    status: 'draft',
    source_id: 1,
    source_database: 'dw',
    source_schema: 'public',
    domain_id: 'sales',
    dimensions: {
      customer_id: {
        title: '客户',
        type: 'string',
        sql: 'source.customer_id',
        description: '客户唯一标识',
      },
    },
    measures: {
      total_amount: {
        title: '总金额',
        type: 'sum',
        sql: 'SUM(source.total_amount)',
        description: '订单总金额',
      },
    },
    joins: {},
    ...overrides,
  }
}

function renderStarter(queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
})) {
  return {
    queryClient,
    ...render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <WorkbenchCubeDraftStarter />
        </QueryClientProvider>
      </MemoryRouter>,
    ),
  }
}

describe('WorkbenchCubeDraftStarter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    datasourceApiMocks.getDataSources.mockResolvedValue({
      data: {
        items: [
          {
            id: 1,
            name: '学习行为仓',
            source_type: 'postgres',
          },
          {
            id: 2,
            name: '经营分析仓',
            source_type: 'clickhouse',
          },
        ],
      },
    })
  })

  it('默认加载数据源，忽略非表节点，并在选中物理表后允许生成草稿', async () => {
    const user = userEvent.setup()
    renderStarter()

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toHaveTextContent('学习行为仓')
    })
    expect(screen.getByText('在右侧选择物理表')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '选择 schema' }))
    expect(screen.queryByText('orders')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '选择 orders' }))
    expect(await screen.findByText('orders')).toBeInTheDocument()
    expect(screen.getByText('dw / public')).toBeInTheDocument()
    expect(screen.getByTestId('cube-generate-draft')).toBeEnabled()
  })

  it('生成草稿成功后展示草稿信息，并在切换数据源时清空已选表和草稿', async () => {
    const user = userEvent.setup()
    semanticApiMocks.createCubeDraftFromSource.mockResolvedValue({
      data: buildDraftPayload(),
    })

    renderStarter()

    await user.click(await screen.findByRole('button', { name: '选择 orders' }))
    await user.click(screen.getByTestId('cube-generate-draft'))

    await waitFor(() => {
      expect(semanticApiMocks.createCubeDraftFromSource).toHaveBeenCalledWith({
        source_kind: 'physical_table',
        source_id: 1,
        database: 'dw',
        schema: 'public',
        table: 'orders',
      })
    })
    expect(await screen.findByDisplayValue('orders_cube__revision_draft')).toBeInTheDocument()
    expect(screen.getByDisplayValue('订单分析草稿')).toBeInTheDocument()
    expect(screen.getByText('维度')).toBeInTheDocument()
    expect(screen.getByText('指标')).toBeInTheDocument()
    expect(toastMock).toHaveBeenCalledWith({ title: 'Cube 草稿已生成' })

    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: '经营分析仓 · clickhouse' }))

    expect(await screen.findByText('在右侧选择物理表')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('orders_cube__revision_draft')).not.toBeInTheDocument()
  })

  it('生成草稿失败时展示 destructive 提示', async () => {
    const user = userEvent.setup()
    semanticApiMocks.createCubeDraftFromSource.mockRejectedValue(new Error('draft failed'))

    renderStarter()

    await user.click(await screen.findByRole('button', { name: '选择 orders' }))
    await user.click(screen.getByTestId('cube-generate-draft'))

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: '生成草稿失败',
        description: 'draft failed',
        variant: 'destructive',
      })
    })
  })

  it('保存 Draft Cube 成功后写回缓存并跳转到工作台', async () => {
    const user = userEvent.setup()
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    queryClient.setQueryData(['semantic', 'cubes'], {
      cubes: [
        {
          name: 'legacy_cube',
          title: '旧 Cube',
          description: '历史对象',
          table: 'legacy',
          domain_ids: [],
          domains: [],
          domain_count: 0,
          status: 'active',
          dimensions: [],
          measures: [],
          dimension_count: 0,
          measure_count: 0,
        },
      ],
      total: 1,
    })
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')

    semanticApiMocks.createCubeDraftFromSource.mockResolvedValue({
      data: buildDraftPayload(),
    })
    semanticApiMocks.createCube.mockResolvedValue({
      data: buildDraftPayload({
        name: 'orders_cube_final',
        title: '订单分析正式版',
      }),
    })

    renderStarter(queryClient)

    await user.click(await screen.findByRole('button', { name: '选择 orders' }))
    await user.click(screen.getByTestId('cube-generate-draft'))
    await screen.findByDisplayValue('orders_cube__revision_draft')

    fireEvent.change(screen.getByTestId('cube-draft-name'), { target: { value: '  orders_cube_final  ' } })
    fireEvent.change(screen.getByTestId('cube-draft-title'), { target: { value: '  订单分析正式版  ' } })
    await user.click(screen.getByTestId('cube-banner-save-draft'))

    await waitFor(() => {
      expect(semanticApiMocks.createCube).toHaveBeenCalledWith(expect.objectContaining({
        name: 'orders_cube_final',
        title: '订单分析正式版',
      }))
    })
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['semantic'] })
    expect(queryClient.getQueryData<{ cubes: Array<{ name: string }>; total: number }>(['semantic', 'cubes'])).toEqual(
      expect.objectContaining({
        total: 2,
        cubes: expect.arrayContaining([expect.objectContaining({ name: 'orders_cube_final' })]),
      }),
    )
    expect(navigateMock).toHaveBeenCalledWith('/semantic/workbench?cube=orders_cube_final&tab=modeling')
    expect(toastMock).toHaveBeenCalledWith({ title: 'Cube 创建成功' })
  })

  it('保存 Draft Cube 失败时通过统一错误提示兜底', async () => {
    const user = userEvent.setup()
    semanticApiMocks.createCubeDraftFromSource.mockResolvedValue({
      data: buildDraftPayload(),
    })
    semanticApiMocks.createCube.mockRejectedValue(new Error('create failed'))

    renderStarter()

    await user.click(await screen.findByRole('button', { name: '选择 orders' }))
    await user.click(screen.getByTestId('cube-generate-draft'))
    await screen.findByDisplayValue('orders_cube__revision_draft')
    await user.click(screen.getByTestId('cube-banner-save-draft'))

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: '创建 Cube 失败',
        description: 'create failed',
        variant: 'destructive',
      })
    })
  })
})
