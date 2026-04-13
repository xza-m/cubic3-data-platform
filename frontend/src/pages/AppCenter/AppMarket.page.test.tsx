import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AppMarket from './AppMarket'

const appMarketMocks = vi.hoisted(() => ({
  getApps: vi.fn(),
  getCategories: vi.fn(),
  getInstances: vi.fn(),
  createInstance: vi.fn(),
  updateInstance: vi.fn(),
  submitConfig: null as null | ((payload: Record<string, unknown>) => Promise<void>),
}))

vi.mock('../../api/appCenter', () => ({
  getApps: appMarketMocks.getApps,
  getCategories: appMarketMocks.getCategories,
  getInstances: appMarketMocks.getInstances,
  createInstance: appMarketMocks.createInstance,
  updateInstance: appMarketMocks.updateInstance,
}))

vi.mock('../../components/AppCenter/InstanceTable', () => ({
  default: ({
    instances,
    onEdit,
    onPageChange,
  }: {
    instances: Array<{ id: number; name: string }>
    onEdit?: (instance: { id: number; name: string }) => void
    onPageChange?: (page: number, pageSize: number) => void
  }) => (
    <div>
      <div>实例数：{instances.length}</div>
      {instances.map((instance) => (
        <button key={instance.id} type="button" onClick={() => onEdit?.(instance)}>
          编辑 {instance.name}
        </button>
      ))}
      <button type="button" onClick={() => onPageChange?.(2, 5)}>
        下一页
      </button>
    </div>
  ),
}))

vi.mock('../../components/AppCenter/ConfigDrawer', () => ({
  default: ({
    open,
    app,
    instance,
    onSubmit,
    onClose,
  }: {
    open: boolean
    app?: { code: string; name: string } | null
    instance?: { id: number; name: string } | null
    onSubmit?: (payload: Record<string, unknown>) => Promise<void>
    onClose?: () => void
  }) => {
    appMarketMocks.submitConfig = open ? (onSubmit || null) : null
    if (!open) return null

    return createPortal(
      <div role="dialog" aria-label="实例配置弹窗" style={{ pointerEvents: 'auto' }}>
        <p>{instance ? `编辑 ${instance.name}` : `新建 ${app?.name}`}</p>
        <button type="button" onClick={() => onClose?.()}>
          关闭
        </button>
      </div>,
      document.body,
    )
  },
}))

vi.mock('@/components/business', () => ({
  PageModal: ({
    open,
    title,
    ariaLabel,
    description,
    children,
  }: {
    open: boolean
    title?: string
    ariaLabel?: string
    description?: string
    children: ReactNode
  }) => (
    open ? createPortal(
      <div role="dialog" aria-label={ariaLabel || title || '应用详情'}>
        {title ? <h2>{title}</h2> : null}
        {description ? <p>{description}</p> : null}
        {children}
      </div>,
      document.body,
    ) : null
  ),
  Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} />,
}))

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <MemoryRouter initialEntries={['/apps']}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/apps" element={<AppMarket />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

function makeApp(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    code: 'report_push',
    name: '日报推送',
    category: 'report',
    description: '按日报模板推送数据报告',
    config_schema: null,
    icon: 'file',
    author: 'alice',
    version: '1.0.0',
    enabled: true,
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-02T00:00:00Z',
    instance_count: 2,
    ...overrides,
  }
}

function makeInstance(overrides: Record<string, unknown> = {}) {
  return {
    id: 11,
    app_code: 'report_push',
    name: '日报实例',
    description: '每日 8 点执行',
    config: {},
    schedule_type: 'cron',
    schedule_config: { cron: '0 8 * * *' },
    owner: 'alice',
    enabled: true,
    last_execution_at: '2026-03-28T08:00:00Z',
    next_execution_at: '2026-03-29T08:00:00Z',
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-02T00:00:00Z',
    app_name: '日报推送',
    ...overrides,
  }
}

