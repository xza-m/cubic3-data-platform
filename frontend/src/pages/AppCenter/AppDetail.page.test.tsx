import type { ReactNode } from 'react'
import React, { createContext, useContext } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AppDetail from './AppDetail'

const appDetailMocks = vi.hoisted(() => ({
  getApp: vi.fn(),
  getInstances: vi.fn(),
  createInstance: vi.fn(),
  updateInstance: vi.fn(),
  toast: vi.fn(),
}))

const navigateMock = vi.hoisted(() => vi.fn())

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

vi.mock('../../api/appCenter', () => ({
  getApp: appDetailMocks.getApp,
  getInstances: appDetailMocks.getInstances,
  createInstance: appDetailMocks.createInstance,
  updateInstance: appDetailMocks.updateInstance,
}))

vi.mock('../../components/AppCenter/InstanceTable', () => ({
  default: ({
    instances,
    onEdit,
    onPageChange,
  }: {
    instances: Array<{ id: number; name: string }>
    onEdit?: (instance: { id: number; name: string }) => void
    onPageChange?: (page: number) => void
  }) => (
    <div>
      <div>实例数：{instances.length}</div>
      {instances.map((instance) => (
        <button key={instance.id} type="button" onClick={() => onEdit?.(instance)}>
          编辑 {instance.name}
        </button>
      ))}
      <button type="button" onClick={() => onPageChange?.(2)}>
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
    onClose,
    onSubmit,
  }: {
    open: boolean
    app?: { code: string; name: string } | null
    instance?: { id: number; name: string } | null
    onClose?: () => void
    onSubmit?: (payload: Record<string, unknown>) => Promise<void>
  }) =>
    open ? (
      <div role="dialog" aria-label="实例配置">
        <p>{instance ? `编辑 ${instance.name}` : `创建 ${app?.name}`}</p>
        <button
          type="button"
          onClick={() => {
            void onSubmit
              ?.({
                app_code: app?.code,
                name: instance ? '更新后的实例' : '新建实例',
                config: { chat_id: 'oc_test' },
                schedule_type: 'manual',
              })
              .catch(() => undefined)
          }}
        >
          提交配置
        </button>
        <button type="button" onClick={() => onClose?.()}>
          关闭抽屉
        </button>
      </div>
    ) : null,
}))

const TabsContext = createContext<{ value: string; onValueChange?: (value: string) => void }>({ value: 'overview' })

vi.mock('@/components/business', () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  FormButton: ({
    children,
    onClick,
    className,
    variant,
  }: {
    children: ReactNode
    onClick?: () => void
    className?: string
    variant?: string
  }) => (
    <button type="button" data-variant={variant} className={className} onClick={onClick}>
      {children}
    </button>
  ),
  PageTabs: ({
    value,
    onValueChange,
    children,
  }: {
    value: string
    onValueChange?: (value: string) => void
    children: ReactNode
  }) => <TabsContext.Provider value={{ value, onValueChange }}>{children}</TabsContext.Provider>,
  PageTabsList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PageTabsTrigger: ({ value, children }: { value: string; children: ReactNode }) => {
    const tabs = useContext(TabsContext)
    return (
      <button type="button" onClick={() => tabs.onValueChange?.(value)}>
        {children}
      </button>
    )
  },
  PageTabsContent: ({ value, children }: { value: string; children: ReactNode }) => {
    const tabs = useContext(TabsContext)
    return tabs.value === value ? <div>{children}</div> : null
  },
  Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} />,
  useToast: () => ({ toast: appDetailMocks.toast }),
}))

