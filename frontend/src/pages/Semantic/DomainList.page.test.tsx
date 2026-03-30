import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DomainList from './DomainList'

const governanceMocks = vi.hoisted(() => ({
  listDomainCatalogs: vi.fn(),
  listDomains: vi.fn(),
}))

vi.mock('@/api/semantic', async () => {
  const actual = await vi.importActual<typeof import('@/api/semantic')>('@/api/semantic')
  return {
    ...actual,
    listDomainCatalogs: governanceMocks.listDomainCatalogs,
    listDomains: governanceMocks.listDomains,
  }
})

function renderPage(initialEntry = '/semantic/domains') {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/semantic/domains" element={<DomainList />} />
          <Route path="/semantic/domains/:id" element={<div data-testid="merged-domain-workspace">merged workspace</div>} />
          <Route path="/semantic/modeling" element={<div data-testid="modeling-fallback">modeling fallback</div>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('DomainList page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('将领域目录入口重定向到合并后的领域工作台目录模式', async () => {
    governanceMocks.listDomainCatalogs.mockResolvedValue({
      data: {
        catalogs: [
          {
            code: 'default',
            name: '默认目录',
            domains: [
              {
                id: 'domain-learning',
                code: 'learning',
                name: '学习领域',
              },
            ],
          },
        ],
      },
    })
    governanceMocks.listDomains.mockResolvedValue({
      data: {
        domains: [
          {
            id: 'domain-learning',
            code: 'learning',
            name: '学习领域',
          },
        ],
        total: 1,
        page: 1,
        page_size: 999,
        page_count: 1,
      },
    })

    renderPage('/semantic/domains?selected=domain-learning')

    expect(await screen.findByTestId('merged-domain-workspace')).toBeInTheDocument()
  })
})
