import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import DomainCanvas from './DomainCanvas'

vi.mock('@v2/layout/AppShell', () => ({
  useAppShell: () => ({
    setBreadcrumbs: vi.fn(),
    setTopBarActions: vi.fn(),
    setContextPanel: vi.fn(),
  }),
}))

vi.mock('@v2/hooks/semantic', () => ({
  useDomainDetail: vi.fn(),
  useDomainCanvas: vi.fn(),
  useDomainList: vi.fn(),
  usePublishDomain: vi.fn(),
  useDomainPublishHistory: vi.fn(),
}))

import {
  useDomainCanvas,
  useDomainDetail,
  useDomainList,
  useDomainPublishHistory,
  usePublishDomain,
} from '@v2/hooks/semantic'

const mockUseDomainDetail = useDomainDetail as ReturnType<typeof vi.fn>
const mockUseDomainCanvas = useDomainCanvas as ReturnType<typeof vi.fn>
const mockUseDomainList = useDomainList as ReturnType<typeof vi.fn>
const mockUsePublishDomain = usePublishDomain as ReturnType<typeof vi.fn>
const mockUseDomainPublishHistory = useDomainPublishHistory as ReturnType<typeof vi.fn>

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderDomainCanvas(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/semantic/domains/:id"
          element={
            <>
              <DomainCanvas />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('DomainCanvas', () => {
  it('展示名旧链接加载失败时，自动跳转到稳定 id 路由', async () => {
    mockUseDomainDetail.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    mockUseDomainCanvas.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    mockUseDomainList.mockReturnValue({
      data: {
        domains: [
          {
            id: 'academic',
            code: 'academic',
            name: '学业分析域',
            description: '学业分析和学习行为相关的业务上下文',
            status: 'active',
          },
        ],
      },
      isLoading: false,
      isError: false,
    })
    mockUsePublishDomain.mockReturnValue({ mutate: vi.fn(), isPending: false })
    mockUseDomainPublishHistory.mockReturnValue({ data: { records: [] }, isLoading: false })

    renderDomainCanvas('/semantic/domains/学业分析域')

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/semantic/domains/academic')
    })
  })
})
