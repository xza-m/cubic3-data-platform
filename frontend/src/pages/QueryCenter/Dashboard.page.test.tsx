import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import QueryCenterDashboard from './Dashboard'

const dashboardMocks = vi.hoisted(() => ({
  getDataSources: vi.fn(),
  getDataSourceDatabases: vi.fn(),
  previewTableData: vi.fn(),
  getTemplates: vi.fn(),
  getHistories: vi.fn(),
  executeQuery: vi.fn(),
  getQuery: vi.fn(),
  createQuery: vi.fn(),
  updateQuery: vi.fn(),
  applyTemplate: vi.fn(),
  toast: vi.fn(),
  formatSql: vi.fn((sql: string) => `FORMATTED ${sql}`),
}))

vi.mock('../../api/datasources', () => ({
  getDataSources: dashboardMocks.getDataSources,
  getDataSourceDatabases: dashboardMocks.getDataSourceDatabases,
  previewTableData: dashboardMocks.previewTableData,
}))

vi.mock('../../api/queries', () => ({
  getTemplates: dashboardMocks.getTemplates,
  getHistories: dashboardMocks.getHistories,
  executeQuery: dashboardMocks.executeQuery,
  getQuery: dashboardMocks.getQuery,
  createQuery: dashboardMocks.createQuery,
  updateQuery: dashboardMocks.updateQuery,
  applyTemplate: dashboardMocks.applyTemplate,
}))

vi.mock('sql-formatter', () => ({
  format: dashboardMocks.formatSql,
}))