describe('AppMarket page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    appMarketMocks.submitConfig = null
    appMarketMocks.getCategories.mockResolvedValue([
      { category: 'report', display_name: '数据报告', app_count: 1 },
      { category: 'agent', display_name: 'Agent', app_count: 1 },
    ])
    appMarketMocks.getApps.mockImplementation(async (params?: { category?: string }) => {
      if (params?.category === 'agent') {
        return [
          makeApp({
            id: 2,
            code: 'data_agent',
            name: '数据助手',
            category: 'agent',
            description: '通过 Agent 分析数据',
            instance_count: 1,
          }),
        ]
      }
      return [
        makeApp(),
        makeApp({
          id: 2,
          code: 'data_agent',
          name: '数据助手',
          category: 'agent',
          description: '通过 Agent 分析数据',
          instance_count: 1,
        }),
      ]
    })
    appMarketMocks.getInstances.mockResolvedValue({
      items: [makeInstance()],
      total: 1,
      page: 1,
      page_size: 5,
      pages: 1,
    })
    appMarketMocks.createInstance.mockResolvedValue(makeInstance({ id: 22, name: '新建实例' }))
    appMarketMocks.updateInstance.mockResolvedValue(makeInstance({ id: 11, name: '更新后的实例' }))
  })

  it('展示应用列表、支持分类筛选和搜索', async () => {
    const user = userEvent.setup()

    renderPage()

    expect(await screen.findByText('应用中心')).toBeInTheDocument()
    expect(screen.getByTestId('app-market-grid')).toHaveClass('grid-cols-1')
    expect(screen.getByTestId('app-market-grid')).toHaveClass('sm:grid-cols-2')
    expect(screen.getByTestId('app-market-grid')).toHaveClass('xl:grid-cols-3')
    expect(await screen.findByText('日报推送')).toBeInTheDocument()
    expect(screen.getByText('数据助手')).toBeInTheDocument()
    expect(appMarketMocks.getApps).toHaveBeenCalledWith({
      category: undefined,
      enabled_only: true,
      include_stats: true,
    })

    await user.click(screen.getByRole('button', { name: 'Agent' }))
    await waitFor(() => {
      expect(appMarketMocks.getApps).toHaveBeenLastCalledWith({
        category: 'agent',
        enabled_only: true,
        include_stats: true,
      })
    })
    expect(await screen.findByText('数据助手')).toBeInTheDocument()
    expect(screen.queryByText('日报推送')).not.toBeInTheDocument()

    const search = screen.getByPlaceholderText('搜索应用名称或描述...')
    await user.clear(search)
    await user.type(search, '助手')
    expect(screen.getByText('数据助手')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '全部' }))
    await waitFor(() => {
      expect(appMarketMocks.getApps).toHaveBeenLastCalledWith({
        category: undefined,
        enabled_only: true,
        include_stats: true,
      })
    })
    await user.clear(search)
    await user.type(search, '日报模板')
    expect(screen.getByText('日报推送')).toBeInTheDocument()
    expect(screen.queryByText('数据助手')).not.toBeInTheDocument()
  })

  it('点击应用卡片后打开详情弹窗并加载实例列表', async () => {
    const user = userEvent.setup()

    renderPage()

    const cardTitle = await screen.findByText('日报推送')
    await user.click(cardTitle.closest('.group') as HTMLElement)

    await waitFor(() => {
      expect(appMarketMocks.getInstances).toHaveBeenCalledWith({
        app_code: 'report_push',
        page: 1,
        page_size: 5,
      })
    })

    expect(await screen.findByRole('dialog', { name: '日报推送' })).toBeInTheDocument()
    expect(screen.getByText('实例列表')).toBeInTheDocument()
    expect(screen.getByText('实例数：1')).toBeInTheDocument()
    expect(screen.getByTestId('app-detail-header-actions')).toHaveClass('mr-12')
    expect(screen.getByRole('button', { name: '编辑 日报实例' })).toBeInTheDocument()
  })

  it('在详情弹窗中新建和编辑实例', async () => {
    const user = userEvent.setup()

    renderPage()

    const cardTitle = await screen.findByText('日报推送')
    await user.click(cardTitle.closest('.group') as HTMLElement)
    const detailDialog = await screen.findByRole('dialog', { name: '日报推送' })

    await user.click(within(detailDialog).getByRole('button', { name: '新建实例' }))
    expect(await screen.findByRole('dialog', { name: '实例配置弹窗' })).toBeInTheDocument()
    expect(screen.getByText('新建 日报推送')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '日报推送' })).not.toBeInTheDocument()
    })
    expect(typeof appMarketMocks.submitConfig).toBe('function')
    await act(async () => {
      await appMarketMocks.submitConfig?.({
        app_code: 'report_push',
        name: '新建实例',
        description: '新建描述',
        config: {},
        schedule_type: 'manual',
        enabled: true,
      })
    })
    await waitFor(() => {
      expect(appMarketMocks.createInstance).toHaveBeenCalledWith({
        app_code: 'report_push',
        name: '新建实例',
        description: '新建描述',
        config: {},
        schedule_type: 'manual',
        enabled: true,
      })
    })

    const reopenCardTitle = await screen.findByText('日报推送')
    await user.click(reopenCardTitle.closest('.group') as HTMLElement)
    expect(await screen.findByRole('dialog', { name: '日报推送' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '编辑 日报实例' }))
    expect(await screen.findByRole('dialog', { name: '实例配置弹窗' })).toBeInTheDocument()
    expect(screen.getByText('编辑 日报实例')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '日报推送' })).not.toBeInTheDocument()
    })
    expect(typeof appMarketMocks.submitConfig).toBe('function')
    await act(async () => {
      await appMarketMocks.submitConfig?.({
        name: '更新后的实例',
        description: '已更新',
        config: {},
        schedule_type: 'manual',
        enabled: true,
      })
    })
    await waitFor(() => {
      expect(appMarketMocks.updateInstance).toHaveBeenCalledWith(11, {
        name: '更新后的实例',
        description: '已更新',
        config: {},
        schedule_type: 'manual',
        enabled: true,
      })
    })
  })

  it('不再展示页头新建实例和卡片级查看/新建按钮', async () => {
    renderPage()

    await screen.findByText('日报推送')

    expect(screen.queryByRole('button', { name: '新建实例' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '查看' })).not.toBeInTheDocument()
  })

  it('详情弹窗中的新建实例会关闭详情并打开实例配置弹窗', async () => {
    const user = userEvent.setup()

    renderPage()

    const cardTitle = await screen.findByText('数据助手')
    await user.click(cardTitle.closest('.group') as HTMLElement)

    const detailDialog = await screen.findByRole('dialog', { name: '数据助手' })
    await user.click(within(detailDialog).getByRole('button', { name: '新建实例' }))

    expect(await screen.findByRole('dialog', { name: '实例配置弹窗' })).toBeInTheDocument()
    expect(screen.getByText('新建 数据助手')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '数据助手' })).not.toBeInTheDocument()
    })
  })

  it('列表为空时展示空状态', async () => {
    appMarketMocks.getApps.mockResolvedValueOnce([])

    renderPage()

    expect(await screen.findByText('未找到应用')).toBeInTheDocument()
    expect(screen.getByText('尝试更换搜索关键词或选择其他分类')).toBeInTheDocument()
  })

  it('分类接口缺失时回退默认分类，并在加载中展示骨架', async () => {
    appMarketMocks.getCategories.mockResolvedValueOnce(null)
    appMarketMocks.getApps.mockImplementationOnce(() => new Promise(() => {}))

    renderPage()

    expect(await screen.findAllByTestId('skeleton')).toHaveLength(24)
    expect(screen.getByRole('button', { name: 'BI集成' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '数据报告' })).toBeInTheDocument()
  })

  it('分类标签对外展示中文名称，并保留专业词大小写', async () => {
    appMarketMocks.getCategories.mockResolvedValueOnce([
      { category: 'system_maintenance', display_name: 'system_maintenance', app_count: 2 },
      { category: 'agent', display_name: 'agent', app_count: 1 },
    ])

    renderPage()

    expect(await screen.findByRole('button', { name: '系统维护' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agent' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'system_maintenance' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'agent' })).not.toBeInTheDocument()
  })
})
