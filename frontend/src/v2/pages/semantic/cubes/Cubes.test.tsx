// frontend/src/v2/pages/semantic/cubes/Cubes.test.tsx
//
// Cube 列表分页回归测试。

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { CubeSummary } from '@v2/api/semantic'

vi.mock('@v2/layout/AppShell', () => ({
  useAppShell: () => ({
    setBreadcrumbs: vi.fn(),
    setTopBarActions: vi.fn(),
    setContextPanel: vi.fn(),
  }),
}))

vi.mock('@v2/hooks/semantic', () => ({
  useCubeList: vi.fn(),
  useCubeDetail: vi.fn(),
}))

import { useCubeList, useCubeDetail } from '@v2/hooks/semantic'
import Cubes from './Cubes'

const mockCubeList = useCubeList as ReturnType<typeof vi.fn>
const mockCubeDetail = useCubeDetail as ReturnType<typeof vi.fn>

function makeCube(index: number): CubeSummary {
  return {
    name: `cube_${String(index).padStart(2, '0')}`,
    title: `Cube ${index}`,
    description: `Cube ${index} description`,
    domain_name: 'teaching',
    status: 'active',
    fact_table: `dws_cube_${index}`,
    dimension_count: index,
    measure_count: index + 1,
    last_modified_at: null,
  }
}

function renderPage(cubes: CubeSummary[]) {
  mockCubeList.mockReturnValue({
    data: {
      cubes,
      total: cubes.length,
      page: 1,
      page_size: cubes.length,
      page_count: 1,
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  })
  mockCubeDetail.mockReturnValue({ data: null, isLoading: false, isError: false })

  return render(
    <MemoryRouter>
      <Cubes />
    </MemoryRouter>,
  )
}

describe('Cubes page pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('超过 20 个 Cube 时分页展示，并可切到下一页', () => {
    renderPage(Array.from({ length: 21 }, (_, i) => makeCube(i + 1)))

    expect(screen.getByText('Cube 1')).toBeInTheDocument()
    expect(screen.queryByText('Cube 21')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '下一页' }))

    expect(screen.queryByText('Cube 1')).toBeNull()
    expect(screen.getByText('Cube 21')).toBeInTheDocument()
    expect(screen.getByText('21-21 / 21 条')).toBeInTheDocument()
  })
})
