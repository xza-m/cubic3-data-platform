import type { ReactNode } from 'react'
import React, { createContext, useContext } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { CubeSummary } from '@/api/semantic'
import { CubeTable } from './CubeTable'
import { CubeToolbar } from './CubeToolbar'

const SelectContext = createContext<{
  value: string
  onValueChange?: (value: string) => void
}>({ value: '' })

vi.mock('@/components/Semantic/SemanticObjectIdentity', () => ({
  SemanticObjectIdentity: ({
    title,
    code,
    description,
    meta,
  }: {
    title?: string
    code: string
    description?: string
    meta?: Array<string | null>
  }) => (
    <div>
      <div>{title}</div>
      <div>{code}</div>
      <div>{description}</div>
      <div>{meta?.filter(Boolean).join(' / ')}</div>
    </div>
  ),
}))

vi.mock('@/components/Semantic/SemanticStatusBlock', () => ({
  SemanticStatusBlock: ({
    status,
    hint,
    warning,
  }: {
    status: string
    hint: string
    warning?: boolean
  }) => (
    <div data-warning={warning ? 'true' : 'false'}>
      {status}
      {' / '}
      {hint}
    </div>
  ),
}))

vi.mock('@/components/Semantic/SemanticStructureSummary', () => ({
  SemanticStructureSummary: ({
    items,
  }: {
    items: Array<{ label: string; value: string | number }>
  }) => <div>{items.map((item) => `${item.label}:${item.value}`).join(' | ')}</div>,
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({
    asChild,
    children,
    onClick,
    ...props
  }: {
    asChild?: boolean
    children: ReactNode
    onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void
    [key: string]: unknown
  }) => (asChild ? children : <button type="button" onClick={onClick} {...props}>{children}</button>),
}))

vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
    onClick,
    ...props
  }: {
    checked?: boolean
    onCheckedChange?: (checked: boolean) => void
    onClick?: (event: React.MouseEvent<HTMLInputElement>) => void
    [key: string]: unknown
  }) => (
    <input
      type="checkbox"
      checked={Boolean(checked)}
      onClick={onClick}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
      {...props}
    />
  ),
}))

vi.mock('@/components/ui/table', () => ({
  Table: ({ children, ...props }: { children: ReactNode }) => <table {...props}><tbody>{children}</tbody></table>,
  TableHeader: ({ children }: { children: ReactNode }) => <>{children}</>,
  TableBody: ({ children }: { children: ReactNode }) => <>{children}</>,
  TableRow: ({
    children,
    onClick,
    ...props
  }: {
    children: ReactNode
    onClick?: () => void
    [key: string]: unknown
  }) => <tr onClick={onClick} {...props}>{children}</tr>,
  TableHead: ({ children, ...props }: { children: ReactNode }) => <th {...props}>{children}</th>,
  TableCell: ({ children, ...props }: { children: ReactNode }) => <td {...props}>{children}</td>,
}))

vi.mock('@/components/ui/input', () => ({
  Input: ({
    value,
    onChange,
    ...props
  }: {
    value?: string
    onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void
    [key: string]: unknown
  }) => <input value={value} onChange={onChange} {...props} />,
}))

vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string
    onValueChange?: (value: string) => void
    children: ReactNode
  }) => <SelectContext.Provider value={{ value, onValueChange }}>{children}</SelectContext.Provider>,
  SelectTrigger: ({ children, ...props }: { children: ReactNode }) => <div {...props}>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({
    value,
    children,
  }: {
    value: string
    children: ReactNode
  }) => {
    const select = useContext(SelectContext)
    return (
      <button type="button" onClick={() => select.onValueChange?.(value)}>
        {children}
      </button>
    )
  },
}))

function makeCube(overrides: Partial<CubeSummary> & Record<string, unknown> = {}): CubeSummary {
  return {
    name: 'orders_cube',
    title: '订单主题',
    description: '订单事实模型',
    table: 'mart.orders',
    status: 'draft',
    type: 'fact',
    domain_id: 'sales',
    domain_ids: ['sales'],
    domains: [{ code: 'sales', name: '销售域' }],
    dimensions: ['customer_id', 'region', 'status'],
    measures: ['gmv', 'order_count', 'pay_count', 'refund_amount', 'discount_amount'],
    dimension_count: 3,
    measure_count: 5,
    view_count: 2,
    domain_count: 1,
    domain_name: '销售域',
    in_domain: true,
    source_database: 'dw',
    source_schema: 'mart',
    state_summary: {
      updated_at: '2026-04-01T08:00:00Z',
      last_published_at: '2026-04-01T09:00:00Z',
      sync_status: 'warn',
      publish_status: 'draft',
      definition_hash: 'abc123456789',
      source_binding_summary: {
        source_id: 1,
        database: 'dw',
        display: 'dw.mart',
      },
    },
    ...overrides,
  } as CubeSummary
}

