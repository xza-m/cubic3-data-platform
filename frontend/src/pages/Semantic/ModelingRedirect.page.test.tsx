import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ModelingRedirect from './ModelingRedirect'

const modelingRedirectMocks = vi.hoisted(() => ({
  useDomainModelingEntry: vi.fn(),
}))

vi.mock('@/hooks/semantic-ia', () => ({
  useDomainModelingEntry: modelingRedirectMocks.useDomainModelingEntry,
}))

vi.mock('./DomainModelingEntry', () => ({
  default: () => <div data-testid="domain-modeling-entry">domain modeling entry</div>,
}))

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} />,
}))

function renderPage(initialEntry = '/semantic/modeling') {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/semantic/modeling" element={<ModelingRedirect />} />
          <Route path="/semantic/domains/:id" element={<div data-testid="domain-workspace">domain workspace</div>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('ModelingRedirect page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('存在草稿或已发布领域时跳转到领域工作台', async () => {
    modelingRedirectMocks.useDomainModelingEntry.mockReturnValue({
      draftDomains: [{ id: 'draft-1', code: 'answer-analysis' }],
      publishedDomains: [],
      isLoading: false,
    })

    renderPage()

    expect(await screen.findByTestId('domain-workspace')).toBeInTheDocument()
  })

  it('没有任何领域时停留在领域建模入口页', async () => {
    modelingRedirectMocks.useDomainModelingEntry.mockReturnValue({
      draftDomains: [],
      publishedDomains: [],
      isLoading: false,
    })

    renderPage()

    expect(await screen.findByTestId('domain-modeling-entry')).toBeInTheDocument()
  })
})
