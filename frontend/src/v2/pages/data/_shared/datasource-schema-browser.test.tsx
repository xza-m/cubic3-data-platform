import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DatasourceSchemaBrowser } from './datasource-schema-browser'

const tables = Array.from({ length: 25 }, (_, index) => ({
  table_name: `public.table_${String(index + 1).padStart(2, '0')}`,
  comment: '',
  row_count: null,
}))

vi.mock('@v2/hooks/datasources', () => ({
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

describe('DatasourceSchemaBrowser', () => {
  it('表列表默认每页展示 20 张，窄屏分页不再一次塞 50 张表', async () => {
    render(<DatasourceSchemaBrowser datasourceId={900001} />)

    expect(await screen.findByText('1-20 / 25 张表')).toBeInTheDocument()
    expect(screen.getByText('public.table_20')).toBeInTheDocument()
    expect(screen.queryByText('public.table_21')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '下一页表' }))

    expect(screen.getByText('21-25 / 25 张表')).toBeInTheDocument()
    expect(screen.getByText('public.table_21')).toBeInTheDocument()
  })
})
