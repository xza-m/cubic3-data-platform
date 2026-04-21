import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CubeSummary } from '@/api/semantic'
import { DomainGraphLegend } from './DomainGraphLegend'
import { DomainCubeLibrary } from './DomainCubeLibrary'
import { DomainInspectorPanel } from './DomainInspectorPanel'

function makeCube(overrides?: Partial<CubeSummary>): CubeSummary {
  return {
    name: 'test_cube',
    title: '测试 Cube',
    description: '',
    table: 'orders',
    domain_ids: [],
    domains: [],
    domain_count: 0,
    status: 'draft',
    dimensions: ['order_id', 'user_id', 'created_date'],
    measures: ['amount', 'count'],
    dimension_count: 5,
    measure_count: 3,
    ...overrides,
  }
}

/* ------------------------------------------------------------------ */
/*  DomainGraphLegend                                                 */
/* ------------------------------------------------------------------ */
describe('DomainGraphLegend', () => {
  it('渲染图例色点和标签', () => {
    render(<DomainGraphLegend lens="all" onLensChange={vi.fn()} />)
    expect(screen.getByText('缺失')).toBeInTheDocument()
    expect(screen.getByText('冲突')).toBeInTheDocument()
    expect(screen.getByText('正常')).toBeInTheDocument()
    expect(screen.getByText('当前焦点')).toBeInTheDocument()
  })

  it('点击「仅看异常」按钮触发 onLensChange("issues")', () => {
    const onChange = vi.fn()
    render(<DomainGraphLegend lens="all" onLensChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: '仅看异常' }))
    expect(onChange).toHaveBeenCalledWith('issues')
  })

  it('当前 lens 按钮具有高亮样式', () => {
    render(<DomainGraphLegend lens="issues" onLensChange={vi.fn()} />)
    const btn = screen.getByRole('button', { name: '仅看异常' })
    expect(btn.className).toContain('bg-[hsl(var(--workbench-accent-soft))]')
  })
})

/* ------------------------------------------------------------------ */
/*  DomainCubeLibrary                                                 */
/* ------------------------------------------------------------------ */
describe('DomainCubeLibrary', () => {
  const defaultProps = {
    search: '',
    onSearchChange: vi.fn(),
    filter: 'all' as const,
    onFilterChange: vi.fn(),
    counts: { all: 2, attention: 1, recent: 0 },
    cubes: [makeCube(), makeCube({ name: 'cube_b', title: 'B Cube' })],
    onDragStart: vi.fn(() => vi.fn()),
  }

  it('渲染标题「Cube 资源库」', () => {
    render(<DomainCubeLibrary {...defaultProps} />)
    expect(screen.getByText('Cube 资源库')).toBeInTheDocument()
  })

  it('渲染 cube 列表项', () => {
    render(<DomainCubeLibrary {...defaultProps} />)
    expect(screen.getByText('测试 Cube')).toBeInTheDocument()
    expect(screen.getByText('B Cube')).toBeInTheDocument()
    expect(screen.getByTestId('domain-library-cube-test_cube')).toBeInTheDocument()
    expect(screen.getByTestId('domain-library-cube-cube_b')).toBeInTheDocument()
  })

  it('空列表时显示空状态提示', () => {
    render(<DomainCubeLibrary {...defaultProps} cubes={[]} />)
    expect(screen.getByText(/当前没有可加入的 Cube/)).toBeInTheDocument()
  })

  it('搜索框输入触发 onSearchChange', () => {
    const onSearchChange = vi.fn()
    render(<DomainCubeLibrary {...defaultProps} onSearchChange={onSearchChange} />)
    const input = screen.getByLabelText('搜索可加入领域的 Cube')
    fireEvent.change(input, { target: { value: 'order' } })
    expect(onSearchChange).toHaveBeenCalledWith('order')
  })
})

/* ------------------------------------------------------------------ */
/*  DomainInspectorPanel                                              */
/* ------------------------------------------------------------------ */
describe('DomainInspectorPanel', () => {
  const baseSummary = {
    status: 'ready' as const,
    title: '检查通过',
    description: '所有校验通过。',
    blockers: [],
    hints: [],
  }

  const baseProps = {
    domain: {
      code: 'domain_order',
      name: '订单领域',
      status: 'active' as const,
      description: '管理订单相关的 Cube。',
    },
    summary: baseSummary,
    selectedCube: null,
    selectedEdgeId: null,
    joinForm: null,
    cubeIndex: new Map<string, CubeSummary>(),
    nodesCount: 4,
    edgesCount: 2,
    onJoinFormChange: vi.fn(),
    onJoinSave: vi.fn(),
    onDeleteEdge: vi.fn(),
  }

  it('无选中时渲染「领域摘要」', () => {
    render(<DomainInspectorPanel {...baseProps} />)
    expect(screen.getByText('领域摘要')).toBeInTheDocument()
    expect(screen.getByText('订单领域')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('选中 Cube 时渲染「Cube 摘要」', () => {
    const cube = makeCube()
    render(<DomainInspectorPanel {...baseProps} selectedCube={cube} />)
    expect(screen.getByText('Cube 摘要')).toBeInTheDocument()
    expect(screen.getByTestId('domain-inspector-cube')).toBeInTheDocument()
    expect(screen.getByText('测试 Cube')).toBeInTheDocument()
    expect(screen.getByText('5 维度')).toBeInTheDocument()
    expect(screen.getByText('3 指标')).toBeInTheDocument()
  })

  it('选中 Edge 时渲染「Join 设置」表单', () => {
    const joinForm = {
      source_cube: 'test_cube',
      target_cube: 'cube_b',
      source_field: 'order_id',
      target_field: 'order_id',
      join_type: 'left' as const,
      cardinality: '1:1' as const,
      aggregation_strategy: 'none' as const,
      description: '',
    }
    const cubeA = makeCube()
    const cubeB = makeCube({ name: 'cube_b', title: 'B Cube' })
    const cubeIndex = new Map<string, CubeSummary>([
      ['test_cube', cubeA],
      ['cube_b', cubeB],
    ])

    render(
      <DomainInspectorPanel
        {...baseProps}
        selectedEdgeId="edge-1"
        joinForm={joinForm}
        cubeIndex={cubeIndex}
      />,
    )
    expect(screen.getByText('Join 设置')).toBeInTheDocument()
    expect(screen.getByTestId('domain-inspector-join')).toBeInTheDocument()
    expect(screen.getByTestId('domain-inspector-save')).toBeInTheDocument()
    expect(screen.getByText('保存当前 Join')).toBeInTheDocument()
    expect(screen.getByText('删除 Join')).toBeInTheDocument()
  })
})
