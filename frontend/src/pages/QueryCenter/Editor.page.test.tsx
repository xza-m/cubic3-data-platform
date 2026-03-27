import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import QueryEditor from './Editor'

const editorPageMocks = vi.hoisted(() => ({
  getDataSources: vi.fn(),
  previewTableData: vi.fn(),
  executeQuery: vi.fn(),
  createQuery: vi.fn(),
  getQuery: vi.fn(),
  toast: vi.fn(),
  navigate: vi.fn(),
  formatSql: vi.fn((sql: string) => `FORMATTED: ${sql}`),
}))

vi.mock('../../api/datasources', () => ({
  getDataSources: editorPageMocks.getDataSources,
  previewTableData: editorPageMocks.previewTableData,
}))

vi.mock('../../api/queries', () => ({
  executeQuery: editorPageMocks.executeQuery,
  createQuery: editorPageMocks.createQuery,
  getQuery: editorPageMocks.getQuery,
}))

vi.mock('sql-formatter', () => ({
  format: editorPageMocks.formatSql,
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

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => editorPageMocks.navigate,
  }
})

vi.mock('@/components/business', () => ({
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
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={className}
      data-testid="form-button"
    >
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
  useToast: () => ({ toast: editorPageMocks.toast }),
  PageModal: ({
    open,
    title,
    description,
    footer,
    children,
  }: {
    open: boolean
    title: string
    description?: string
    footer?: ReactNode
    children: ReactNode
  }) => (
    open ? <div role="dialog" aria-label={title}>{description}{children}{footer}</div> : null
  ),
  DataTable: ({
    data,
    columns,
  }: {
    data: Array<Record<string, unknown>>
    columns: Array<{ accessorKey?: string | number }>
  }) => (
    <div data-testid="query-result-table">
      rows:{data.length}; cols:{columns.length}; headers:{columns.map((column) => String(column.accessorKey ?? '')).join('|')}
    </div>
  ),
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SchemaBrowser: ({
    onInsert,
    onPreview,
    onDoubleClick,
  }: {
    onInsert?: (text: string) => void
    onPreview?: (database: string, table: string) => void | Promise<void>
    onDoubleClick?: (_node: unknown, qualifiedName: string) => void
  }) => (
    <div>
      <button type="button" onClick={() => onInsert?.('analytics.orders')} data-testid="schema-insert">
        插入表名
      </button>
      <button type="button" onClick={() => onDoubleClick?.(null, 'analytics.fact_orders')} data-testid="schema-doubleclick">
        双击表名
      </button>
      <button type="button" onClick={() => onPreview?.('analytics', 'orders')} data-testid="schema-preview">
        预览表
      </button>
    </div>
  ),
  SaveAsDatasetDialog: ({
    open,
    sql,
    sourceId,
  }: {
    open: boolean
    sql: string
    sourceId: number
  }) => (
    open ? <div data-testid="save-dataset-dialog">dataset:{sourceId}:{sql}</div> : null
  ),
}))

