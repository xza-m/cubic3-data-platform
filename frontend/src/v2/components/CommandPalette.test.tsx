import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { CommandPalette } from './CommandPalette'

vi.mock('@v2/api/search', () => ({
  globalSearch: vi.fn(),
}))

function renderPalette() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: 0 }, mutations: { retry: 0 } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
  return render(<CommandPalette open onClose={() => {}} />, { wrapper })
}

describe('CommandPalette', () => {
  it('导航命令只展示动作名称，不暴露内部路由或泛化说明', () => {
    renderPalette()

    expect(screen.getByRole('option', { name: /回到总览/ })).toBeInTheDocument()
    expect(screen.queryByText('/dashboard')).not.toBeInTheDocument()
    expect(screen.queryByText('/semantic/ontology')).not.toBeInTheDocument()
    expect(screen.queryByText('跳转到模块')).not.toBeInTheDocument()
  })
})
