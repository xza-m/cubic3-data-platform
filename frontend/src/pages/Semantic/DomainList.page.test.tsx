import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DomainList from './DomainList'

const semanticApiMocks = vi.hoisted(() => ({
  listDomainCatalogs: vi.fn(),
  listDomains: vi.fn(),
  describeDomain: vi.fn(),
  deleteCatalog: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@/api/semantic', async () => {
  const actual = await vi.importActual<typeof import('@/api/semantic')>('@/api/semantic')
  return {
    ...actual,
    listDomainCatalogs: semanticApiMocks.listDomainCatalogs,
    listDomains: semanticApiMocks.listDomains,
    describeDomain: semanticApiMocks.describeDomain,
    deleteCatalog: semanticApiMocks.deleteCatalog,
  }
})

vi.mock('@/components/business', async () => {
  const actual = await vi.importActual<typeof import('@/components/business')>('@/components/business')
  return {
    ...actual,
    useToast: () => ({ toast: semanticApiMocks.toast }),
  }
})

vi.mock('@/components/Semantic/CatalogEditorDialog', () => ({
  CatalogEditorDialog: ({
    open,
    onOpenChange,
    onSuccess,
  }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess: (catalog: { code: string }) => void
  }) => open ? (
    <div data-testid="mock-catalog-editor">
      <button type="button" onClick={() => onSuccess({ code: 'ops' })}>
        mock catalog success
      </button>
      <button type="button" onClick={() => onOpenChange(false)}>
        close catalog editor
      </button>
    </div>
  ) : null,
}))

function renderPage(initialEntries?: string[]) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <QueryClientProvider client={client}>
        <DomainList />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

function installSelectPolyfills() {
  Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
    configurable: true,
    value: () => false,
  })
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: () => {},
  })
  Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
    configurable: true,
    value: () => {},
  })
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: () => {},
  })
}

