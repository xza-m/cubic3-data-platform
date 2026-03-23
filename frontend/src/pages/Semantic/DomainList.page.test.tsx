import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import DomainList from './DomainList'

const semanticApiMocks = vi.hoisted(() => ({
  listDomainCatalogs: vi.fn(),
  listDomains: vi.fn(),
  deleteCatalog: vi.fn(),
}))

vi.mock('@/api/semantic', async () => {
  const actual = await vi.importActual<typeof import('@/api/semantic')>('@/api/semantic')
  return {
    ...actual,
    listDomainCatalogs: semanticApiMocks.listDomainCatalogs,
    listDomains: semanticApiMocks.listDomains,
    deleteCatalog: semanticApiMocks.deleteCatalog,
  }
})

vi.mock('@/components/business', async () => {
  const actual = await vi.importActual<typeof import('@/components/business')>('@/components/business')
  return {
    ...actual,
    useToast: () => ({ toast: vi.fn() }),
  }
})

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <DomainList />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('DomainList page', () => {
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

    renderPage()
    await screen.findByRole('heading', { name: '领域目录' })

    const trigger = screen.getByTestId('domain-create-trigger')
    expect(trigger).toHaveAttribute('href', '/semantic/modeling')
  })
})
