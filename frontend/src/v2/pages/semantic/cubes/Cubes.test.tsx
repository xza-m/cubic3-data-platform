// frontend/src/v2/pages/semantic/cubes/Cubes.test.tsx
//
// Cube 列表分页回归测试。

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { CubeSummary } from '@v2/api/semantic'

const appShellMocks = vi.hoisted(() => ({
  setBreadcrumbs: vi.fn(),
  setTopBarActions: vi.fn(),
  setContextPanel: vi.fn(),
}))

vi.mock('@v2/layout/AppShell', () => ({
  useAppShell: () => appShellMocks,
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

  it('默认不设置重复的右侧上下文面板', () => {
    renderPage([makeCube(1)])

    expect(appShellMocks.setContextPanel).toHaveBeenCalledWith(null)
    expect(appShellMocks.setContextPanel).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Cube' }))
  })

  it('顶部摘要不再展示概念链路', () => {
    renderPage([
      makeCube(1),
      { ...makeCube(2), status: 'review' },
      { ...makeCube(3), status: 'draft' },
    ])

    expect(screen.getByText('维护可复用的数据语义资产，统一管理事实表、维度、度量和发布状态。')).toBeInTheDocument()
    expect(screen.getByText('Cube 总数')).toBeInTheDocument()
    expect(screen.getAllByText('已上线').length).toBeGreaterThan(0)
    expect(screen.getAllByText('待审核').length).toBeGreaterThan(0)
    expect(screen.getAllByText('草稿').length).toBeGreaterThan(0)
    expect(screen.queryByText('双层语义建模')).not.toBeInTheDocument()
    expect(screen.queryByText(/物理底座/)).not.toBeInTheDocument()
    expect(screen.queryByText(/业务语义层/)).not.toBeInTheDocument()
  })

  it('卡片展示业务标题，不直接暴露 Cube 技术标识', () => {
    renderPage([makeCube(1)])

    expect(screen.getByText('Cube 1')).toBeInTheDocument()
    expect(screen.getByText('Cube 1 description')).toBeInTheDocument()
    expect(screen.getByText('teaching')).toBeInTheDocument()
    expect(screen.queryByText('cube_01')).not.toBeInTheDocument()
    expect(screen.queryByText('dws_cube_1')).not.toBeInTheDocument()
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