describe('DomainList page', () => {
  beforeEach(() => {
    semanticApiMocks.listDomainCatalogs.mockReset()
    semanticApiMocks.listDomains.mockReset()
    semanticApiMocks.describeDomain.mockReset()
    semanticApiMocks.deleteCatalog.mockReset()
    semanticApiMocks.toast.mockReset()
  })

  it('领域目录首页只保留目录管理与状态浏览，不承载新建领域表单', async () => {
    const domains = [
      {
        id: 'domain-1',
        code: 'learning_domain',
        name: '学习领域',
        description: '学习场景的关联概况',
        status: 'draft',
        cube_count: 0,
        join_count: 0,
        catalog_code: 'default',
        catalog_name: '默认目录',
        state_summary: {},
      },
    ]
    semanticApiMocks.listDomainCatalogs.mockResolvedValueOnce({
      data: {
        catalogs: [
          {
            code: 'default',
            name: '默认目录',
            description: '默认目录',
            status: 'active',
            domain_count: 1,
            active_count: 0,
            draft_count: 1,
            domains,
          },
        ],
      },
    })
    semanticApiMocks.listDomains.mockResolvedValueOnce({
      data: {
        domains,
        total: 1,
        page: 1,
        page_size: 10,
        page_count: 1,
      },
    })
    semanticApiMocks.describeDomain.mockResolvedValueOnce({
      data: {
        id: 'domain-1',
        code: 'learning_domain',
        name: '学习领域',
        description: '学习场景的关联概况',
        status: 'draft',
        catalog_code: 'default',
        catalog_name: '默认目录',
        cubes: [],
        joins: [],
        state_summary: {},
      },
    })

    renderPage()

    await screen.findByRole('heading', { name: '领域目录' })
    expect(screen.getByTestId('domain-list-search')).toBeInTheDocument()
    expect(screen.getByTestId('domain-summary-panel')).toBeInTheDocument()
    expect(screen.queryByLabelText('领域名称')).not.toBeInTheDocument()
    expect(screen.queryByText('新建领域草稿')).not.toBeInTheDocument()
    expect(screen.queryByTestId('domain-create-name')).not.toBeInTheDocument()
  })

  it('目录页提供前往领域建模的入口，而不是直接弹出新建对话框', async () => {
    semanticApiMocks.listDomainCatalogs.mockResolvedValueOnce({
      data: {
        catalogs: [
          {
            code: 'default',
            name: '默认目录',
            description: '默认目录',
            status: 'active',
            domain_count: 0,
            active_count: 0,
            draft_count: 0,
            domains: [],
          },
        ],
      },
    })
    semanticApiMocks.listDomains.mockResolvedValueOnce({
      data: {
        domains: [],
        total: 0,
        page: 1,
        page_size: 10,
        page_count: 0,
      },
    })
    semanticApiMocks.describeDomain.mockResolvedValue({
      data: {
        id: 'domain-empty',
        code: 'empty_domain',
        name: '空领域',
        description: '',
        status: 'draft',
        catalog_code: 'default',
        catalog_name: '默认目录',
        cubes: [],
        joins: [],
        state_summary: {},
      },
    })

    renderPage()
    await screen.findByRole('heading', { name: '领域目录' })

    const trigger = screen.getByTestId('domain-create-trigger')
    expect(trigger).toHaveAttribute('href', '/semantic/modeling')
  })

  it('支持治理透镜过滤领域，并在右侧切到当前领域摘要', async () => {
    const domains = [
      {
        id: 'domain-empty',
        code: 'empty_domain',
        name: '空领域',
        description: '',
        status: 'draft',
        cube_count: 0,
        join_count: 0,
        catalog_code: 'default',
        catalog_name: '默认目录',
        state_summary: {},
      },
      {
        id: 'domain-ready',
        code: 'ready_domain',
        name: '成熟领域',
        description: '',
        status: 'active',
        cube_count: 2,
        join_count: 1,
        catalog_code: 'default',
        catalog_name: '默认目录',
        state_summary: {},
      },
    ]

    semanticApiMocks.listDomainCatalogs.mockResolvedValueOnce({
      data: {
        catalogs: [
          {
            code: 'default',
            name: '默认目录',
            description: '默认目录',
            status: 'active',
            domain_count: 2,
            active_count: 1,
            draft_count: 1,
            domains,
          },
        ],
      },
    })
    semanticApiMocks.listDomains.mockResolvedValueOnce({
      data: {
        domains,
        total: 2,
        page: 1,
        page_size: 10,
        page_count: 1,
      },
    })
    semanticApiMocks.describeDomain.mockImplementation(async (id: string) => ({
      data: id === 'domain-empty'
        ? {
            id: 'domain-empty',
            code: 'empty_domain',
            name: '空领域',
            description: '',
            status: 'draft',
            catalog_code: 'default',
            catalog_name: '默认目录',
            cubes: ['lesson_progress', 'answer_records'],
            joins: [],
            governance_summary: {
              cube_count: 2,
              active_cube_count: 1,
              draft_cube_count: 1,
              deprecated_cube_count: 0,
              join_count: 0,
              dangling_cube_count: 1,
            },
            state_summary: {},
          }
        : {
            id: 'domain-ready',
            code: 'ready_domain',
            name: '成熟领域',
            description: '',
            status: 'active',
            catalog_code: 'default',
            catalog_name: '默认目录',
            cubes: ['study_sessions'],
            joins: [{ id: 'join-ready' }],
            state_summary: {},
          },
    }))

    renderPage()
    await screen.findByRole('heading', { name: '领域目录' })
    expect(within(screen.getByTestId('catalog-summary-panel')).getByText('Join 数')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('domain-governance-lens-empty'))

    await waitFor(() => {
      expect(screen.getByTestId('domain-list-item-domain-empty')).toBeInTheDocument()
      expect(screen.queryByTestId('domain-list-item-domain-ready')).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('domain-list-item-domain-empty'))

    await waitFor(() => {
      expect(screen.getByTestId('domain-detail-panel')).toBeInTheDocument()
      expect(within(screen.getByTestId('domain-detail-panel')).getByText('空领域')).toBeInTheDocument()
      expect(screen.getByTestId('domain-cube-list-panel')).toBeInTheDocument()
      expect(screen.getByText('活跃 Cube')).toBeInTheDocument()
      expect(screen.getByText('悬挂引用')).toBeInTheDocument()
      expect(screen.getByTestId('domain-cube-list-item-lesson_progress')).toBeInTheDocument()
      expect(screen.getByTestId('domain-cube-list-item-answer_records')).toBeInTheDocument()
    })
  })

  it('支持目录创建成功后的目录切换，以及空目录删除', async () => {
    semanticApiMocks.listDomainCatalogs.mockResolvedValue({
      data: {
        catalogs: [
          {
            code: 'default',
            name: '默认目录',
            description: '默认目录',
            status: 'active',
            domain_count: 1,
            active_count: 1,
            draft_count: 0,
            domains: [],
          },
          {
            code: 'ops',
            name: '运维目录',
            description: '运维域目录',
            status: 'draft',
            domain_count: 0,
            active_count: 0,
            draft_count: 0,
            domains: [],
          },
        ],
      },
    })
    semanticApiMocks.listDomains.mockResolvedValue({
      data: {
        domains: [],
        total: 0,
        page: 1,
        page_size: 10,
        page_count: 0,
      },
    })
    semanticApiMocks.describeDomain.mockResolvedValue({
      data: {
        id: 'domain-empty',
        code: 'empty',
        name: '空领域',
        description: '',
        status: 'draft',
        catalog_code: 'default',
        catalog_name: '默认目录',
        cubes: [],
        joins: [],
        state_summary: {},
      },
    })
    semanticApiMocks.deleteCatalog.mockResolvedValueOnce({ data: {} })

    renderPage()
    await screen.findByRole('heading', { name: '领域目录' })

    fireEvent.click(screen.getByTestId('catalog-create-trigger'))
    fireEvent.click(await screen.findByRole('button', { name: 'mock catalog success' }))

    await waitFor(() => {
      expect(within(screen.getByTestId('catalog-summary-panel')).getByText('运维目录')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('catalog-delete-trigger'))
    fireEvent.click(await screen.findByRole('button', { name: '确认删除' }))

    await waitFor(() => {
      expect(semanticApiMocks.deleteCatalog).toHaveBeenCalledWith('ops')
    })
  })

  it('目录删除失败时提示错误信息', async () => {
    semanticApiMocks.listDomainCatalogs.mockResolvedValue({
      data: {
        catalogs: [
          {
            code: 'ops',
            name: '运维目录',
            description: '运维目录',
            status: 'draft',
            domain_count: 0,
            active_count: 0,
            draft_count: 0,
            domains: [],
          },
        ],
      },
    })
    semanticApiMocks.listDomains.mockResolvedValue({
      data: {
        domains: [],
        total: 0,
        page: 1,
        page_size: 10,
        page_count: 0,
      },
    })
    semanticApiMocks.describeDomain.mockResolvedValue({
      data: {
        id: 'domain-empty',
        code: 'empty',
        name: '空领域',
        description: '',
        status: 'draft',
        catalog_code: 'ops',
        catalog_name: '运维目录',
        cubes: [],
        joins: [],
        state_summary: {},
      },
    })
    semanticApiMocks.deleteCatalog.mockRejectedValueOnce(new Error('目录仍被引用'))

    renderPage(['/?catalog=ops'])
    await screen.findByRole('heading', { name: '领域目录' })

    fireEvent.click(screen.getByTestId('catalog-delete-trigger'))
    fireEvent.click(await screen.findByRole('button', { name: '确认删除' }))

    await waitFor(() => {
      expect(semanticApiMocks.toast).toHaveBeenCalledWith({
        title: '删除目录失败',
        description: '目录仍被引用',
        variant: 'destructive',
      })
    })
  })

  it('支持关闭目录编辑弹窗并切换分页大小', async () => {
    const user = userEvent.setup()
    installSelectPolyfills()

    semanticApiMocks.listDomainCatalogs.mockResolvedValue({
      data: {
        catalogs: [
          {
            code: 'default',
            name: '默认目录',
            description: '默认目录',
            status: 'active',
            domain_count: 2,
            active_count: 1,
            draft_count: 1,
            domains: [],
          },
        ],
      },
    })
    semanticApiMocks.listDomains.mockResolvedValue({
      data: {
        domains: [
          {
            id: 'domain-1',
            code: 'learning_domain',
            name: '学习领域',
            description: '学习场景',
            status: 'draft',
            cube_count: 0,
            join_count: 0,
            catalog_code: 'default',
            catalog_name: '默认目录',
            state_summary: {},
          },
          {
            id: 'domain-2',
            code: 'teaching_domain',
            name: '教学领域',
            description: '教学场景',
            status: 'active',
            cube_count: 1,
            join_count: 1,
            catalog_code: 'default',
            catalog_name: '默认目录',
            state_summary: {},
          },
        ],
        total: 2,
        page: 1,
        page_size: 10,
        page_count: 1,
      },
    })
    semanticApiMocks.describeDomain.mockResolvedValue({
      data: {
        id: 'domain-1',
        code: 'learning_domain',
        name: '学习领域',
        description: '学习场景',
        status: 'draft',
        catalog_code: 'default',
        catalog_name: '默认目录',
        cubes: [],
        joins: [],
        state_summary: {},
      },
    })

    renderPage()

    await screen.findByRole('heading', { name: '领域目录' })

    fireEvent.click(screen.getByTestId('catalog-edit-trigger'))
    expect(await screen.findByTestId('mock-catalog-editor')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'close catalog editor' }))
    await waitFor(() => {
      expect(screen.queryByTestId('mock-catalog-editor')).not.toBeInTheDocument()
    })

    const pageSizeSelect = screen.getAllByRole('combobox').slice(-1)[0]
    if (!pageSizeSelect) {
      throw new Error('未找到领域目录分页大小选择器')
    }

    await user.click(pageSizeSelect)
    await user.click(await screen.findByText('20 条'))

    await waitFor(() => {
      expect(screen.getAllByRole('combobox').slice(-1)[0]).toHaveTextContent('20 条')
    })
  })

  it('未选择目录时展示目录级空态摘要', async () => {
    semanticApiMocks.listDomainCatalogs.mockResolvedValue({
      data: {
        catalogs: [],
      },
    })
    semanticApiMocks.listDomains.mockResolvedValue({
      data: {
        domains: [],
        total: 0,
        page: 1,
        page_size: 10,
        page_count: 0,
      },
    })
    semanticApiMocks.describeDomain.mockResolvedValue({
      data: {
        id: 'unused',
        code: 'unused',
        name: 'unused',
        description: '',
        status: 'draft',
        catalog_code: 'default',
        catalog_name: '默认目录',
        cubes: [],
        joins: [],
        state_summary: {},
      },
    })

    renderPage()

    await screen.findByRole('heading', { name: '领域目录' })
    expect(within(screen.getByTestId('catalog-summary-panel')).getByText('未选择目录')).toBeInTheDocument()
    expect(screen.getByText('当前未选择目录')).toBeInTheDocument()
  })

  it('非法分页参数会回退到默认值', async () => {
    semanticApiMocks.listDomainCatalogs.mockResolvedValue({
      data: {
        catalogs: [
          {
            code: 'default',
            name: '默认目录',
            description: '默认目录',
            status: 'active',
            domain_count: 1,
            active_count: 1,
            draft_count: 0,
            domains: [],
          },
        ],
      },
    })
    semanticApiMocks.listDomains.mockResolvedValue({
      data: {
        domains: [
          {
            id: 'domain-1',
            code: 'learning_domain',
            name: '学习领域',
            description: '学习场景',
            status: 'active',
            cube_count: 1,
            join_count: 1,
            catalog_code: 'default',
            catalog_name: '默认目录',
            state_summary: {},
          },
        ],
        total: 1,
        page: 1,
        page_size: 10,
        page_count: 1,
      },
    })
    semanticApiMocks.describeDomain.mockResolvedValue({
      data: {
        id: 'domain-1',
        code: 'learning_domain',
        name: '学习领域',
        description: '学习场景',
        status: 'active',
        catalog_code: 'default',
        catalog_name: '默认目录',
        cubes: ['lesson_progress'],
        joins: [{ id: 'join-active' }],
        state_summary: {},
      },
    })

    renderPage(['/?page=0&page_size=oops'])
    await screen.findByRole('heading', { name: '领域目录' })

    expect(within(screen.getByTestId('domain-list-context-bar')).getByText('1 / 1')).toBeInTheDocument()
    expect(screen.getAllByRole('combobox').slice(-1)[0]).toHaveTextContent('10')
  })

  it('根据领域状态切换右侧健康摘要', async () => {
    const domains = [
      {
        id: 'domain-active',
        code: 'active_domain',
        name: '成熟领域',
        description: '已发布领域',
        status: 'active',
        cube_count: 1,
        join_count: 1,
        catalog_code: 'default',
        catalog_name: '默认目录',
        state_summary: {},
      },
      {
        id: 'domain-draft',
        code: 'draft_domain',
        name: '草稿领域',
        description: '待发布领域',
        status: 'draft',
        cube_count: 1,
        join_count: 1,
        catalog_code: 'default',
        catalog_name: '默认目录',
        state_summary: {},
      },
    ]

    semanticApiMocks.listDomainCatalogs.mockResolvedValue({
      data: {
        catalogs: [
          {
            code: 'default',
            name: '默认目录',
            description: '默认目录',
            status: 'active',
            domain_count: 2,
            active_count: 1,
            draft_count: 0,
            domains,
          },
        ],
      },
    })
    semanticApiMocks.listDomains.mockResolvedValue({
      data: {
        domains,
        total: 2,
        page: 1,
        page_size: 10,
        page_count: 1,
      },
    })
    semanticApiMocks.describeDomain.mockImplementation(async (id: string) => ({
      data: id === 'domain-active'
        ? {
            ...domains[0],
            cubes: ['lesson_progress'],
            joins: [{ id: 'join-active' }],
          }
        : {
            ...domains[1],
            cubes: ['draft_cube'],
            joins: [{ id: 'join-draft' }],
          },
    }))

    renderPage()

    await screen.findByRole('heading', { name: '领域目录' })

    fireEvent.click(screen.getByTestId('domain-list-item-domain-active'))
    await screen.findByText('当前领域已发布')

    fireEvent.click(screen.getByTestId('domain-list-item-domain-draft'))
    await screen.findByText('当前领域为草稿')
  })

  it('支持目录切换并更新搜索关键字', async () => {
    semanticApiMocks.listDomainCatalogs.mockResolvedValue({
      data: {
        catalogs: [
          {
            code: 'default',
            name: '默认目录',
            description: '默认目录',
            status: 'active',
            domain_count: 1,
            active_count: 1,
            draft_count: 0,
            domains: [],
          },
          {
            code: 'ops',
            name: '运维目录',
            description: '运维目录',
            status: 'draft',
            domain_count: 1,
            active_count: 0,
            draft_count: 1,
            domains: [],
          },
        ],
      },
    })
    semanticApiMocks.listDomains.mockResolvedValue({
      data: {
        domains: [
          {
            id: 'domain-ops',
            code: 'ops_domain',
            name: '运维领域',
            description: '运维语义建模',
            status: 'draft',
            cube_count: 1,
            join_count: 1,
            catalog_code: 'ops',
            catalog_name: '运维目录',
            state_summary: {},
          },
        ],
        total: 1,
        page: 1,
        page_size: 10,
        page_count: 1,
      },
    })
    semanticApiMocks.describeDomain.mockResolvedValue({
      data: {
        id: 'domain-ops',
        code: 'ops_domain',
        name: '运维领域',
        description: '运维语义建模',
        status: 'draft',
        catalog_code: 'ops',
        catalog_name: '运维目录',
        cubes: ['ops_cube'],
        joins: [{ id: 'join-ops' }],
        state_summary: {},
      },
    })

    renderPage()

    await screen.findByRole('heading', { name: '领域目录' })

    fireEvent.click(screen.getByTestId('domain-catalog-ops'))
    await waitFor(() => {
      expect(within(screen.getByTestId('domain-list-context-bar')).getByText('运维目录')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByTestId('domain-list-search'), { target: { value: '运维' } })
    await waitFor(() => {
      expect(screen.getByTestId('domain-list-search')).toHaveValue('运维')
    })
  })
})