function renderPage(entry = '/apps/report_push') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <MemoryRouter initialEntries={[entry]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/apps/:code" element={<AppDetail />} />
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
    config_schema: { datasource_id: 1, chat_id: 'oc_demo' },
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

describe('AppDetail page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    appDetailMocks.getApp.mockResolvedValue(makeApp())
    appDetailMocks.getInstances.mockResolvedValue({
      items: [makeInstance()],
      total: 1,
      page: 1,
      page_size: 10,
      pages: 1,
    })
    appDetailMocks.createInstance.mockResolvedValue(makeInstance({ id: 21, name: '新建实例' }))
    appDetailMocks.updateInstance.mockResolvedValue(makeInstance({ id: 11, name: '更新后的实例' }))
  })

  it('加载中时展示骨架屏', () => {
    appDetailMocks.getApp.mockImplementation(() => new Promise(() => {}))

    renderPage()

    expect(screen.getAllByTestId('skeleton')).toHaveLength(2)
  })

  it('展示概览、配置说明和实例管理，并支持创建实例与分页', async () => {
    const user = userEvent.setup()

    renderPage()

    expect(await screen.findByText('日报推送')).toBeInTheDocument()
    expect(screen.getAllByText('按日报模板推送数据报告')).toHaveLength(2)
    expect(screen.getByText('report')).toBeInTheDocument()
    expect(screen.getByText('已启用')).toBeInTheDocument()
    expect(screen.getByText('alice')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '配置说明' }))
    expect(await screen.findByText(/datasource_id/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /我的实例/ }))
    expect(await screen.findByText('实例数：1')).toBeInTheDocument()
    expect(screen.getByText('编辑 日报实例')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '下一页' }))
    await waitFor(() => {
      expect(appDetailMocks.getInstances).toHaveBeenLastCalledWith({
        app_code: 'report_push',
        page: 2,
        page_size: 10,
      })
    })

    await user.click(screen.getByRole('button', { name: '创建实例' }))
    expect(screen.getByRole('dialog', { name: '实例配置' })).toBeInTheDocument()
    expect(screen.getByText('创建 日报推送')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '提交配置' }))

    await waitFor(() => {
      expect(appDetailMocks.createInstance).toHaveBeenCalledWith(
        {
          app_code: 'report_push',
          name: '新建实例',
          config: { chat_id: 'oc_test' },
          schedule_type: 'manual',
        },
        expect.any(Object),
      )
    })
    expect(appDetailMocks.toast).toHaveBeenCalledWith({ title: '创建成功' })
  })

  it('支持编辑实例并提交更新', async () => {
    const user = userEvent.setup()

    renderPage()

    await user.click(await screen.findByRole('button', { name: /我的实例/ }))
    await user.click(await screen.findByRole('button', { name: '编辑 日报实例' }))
    expect(screen.getByRole('dialog', { name: '实例配置' })).toHaveTextContent('编辑 日报实例')

    await user.click(screen.getByRole('button', { name: '提交配置' }))

    await waitFor(() => {
      expect(appDetailMocks.updateInstance).toHaveBeenCalledWith(11, {
        app_code: 'report_push',
        name: '更新后的实例',
        config: { chat_id: 'oc_test' },
        schedule_type: 'manual',
      })
    })
    expect(appDetailMocks.toast).toHaveBeenCalledWith({ title: '更新成功' })
  })

  it('应用不存在时支持返回应用市场', async () => {
    const user = userEvent.setup()
    appDetailMocks.getApp.mockResolvedValue(null)

    renderPage()

    expect(await screen.findByText('应用不存在')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '返回应用市场' }))
    expect(navigateMock).toHaveBeenCalledWith('/apps')
  })

  it('创建和更新失败时展示 destructive 提示', async () => {
    const user = userEvent.setup()
    appDetailMocks.createInstance.mockRejectedValueOnce(new Error('create boom'))
    appDetailMocks.updateInstance.mockRejectedValueOnce(new Error('update boom'))

    renderPage()

    await user.click(await screen.findByRole('button', { name: /我的实例/ }))
    await user.click(screen.getByRole('button', { name: '创建实例' }))
    await user.click(screen.getByRole('button', { name: '提交配置' }))

    await waitFor(() => {
      expect(appDetailMocks.toast).toHaveBeenCalledWith({
        title: '创建失败',
        description: 'create boom',
        variant: 'destructive',
      })
    })

    await user.click(screen.getByRole('button', { name: '关闭抽屉' }))
    await user.click(screen.getByRole('button', { name: '编辑 日报实例' }))
    await user.click(screen.getByRole('button', { name: '提交配置' }))

    await waitFor(() => {
      expect(appDetailMocks.toast).toHaveBeenCalledWith({
        title: '更新失败',
        description: 'update boom',
        variant: 'destructive',
      })
    })
  })
})
