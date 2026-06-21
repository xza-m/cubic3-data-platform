import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '@v2/components/ui/Toast'
import DataCenter from './DataCenter'

const appShellMocks = vi.hoisted(() => ({
  setBreadcrumbs: vi.fn(),
  setTopBarActions: vi.fn(),
  setContextPanel: vi.fn(),
  openTab: vi.fn(),
}))

const datasource = {
  id: 1,
  name: 'pg_main',
  source_type: 'postgresql',
  description: '主库连接',
  connection_config: {},
  extra_config: {},
  is_active: true,
  connection_status: 'connected',
  last_test_at: '2026-06-09T03:56:00Z',
  last_test_error: null,
  created_by: 'tester',
  created_by_display_name: null,
  created_at: '2026-05-20T06:13:00Z',
  updated_at: '2026-06-09T03:56:00Z',
}

const dataset = {
  id: 11,
  dataset_name: '订单明细',
  dataset_code: 'order_detail',
  physical_table: 'public.orders',
  owner: 'tester',
  sync_status: 'synced',
  source_id: 1,
  datasource_id: 1,
  datasource_name: 'pg_main',
  last_sync_at: '2026-06-09T03:00:00Z',
  created_at: '2026-05-20T06:13:00Z',
  updated_at: '2026-06-09T03:00:00Z',
}

const datasourcesState = {
  isError: false,
  error: null as Error | null,
}
const testConnectionMutateAsync = vi.fn()

vi.mock('@v2/hooks/datasources', () => ({
  useDatasources: () => ({
    data: datasourcesState.isError
      ? undefined
      : { items: [datasource], total: 1, page: 1, page_size: 100, total_pages: 1 },
    isLoading: false,
    isError: datasourcesState.isError,
    error: datasourcesState.error,
    isFetching: false,
    refetch: vi.fn().mockResolvedValue({ status: 'success' }),
  }),
  useTestConnection: () => ({
    mutateAsync: testConnectionMutateAsync,
    isPending: false,
  }),
}))

vi.mock('@v2/hooks/datasets', () => ({
  useDatasets: () => ({
    data: { items: [dataset], total: 1, page: 1, page_size: 100, total_pages: 1 },
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn().mockResolvedValue({ status: 'success' }),
  }),
}))

vi.mock('@v2/layout/AppShell', () => ({
  useAppShell: () => appShellMocks,
}))

function renderDataCenter(initialPath = '/data-center') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/data-center/*" element={<DataCenter />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  )
}

describe('DataCenter', () => {
  beforeEach(() => {
    datasourcesState.isError = false
    datasourcesState.error = null
    testConnectionMutateAsync.mockReset()
    appShellMocks.setBreadcrumbs.mockClear()
    appShellMocks.setTopBarActions.mockClear()
    appShellMocks.setContextPanel.mockClear()
    appShellMocks.openTab.mockClear()
  })

  it('默认展示概览，一级导航交给二级侧栏承载', () => {
    renderDataCenter()

    expect(appShellMocks.setBreadcrumbs).toHaveBeenLastCalledWith(['数据', '概览'])
    expect(screen.queryByRole('tab', { name: /概览/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '数据中心' })).not.toBeInTheDocument()
    expect(screen.getByText('今日待处理')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '最近运营对象' })).not.toBeInTheDocument()
  })

  it('连接路径直接展示连接管理内容', async () => {
    renderDataCenter('/data-center/connections')

    expect(await screen.findByText('pg_main')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '测试连接' })).toBeInTheDocument()
  })

  it('影响分析展示基于资产和连接状态计算的摘要', () => {
    renderDataCenter('/data-center/impact')

    expect(screen.getByRole('heading', { name: '准备度摘要' })).toBeInTheDocument()
    expect(screen.getByText('可建模资产')).toBeInTheDocument()
    expect(screen.getByText('暂无阻断项，已同步资产可继续进入语义建设。')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '职责边界' })).not.toBeInTheDocument()
    expect(screen.queryByText('语义中心 / BI / Data Agent')).not.toBeInTheDocument()
    expect(screen.queryByText('可触达消费端')).not.toBeInTheDocument()
  })

  it('上下文面板展示数据健康，不重复菜单和内部边界说明', () => {
    renderDataCenter()

    const calls = appShellMocks.setContextPanel.mock.calls
    const payload = calls[calls.length - 1]?.[0]
    expect(payload).toBeTruthy()
    render(<>{payload.body}</>)

    expect(payload.title).toBe('数据健康')
    expect(screen.getByText('当前数据')).toBeInTheDocument()
    expect(screen.getByText('待处理')).toBeInTheDocument()
    expect(screen.getByText('连接和资产同步状态正常。')).toBeInTheDocument()
    expect(screen.queryByText('工作路径')).not.toBeInTheDocument()
    expect(screen.queryByText('操作原则')).not.toBeInTheDocument()
    expect(screen.queryByText(/gateway|Dataset|不暴露 API/)).not.toBeInTheDocument()
  })

  it('数据加载失败时展示 RetryState', () => {
    datasourcesState.isError = true
    datasourcesState.error = new Error('数据源服务不可用')

    renderDataCenter()

    expect(screen.getByText('数据源服务不可用')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重试加载数据中心' })).toBeInTheDocument()
  })

  it('测试连接成功后弹出成功 Toast', async () => {
    testConnectionMutateAsync.mockResolvedValue({ ok: true, message: '连接正常' })

    renderDataCenter('/data-center/connections')

    await userEvent.click(screen.getByRole('button', { name: '测试连接' }))

    expect(testConnectionMutateAsync).toHaveBeenCalledWith(1)
    expect(await screen.findByText('连接测试通过')).toBeInTheDocument()
    expect(screen.getByText(/连接正常/)).toBeInTheDocument()
  })

  it('测试连接失败后弹出失败 Toast', async () => {
    testConnectionMutateAsync.mockRejectedValue(new Error('网络超时'))

    renderDataCenter('/data-center/connections')

    await userEvent.click(screen.getByRole('button', { name: '测试连接' }))

    expect(await screen.findByText('连接测试未通过')).toBeInTheDocument()
    expect(screen.getByText('网络超时')).toBeInTheDocument()
  })
})