describe('CubeList components', () => {
  it('CubeTable 渲染 Cube 摘要、支持行选中和批量勾选', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const onToggleSelect = vi.fn()
    const onToggleSelectAll = vi.fn()

    render(
      <MemoryRouter>
        <CubeTable
          cubes={[
            makeCube(),
            makeCube({
              name: 'inventory_cube',
              title: '库存主题',
              description: '库存维度模型',
              type: 'dimension',
              status: 'active',
              measure_count: 1,
              view_count: 0,
              domain_name: null,
              in_domain: false,
              source_database: null,
              source_schema: null,
              state_summary: {
                updated_at: null,
                last_published_at: null,
                sync_status: 'error',
                publish_status: 'active',
                definition_hash: '',
                source_binding_summary: {},
              },
            }),
          ]}
          selectedName="orders_cube"
          selectedNames={['orders_cube']}
          onSelect={onSelect}
          onToggleSelect={onToggleSelect}
          onToggleSelectAll={onToggleSelectAll}
        />
      </MemoryRouter>,
    )

    expect(screen.getByText('订单主题')).toBeInTheDocument()
    expect(screen.getByText('事实模型 / 销售域')).toBeInTheDocument()
    expect(screen.getByText('维度:3 | 指标:5 | View:2 个')).toBeInTheDocument()
    expect(screen.getByText('草稿 / 待发布 · 待检查')).toBeInTheDocument()
    expect(screen.getByText('库存主题')).toBeInTheDocument()
    expect(screen.getByText('维度模型 / 未纳入领域')).toBeInTheDocument()
    expect(screen.getByText('活跃 / 未绑定数据源 · 同步异常')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '编辑 订单主题' })).toHaveAttribute(
      'href',
      '/semantic/cubes/orders_cube/edit',
    )

    await user.click(screen.getByTestId('cube-management-item-inventory_cube'))
    expect(onSelect).toHaveBeenCalledWith('inventory_cube')

    fireEvent.click(screen.getByLabelText('选择 订单主题'))
    expect(onToggleSelect).toHaveBeenCalledWith('orders_cube', false)
    expect(onSelect).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByLabelText('全选当前页 Cube'))
    expect(onToggleSelectAll).toHaveBeenCalledWith(true)
  })

  it('CubeToolbar 支持搜索、切换筛选和重置', async () => {
    const user = userEvent.setup()
    const onQueryChange = vi.fn()
    const onFocusChange = vi.fn()
    const onStatusChange = vi.fn()
    const onCubeTypeChange = vi.fn()
    const onDomainChange = vi.fn()
    const onSortChange = vi.fn()
    const onResetFilters = vi.fn()

    render(
      <CubeToolbar
        query="订单"
        focus="all"
        status="all"
        cubeType="all"
        domain="all"
        sort="priority"
        onQueryChange={onQueryChange}
        onFocusChange={onFocusChange}
        onStatusChange={onStatusChange}
        onCubeTypeChange={onCubeTypeChange}
        onDomainChange={onDomainChange}
        onSortChange={onSortChange}
        onResetFilters={onResetFilters}
      />,
    )

    expect(screen.getByTestId('semantic-toolbar')).toBeInTheDocument()

    fireEvent.change(screen.getByTestId('cube-management-search'), { target: { value: '库存' } })
    expect(onQueryChange).toHaveBeenCalledWith('库存')

    await user.click(screen.getByTestId('semantic-filter-chip-attention'))
    expect(onFocusChange).toHaveBeenCalledWith('attention')

    await user.click(screen.getByRole('button', { name: '维度模型' }))
    expect(onCubeTypeChange).toHaveBeenCalledWith('dimension')

    await user.click(screen.getByRole('button', { name: '草稿' }))
    expect(onStatusChange).toHaveBeenCalledWith('draft')

    await user.click(screen.getByRole('button', { name: '已纳入领域' }))
    expect(onDomainChange).toHaveBeenCalledWith('in_domain')

    await user.click(screen.getByRole('button', { name: '名称' }))
    expect(onSortChange).toHaveBeenCalledWith('name_asc')

    await user.click(screen.getByRole('button', { name: '清空筛选' }))
    expect(onResetFilters).toHaveBeenCalledTimes(1)
  })
})
