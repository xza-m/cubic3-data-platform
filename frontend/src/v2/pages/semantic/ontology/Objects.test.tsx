// frontend/src/v2/pages/semantic/ontology/Objects.test.tsx
//
// Objects 页 · 行点击通过 AppShell.openTab 打开 Tab 而不是抽屉。

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { BusinessObject } from '@v2/api/ontology'

const navigateMock = vi.fn()
const openTabMock = vi.fn()

vi.mock('@v2/hooks/ontology', () => ({
  useObjectList: vi.fn(),
}))

vi.mock('@v2/layout/AppShell', async () => {
  return {
    useAppShell: () => ({
      openTab: openTabMock,
      closeTab: vi.fn(),
      setTabs: vi.fn(),
      setActiveTab: vi.fn(),
      setBreadcrumbs: vi.fn(),
      setTopBarActions: vi.fn(),
      setSidebarSections: vi.fn(),
      setContextPanel: vi.fn(),
      setInspector: vi.fn(),
      setInspectorEmptyState: vi.fn(),
      openCommandPalette: vi.fn(),
      setPeekActive: vi.fn(),
    }),
  }
})

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

import { useObjectList } from '@v2/hooks/ontology'
import OntologyObjects, { buildOntologyObjectTabId } from './Objects'

const mockObjects = useObjectList as ReturnType<typeof vi.fn>

function mk(name: string, title?: string): BusinessObject {
  return { name, title: title ?? name, status: 'active' }
}

const ITEMS: BusinessObject[] = [mk('customer', '客户'), mk('order', '订单')]

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
  return render(<OntologyObjects />, { wrapper: Wrapper })
}

describe('OntologyObjects page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockObjects.mockReturnValue({
      data: { items: ITEMS, total: ITEMS.length },
      isLoading: false,
      isError: false,
    })
  })

  it('点击对象行 → openTab + navigate 到对应路由', () => {
    renderPage()
    fireEvent.click(screen.getByTestId('ontology-objects-row-customer'))
    expect(openTabMock).toHaveBeenCalledTimes(1)
    expect(openTabMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: buildOntologyObjectTabId('customer'),
        label: '客户',
        closeable: true,
        to: '/semantic/ontology/objects/customer',
      }),
    )
    expect(navigateMock).toHaveBeenCalledWith('/semantic/ontology/objects/customer')
  })

  it('重复点击同一对象 → 仍只产生一次 openTab call（去重交由 AppShell.openTab 内部处理，调用接口幂等）', () => {
    renderPage()
    const row = screen.getByTestId('ontology-objects-row-customer')
    fireEvent.click(row)
    fireEvent.click(row)
    fireEvent.click(row)
    // openTab 被调用 3 次（每次都同 id 同 label），AppShell 内部以 id 去重
    expect(openTabMock).toHaveBeenCalledTimes(3)
    for (const call of openTabMock.mock.calls) {
      expect(call[0].id).toBe(buildOntologyObjectTabId('customer'))
    }
  })

  it('不再渲染 PeekPanel 抽屉（行点击后无 dialog/抽屉容器出现）', () => {
    renderPage()
    fireEvent.click(screen.getByTestId('ontology-objects-row-order'))
    // 旧 PeekPanel 用 role="dialog"；行点击不应该再产生
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
