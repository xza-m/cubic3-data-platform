import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import VisualBuilder from './VisualBuilder'

const navigateMock = vi.fn()

const visualBuilderMocks = vi.hoisted(() => ({
  getDataSources: vi.fn(),
  executeQuery: vi.fn(),
  generateSQLFromConfig: vi.fn((config: { fields: string[]; table: string; limit: number }) =>
    config.table ? `SELECT ${config.fields.length > 0 ? config.fields.join(', ') : '*'} FROM ${config.table} LIMIT ${config.limit}` : ''
  ),
  validateVisualQueryConfig: vi.fn(() => ({ valid: true, errors: [] as string[] })),
  toast: vi.fn(),
}))

vi.mock('../../api/datasources', () => ({
  getDataSources: visualBuilderMocks.getDataSources,
}))

vi.mock('../../api/queries', () => ({
  executeQuery: visualBuilderMocks.executeQuery,
}))

vi.mock('../../utils/visualQueryGenerator', () => ({
  generateSQLFromConfig: visualBuilderMocks.generateSQLFromConfig,
  validateVisualQueryConfig: visualBuilderMocks.validateVisualQueryConfig,
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

vi.mock('../../components/FilterBuilder/FilterBuilder', () => ({
  default: () => <div data-testid="filter-builder">筛选构建器</div>,
}))

vi.mock('@/components/business', async () => {
  const actual = await vi.importActual<typeof import('@/components/business')>('@/components/business')
  return {
    ...actual,
    FormButton: ({
      children,
      onClick,
      type = 'button',
      ...props
    }: {
      children: ReactNode
      onClick?: () => void
      type?: 'button' | 'submit' | 'reset'
    }) => (
      <button type={type} onClick={onClick} {...props}>
        {children}
      </button>
    ),
    FormSelect: ({
      value,
      onValueChange,
      options,
      placeholder,
      disabled,
    }: {
      value: string
      onValueChange: (value: string) => void
      options: Array<{ value: string; label: string }>
      placeholder?: string
      disabled?: boolean
    }) => (
      <select
        aria-label={placeholder || 'select'}
        value={value}
        disabled={disabled}
        onChange={(event) => onValueChange(event.target.value)}
      >
        <option value="">请选择</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    ),
    DataTable: ({
      data,
      columns,
    }: {
      data: Array<Record<string, unknown>>
      columns: Array<{ accessorKey?: string | number }>
    }) => (
      <div data-testid="data-table">
        rows:{data.length}; cols:{columns.length}
      </div>
    ),
    useToast: () => ({ toast: visualBuilderMocks.toast }),
  }
})

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <VisualBuilder />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('VisualBuilder page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    navigateMock.mockReset()
    visualBuilderMocks.getDataSources.mockResolvedValue({
      data: {
        items: [{ id: 1, name: '教学 PostgreSQL', source_type: 'postgresql' }],
      },
    })
    visualBuilderMocks.executeQuery.mockResolvedValue({
      data: {
        columns: ['id', 'user_name'],
        data: [[1, 'Alice']],
        row_count: 1,
        execution_time_ms: 2000,
      },
    })
    visualBuilderMocks.validateVisualQueryConfig.mockReturnValue({ valid: true, errors: [] })
  })

  it('支持配置查询、添加聚合排序、执行并跳转到 SQL 编辑器', async () => {
    const user = userEvent.setup()

    renderPage()

    expect(await screen.findByRole('heading', { name: '可视化查询构建器' })).toBeInTheDocument()
    expect(screen.getByTestId('visual-builder-main')).toBeInTheDocument()
    expect(screen.getByText('选择数据源和表')).toBeInTheDocument()
    expect(screen.getByTestId('filter-builder')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: '选择数据源' }).querySelectorAll('option').length).toBeGreaterThan(1)
    })

    await user.selectOptions(screen.getByRole('combobox', { name: '选择数据源' }), '1')
    await user.selectOptions(screen.getByRole('combobox', { name: '选择数据表' }), 'users')
    await user.click(screen.getByLabelText('id'))
    await user.click(screen.getByLabelText('user_name'))

    await user.click(screen.getByText('分组与聚合（可选）'))
    await user.click(screen.getByRole('button', { name: /添加聚合函数/ }))
    expect(screen.getByDisplayValue('agg_1')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /添加排序/ }))
    expect(screen.getAllByRole('combobox', { name: '选择字段' }).length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: /切换到 SQL 编辑器/ }))
    expect(navigateMock).toHaveBeenCalledWith('/queries/editor', {
      state: {
        sql: 'SELECT id, user_name FROM users LIMIT 100',
        sourceId: 1,
      },
    })

    await user.click(screen.getByRole('button', { name: /运行查询/ }))
    await waitFor(() => {
      expect(visualBuilderMocks.executeQuery.mock.calls[0][0]).toEqual({
        source_id: 1,
        sql_query: 'SELECT id, user_name FROM users LIMIT 100',
        limit: 100,
      })
      expect(visualBuilderMocks.toast).toHaveBeenCalledWith({ title: '查询成功: 1 行' })
    })

    expect(await screen.findByText('查询结果')).toBeInTheDocument()
    expect(screen.getByTestId('data-table')).toHaveTextContent('rows:1; cols:2')
    expect(screen.getByText('1 行 · 耗时 2.00s')).toBeInTheDocument()
  })

  it('在校验失败、缺少数据源和执行失败时给出提示', async () => {
    const user = userEvent.setup()

    visualBuilderMocks.validateVisualQueryConfig.mockReturnValueOnce({
      valid: false,
      errors: ['请选择数据表'],
    })

    renderPage()

    await user.click(screen.getByRole('button', { name: /运行查询/ }))
    expect(visualBuilderMocks.toast).toHaveBeenCalledWith({
      title: '配置错误',
      description: '请选择数据表',
      variant: 'destructive',
    })

    visualBuilderMocks.validateVisualQueryConfig.mockReturnValueOnce({ valid: true, errors: [] })
    await user.click(screen.getByRole('button', { name: /运行查询/ }))
    expect(visualBuilderMocks.toast).toHaveBeenCalledWith({
      title: '请先选择数据源',
      variant: 'warning',
    })

    await user.selectOptions(screen.getByRole('combobox', { name: '选择数据源' }), '1')
    await user.selectOptions(screen.getByRole('combobox', { name: '选择数据表' }), 'users')
    await user.click(screen.getByLabelText('id'))

    visualBuilderMocks.executeQuery.mockRejectedValueOnce(new Error('db timeout'))
    await user.click(screen.getByRole('button', { name: /运行查询/ }))
    await waitFor(() => {
      expect(visualBuilderMocks.toast).toHaveBeenCalledWith({
        title: '查询执行失败',
        description: 'db timeout',
        variant: 'destructive',
      })
    })
  })

  it('支持配置分组、聚合和排序明细，并允许删除条件', async () => {
    const user = userEvent.setup()

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: '选择数据源' }).querySelectorAll('option').length).toBeGreaterThan(1)
    })

    await user.selectOptions(screen.getByRole('combobox', { name: '选择数据源' }), '1')
    await user.selectOptions(screen.getByRole('combobox', { name: '选择数据表' }), 'users')
    await user.click(screen.getByLabelText('id'))
    await user.click(screen.getByLabelText('user_name'))

    await user.click(screen.getByText('分组与聚合（可选）'))
    await user.selectOptions(screen.getByRole('combobox', { name: '选择分组字段' }), 'user_name')
    await user.click(screen.getByRole('button', { name: /添加聚合函数/ }))

    const aggregationRow = screen.getByDisplayValue('agg_1').closest('.flex.items-center.gap-2.mb-2')
    expect(aggregationRow).not.toBeNull()
    const aggregationSelects = within(aggregationRow as HTMLElement).getAllByRole('combobox')
    await user.selectOptions(aggregationSelects[0], 'AVG')
    await user.selectOptions(aggregationSelects[1], 'id')
    await user.clear(screen.getByDisplayValue('agg_1'))
    await user.type(screen.getByRole('textbox'), 'avg_id')

    await user.click(screen.getByRole('button', { name: /添加排序/ }))
    const orderRows = screen
      .getAllByRole('combobox', { name: '选择字段' })
      .map((element) => element.closest('.flex.items-center.gap-2.mb-2'))
      .filter((row): row is HTMLElement => Boolean(row))
    const orderRow = orderRows[orderRows.length - 1]
    const orderSelects = within(orderRow).getAllByRole('combobox')
    await user.selectOptions(orderSelects[0], 'user_name')
    await user.selectOptions(orderSelects[1], 'ASC')

    const limitInput = screen.getByLabelText('限制行数')
    fireEvent.change(limitInput, { target: { value: '' } })
    expect(limitInput).toHaveValue(100)

    await user.click(within(aggregationRow as HTMLElement).getByRole('button'))
    await user.click(within(orderRow).getByRole('button'))

    await user.click(screen.getByLabelText('id'))
    expect(screen.getByRole('checkbox', { name: 'id' })).toHaveAttribute('aria-checked', 'false')

    expect(screen.queryByDisplayValue('avg_id')).not.toBeInTheDocument()
    expect(screen.queryAllByRole('combobox', { name: '选择字段' }).length).toBe(0)
  })
})
