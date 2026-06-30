import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import DatasourceDetail from './DatasourceDetail'

const appShellMocks = vi.hoisted(() => ({
  setBreadcrumbs: vi.fn(),
  setTopBarActions: vi.fn(),
  setContextPanel: vi.fn(),
  openTab: vi.fn(),
}))

const datasource = {
  id: 900001,
  name: 'sim_preprod_comment_reports',
  source_type: 'postgresql',
  description: 'local simulated preprod datasource for semantic platform E2E',
  connection_config: {
    host: 'postgres',
    port: 5432,
    database: 'cubic3_data_platform',
    user: 'postgres',
    password: 'postgres',
  },
  extra_config: {},
  is_active: true,
  connection_status: 'connected',
  last_test_at: '2026-06-09T03:56:00Z',
  last_test_error: null,
  created_by: 'codex_e2e',
  created_by_display_name: null,
  created_at: '2026-05-20T06:13:00Z',
  updated_at: '2026-06-09T03:56:00Z',
}

const tables = Array.from({ length: 25 }, (_, index) => ({
  table_name: `public.table_${String(index + 1).padStart(2, '0')}`,
  comment: '',
  row_count: null,
}))

const longColumnType =
  'array<struct<`level_tag`:string,`level_student_cnt`:bigint,`level_student_rate`:double>>'

vi.mock('@v2/hooks/datasources', () => ({
  useDatasource: () => ({
    data: datasource,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    isFetching: false,
  }),
  useDatasources: () => ({
    data: { items: [datasource], total: 1, page: 1, page_size: 20, total_pages: 1 },
  }),
  useTestConnection: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useDatasourceSchema: () => ({
    data: { databases: ['cubic3_data_platform'] },
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useDatasourceSchemaTables: () => ({
    data: { tables },
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useDatasourceSchemaTableColumns: () => ({
    data: {
      columns: [
        {
          name: 'level_distribution_arr',
          type: longColumnType,
          nullable: true,
          comment: '层级分布',
        },
      ],
      row_count_estimate: null,
    },
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  }),
}))

vi.mock('@v2/layout/AppShell', () => ({
  useAppShell: () => appShellMocks,
}))

vi.mock('@v2/components/IdentityName', () => ({
  IdentityName: ({ value, displayName }: { value: string; displayName?: string | null }) => (
    <span>{displayName || value}</span>
  ),
}))

describe('DatasourceDetail', () => {
  beforeEach(() => {
    appShellMocks.setBreadcrumbs.mockClear()
    appShellMocks.setTopBarActions.mockClear()
    appShellMocks.setContextPanel.mockClear()
    appShellMocks.openTab.mockClear()
  })

  it('可以从概览切到结构，并按每页 20 张表展示结构浏览器', async () => {
    render(
      <MemoryRouter initialEntries={['/data-center/connections/900001']}>
        <Routes>
          <Route path="/data-center/connections/:id" element={<DatasourceDetail />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByRole('tab', { name: '概览' })).toHaveAttribute('aria-selected', 'true')

    await userEvent.click(screen.getByRole('tab', { name: '结构' }))

    expect(screen.getByRole('tab', { name: '结构' })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByText('1-20 / 25 张表')).toBeInTheDocument()
    expect(screen.getByText('public.table_20')).toBeInTheDocument()
    expect(screen.queryByText('public.table_21')).not.toBeInTheDocument()
  })

  it('字段类型列固定宽度，长类型 hover 时展示完整内容', async () => {
    render(
      <MemoryRouter initialEntries={['/data-center/connections/900001']}>
        <Routes>
          <Route path="/data-center/connections/:id" element={<DatasourceDetail />} />
        </Routes>
      </MemoryRouter>,
    )

    await userEvent.click(screen.getByRole('tab', { name: '结构' }))
    await userEvent.click(await screen.findByText('public.table_01'))

    const typeText = await screen.findByText(longColumnType)
    expect(typeText.closest('table')).toHaveClass('table-fixed')
    expect(typeText).toHaveClass('truncate')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    Object.defineProperty(typeText, 'scrollWidth', { configurable: true, value: 520 })
    Object.defineProperty(typeText, 'clientWidth', { configurable: true, value: 180 })
    fireEvent.mouseEnter(typeText)

    expect(await screen.findByRole('tooltip')).toHaveTextContent(longColumnType)

    fireEvent.mouseLeave(typeText)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('把连接实例动作放在详情页头部，顶栏只保留导航和刷新', async () => {
    render(
      <MemoryRouter initialEntries={['/data-center/connections/900001']}>
        <Routes>
          <Route path="/data-center/connections/:id" element={<DatasourceDetail />} />
        </Routes>
      </MemoryRouter>,
    )

    const testButton = screen.getByRole('button', { name: '测试连接' })
    const editButton = screen.getByRole('button', { name: '编辑' })
    expect(testButton).toBeInTheDocument()
    expect(testButton).toHaveClass('btn', 'btn-sm')
    expect(editButton).toBeInTheDocument()
    expect(editButton).toHaveClass('btn', 'btn-sm', 'btn-primary')

    await waitFor(() => expect(appShellMocks.setTopBarActions).toHaveBeenCalled())
    const topBarNode = appShellMocks.setTopBarActions.mock.calls
      .map((call) => call[0])
      .find(Boolean)

    const topBar = render(<>{topBarNode}</>)
    const topBarActions = within(topBar.container)
    expect(topBarActions.getByRole('button', { name: '返回列表' })).toHaveClass('btn', 'btn-sm', 'btn-ghost')
    expect(topBarActions.getByRole('button', { name: '重新加载' })).toBeInTheDocument()
    expect(topBarActions.queryByRole('button', { name: '测试连接' })).not.toBeInTheDocument()
    expect(topBarActions.queryByRole('button', { name: '编辑' })).not.toBeInTheDocument()
    topBar.unmount()
  })
})