vi.mock('@monaco-editor/react', () => ({
  default: ({
    value,
    onChange,
  }: {
    value?: string
    onChange?: (value: string) => void
  }) => (
    <textarea
      aria-label="sql-editor"
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}))

vi.mock('@/components/business', async () => {
  const actual = await vi.importActual<typeof import('@/components/business')>('@/components/business')
  return {
    ...actual,
    FormButton: ({
      children,
      onClick,
      disabled,
      loading,
      type = 'button',
      className,
    }: {
      children?: ReactNode
      onClick?: () => void
      disabled?: boolean
      loading?: boolean
      type?: 'button' | 'submit' | 'reset'
      className?: string
    }) => (
      <button type={type} onClick={onClick} disabled={disabled || loading} className={className}>
        {children}
      </button>
    ),
    FormSelect: ({
      value,
      onValueChange,
      options,
      placeholder,
      className,
    }: {
      value?: string
      onValueChange: (value: string) => void
      options: Array<{ value: string; label: string }>
      placeholder?: string
      className?: string
    }) => (
      <select
        aria-label={placeholder || 'select'}
        value={value || ''}
        onChange={(event) => onValueChange(event.target.value)}
        className={className}
      >
        <option value="">{placeholder || '请选择'}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    ),
    FormInput: ({
      value,
      onChange,
      placeholder,
      className,
    }: {
      value?: string
      onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void
      placeholder?: string
      className?: string
    }) => (
      <input value={value || ''} onChange={onChange} placeholder={placeholder} className={className} />
    ),
    DataTable: ({
      data,
      columns,
    }: {
      data: Array<Record<string, unknown>>
      columns: Array<{ accessorKey?: string | number }>
    }) => (
      <div data-testid="dashboard-query-result-table">
        rows:{data.length}; cols:{columns.length}; headers:{columns.map((column) => String(column.accessorKey ?? '')).join('|')}
      </div>
    ),
    SchemaBrowser: ({
      onInsert,
      onDoubleClick,
      onPreview,
    }: {
      onInsert?: (text: string) => void
      onDoubleClick?: (_node: unknown, qualifiedName: string) => void
      onPreview?: (database: string, table: string) => void | Promise<void>
    }) => (
      <div>
        <button type="button" onClick={() => onInsert?.('public.orders')} data-testid="schema-insert">
          插入
        </button>
        <button type="button" onClick={() => onDoubleClick?.(null, 'public.customers')} data-testid="schema-double-click">
          双击
        </button>
        <button type="button" onClick={() => onPreview?.('public', 'orders')} data-testid="schema-preview">
          预览
        </button>
      </div>
    ),
    PageModal: ({
      open,
      title,
      children,
      footer,
    }: {
      open: boolean
      title: string
      children: ReactNode
      footer?: ReactNode
    }) => open ? <div role="dialog" aria-label={title}>{children}{footer}</div> : null,
    TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
    Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
    TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
    TooltipContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    useToast: () => ({ toast: dashboardMocks.toast }),
  }
})

function renderPage(initialEntry = '/queries') {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={client}>
        <QueryCenterDashboard />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('QueryCenter Dashboard page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dashboardMocks.getDataSources.mockResolvedValue({
      data: {
        items: [
          { id: 1, name: 'PostgreSQL - 主库', source_type: 'postgresql' },
          { id: 2, name: 'ClickHouse - 分析库', source_type: 'clickhouse' },
        ],
      },
    })
    dashboardMocks.getDataSourceDatabases.mockImplementation(async (sourceId: number) => ({
      data: sourceId === 2 ? ['analytics'] : ['public'],
    }))
    dashboardMocks.getTemplates.mockResolvedValue({
      items: [
        {
          id: 51,
          template_name: '近 30 天订单营收',
          template_description: '按订单维度统计营收',
          sql_template: 'SELECT * FROM orders',
          parameters: [],
          category: '经营分析',
          tags: [],
          use_count: 10,
          created_at: '2026-03-28T06:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
      total_pages: 1,
    })
    dashboardMocks.getHistories.mockResolvedValue({
      items: [
        {
          id: 3,
          datasource_name: 'PostgreSQL - 主库',
          status: 'success',
          execution_time_ms: 186,
          sql_query: 'SELECT 1',
          executed_at: '2026-03-28T06:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      page_size: 5,
      total_pages: 1,
    })
    dashboardMocks.executeQuery.mockResolvedValue({
      data: {
        columns: ['order_id', 'revenue'],
        data: [[1, 99]],
        row_count: 1,
        execution_time_ms: 233,
      },
    })
    dashboardMocks.previewTableData.mockResolvedValue({
      data: {
        columns: [{ name: 'id', type: 'int' }],
        data: [{ id: 1 }],
        row_count: 1,
        table_name: 'orders',
      },
    })
    dashboardMocks.getQuery.mockImplementation(async (id: number) => ({
      id,
      query_code: `Q-${id}`,
      query_name: '教学查询',
      source_id: 1,
      sql_query: 'SELECT 1',
      description: '历史保存的查询',
      tags: [],
      is_favorite: false,
      execute_count: 3,
      created_by: 'tester',
      created_at: '2026-03-28T06:00:00Z',
      updated_at: '2026-03-28T08:00:00Z',
    }))
    dashboardMocks.createQuery.mockResolvedValue({ id: 9, query_code: 'Q-9', query_name: '营收查询' })
    dashboardMocks.updateQuery.mockResolvedValue({ id: 18, query_name: '教学查询' })
    dashboardMocks.applyTemplate.mockResolvedValue({
      sql_query: 'SELECT * FROM orders LIMIT 100',
      template_name: '近 30 天订单营收',
    })
  })

  it('默认入口渲染查询分析中心三面板，并支持运行与模板加载', async () => {
    const user = userEvent.setup()

    renderPage()

    expect(await screen.findByTestId('query-center-dashboard-layout')).toBeInTheDocument()
    expect(screen.getByTestId('query-center-dashboard-layout')).toHaveClass('flex-col')
    expect(screen.getByTestId('query-center-schema-panel')).toBeInTheDocument()
    expect(screen.getByTestId('query-center-template-panel')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '展开模版库' })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('搜索模版...')).not.toBeInTheDocument()
    expect(screen.getByText('模版库')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '运行' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '展开模版库' }))
    expect(screen.getByRole('button', { name: '折叠模版库' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('搜索模版...')).toBeInTheDocument()
    expect(screen.getByText('最近执行')).toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: /近 30 天订单营收/ }))
    await waitFor(() => {
      expect(dashboardMocks.applyTemplate).toHaveBeenCalledWith(51, {})
    })

    await user.click(screen.getByRole('button', { name: '运行' }))
    expect(await screen.findByTestId('dashboard-query-result-table')).toHaveTextContent('rows:1; cols:2; headers:order_id|revenue')
  })

  it('支持结构树插入和表预览', async () => {
    const user = userEvent.setup()

    renderPage()

    await screen.findByTestId('query-center-dashboard-layout')
    await user.click(screen.getByTestId('schema-insert'))
    expect((screen.getByLabelText('sql-editor') as HTMLTextAreaElement).value).toContain('public.orders')

    await user.click(screen.getByTestId('schema-preview'))
    expect(await screen.findByTestId('dashboard-query-result-table')).toHaveTextContent('rows:1; cols:1; headers:id')
  })

  it('支持保存查询', async () => {
    const user = userEvent.setup()

    renderPage()

    await screen.findByTestId('query-center-dashboard-layout')
    await user.click(screen.getAllByRole('button', { name: '保存' })[0])
    const dialog = await screen.findByRole('dialog', { name: '保存查询' })
    expect(dialog).toBeInTheDocument()

    await user.type(screen.getByLabelText('查询名称'), '本月订单营收')
    await user.type(screen.getByLabelText('描述'), '用于月度营收联调')
    await user.click(screen.getAllByRole('button', { name: '保存' })[1])

    await waitFor(() => {
      expect(dashboardMocks.createQuery).toHaveBeenCalledWith(expect.objectContaining({
        query_name: '本月订单营收',
        description: '用于月度营收联调',
        source_id: 1,
      }))
    })
    expect(dashboardMocks.updateQuery).not.toHaveBeenCalled()
  })

  it('兼容旧入口重定向传入的查询参数', async () => {
    const user = userEvent.setup()

    renderPage('/queries?legacy=history&sql=SELECT%202&source_id=1&id=18&name=%E6%95%99%E5%AD%A6%E6%9F%A5%E8%AF%A2')

    await screen.findByTestId('query-center-dashboard-layout')

    expect((screen.getByLabelText('sql-editor') as HTMLTextAreaElement).value).toContain('SELECT 2')
    await waitFor(() => {
      expect(screen.getAllByText('PostgreSQL - 主库').length).toBeGreaterThan(0)
    })

    await user.click(screen.getAllByRole('button', { name: '保存' })[0])
    expect(await screen.findByDisplayValue('教学查询')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: '保存' })[1])

    await waitFor(() => {
      expect(dashboardMocks.updateQuery).toHaveBeenCalledWith(18, expect.objectContaining({
        query_name: '教学查询',
        sql_query: 'SELECT 2',
        source_id: 1,
      }))
    })
  })

  it('兼容 templates 旧入口时展开模板侧栏并展示上下文提示', async () => {
    renderPage('/queries?legacy=templates')

    await screen.findByTestId('query-center-dashboard-layout')

    expect(await screen.findByTestId('query-center-legacy-context')).toHaveTextContent('兼容入口：查询模板')
    expect(screen.getByPlaceholderText('搜索模版...')).toBeInTheDocument()
  })

  it('兼容 history 旧入口时展开最近执行区并展示上下文提示', async () => {
    renderPage('/queries?legacy=history')

    await screen.findByTestId('query-center-dashboard-layout')

    expect(await screen.findByTestId('query-center-legacy-context')).toHaveTextContent('兼容入口：查询历史')
    expect(screen.getByText('最近执行')).toBeInTheDocument()
  })

  it('兼容 visual 旧入口时切换到可视化视图并展示上下文提示', async () => {
    renderPage('/queries?legacy=visual')

    await screen.findByTestId('query-center-dashboard-layout')

    expect(await screen.findByTestId('query-center-legacy-context')).toHaveTextContent('兼容入口：可视化查询')
    expect(screen.getByText('可视化视图待接入')).toBeInTheDocument()
  })

  it('支持切换数据源并刷新数据库上下文', async () => {
    const user = userEvent.setup()

    renderPage()

    await screen.findByTestId('query-center-dashboard-layout')
    await waitFor(() => {
      expect(screen.getByLabelText('选择数据源')).toHaveValue('1')
    })

    await user.selectOptions(screen.getByLabelText('选择数据源'), '2')

    await waitFor(() => {
      expect(screen.getByLabelText('选择数据源')).toHaveValue('2')
    })
    await waitFor(() => {
      expect(dashboardMocks.getDataSourceDatabases).toHaveBeenCalledWith(2)
    })
    expect(screen.queryByLabelText('选择数据库')).not.toBeInTheDocument()
  })
})
