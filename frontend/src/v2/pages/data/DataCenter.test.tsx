import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '@v2/components/ui/Toast'
import DataCenter from './DataCenter'

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
  useAppShell: () => ({
    setBreadcrumbs: vi.fn(),
    setTopBarActions: vi.fn(),
    setContextPanel: vi.fn(),
    openTab: vi.fn(),
  }),
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
  })

  it('默认展示概览，可切换到连接管理 Tab', async () => {
    renderDataCenter()

    expect(screen.getByRole('tab', { name: /概览/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('今日待处理')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: /连接管理/ }))

    expect(screen.getByRole('tab', { name: /连接管理/ })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByText('pg_main')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '测试连接' })).toBeInTheDocument()
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
