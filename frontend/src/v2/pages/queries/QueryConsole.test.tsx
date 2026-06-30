// frontend/src/v2/pages/queries/QueryConsole.test.tsx
//
// 查询工作台 prefill 身份上下文回归测试。

import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@monaco-editor/react', () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string
    onChange: (value?: string) => void
  }) => (
    <textarea
      data-testid="query-console-editor"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}))

vi.mock('@v2/components/IdentityName', () => ({
  IdentityName: ({ value, displayName }: { value: string; displayName?: string | null }) => (
    <span title={value}>{displayName ?? value}</span>
  ),
}))

vi.mock('@v2/hooks/queries', () => ({
  useDatasourcesForConsole: vi.fn(),
  useExecuteQuery: vi.fn(),
  useCreateSavedQuery: vi.fn(),
}))

vi.mock('@v2/hooks/datasources', () => ({
  useDatasourceSchema: vi.fn(),
  useDatasourceSchemaTables: vi.fn(),
  useDatasourceSchemaTableColumns: vi.fn(),
}))

import {
  useCreateSavedQuery,
  useDatasourcesForConsole,
  useExecuteQuery,
} from '@v2/hooks/queries'
import {
  useDatasourceSchema,
  useDatasourceSchemaTableColumns,
  useDatasourceSchemaTables,
} from '@v2/hooks/datasources'
import QueryConsole from './QueryConsole'

const mockUseDatasources = useDatasourcesForConsole as ReturnType<typeof vi.fn>
const mockUseExecute = useExecuteQuery as ReturnType<typeof vi.fn>
const mockUseCreate = useCreateSavedQuery as ReturnType<typeof vi.fn>
const mockUseSchema = useDatasourceSchema as ReturnType<typeof vi.fn>
const mockUseTables = useDatasourceSchemaTables as ReturnType<typeof vi.fn>
const mockUseColumns = useDatasourceSchemaTableColumns as ReturnType<typeof vi.fn>

function renderConsole() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/queries',
            state: {
              queryWorkbenchPrefill: {
                sql: 'SELECT * FROM public.orders',
                source_id: 7,
                origin: 'saved_query',
                query_id: 42,
                query_name: '订单明细',
                principal_id: 'feishu:tenant:on_owner',
                principal_display_name: '运营同学',
              },
            },
          },
        ]}
      >
        {children}
      </MemoryRouter>
    </QueryClientProvider>
  )
  return render(<QueryConsole />, { wrapper: Wrapper })
}

describe('QueryConsole principal handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()

    mockUseDatasources.mockReturnValue({
      data: [
        {
          id: 7,
          name: '主数仓',
          source_type: 'maxcompute',
          connection_status: 'connected',
          is_active: true,
        },
      ],
      isLoading: false,
      isError: false,
    })
    mockUseSchema.mockReturnValue({
      data: { datasource_id: 7, databases: ['public'] },
      isLoading: false,
      isError: false,
    })
    mockUseTables.mockReturnValue({
      data: { datasource_id: 7, database: 'public', tables: [] },
      isLoading: false,
      isError: false,
    })
    mockUseColumns.mockReturnValue({
      data: { columns: [] },
      isLoading: false,
      isError: false,
    })
  })

  it('从 prefill 进入后执行与保存都会携带 principal_id', async () => {
    const execute = vi.fn().mockResolvedValue({
      columns: ['value'],
      data: [{ value: 1 }],
      row_count: 1,
      execution_time_ms: 12,
    })
    const create = vi.fn().mockResolvedValue({ id: 9, query_code: 'q_009', query_name: '订单明细' })
    mockUseExecute.mockReturnValue({ mutateAsync: execute, isPending: false })
    mockUseCreate.mockReturnValue({ mutateAsync: create, isPending: false })

    renderConsole()

    expect(screen.getAllByText('MaxCompute').length).toBeGreaterThan(0)
    expect(screen.queryByText('maxcompute')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '执行' }))
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1))
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        source_id: 7,
        sql_query: 'SELECT * FROM public.orders',
        principal_id: 'feishu:tenant:on_owner',
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    fireEvent.change(screen.getByPlaceholderText('如：GMV_周报'), {
      target: { value: '订单明细复用' },
    })
    const saveButtons = screen.getAllByRole('button', { name: '保存' })
    fireEvent.click(saveButtons[saveButtons.length - 1])

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        query_name: '订单明细复用',
        source_id: 7,
        sql_query: 'SELECT * FROM public.orders',
        principal_id: 'feishu:tenant:on_owner',
      }),
    )
  })

  it('数据表列表不常驻填入提示，hover 时展示表描述', async () => {
    mockUseTables.mockReturnValue({
      data: {
        datasource_id: 7,
        database: 'public',
        tables: [
          {
            table_name: 'ads_bi_class_study_stats_wide_df',
            comment: '班级学习统计宽表，用于课堂看板分析。',
            row_count: 1280,
          },
        ],
      },
      isLoading: false,
      isError: false,
    })
    mockUseExecute.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
    mockUseCreate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })

    renderConsole()

    expect(screen.getByText('ads_bi_class_study_stats_wide_df')).toBeInTheDocument()
    expect(screen.queryByText('点击填入查询')).not.toBeInTheDocument()

    fireEvent.mouseEnter(screen.getByTestId('query-resource-table-ads_bi_class_study_stats_wide_df'))

    expect(screen.getByRole('tooltip')).toHaveTextContent('班级学习统计宽表，用于课堂看板分析。')
    expect(screen.getByRole('tooltip')).toHaveTextContent('1,280 行')
  })
})
