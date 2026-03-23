import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import CubeStudio from './CubeStudio'

const semanticApiMocks = vi.hoisted(() => ({
  listDomains: vi.fn(),
  describeCube: vi.fn(),
  createCubeDraftFromTable: vi.fn(),
  createCube: vi.fn(),
  updateCube: vi.fn(),
  activateCube: vi.fn(),
  deprecateCube: vi.fn(),
}))

const datasourceMocks = vi.hoisted(() => ({
  getDataSources: vi.fn(),
}))

vi.mock('@/api/semantic', async () => {
  const actual = await vi.importActual<typeof import('@/api/semantic')>('@/api/semantic')
  return {
    ...actual,
    listDomains: semanticApiMocks.listDomains,
    describeCube: semanticApiMocks.describeCube,
    createCubeDraftFromTable: semanticApiMocks.createCubeDraftFromTable,
    createCube: semanticApiMocks.createCube,
    updateCube: semanticApiMocks.updateCube,
    activateCube: semanticApiMocks.activateCube,
    deprecateCube: semanticApiMocks.deprecateCube,
  }
})

vi.mock('@/api/datasources', () => ({
  getDataSources: datasourceMocks.getDataSources,
}))

vi.mock('@/components/business', () => ({
  SchemaBrowser: ({ onSelect }: { onSelect?: (node: any) => void }) => (
    <div data-testid="schema-browser">
      <button
        type="button"
        onClick={() => onSelect?.({
          type: 'table',
          name: 'answer_records',
          metadata: {
            database: 'dw',
            schema: 'learning',
            table: 'answer_records',
          },
        })}
      >
        选择物理表
      </button>
    </div>
  ),
  useToast: () => ({
    toast: vi.fn(),
  }),
}))

vi.mock('@/hooks/useUnsavedChangesPrompt', () => ({
  useUnsavedChangesPrompt: vi.fn(),
}))

function renderPage(initialEntry: string) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/semantic/cubes/new" element={<CubeStudio />} />
          <Route path="/semantic/cubes/:name/edit" element={<CubeStudio />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('CubeStudio page', () => {
  it('新建模式显示六步工作流并默认聚焦来源绑定', async () => {
    datasourceMocks.getDataSources.mockResolvedValueOnce({
      data: {
        items: [{ id: 1, name: '学习数仓', source_type: 'maxcompute' }],
      },
    })
    semanticApiMocks.listDomains.mockResolvedValueOnce({
      data: {
        domains: [{ id: 'learning', code: 'learning', name: '学习领域' }],
      },
    })

    renderPage('/semantic/cubes/new')

    await screen.findByRole('heading', { name: '新建 Cube' })
    expect(screen.getByTestId('cube-studio-step-1')).toBeInTheDocument()
    expect(screen.getByTestId('cube-studio-step-6')).toBeInTheDocument()
    expect(screen.getAllByText('来源绑定').length).toBeGreaterThan(0)
    expect(screen.getByTestId('schema-browser')).toBeInTheDocument()
  })

  it('切换到语义规则步骤后显示规则表单', async () => {
    datasourceMocks.getDataSources.mockResolvedValueOnce({
      data: {
        items: [{ id: 1, name: '学习数仓', source_type: 'maxcompute' }],
      },
    })
    semanticApiMocks.listDomains.mockResolvedValueOnce({
      data: {
        domains: [{ id: 'learning', code: 'learning', name: '学习领域' }],
      },
    })

    renderPage('/semantic/cubes/new')

    await screen.findByRole('heading', { name: '新建 Cube' })
    fireEvent.click(screen.getByTestId('cube-studio-step-4'))

    expect(screen.getAllByText('语义规则').length).toBeGreaterThan(0)
    expect(screen.getByText('默认粒度')).toBeInTheDocument()
    expect(screen.getByText('实体主键')).toBeInTheDocument()
  })
})
