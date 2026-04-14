import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
      emptyText,
    }: {
      data: Array<Record<string, unknown>>
      columns: Array<{ accessorKey?: string | number; title?: string }>
      emptyText?: string
    }) => (
      <div data-testid="dashboard-query-result-table">
        rows:{data.length}; cols:{columns.length}; headers:{columns.map((column) => String(column.title ?? column.accessorKey ?? '')).join('|')}; empty:{emptyText ?? ''}
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
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    })
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

  it('紧凑视口和本地存储会影响初始布局并持久化编辑器高度', async () => {
    const originalMatchMedia = window.matchMedia
    const originalLocalStorage = window.localStorage
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: true,
        addEventListener,
        removeEventListener,
      })),
    })
    const getItem = vi.fn(() => '120')
    const setItem = vi.fn()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem,
        setItem,
      },
    })

    const view = renderPage()

    await screen.findByTestId('query-center-dashboard-layout')
    expect(screen.getByRole('button', { name: '展开结构树' })).toBeInTheDocument()
    expect(screen.getByTestId('query-editor-pane').style.height).toBe('78%')
    expect(setItem).toHaveBeenCalledWith('query-center.editor-height-ratio', '78')

    view.unmount()
    expect(addEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    expect(removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    })
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: originalLocalStorage,
    })
  })

  it('默认入口渲染查询分析中心三面板，并支持运行与模板加载', async () => {
    const user = userEvent.setup()

    renderPage()

    expect(await screen.findByTestId('query-center-dashboard-layout')).toBeInTheDocument()
    expect(screen.queryByText('推荐路径：先选择数据源，再编辑或替换示例 SQL，最后运行并查看结果。')).not.toBeInTheDocument()
    expect(screen.getByText('示例 SQL，可直接修改')).toBeInTheDocument()
    expect(screen.getByTestId('query-editor-resize-handle')).toBeInTheDocument()
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
    expect(await screen.findByTestId('dashboard-query-result-table')).toHaveTextContent('rows:1; cols:2; headers:123 order_id|123 revenue')
  })

  it('支持拖拽调整编辑器与结果区高度', async () => {
    renderPage()

    await screen.findByTestId('query-center-dashboard-layout')
    const editorPane = screen.getByTestId('query-editor-pane')
    const splitter = screen.getByTestId('query-editor-resize-handle')

    expect(editorPane.style.height).toBe('52%')

    Object.defineProperty(splitter.parentElement, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 0, height: 1000 }),
    })

    fireEvent.mouseDown(splitter, { clientY: 620 })
    fireEvent.mouseMove(window, { clientY: 620 })
    fireEvent.mouseUp(window)

    expect(Number.parseFloat(editorPane.style.height)).toBeGreaterThan(60)
  })

  it('查询成功但无数据时仍保留原始字段列头', async () => {
    const user = userEvent.setup()
    dashboardMocks.executeQuery.mockResolvedValueOnce({
      data: {
        columns: [
          { name: 'subject_id', type: 'bigint' },
          { name: 'subject_name', type: 'string' },
        ],
        rows: [],
        row_count: 0,
        execution_time_ms: 88,
      },
    })

    renderPage()

    await screen.findByTestId('query-center-dashboard-layout')
    await user.click(screen.getByRole('button', { name: '运行' }))

    expect(await screen.findByTestId('dashboard-query-result-table')).toHaveTextContent('rows:0; cols:2; headers:123 subject_id|ABC subject_name')
    expect(screen.getByTestId('dashboard-query-result-table')).toHaveTextContent('empty:查询成功，当前条件下没有返回数据')
  })

  it('仅保留虚拟数据集入口的明确引导', async () => {
    const firstRender = renderPage('/queries?intent=create-virtual-dataset')
    expect(await screen.findByText('你正在从 SQL 虚拟数据集入口进入，请先选择数据源并完善 SQL，再决定是否沉淀为数据集。')).toBeInTheDocument()

    firstRender.unmount()
    renderPage('/queries?intent=dataset-query&datasetId=7&datasetName=%E7%AD%94%E9%A2%98%E6%B1%87%E6%80%BB')

    await screen.findByTestId('query-center-dashboard-layout')
    expect(screen.queryByText('已基于数据集“答题汇总”打开查询工作台，可继续完善 SQL 并验证结果。')).not.toBeInTheDocument()
  })

  it('支持结构树插入和表预览', async () => {
    const user = userEvent.setup()

    renderPage()

    await screen.findByTestId('query-center-dashboard-layout')
    await user.click(screen.getByTestId('schema-insert'))
    expect((screen.getByLabelText('sql-editor') as HTMLTextAreaElement).value).toContain('public.orders')

    await user.click(screen.getByTestId('schema-preview'))
    expect(await screen.findByTestId('dashboard-query-result-table')).toHaveTextContent('rows:1; cols:1; headers:123 id')
  })

  it('双击结构树节点时会按换行规则追加 SQL 片段', async () => {
    const user = userEvent.setup()

    renderPage()

    await screen.findByTestId('query-center-dashboard-layout')
    const editor = screen.getByLabelText('sql-editor') as HTMLTextAreaElement
    expect(editor.value).toContain('LIMIT 100')

    await user.click(screen.getByTestId('schema-double-click'))
    expect(editor.value).toContain('\npublic.customers')
  })

  it('支持折叠结构树，并在表预览失败时给出 destructive 提示', async () => {
    const user = userEvent.setup()
    dashboardMocks.previewTableData.mockRejectedValueOnce(new Error('预览接口异常'))

    renderPage()

    await screen.findByTestId('query-center-dashboard-layout')
    await user.click(screen.getByRole('button', { name: '折叠结构树' }))
    expect(screen.getByRole('button', { name: '展开结构树' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '展开结构树' }))
    await user.click(screen.getByTestId('schema-preview'))
    await waitFor(() => {
      expect(dashboardMocks.toast).toHaveBeenCalledWith({
        title: '表预览失败',
        description: '预览接口异常',
        variant: 'destructive',
      })
    })
  })

  it('运行与保存前会校验数据源、SQL 和查询名称', async () => {
    const user = userEvent.setup()
    dashboardMocks.getDataSources.mockResolvedValueOnce({
      data: { items: [] },
    })

    const firstRender = renderPage()

    await screen.findByTestId('query-center-dashboard-layout')
    await user.click(screen.getByRole('button', { name: '运行' }))
    expect(dashboardMocks.toast).toHaveBeenCalledWith({ title: '请先选择数据源', variant: 'warning' })
    await user.click(screen.getAllByRole('button', { name: '保存' })[0])
    await user.click(screen.getAllByRole('button', { name: '保存' })[1])
    expect(dashboardMocks.toast).toHaveBeenCalledWith({ title: '请先选择数据源', variant: 'warning' })

    firstRender.unmount()
    renderPage()

    await screen.findByTestId('query-center-dashboard-layout')
    const editor = screen.getByLabelText('sql-editor')
    await user.clear(editor)
    await user.click(screen.getByRole('button', { name: '运行' }))
    expect(dashboardMocks.toast).toHaveBeenCalledWith({ title: '请输入 SQL 查询', variant: 'warning' })

    await user.click(screen.getAllByRole('button', { name: '保存' })[0])
    await user.click(screen.getAllByRole('button', { name: '保存' })[1])
    expect(dashboardMocks.toast).toHaveBeenCalledWith({ title: '请输入查询名称', variant: 'warning' })
  })

  it('SQL 美化失败和带参数模板会走警告/异常分支', async () => {
    const user = userEvent.setup()
    dashboardMocks.formatSql.mockImplementationOnce(() => {
      throw new Error('SQL 语法不完整')
    })
    dashboardMocks.getTemplates.mockResolvedValueOnce({
      items: [
        {
          id: 88,
          template_name: '按日期筛选订单',
          template_description: '需要传入日期参数',
          sql_template: 'SELECT * FROM orders WHERE dt = {{ ds }}',
          parameters: [{ name: 'ds' }],
          category: '经营分析',
          tags: [],
          use_count: 3,
          created_at: '2026-03-28T06:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
      total_pages: 1,
    })

    renderPage()

    await screen.findByTestId('query-center-dashboard-layout')
    await user.click(screen.getByRole('button', { name: 'SQL 美化' }))
    expect(dashboardMocks.toast).toHaveBeenCalledWith({
      title: 'SQL 美化失败',
      description: 'SQL 语法不完整',
      variant: 'destructive',
    })

    await user.click(screen.getByRole('button', { name: '展开模版库' }))
    await user.click(await screen.findByRole('button', { name: /按日期筛选订单/ }))
    expect(dashboardMocks.applyTemplate).not.toHaveBeenCalled()
    expect(dashboardMocks.toast).toHaveBeenCalledWith({
      title: '带参数模板请先进入模板管理页使用',
      variant: 'warning',
    })
  })

  it('模板加载失败时展示 destructive 提示', async () => {
    const user = userEvent.setup()
    dashboardMocks.applyTemplate.mockRejectedValueOnce(new Error('模板服务暂不可用'))

    renderPage()

    await screen.findByTestId('query-center-dashboard-layout')
    await user.click(screen.getByRole('button', { name: '展开模版库' }))
    await user.click(await screen.findByRole('button', { name: /近 30 天订单营收/ }))

    await waitFor(() => {
      expect(dashboardMocks.toast).toHaveBeenCalledWith({
        title: '加载模板失败',
        description: '模板服务暂不可用',
        variant: 'destructive',
      })
    })
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
    expect(dashboardMocks.toast).toHaveBeenCalledWith({ title: '查询已保存' })
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
    expect(dashboardMocks.toast).toHaveBeenCalledWith({ title: '查询已更新' })
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

  it('兼容 editor 旧入口时保持模板侧栏折叠，并回填已保存查询详情', async () => {
    const user = userEvent.setup()

    renderPage('/queries?legacy=editor&id=18')

    await screen.findByTestId('query-center-dashboard-layout')
    expect(await screen.findByTestId('query-center-legacy-context')).toHaveTextContent('兼容入口：SQL 编辑器')
    await waitFor(() => {
      expect(screen.getByLabelText('选择数据源')).toHaveValue('1')
    })
    expect((screen.getByLabelText('sql-editor') as HTMLTextAreaElement).value).toBe('SELECT 1')
    expect(screen.getByRole('button', { name: '展开模版库' })).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: '保存' })[0])
    expect(await screen.findByDisplayValue('教学查询')).toBeInTheDocument()
    expect(screen.getByDisplayValue('历史保存的查询')).toBeInTheDocument()
  })

  it('运行失败时展示 destructive 提示，并恢复运行按钮状态', async () => {
    const user = userEvent.setup()
    dashboardMocks.executeQuery.mockRejectedValueOnce({
      response: { data: { message: '执行网关超时' } },
      message: '执行网关超时',
    })

    renderPage()

    await screen.findByTestId('query-center-dashboard-layout')
    const runButton = screen.getByRole('button', { name: '运行' })
    await user.click(runButton)

    await waitFor(() => {
      expect(dashboardMocks.toast).toHaveBeenCalledWith({
        title: '查询失败',
        description: '执行网关超时',
        variant: 'destructive',
      })
    })
    await waitFor(() => {
      expect(runButton).not.toBeDisabled()
    })
  })

  it('查询结果会根据样本值推断字符串列头，并为未知类型保留原始名称', async () => {
    const user = userEvent.setup()
    dashboardMocks.executeQuery.mockResolvedValueOnce({
      data: {
        columns: [{ name: 'city' }, { name: 'misc' }],
        rows: [['上海', null]],
        row_count: 1,
        execution_time_ms: 66,
      },
    })

    renderPage()

    await screen.findByTestId('query-center-dashboard-layout')
    await user.click(screen.getByRole('button', { name: '运行' }))

    expect(await screen.findByTestId('dashboard-query-result-table')).toHaveTextContent('headers:ABC city|misc')
  })

  it('保存失败时展示 destructive 提示', async () => {
    const user = userEvent.setup()
    dashboardMocks.createQuery.mockRejectedValueOnce({
      response: { data: { message: '保存服务暂不可用' } },
      message: '保存服务暂不可用',
    })

    renderPage()

    await screen.findByTestId('query-center-dashboard-layout')
    await user.click(screen.getAllByRole('button', { name: '保存' })[0])
    await user.type(screen.getByLabelText('查询名称'), '失败查询')
    await user.click(screen.getAllByRole('button', { name: '保存' })[1])

    await waitFor(() => {
      expect(dashboardMocks.toast).toHaveBeenCalledWith({
        title: '保存失败',
        description: '保存服务暂不可用',
        variant: 'destructive',
      })
    })
  })

  it('模板缺少分类与描述时隐藏分类徽标并回退说明文案', async () => {
    const user = userEvent.setup()
    dashboardMocks.getTemplates.mockResolvedValueOnce({
      items: [
        {
          id: 77,
          template_name: '未分类模板',
          template_description: '',
          sql_template: 'SELECT 1',
          parameters: [],
          category: '',
          tags: [],
          use_count: 0,
          created_at: '2026-03-28T06:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
      total_pages: 1,
    })

    renderPage()

    await screen.findByTestId('query-center-dashboard-layout')
    await user.click(screen.getByRole('button', { name: '展开模版库' }))
    const templateButton = await screen.findByRole('button', { name: /未分类模板/ })
    expect(templateButton).toBeInTheDocument()
    expect(screen.getByText('无描述')).toBeInTheDocument()
    expect(screen.queryByText('经营分析')).not.toBeInTheDocument()
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
