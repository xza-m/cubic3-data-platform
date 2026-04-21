import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CubeSummary, CubeDetail } from '@/api/semantic'
import { WorkbenchHeader } from './WorkbenchHeader'
import { WorkbenchResumePanel } from './WorkbenchResumePanel'
import { WorkbenchModelingTab } from './WorkbenchModelingTab'

vi.mock('./WorkbenchCubeDraftStarter', () => ({
  WorkbenchCubeDraftStarter: () => <div data-testid="mock-draft-starter" />,
}))

// lazy-import after mock registration
const { WorkbenchStartPanel } = await import('./WorkbenchStartPanel')
const { CubeStudioStepRail } = await import('../CubeStudio/CubeStudioStepRail')

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

const mockCube: CubeSummary = {
  name: 'test_cube',
  title: '测试 Cube',
  description: '测试用',
  table: 'orders',
  domain_ids: [],
  domains: [],
  domain_count: 0,
  status: 'draft',
  dimensions: ['order_id', 'order_date'],
  measures: ['total_amount'],
  dimension_count: 5,
  measure_count: 3,
}

const mockCubeDetail: CubeDetail = {
  name: 'test_cube',
  title: '测试 Cube',
  description: '测试用',
  table: 'orders',
  domain_ids: [],
  domains: [],
  domain_count: 0,
  status: 'draft',
  dimensions: {
    order_id: { title: '订单ID', type: 'string', sql: 'order_id', description: '订单编号' },
    order_date: { title: '下单日期', type: 'time', sql: 'order_date', description: '下单时间' },
  },
  measures: {
    total_amount: { title: '总金额', type: 'sum', sql: 'amount', description: '订单总额' },
  },
  segments: {},
  joins: {},
}

/* ------------------------------------------------------------------ */
/*  WorkbenchHeader                                                    */
/* ------------------------------------------------------------------ */
describe('WorkbenchHeader', () => {
  it('渲染标题「语义工作台」和 cube 名称', () => {
    render(<WorkbenchHeader cube={mockCube} activeTab="modeling" onTabChange={() => {}} />, { wrapper })

    expect(screen.getAllByText('语义工作台').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('测试 Cube')).toBeInTheDocument()
    expect(screen.getByText('test_cube')).toBeInTheDocument()
  })

  it('点击 tab 按钮触发 onTabChange', () => {
    const onChange = vi.fn()
    render(<WorkbenchHeader cube={mockCube} activeTab="modeling" onTabChange={onChange} />, { wrapper })

    fireEvent.click(screen.getByTestId('devtools-tab-preview'))
    expect(onChange).toHaveBeenCalledWith('preview')

    fireEvent.click(screen.getByTestId('devtools-tab-yaml'))
    expect(onChange).toHaveBeenCalledWith('yaml')
  })

  it('当前 active tab 显示正确的 data-state', () => {
    render(<WorkbenchHeader cube={mockCube} activeTab="yaml" onTabChange={() => {}} />, { wrapper })

    expect(screen.getByTestId('devtools-tab-yaml')).toHaveAttribute('data-state', 'active')
    expect(screen.getByTestId('devtools-tab-modeling')).toHaveAttribute('data-state', 'inactive')
  })
})

/* ------------------------------------------------------------------ */
/*  WorkbenchResumePanel                                               */
/* ------------------------------------------------------------------ */
describe('WorkbenchResumePanel', () => {
  it('渲染标题和描述', () => {
    render(
      <WorkbenchResumePanel title="继续工作" description="恢复上下文" cubes={[]} emptyText="暂无" />,
      { wrapper },
    )
    expect(screen.getByText('继续工作')).toBeInTheDocument()
    expect(screen.getByText('恢复上下文')).toBeInTheDocument()
  })

  it('有 cubes 时渲染列表项（最多 4 个）', () => {
    const cubes = Array.from({ length: 6 }, (_, i) => ({
      ...mockCube,
      name: `cube_${i}`,
      title: `Cube ${i}`,
    }))
    render(
      <WorkbenchResumePanel title="标题" description="说明" cubes={cubes} emptyText="暂无" />,
      { wrapper },
    )

    expect(screen.getByText('Cube 0')).toBeInTheDocument()
    expect(screen.getByText('Cube 3')).toBeInTheDocument()
    expect(screen.queryByText('Cube 4')).not.toBeInTheDocument()
  })

  it('空数组时渲染 emptyText', () => {
    render(
      <WorkbenchResumePanel title="标题" description="说明" cubes={[]} emptyText="没有任何数据" />,
      { wrapper },
    )
    expect(screen.getByText('没有任何数据')).toBeInTheDocument()
  })

  it('未知状态时回退到未标记和 outline 徽标', () => {
    render(
      <WorkbenchResumePanel
        title="标题"
        description="说明"
        cubes={[{ ...mockCube, name: 'unknown_cube', title: '未知状态 Cube', status: undefined }]}
        emptyText="暂无"
      />,
      { wrapper },
    )

    expect(screen.getByText('未标记')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /未知状态 Cube/ })).toHaveAttribute(
      'href',
      '/semantic/workbench?cube=unknown_cube',
    )
  })
})

