import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ResourcePagination } from '@/components/Semantic/ResourcePagination'
import { DomainCubeLibrary } from '@/components/Semantic/DomainCanvas/DomainCubeLibrary'
import { PythonPreviewTab } from '@/components/Semantic/DevTools/PythonPreviewTab'
import { SemanticEditorEmptyState } from '@/components/Semantic/DevTools/SemanticEditorEmptyState'
import { SemanticResourceTree } from '@/components/Semantic/DevTools/SemanticResourceTree'
import { SemanticWorkspaceHeader } from '@/components/Semantic/DevTools/SemanticWorkspaceHeader'

vi.mock('@monaco-editor/react', () => ({
  default: ({ value }: { value?: string }) => <pre data-testid="monaco-editor">{value}</pre>,
}))

describe('Semantic auxiliary components', () => {
  it('ResourcePagination 在单页时隐藏，多页时支持翻页', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(<ResourcePagination page={1} pageCount={1} onChange={onChange} />)

    expect(screen.queryByText('上一页')).not.toBeInTheDocument()

    rerender(<ResourcePagination page={2} pageCount={3} onChange={onChange} />)
    expect(screen.getByText('第 2 / 3 页')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '上一页' }))
    await user.click(screen.getByRole('button', { name: '下一页' }))

    expect(onChange).toHaveBeenNthCalledWith(1, 1)
    expect(onChange).toHaveBeenNthCalledWith(2, 3)
  })

  it('PythonPreviewTab 在无 Cube 和有 Cube 时都能生成预览', () => {
    const { rerender } = render(<PythonPreviewTab />)

    expect(screen.getByText('Python 实现预览')).toBeInTheDocument()
    expect(screen.getByTestId('monaco-editor')).toHaveTextContent('请选择一个 Cube 后查看 Python 预览')

    rerender(
      <PythonPreviewTab
        cube={{
          name: 'orders_cube',
          title: '订单分析',
          table: 'public.orders',
          description: '订单事实表',
          dimensions: {
            customer_id: { title: '客户', type: 'string' } as never,
          },
          measures: {
            total_amount: { title: '总金额', type: 'sum' } as never,
          },
          joins: {
            users: { target_cube: 'users_cube', type: 'left' } as never,
          },
        } as never}
      />,
    )

    expect(screen.getByTestId('monaco-editor')).toHaveTextContent('orders_cube = CubeDefinition')
    expect(screen.getByTestId('monaco-editor')).toHaveTextContent('"customer_id": {"title": "客户", "type": "string"}')
    expect(screen.getByTestId('monaco-editor')).toHaveTextContent('"users": {"target_cube": "users_cube", "type": "left"}')
  })

  it('SemanticEditorEmptyState 根据对象类型给出正确跳转', () => {
    const { rerender } = render(
      <MemoryRouter>
        <SemanticEditorEmptyState kind="domain" selectionCode="sales" />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('semantic-editor-empty-state')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '打开领域模块' })).toHaveAttribute('href', '/semantic/domains/sales')

    rerender(
      <MemoryRouter>
        <SemanticEditorEmptyState kind="catalog" />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: '打开领域建模' })).toHaveAttribute('href', '/semantic/domains')
  })

  it('SemanticWorkspaceHeader 展示统计卡片和操作区', () => {
    render(
      <SemanticWorkspaceHeader
        title="语义资源概览"
        description="当前展示核心语义对象和模型状态。"
        testId="workspace-header"
        items={[
          { label: '状态', value: '草稿中' },
          { label: '异常', value: 2, tone: 'warning' },
          { label: '同步', value: '已对齐', tone: 'accent' },
        ]}
        actions={<button type="button">立即发布</button>}
      />,
    )

    expect(screen.getByTestId('workspace-header')).toBeInTheDocument()
    expect(screen.getByText('语义资源概览')).toBeInTheDocument()
    expect(screen.getByText('工作区')).toBeInTheDocument()
    expect(screen.getByText('草稿中')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '立即发布' })).toBeInTheDocument()
  })

  it('SemanticResourceTree 支持搜索、聚焦、选择和分页', async () => {
    const user = userEvent.setup()
    const onSearchChange = vi.fn()
    const onToggleCollapsed = vi.fn()
    const onSelect = vi.fn()

    render(
      <SemanticResourceTree
        search=""
        onSearchChange={onSearchChange}
        groups={[
          {
            kind: 'cube',
            label: 'Cube',
            count: 9,
            items: Array.from({ length: 9 }).map((_, index) => ({
              key: `cube_${index + 1}`,
              label: `Cube ${index + 1}`,
              meta: `${index + 1} 维度`,
            })),
          },
        ]}
        selectedCode="cube_2"
        onSelect={onSelect}
        onToggleCollapsed={onToggleCollapsed}
      />,
    )

    const searchInput = screen.getByTestId('semantic-resource-search')
    fireEvent.change(searchInput, { target: { value: '订单' } })
    expect(onSearchChange).toHaveBeenLastCalledWith('订单')

    await user.click(screen.getByRole('button', { name: '聚焦 Cube 搜索' }))
    expect(searchInput).toHaveFocus()

    await user.click(screen.getByTestId('semantic-resource-item-cube-cube_2'))
    expect(onSelect).toHaveBeenCalledWith('cube', 'cube_2')

    expect(screen.getByText('第 1 / 2 页')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '下一页' }))
    expect(screen.getByText('Cube 9')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '折叠 Cube 资源库' }))
    expect(onToggleCollapsed).toHaveBeenCalled()
  })

  it('SemanticResourceTree 在折叠和空态时显示对应提示', async () => {
    const user = userEvent.setup()
    const onToggleCollapsed = vi.fn()

    const { rerender } = render(
      <SemanticResourceTree
        search=""
        onSearchChange={() => undefined}
        groups={[]}
        collapsed
        selectedCode=""
        onSelect={() => undefined}
        onToggleCollapsed={onToggleCollapsed}
      />,
    )

    await user.click(screen.getByRole('button', { name: '展开 Cube 资源库' }))
    expect(onToggleCollapsed).toHaveBeenCalled()

    rerender(
      <SemanticResourceTree
        search=""
        onSearchChange={() => undefined}
        groups={[
          {
            kind: 'cube',
            label: 'Cube',
            count: 0,
            items: [],
          },
        ]}
        selectedCode=""
        onSelect={() => undefined}
      />,
    )

    expect(screen.getByText('当前筛选下没有匹配资源。')).toBeInTheDocument()
    expect(screen.getByText('没有匹配的语义对象。')).toBeInTheDocument()
  })

  it('DomainCubeLibrary 支持搜索、过滤、拖拽和空态', async () => {
    const user = userEvent.setup()
    const onSearchChange = vi.fn()
    const onFilterChange = vi.fn()
    const onDragStart = vi.fn(() => vi.fn())

    const { rerender } = render(
      <DomainCubeLibrary
        search=""
        onSearchChange={onSearchChange}
        filter="all"
        onFilterChange={onFilterChange}
        counts={{ all: 2, attention: 1, recent: 1 }}
        cubes={[
          {
            name: 'orders_cube',
            title: '订单分析',
            status: 'active',
            dimension_count: 3,
            measure_count: 2,
          } as never,
          {
            name: 'draft_cube',
            title: '草稿模型',
            status: 'draft',
            dimension_count: 1,
            measure_count: 0,
          } as never,
        ]}
        onDragStart={onDragStart}
      />,
    )

    expect(screen.getByText('Cube 资源库')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: '搜索可加入领域的 Cube' }), { target: { value: '订单' } })
    expect(onSearchChange).toHaveBeenLastCalledWith('订单')

    await user.click(screen.getByTestId('semantic-filter-chip-attention'))
    expect(onFilterChange).toHaveBeenCalledWith('attention')

    fireEvent.dragStart(screen.getByTestId('domain-library-cube-orders_cube'))
    expect(onDragStart).toHaveBeenCalledWith('orders_cube')

    rerender(
      <DomainCubeLibrary
        search="none"
        onSearchChange={onSearchChange}
        filter="recent"
        onFilterChange={onFilterChange}
        counts={{ all: 0, attention: 0, recent: 0 }}
        cubes={[]}
        onDragStart={onDragStart}
      />,
    )

    expect(screen.getByText('当前没有可加入的 Cube，可能都已在本领域中或检索条件过窄。')).toBeInTheDocument()
  })
})
