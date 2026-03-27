import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Datasources from './Datasources'

const dataSourceMocks = vi.hoisted(() => ({
  getDataSources: vi.fn(),
  createDataSource: vi.fn(),
  updateDataSource: vi.fn(),
  deleteDataSource: vi.fn(),
  testDataSourceConnection: vi.fn(),
  syncDataSourceCatalog: vi.fn(),
  getDataSourceStatistics: vi.fn(),
  getDataSourceTypes: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('../api/datasources', () => ({
  getDataSources: dataSourceMocks.getDataSources,
  createDataSource: dataSourceMocks.createDataSource,
  updateDataSource: dataSourceMocks.updateDataSource,
  deleteDataSource: dataSourceMocks.deleteDataSource,
  testDataSourceConnection: dataSourceMocks.testDataSourceConnection,
  syncDataSourceCatalog: dataSourceMocks.syncDataSourceCatalog,
  getDataSourceStatistics: dataSourceMocks.getDataSourceStatistics,
  getDataSourceTypes: dataSourceMocks.getDataSourceTypes,
}))

vi.mock('@/components/business', async () => {
  const actual = await vi.importActual<typeof import('@/components/business')>('@/components/business')
  return {
    ...actual,
    FormButton: ({
      children,
      onClick,
      title,
      disabled,
      type = 'button',
    }: {
      children: ReactNode
      onClick?: () => void
      title?: string
      disabled?: boolean
      type?: 'button' | 'submit' | 'reset'
    }) => (
      <button type={type} onClick={onClick} title={title} disabled={disabled}>
        {children}
      </button>
    ),
    FormSelect: ({
      value,
      onValueChange,
      options,
      placeholder,
    }: {
      value: string
      onValueChange: (value: string) => void
      options: Array<{ value: string; label: string }>
      placeholder?: string
    }) => (
      <select
        aria-label={placeholder || 'select'}
        value={value}
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
    PageModal: ({
      open,
      title,
      description,
      children,
      footer,
    }: {
      open: boolean
      title: string
      description?: string
      children: ReactNode
      footer?: ReactNode
    }) => open ? (
      <div role="dialog" aria-label={title}>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
        {children}
        {footer}
      </div>
    ) : null,
    AlertDialog: ({ open, children }: { open: boolean; children: ReactNode }) => open ? <div role="alertdialog">{children}</div> : null,
    AlertDialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    AlertDialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    AlertDialogTitle: ({ children }: { children: ReactNode }) => <h3>{children}</h3>,
    AlertDialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
    AlertDialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    AlertDialogCancel: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => <button type="button" onClick={onClick}>{children}</button>,
    AlertDialogAction: ({
      children,
      onClick,
    }: {
      children: ReactNode
      onClick?: () => void
    }) => <button type="button" onClick={onClick}>{children}</button>,
    Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
    TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
    Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
    TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
    TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
    useToast: () => ({ toast: dataSourceMocks.toast }),
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
        <Datasources />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

function makeDataSource(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: '教学 PostgreSQL',
    source_type: 'postgresql',
    description: '主学习业务库',
    connection_config: {
      host: 'pg.internal',
      port: '5432',
      database: 'learning',
      username: 'analyst',
      project: '',
    },
    is_active: true,
    connection_status: 'connected',
    extra_config: {
      catalog_sync: {
        status: 'synced',
        last_run_at: '2026-03-24T10:00:00Z',
        last_error: null,
        tracked_databases: ['learning'],
        database_count: 1,
      },
    },
    last_test_error: null,
    created_at: '2026-03-23T10:00:00Z',
    updated_at: '2026-03-24T10:00:00Z',
    ...overrides,
  }
}

function getDatasourceCard(name: string) {
  const title = screen.getByText(name)
  const card = title.closest('div[class*="rounded-xl"]')
  if (!card) {
    throw new Error(`未找到数据源卡片: ${name}`)
  }
  return card as HTMLElement
}

function getDatasourceActions(name: string) {
  const buttons = within(getDatasourceCard(name)).getAllByRole('button')
  return {
    sync: buttons[0],
    test: buttons[1],
    edit: buttons[2],
    delete: buttons[3],
  }
}

describe('Datasources page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dataSourceMocks.getDataSourceTypes.mockResolvedValue({
      data: [
        { type: 'postgresql', display_name: 'PostgreSQL' },
        { type: 'maxcompute', display_name: 'MaxCompute' },
      ],
    })
  })

  it('展示连接状态与目录同步摘要，并支持搜索过滤', async () => {
    const user = userEvent.setup()

    dataSourceMocks.getDataSources.mockResolvedValue({
      data: {
        items: [
          makeDataSource(),
          makeDataSource({
            id: 2,
            name: 'MaxCompute 行为仓',
            source_type: 'maxcompute',
            connection_status: 'error',
            last_test_error: 'AK 已过期',
            extra_config: {
              catalog_sync: {
                status: 'failed',
                last_run_at: '2026-03-24T12:00:00Z',
                last_error: '权限不足',
                tracked_databases: ['behavior_dw', 'behavior_dm'],
                database_count: 2,
              },
            },
          }),
          makeDataSource({
            id: 3,
            name: 'MySQL 画像库',
            source_type: 'mysql',
            connection_status: 'idle',
            extra_config: {
              catalog_sync: {
                status: 'pending',
                last_run_at: null,
                last_error: null,
                tracked_databases: [],
                database_count: 0,
              },
            },
          }),
        ],
      },
    })
    dataSourceMocks.getDataSourceStatistics.mockResolvedValue({
      data: { total: 3, active: 2, connected: 1, inactive: 1 },
    })

    renderPage()

    expect(await screen.findByRole('heading', { name: '数据源管理' })).toBeInTheDocument()
    expect(screen.getByText('管理已接入的数据源与目录同步状态')).toBeInTheDocument()
    expect(await screen.findByText('教学 PostgreSQL')).toBeInTheDocument()
    expect(screen.getAllByText((_, element) => element?.textContent === '已连接').length).toBeGreaterThan(0)
    expect(screen.getAllByText((_, element) => element?.textContent === '连接失败').length).toBeGreaterThan(0)
    expect(screen.getAllByText((_, element) => element?.textContent === '未连接').length).toBeGreaterThan(0)
    expect(screen.getAllByText('目录同步').length).toBeGreaterThan(0)
    expect(screen.getByText('目录同步失败')).toBeInTheDocument()
    expect(screen.getByText('权限不足')).toBeInTheDocument()
    expect(screen.getByText('MaxCompute')).toBeInTheDocument()
    expect(screen.getByText('质量治理')).toBeInTheDocument()
    expect(screen.getAllByText('当前阶段未接入后端能力').length).toBeGreaterThan(0)

    await user.type(screen.getByPlaceholderText('搜索数据源名称或类型...'), 'max')
    expect(screen.getByText('MaxCompute 行为仓')).toBeInTheDocument()
    expect(screen.queryByText('教学 PostgreSQL')).not.toBeInTheDocument()
  })

  it('对未接入的治理模块展示禁用态，并保留真实连接测试与目录同步动作', async () => {
    const user = userEvent.setup()

    dataSourceMocks.getDataSources.mockResolvedValue({
      data: {
        items: [makeDataSource()],
      },
    })
    dataSourceMocks.getDataSourceStatistics.mockResolvedValue({
      data: { total: 1, active: 1, connected: 1, inactive: 0 },
    })
    dataSourceMocks.syncDataSourceCatalog.mockResolvedValue({ job_id: 'job-1', status: 'queued' })

    renderPage()

    expect(await screen.findByText('教学 PostgreSQL')).toBeInTheDocument()
    expect(screen.getByText('当前阶段未接入后端能力')).toBeInTheDocument()

    await user.click(screen.getByTitle('同步目录'))
    expect(dataSourceMocks.syncDataSourceCatalog).toHaveBeenCalledWith(1)
  })

  it('支持空状态和创建表单校验', async () => {
    const user = userEvent.setup()

    dataSourceMocks.getDataSources.mockResolvedValue({
      data: { items: [] },
    })
    dataSourceMocks.getDataSourceStatistics.mockResolvedValue({
      data: { total: 0, active: 0, connected: 0, inactive: 0 },
    })

    renderPage()

    expect(await screen.findByText('还没有数据源')).toBeInTheDocument()
    const emptyState = screen.getByText('还没有数据源').closest('div')
    expect(emptyState).not.toBeNull()

    await user.click(within(emptyState!).getByRole('button', { name: '创建第一个数据源' }))
    expect(await screen.findByRole('dialog', { name: '新建数据源' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '创建' }))
    expect(dataSourceMocks.toast).toHaveBeenCalledWith({ title: '请填写名称和类型', variant: 'warning' })
  })

  it('支持创建 PostgreSQL 和 MaxCompute 数据源', async () => {
    const user = userEvent.setup()

    dataSourceMocks.getDataSources.mockResolvedValue({
      data: { items: [] },
    })
    dataSourceMocks.getDataSourceStatistics.mockResolvedValue({
      data: { total: 0, active: 0, connected: 0, inactive: 0 },
    })
    dataSourceMocks.createDataSource.mockResolvedValue({ data: {} })

    renderPage()

    await user.click(await screen.findByRole('button', { name: '新建数据源' }))
    await user.type(screen.getByPlaceholderText('例如：生产环境 PostgreSQL'), '分析 PostgreSQL')
    await user.selectOptions(screen.getByRole('combobox', { name: '选择数据库类型' }), 'postgresql')
    await user.type(screen.getByPlaceholderText('localhost 或 IP'), 'pg.internal')
    await user.type(screen.getByPlaceholderText('3306/5432/9000'), '5432')
    await user.type(screen.getByPlaceholderText('数据库名称'), 'analytics')
    await user.type(screen.getByPlaceholderText('数据库用户名'), 'reader')
    await user.type(screen.getByPlaceholderText('数据库密码'), 'secret')
    await user.click(screen.getByRole('button', { name: '创建' }))

    await waitFor(() => {
      expect(dataSourceMocks.createDataSource).toHaveBeenCalled()
    })
    expect(dataSourceMocks.createDataSource.mock.calls[0][0]).toEqual({
        name: '分析 PostgreSQL',
        source_type: 'postgresql',
        description: '',
        connection_config: {
          host: 'pg.internal',
          port: '5432',
          database: 'analytics',
          username: 'reader',
          password: 'secret',
        },
      })

    await user.click(screen.getByRole('button', { name: '新建数据源' }))
    await user.clear(screen.getByPlaceholderText('例如：生产环境 PostgreSQL'))
    await user.type(screen.getByPlaceholderText('例如：生产环境 PostgreSQL'), '行为 MaxCompute')
    await user.selectOptions(screen.getByRole('combobox', { name: '选择数据库类型' }), 'maxcompute')
    expect(screen.getByText('Project *')).toBeInTheDocument()
    expect(screen.getByText('AccessKey ID *')).toBeInTheDocument()
    expect(screen.getByText('AccessKey Secret *')).toBeInTheDocument()
    await user.type(screen.getByPlaceholderText('MaxCompute 项目名'), 'behavior_dw')
    await user.type(screen.getByPlaceholderText('阿里云 Access ID'), 'ak')
    await user.type(screen.getByPlaceholderText('阿里云 Access Key Secret'), 'sk')
    await user.click(screen.getByRole('button', { name: '创建' }))

    await waitFor(() => {
      expect(dataSourceMocks.createDataSource).toHaveBeenCalledTimes(2)
    })
    expect(dataSourceMocks.createDataSource.mock.calls[1][0]).toEqual({
        name: '行为 MaxCompute',
        source_type: 'maxcompute',
        description: '',
        connection_config: {
          project: 'behavior_dw',
          access_id: 'ak',
          access_key: 'sk',
        },
      })
    expect(dataSourceMocks.toast).toHaveBeenCalledWith({ title: '创建成功' })
  })

  it('支持目录同步、编辑、测试连接和删除数据源', async () => {
    const user = userEvent.setup()

    dataSourceMocks.getDataSources.mockResolvedValue({
      data: {
        items: [
          makeDataSource(),
          makeDataSource({
            id: 2,
            name: '行为 MaxCompute',
            source_type: 'maxcompute',
            connection_config: { project: 'dw', access_id: 'ak' },
          }),
        ],
      },
    })
    dataSourceMocks.getDataSourceStatistics.mockResolvedValue({
      data: { total: 2, active: 2, connected: 2, inactive: 0 },
    })
    dataSourceMocks.updateDataSource.mockResolvedValue({ data: {} })
    dataSourceMocks.syncDataSourceCatalog.mockResolvedValue({ job_id: 'job-1', status: 'queued' })
    dataSourceMocks.testDataSourceConnection
      .mockResolvedValueOnce({ data: { success: true, message: '连接正常' } })
      .mockResolvedValueOnce({ data: { success: false, message: '认证失败' } })
      .mockRejectedValueOnce({ response: { data: { message: '网络超时' } } })
    dataSourceMocks.deleteDataSource
      .mockResolvedValueOnce({ data: {} })
      .mockRejectedValueOnce({ response: { data: { message: '仍有关联任务' } } })

    renderPage()

    await screen.findByText('教学 PostgreSQL')

    await user.click(getDatasourceActions('教学 PostgreSQL').sync)
    await waitFor(() => {
      expect(dataSourceMocks.syncDataSourceCatalog).toHaveBeenCalled()
    })
    expect(dataSourceMocks.syncDataSourceCatalog.mock.calls[0][0]).toBe(1)
    expect(dataSourceMocks.toast).toHaveBeenCalledWith({
      title: '目录同步已触发',
      description: '目录刷新任务已加入队列，请稍后查看同步摘要。',
    })

    await user.click(getDatasourceActions('教学 PostgreSQL').test)
    await user.click(getDatasourceActions('行为 MaxCompute').test)
    await user.click(getDatasourceActions('教学 PostgreSQL').test)
    await waitFor(() => {
      expect(dataSourceMocks.toast).toHaveBeenCalledWith({ title: '连接测试成功', description: '连接正常' })
      expect(dataSourceMocks.toast).toHaveBeenCalledWith({
        title: '连接测试失败',
        description: '认证失败',
        variant: 'destructive',
      })
      expect(dataSourceMocks.toast).toHaveBeenCalledWith({
        title: '连接测试失败',
        description: '网络超时',
        variant: 'destructive',
      })
    })

    await user.click(getDatasourceActions('教学 PostgreSQL').edit)
    expect(await screen.findByRole('dialog', { name: '编辑数据源' })).toBeInTheDocument()
    const editName = screen.getByDisplayValue('教学 PostgreSQL')
    await user.clear(editName)
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(dataSourceMocks.toast).toHaveBeenCalledWith({ title: '请填写名称', variant: 'warning' })

    await user.type(editName, '教学 PostgreSQL v2')
    await user.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => {
      expect(dataSourceMocks.updateDataSource).toHaveBeenCalled()
    })
    expect(dataSourceMocks.updateDataSource.mock.calls[0][0]).toBe(1)
    expect(dataSourceMocks.updateDataSource.mock.calls[0][1]).toEqual({
        name: '教学 PostgreSQL v2',
        description: '主学习业务库',
        connection_config: {
          host: 'pg.internal',
          port: '5432',
          database: 'learning',
          username: 'analyst',
        },
      })

    await user.click(getDatasourceActions('行为 MaxCompute').edit)
    await user.type(screen.getByPlaceholderText('留空表示保持原 AccessKey Secret'), 'new-secret')
    await user.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => {
      expect(dataSourceMocks.updateDataSource).toHaveBeenCalledTimes(2)
    })
    expect(dataSourceMocks.updateDataSource.mock.calls[1][0]).toBe(2)
    expect(dataSourceMocks.updateDataSource.mock.calls[1][1]).toEqual({
        name: '行为 MaxCompute',
        description: '主学习业务库',
        connection_config: {
          project: 'dw',
          access_id: 'ak',
          access_key: 'new-secret',
        },
      })

    await user.click(getDatasourceActions('教学 PostgreSQL').delete)
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '删除' }))
    await waitFor(() => {
      expect(dataSourceMocks.deleteDataSource).toHaveBeenCalled()
    })
    expect(dataSourceMocks.deleteDataSource.mock.calls[0][0]).toBe(1)
    expect(dataSourceMocks.toast).toHaveBeenCalledWith({ title: '删除成功' })

    await user.click(getDatasourceActions('行为 MaxCompute').delete)
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '删除' }))
    await waitFor(() => {
      expect(dataSourceMocks.toast).toHaveBeenCalledWith({
        title: '删除失败',
        description: '仍有关联任务',
        variant: 'destructive',
      })
    })
  })

  it('在创建或更新失败时给出 destructive 提示', async () => {
    const user = userEvent.setup()

    dataSourceMocks.getDataSources.mockResolvedValue({
      data: { items: [makeDataSource()] },
    })
    dataSourceMocks.getDataSourceStatistics.mockResolvedValue({
      data: { total: 1, active: 1, connected: 1, inactive: 0 },
    })
    dataSourceMocks.createDataSource.mockRejectedValueOnce({
      response: { data: { message: '名称重复' } },
    })
    dataSourceMocks.updateDataSource.mockRejectedValueOnce({
      response: { data: { message: '连接配置非法' } },
    })

    renderPage()

    await user.click(await screen.findByRole('button', { name: '新建数据源' }))
    await user.type(screen.getByPlaceholderText('例如：生产环境 PostgreSQL'), '重复数据源')
    await user.selectOptions(screen.getByRole('combobox', { name: '选择数据库类型' }), 'postgresql')
    await user.click(screen.getByRole('button', { name: '创建' }))
    await waitFor(() => {
      expect(dataSourceMocks.toast).toHaveBeenCalledWith({
        title: '创建失败',
        description: '名称重复',
        variant: 'destructive',
      })
    })

    await user.click(getDatasourceActions('教学 PostgreSQL').edit)
    const editName = await screen.findByDisplayValue('教学 PostgreSQL')
    await user.clear(editName)
    await user.type(editName, '教学 PostgreSQL')
    await user.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => {
      expect(dataSourceMocks.toast).toHaveBeenCalledWith({
        title: '更新失败',
        description: '连接配置非法',
        variant: 'destructive',
      })
    })
  })

  it('支持目录同步失败提示，并展示无效同步时间原值', async () => {
    const user = userEvent.setup()

    dataSourceMocks.getDataSources.mockResolvedValue({
      data: {
        items: [
          makeDataSource({
            id: 7,
            name: '异常目录源',
            extra_config: {
              catalog_sync: {
                status: 'failed',
                last_run_at: 'invalid-date',
                last_error: '目录服务异常',
                tracked_databases: ['dw'],
                database_count: 1,
              },
            },
          }),
        ],
      },
    })
    dataSourceMocks.getDataSourceStatistics.mockResolvedValue({
      data: { total: 1, active: 1, connected: 1, inactive: 0 },
    })
    dataSourceMocks.syncDataSourceCatalog.mockRejectedValueOnce({
      response: { data: { message: '同步队列不可用' } },
    })

    renderPage()

    await screen.findByText('异常目录源')
    expect(screen.getByText('invalid-date')).toBeInTheDocument()
    expect(screen.getByText('目录服务异常')).toBeInTheDocument()

    await user.click(getDatasourceActions('异常目录源').sync)
    await waitFor(() => {
      expect(dataSourceMocks.toast).toHaveBeenCalledWith({
        title: '目录同步失败',
        description: '同步队列不可用',
        variant: 'destructive',
      })
    })
  })
})
