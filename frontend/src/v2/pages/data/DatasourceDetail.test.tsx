import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import DatasourceDetail from './DatasourceDetail'

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
    data: { columns: [], row_count_estimate: null },
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
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

vi.mock('@v2/components/IdentityName', () => ({
  IdentityName: ({ value, displayName }: { value: string; displayName?: string | null }) => (
    <span>{displayName || value}</span>
  ),
}))

describe('DatasourceDetail', () => {
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
})