function renderPage(initialEntries: Array<string | { pathname: string; search?: string; state?: unknown }>) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/queries/editor" element={<QueryEditor />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('QueryEditor page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    editorPageMocks.getDataSources.mockResolvedValue({
      data: {
        items: [
          { id: 1, name: '教学 PostgreSQL', source_type: 'postgresql' },
        ],
      },
    })
    editorPageMocks.executeQuery.mockResolvedValue({
      data: {
        columns: ['id', 'user_name'],
        data: [[1, 'Alice']],
        row_count: 1,
        execution_time_ms: 233,
      },
    })
    editorPageMocks.previewTableData.mockResolvedValue({
      data: {
        columns: [{ name: 'id', type: 'int' }],
        data: [{ id: 1 }],
        row_count: 1,
        table_name: 'orders',
      },
    })
    editorPageMocks.createQuery.mockResolvedValue({ id: 9, query_code: 'Q-9', query_name: '留存查询' })
    editorPageMocks.getQuery.mockResolvedValue({
      id: 9,
      query_name: '已保存查询',
      sql_query: 'select * from fact_orders',
      source_id: 1,
    })
  })

  it('支持从模板加载、格式化 SQL、执行查询、导出结果并打开虚拟数据集弹窗', async () => {
    const user = userEvent.setup()
    const createObjectURL = vi.fn(() => 'blob:query-result')
    const revokeObjectURL = vi.fn()
    const clickSpy = vi.fn()
    const createElementSpy = vi.spyOn(document, 'createElement')
    createElementSpy.mockImplementation((tagName: string) => {
      if (tagName === 'a') {
        return { click: clickSpy, href: '', download: '' } as unknown as HTMLAnchorElement
      }
      return document.createElementNS('http://www.w3.org/1999/xhtml', tagName)
    })
    vi.stubGlobal('URL', {
      createObjectURL,
      revokeObjectURL,
    })

    renderPage([{ pathname: '/queries/editor', state: { sql: 'select * from answers', name: '答题模板' } }])

    expect(await screen.findByTestId('query-editor-layout')).toBeInTheDocument()
    expect(editorPageMocks.toast).toHaveBeenCalledWith({ title: '模板已加载' })
    expect(editorPageMocks.navigate).toHaveBeenCalledWith('/queries/editor', { replace: true, state: null })

    const editor = screen.getByLabelText('sql-editor')
    expect(editor).toHaveValue('select * from answers')

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: '选择数据源' }).querySelectorAll('option').length).toBeGreaterThan(1)
    })
    await user.selectOptions(screen.getByRole('combobox', { name: '选择数据源' }), '1')

    await user.click(screen.getByTestId('schema-insert'))
    expect(screen.getByLabelText('sql-editor')).toHaveValue('select * from answers\nanalytics.orders')

    const toolbarButtons = screen.getAllByTestId('form-button')
    await user.click(toolbarButtons[1])
    expect(screen.getByLabelText('sql-editor')).toHaveValue('FORMATTED: select * from answers\nanalytics.orders')
    expect(editorPageMocks.toast).toHaveBeenCalledWith({ title: 'SQL 格式化成功' })

    await user.click(screen.getByRole('button', { name: '执行查询' }))
    await waitFor(() => {
      expect(editorPageMocks.executeQuery).toHaveBeenCalledWith({
        source_id: 1,
        sql_query: 'FORMATTED: select * from answers\nanalytics.orders',
      })
    })
    expect(await screen.findByTestId('query-result-table')).toHaveTextContent('rows:1; cols:2')
    expect(editorPageMocks.toast).toHaveBeenCalledWith({
      title: '查询成功',
      description: '返回 1 行数据（耗时 233ms）',
    })

    await user.click(toolbarButtons[3])
    expect(createObjectURL).toHaveBeenCalled()
    expect(clickSpy).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:query-result')

    await user.click(toolbarButtons[4])
    expect(await screen.findByTestId('save-dataset-dialog')).toHaveTextContent('dataset:1:FORMATTED: select * from answers analytics.orders')

    await user.click(screen.getByTestId('schema-preview'))
    await waitFor(() => {
      expect(editorPageMocks.previewTableData).toHaveBeenCalledWith(1, 'analytics', 'orders')
    expect(editorPageMocks.toast).toHaveBeenCalledWith({ title: '预览: orders', description: '共 1 行' })
    })
    expect(screen.getByTestId('query-result-table')).toHaveTextContent('rows:1; cols:1; headers:id')

    await user.click(toolbarButtons[3])
    expect(createObjectURL).toHaveBeenCalledTimes(2)
    expect(clickSpy).toHaveBeenCalledTimes(2)
    expect(revokeObjectURL).toHaveBeenLastCalledWith('blob:query-result')

    vi.unstubAllGlobals()
    createElementSpy.mockRestore()
  })

  it('支持根据 queryId 加载已保存查询并保存到我的查询', async () => {
    const user = userEvent.setup()

    renderPage(['/queries/editor?id=9'])

    await waitFor(() => {
      expect(editorPageMocks.getQuery).toHaveBeenCalledWith(9)
      expect(screen.getByLabelText('sql-editor')).toHaveValue('select * from fact_orders')
    })

    expect(screen.getByRole('combobox', { name: '选择数据源' })).toHaveValue('1')

    const toolbarButtons = screen.getAllByTestId('form-button')
    await user.click(toolbarButtons[2])

    const dialog = screen.getByRole('dialog', { name: '保存查询' })
    const nameInput = within(dialog).getByPlaceholderText('例如：用户活跃度统计')
    const descriptionInput = within(dialog).getByPlaceholderText('简要描述此查询的用途')

    await user.clear(nameInput)
    await user.type(nameInput, '留存分析')
    await user.type(descriptionInput, '近 7 日留存 SQL')
    await user.click(within(dialog).getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(editorPageMocks.createQuery).toHaveBeenCalledWith({
        query_name: '留存分析',
        description: '近 7 日留存 SQL',
        sql_query: 'select * from fact_orders',
        source_id: 1,
      })
      expect(editorPageMocks.toast).toHaveBeenCalledWith({ title: '查询已保存' })
    })
  })

  it('支持从 URL 参数恢复 SQL 与数据源，承接历史回放入口', async () => {
    renderPage([`/queries/editor?sql=${encodeURIComponent('SELECT * FROM history_orders')}&source_id=1`])

    expect(await screen.findByTestId('query-editor-layout')).toBeInTheDocument()
    expect(screen.getByLabelText('sql-editor')).toHaveValue('SELECT * FROM history_orders')
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: '选择数据源' })).toHaveValue('1')
    })
    expect(editorPageMocks.getQuery).not.toHaveBeenCalled()
  })

  it('在缺少前置条件、格式化失败和执行失败时给出提示', async () => {
    const user = userEvent.setup()

    renderPage([{ pathname: '/queries/editor', state: { sql: 'select 1', name: '错误分支模板' } }])

    expect(await screen.findByTestId('query-editor-layout')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '执行查询' }))
    expect(editorPageMocks.toast).toHaveBeenCalledWith({
      title: '请先选择数据源',
      variant: 'warning',
    })

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: '选择数据源' }).querySelectorAll('option').length).toBeGreaterThan(1)
    })
    await user.selectOptions(screen.getByRole('combobox', { name: '选择数据源' }), '1')
    editorPageMocks.formatSql.mockImplementationOnce(() => {
      throw new Error('invalid sql')
    })
    const toolbarButtons = screen.getAllByTestId('form-button')
    await user.click(toolbarButtons[1])
    expect(editorPageMocks.toast).toHaveBeenCalledWith({
      title: '格式化失败: invalid sql',
      variant: 'destructive',
    })

    editorPageMocks.executeQuery.mockRejectedValueOnce({ message: 'db timeout' })
    await user.click(screen.getByRole('button', { name: '执行查询' }))
    await waitFor(() => {
      expect(editorPageMocks.executeQuery).toHaveBeenCalled()
      expect(editorPageMocks.toast).toHaveBeenCalledWith({
        title: '查询失败',
        description: 'db timeout',
        variant: 'destructive',
      })
    })
  })

  it('未执行 SQL、执行结果为空或预览后，不能打开虚拟数据集对话框并给出明确提示', async () => {
    const user = userEvent.setup()
    editorPageMocks.executeQuery.mockResolvedValueOnce({
      data: {
        columns: ['id'],
        data: [],
        row_count: 0,
        execution_time_ms: 88,
      },
    })

    renderPage([{ pathname: '/queries/editor', state: { sql: 'select * from answers', name: '虚拟数据集守卫' } }])

    expect(await screen.findByTestId('query-editor-layout')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: '选择数据源' }).querySelectorAll('option').length).toBeGreaterThan(1)
    })
    await user.selectOptions(screen.getByRole('combobox', { name: '选择数据源' }), '1')

    const toolbarButtons = screen.getAllByTestId('form-button')
    await user.click(toolbarButtons[4])
    expect(editorPageMocks.toast).toHaveBeenLastCalledWith({
      title: '请先执行查询，再保存为虚拟数据集',
      variant: 'warning',
    })
    expect(screen.queryByTestId('save-dataset-dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '执行查询' }))
    await waitFor(() => {
      expect(editorPageMocks.executeQuery).toHaveBeenCalledWith({
        source_id: 1,
        sql_query: 'select * from answers',
      })
    })

    await user.click(toolbarButtons[4])
    expect(editorPageMocks.toast).toHaveBeenLastCalledWith({
      title: '查询结果为空，无法保存为虚拟数据集',
      variant: 'warning',
    })
    expect(screen.queryByTestId('save-dataset-dialog')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('schema-preview'))
    await waitFor(() => {
      expect(editorPageMocks.previewTableData).toHaveBeenCalledWith(1, 'analytics', 'orders')
      expect(editorPageMocks.toast).toHaveBeenCalledWith({ title: '预览: orders', description: '共 1 行' })
    })

    await user.click(toolbarButtons[4])
    expect(editorPageMocks.toast).toHaveBeenLastCalledWith({
      title: '请先执行查询，再保存为虚拟数据集',
      variant: 'warning',
    })
    expect(screen.queryByTestId('save-dataset-dialog')).not.toBeInTheDocument()
  })

  it('执行后修改 SQL 或切换数据源时，必须重新执行后才能保存为虚拟数据集', async () => {
    const user = userEvent.setup()
    editorPageMocks.getDataSources.mockResolvedValueOnce({
      data: {
        items: [
          { id: 1, name: '教学 PostgreSQL', source_type: 'postgresql' },
          { id: 2, name: '教学 ClickHouse', source_type: 'clickhouse' },
        ],
      },
    })

    renderPage([{ pathname: '/queries/editor', state: { sql: 'select * from retention_base', name: '执行上下文守卫' } }])

    expect(await screen.findByTestId('query-editor-layout')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: '选择数据源' }).querySelectorAll('option').length).toBeGreaterThan(2)
    })

    const sourceSelect = screen.getByRole('combobox', { name: '选择数据源' })
    const editor = screen.getByLabelText('sql-editor')
    const toolbarButtons = screen.getAllByTestId('form-button')

    await user.selectOptions(sourceSelect, '1')
    await user.click(screen.getByRole('button', { name: '执行查询' }))
    await waitFor(() => {
      expect(editorPageMocks.executeQuery).toHaveBeenLastCalledWith({
        source_id: 1,
        sql_query: 'select * from retention_base',
      })
    })

    await user.clear(editor)
    await user.type(editor, 'select * from retention_changed')
    await user.click(toolbarButtons[4])
    expect(editorPageMocks.toast).toHaveBeenLastCalledWith({
      title: '请先执行查询，再保存为虚拟数据集',
      variant: 'warning',
    })
    expect(screen.queryByTestId('save-dataset-dialog')).not.toBeInTheDocument()

    await user.selectOptions(sourceSelect, '2')
    await user.click(toolbarButtons[4])
    expect(editorPageMocks.toast).toHaveBeenLastCalledWith({
      title: '请先执行查询，再保存为虚拟数据集',
      variant: 'warning',
    })
    expect(screen.queryByTestId('save-dataset-dialog')).not.toBeInTheDocument()
  })

  it('执行进行中继续编辑时，不会被返回结果覆盖当前草稿', async () => {
    const user = userEvent.setup()
    let resolveQuery: ((value: unknown) => void) | undefined
    editorPageMocks.executeQuery.mockImplementationOnce(() => (
      new Promise((resolve) => {
        resolveQuery = resolve
      })
    ))

    renderPage([{ pathname: '/queries/editor', state: { sql: 'select * from slow_orders', name: '异步执行守卫' } }])

    expect(await screen.findByTestId('query-editor-layout')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: '选择数据源' }).querySelectorAll('option').length).toBeGreaterThan(1)
    })

    const sourceSelect = screen.getByRole('combobox', { name: '选择数据源' })
    const editor = screen.getByLabelText('sql-editor')
    const toolbarButtons = screen.getAllByTestId('form-button')

    await user.selectOptions(sourceSelect, '1')
    await user.click(screen.getByRole('button', { name: '执行查询' }))
    await waitFor(() => {
      expect(editorPageMocks.executeQuery).toHaveBeenCalledWith({
        source_id: 1,
        sql_query: 'select * from slow_orders',
      })
    })

    await user.clear(editor)
    await user.type(editor, 'select * from edited_orders')

    resolveQuery?.({
      data: {
        columns: ['id'],
        data: [[1]],
        row_count: 1,
        execution_time_ms: 55,
      },
    })

    expect(await screen.findByTestId('query-result-table')).toHaveTextContent('rows:1; cols:1; headers:id')
    expect(screen.getByLabelText('sql-editor')).toHaveValue('select * from edited_orders')

    await user.click(toolbarButtons[4])
    expect(editorPageMocks.toast).toHaveBeenLastCalledWith({
      title: '请先执行查询，再保存为虚拟数据集',
      variant: 'warning',
    })
    expect(screen.queryByTestId('save-dataset-dialog')).not.toBeInTheDocument()
  })

  it('在清空 SQL、双击结构树插入表名和预览失败时给出对应反馈', async () => {
    const user = userEvent.setup()
    editorPageMocks.previewTableData.mockRejectedValueOnce(new Error('schema offline'))

    renderPage([{ pathname: '/queries/editor', state: { sql: 'select * from answers', name: '结构树模板' } }])

    expect(await screen.findByTestId('query-editor-layout')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: '选择数据源' }).querySelectorAll('option').length).toBeGreaterThan(1)
    })
    await user.selectOptions(screen.getByRole('combobox', { name: '选择数据源' }), '1')

    const editor = screen.getByLabelText('sql-editor')
    await user.clear(editor)
    await user.type(editor, '   ')
    await user.click(screen.getByRole('button', { name: '执行查询' }))
    expect(editorPageMocks.toast).toHaveBeenCalledWith({
      title: '请输入 SQL 查询',
      variant: 'warning',
    })

    await user.clear(editor)
    await user.type(editor, 'select 1')
    await user.click(screen.getByTestId('schema-doubleclick'))
    expect(screen.getByLabelText('sql-editor')).toHaveValue('select 1\nanalytics.fact_orders')
    expect(editorPageMocks.toast).toHaveBeenCalledWith({ title: '表名已插入' })

    await user.click(screen.getByTestId('schema-preview'))
    await waitFor(() => {
      expect(editorPageMocks.previewTableData).toHaveBeenCalledWith(1, 'analytics', 'orders')
      expect(editorPageMocks.toast).toHaveBeenCalledWith({
        title: '预览失败',
        description: 'schema offline',
        variant: 'destructive',
      })
    })
  })

  it('在已保存查询加载失败或空名称保存时给出提示', async () => {
    const user = userEvent.setup()
    editorPageMocks.getQuery.mockRejectedValueOnce(new Error('missing query'))

    renderPage(['/queries/editor?id=9'])

    await waitFor(() => {
      expect(editorPageMocks.getQuery).toHaveBeenCalledWith(9)
      expect(editorPageMocks.toast).toHaveBeenCalledWith({
        title: '加载查询失败',
        variant: 'destructive',
      })
    })

    const toolbarButtons = screen.getAllByTestId('form-button')
    await user.click(toolbarButtons[2])

    const dialog = screen.getByRole('dialog', { name: '保存查询' })
    const nameInput = within(dialog).getByPlaceholderText('例如：用户活跃度统计')
    await user.clear(nameInput)
    await user.click(within(dialog).getByRole('button', { name: '保存' }))

    expect(editorPageMocks.createQuery).not.toHaveBeenCalled()
    expect(editorPageMocks.toast).toHaveBeenCalledWith({
      title: '请输入查询名称',
      variant: 'warning',
    })
  })
})