/* ------------------------------------------------------------------ */
/*  WorkbenchModelingTab                                               */
/* ------------------------------------------------------------------ */
describe('WorkbenchModelingTab', () => {
  it('渲染 cube 名称和来源信息', () => {
    render(<WorkbenchModelingTab cube={mockCube} cubeDetail={mockCubeDetail} />, { wrapper })

    expect(screen.getByText(/来源/)).toBeInTheDocument()
  })

  it('有 dimensions 时渲染维度列表', () => {
    render(<WorkbenchModelingTab cube={mockCube} cubeDetail={mockCubeDetail} />, { wrapper })

    expect(screen.getByText('订单ID')).toBeInTheDocument()
    expect(screen.getByText('总金额')).toBeInTheDocument()
  })

  it('无 dimensions 时显示空状态文案', () => {
    const emptyDetail: CubeDetail = {
      ...mockCubeDetail,
      dimensions: {},
      measures: {},
    }
    render(
      <WorkbenchModelingTab cube={{ ...mockCube, dimension_count: 0, measure_count: 0 }} cubeDetail={emptyDetail} />,
      { wrapper },
    )

    expect(screen.getAllByText('暂无数据')).toHaveLength(2)
  })
})

/* ------------------------------------------------------------------ */
/*  WorkbenchStartPanel                                                */
/* ------------------------------------------------------------------ */
describe('WorkbenchStartPanel', () => {
  it('渲染标题「语义工作台」', () => {
    render(<WorkbenchStartPanel draftCubes={[]} publishedCubes={[]} />, { wrapper })
    expect(screen.getByText('语义工作台')).toBeInTheDocument()
  })

  it('有草稿时显示 cube 名称在最近工作表格中', () => {
    render(<WorkbenchStartPanel draftCubes={[mockCube]} publishedCubes={[]} />, { wrapper })
    expect(screen.getByText('测试 Cube')).toBeInTheDocument()
  })

  it('渲染统计数字（草稿数、已发布数）', () => {
    const published = { ...mockCube, name: 'pub_cube', status: 'active' as const }
    render(<WorkbenchStartPanel draftCubes={[mockCube]} publishedCubes={[published]} />, { wrapper })

    expect(screen.getAllByText(/草稿/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/已发布/).length).toBeGreaterThanOrEqual(1)
  })
})

/* ------------------------------------------------------------------ */
/*  CubeStudioStepRail                                                 */
/* ------------------------------------------------------------------ */
describe('CubeStudioStepRail', () => {
  const steps = [
    { key: 'basic' as const, title: '基础信息', description: '填写名称', done: true },
    { key: 'source' as const, title: '数据来源', description: '选择数据源', done: false },
    { key: 'structure' as const, title: '结构设计', description: '定义字段', done: false },
  ]

  it('渲染所有步骤标题', () => {
    render(<CubeStudioStepRail activeStep="basic" steps={steps} onSelect={() => {}} />, { wrapper })

    expect(screen.getByText('基础信息')).toBeInTheDocument()
    expect(screen.getByText('数据来源')).toBeInTheDocument()
    expect(screen.getByText('结构设计')).toBeInTheDocument()
  })

  it('点击步骤触发 onSelect', () => {
    const onSelect = vi.fn()
    render(<CubeStudioStepRail activeStep="basic" steps={steps} onSelect={onSelect} />, { wrapper })

    fireEvent.click(screen.getByTestId('cube-studio-step-2'))
    expect(onSelect).toHaveBeenCalledWith('source')
  })

  it('已完成且非 active 步骤显示勾选图标（CheckCircle2）', () => {
    render(<CubeStudioStepRail activeStep="source" steps={steps} onSelect={() => {}} />, { wrapper })

    const firstStep = screen.getByTestId('cube-studio-step-1')
    expect(firstStep.querySelector('svg')).toBeInTheDocument()
    // active step 应该显示数字而不是图标
    const secondStep = screen.getByTestId('cube-studio-step-2')
    expect(secondStep).toHaveTextContent('2')
  })
})
