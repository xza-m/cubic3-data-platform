// frontend/src/v2/pages/semantic/domains/Domains.test.tsx
//
// 业务域列表分页回归测试。

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { DomainSummary } from '@v2/api/semantic'

vi.mock('@v2/layout/AppShell', () => ({
  useAppShell: () => ({
    setBreadcrumbs: vi.fn(),
    setTopBarActions: vi.fn(),
  }),
}))

vi.mock('@v2/hooks/semantic', () => ({
  useDomainList: vi.fn(),
  useCreateDomain: vi.fn(),
}))

import { useDomainList, useCreateDomain } from '@v2/hooks/semantic'
import Domains from './Domains'

const mockDomainList = useDomainList as ReturnType<typeof vi.fn>
const mockCreateDomain = useCreateDomain as ReturnType<typeof vi.fn>

function makeDomain(index: number): DomainSummary {
  return {
    id: `domain_${String(index).padStart(2, '0')}`,
    code: `domain_${String(index).padStart(2, '0')}`,
    name: `domain_${String(index).padStart(2, '0')}`,
    title: `业务域 ${index}`,
    description: `业务域 ${index} 描述`,
    status: 'draft',
  }
}

function renderPage(domains: DomainSummary[]) {
  mockDomainList.mockReturnValue({
    data: {
      domains,
      total: domains.length,
      page: 1,
      page_size: domains.length,
      page_count: 1,
    },
    isLoading: false,
    isError: false,
  })
  mockCreateDomain.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })

  return render(
    <MemoryRouter>
      <Domains />
      <LocationProbe />
    </MemoryRouter>,
  )
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

describe('Domains page pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('超过 20 个业务域时分页展示，并可切到下一页', () => {
    renderPage(Array.from({ length: 21 }, (_, i) => makeDomain(i + 1)))

    expect(screen.getByText('业务域 1')).toBeInTheDocument()
    expect(screen.queryByText('业务域 21')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '下一页' }))

    expect(screen.queryByText('业务域 1')).toBeNull()
    expect(screen.getByText('业务域 21')).toBeInTheDocument()
    expect(screen.getByText('21-21 / 21 条')).toBeInTheDocument()
  })

  it('点击业务上下文时使用稳定 id 跳转，不使用中文展示名', () => {
    renderPage([
      {
        id: 'academic',
        code: 'academic',
        name: '学业分析域',
        title: null,
        description: '学业分析和学习行为相关的业务上下文',
        status: 'active',
      },
    ])

    fireEvent.click(screen.getByRole('button', { name: /学业分析域/ }))

    expect(screen.getByTestId('location')).toHaveTextContent('/semantic/domains/academic')
  })
})
