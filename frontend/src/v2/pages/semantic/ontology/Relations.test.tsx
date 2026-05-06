// frontend/src/v2/pages/semantic/ontology/Relations.test.tsx
//
// Relations 页 · 左 SVG 图 + 右关系列表 联动测试。

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { BusinessObject, BusinessRelation } from '@v2/api/ontology'

vi.mock('@v2/hooks/ontology', () => ({
  useObjectList: vi.fn(),
  useRelationList: vi.fn(),
  useCreateRelation: vi.fn(),
}))

import {
  useObjectList,
  useRelationList,
  useCreateRelation,
} from '@v2/hooks/ontology'
import OntologyRelations from './Relations'

const mockObjects = useObjectList as ReturnType<typeof vi.fn>
const mockRelations = useRelationList as ReturnType<typeof vi.fn>
const mockCreate = useCreateRelation as ReturnType<typeof vi.fn>

function mkObject(p: Partial<BusinessObject> & { name: string }): BusinessObject {
  return { name: p.name, title: p.title ?? p.name, status: 'active', ...p }
}
function mkRelation(p: Partial<BusinessRelation> & { name: string }): BusinessRelation {
  return {
    name: p.name,
    title: p.title ?? p.name,
    source_object_name: p.source_object_name ?? 'customer',
    target_object_name: p.target_object_name ?? 'order',
    relation_type: p.relation_type ?? 'one_to_many',
    status: p.status ?? 'active',
    ...p,
  }
}

const OBJECTS: BusinessObject[] = [
  mkObject({ name: 'customer', title: '客户' }),
  mkObject({ name: 'order', title: '订单' }),
  mkObject({ name: 'payment', title: '支付' }),
]

const RELATIONS: BusinessRelation[] = [
  mkRelation({
    name: 'customer_submits_order',
    title: '客户提交订单',
    source_object_name: 'customer',
    target_object_name: 'order',
    relation_type: 'submits',
  }),
  mkRelation({
    name: 'order_has_payment',
    title: '订单有支付',
    source_object_name: 'order',
    target_object_name: 'payment',
    relation_type: 'has',
  }),
]

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
  return render(<OntologyRelations />, { wrapper: Wrapper })
}

describe('OntologyRelations page', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    mockCreate.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false })
    mockObjects.mockReturnValue({ data: { items: OBJECTS, total: OBJECTS.length }, isLoading: false, isError: false })
    mockRelations.mockReturnValue({ data: { items: RELATIONS, total: RELATIONS.length }, isLoading: false, isError: false })
  })

  it('渲染 SVG 图 + 关系表，节点数 = 涉及对象数，边数 = 关系数', () => {
    renderPage()
    expect(screen.getByTestId('ontology-relation-graph')).toBeInTheDocument()
    expect(screen.getByTestId('ontology-relation-node-customer')).toBeInTheDocument()
    expect(screen.getByTestId('ontology-relation-node-order')).toBeInTheDocument()
    expect(screen.getByTestId('ontology-relation-node-payment')).toBeInTheDocument()
    expect(screen.getByTestId('ontology-relation-edge-customer_submits_order')).toBeInTheDocument()
    expect(screen.getByTestId('ontology-relation-edge-order_has_payment')).toBeInTheDocument()
    const table = screen.getByTestId('ontology-relations-table')
    const rows = within(table).getAllByRole('row')
    expect(rows.length - 1).toBe(2) // 减去 thead 行
  })

  it('点击节点 → 表格过滤为该对象相关关系', () => {
    renderPage()
    fireEvent.click(screen.getByTestId('ontology-relation-node-payment'))
    const table = screen.getByTestId('ontology-relations-table')
    const rows = within(table).getAllByRole('row')
    expect(rows.length - 1).toBe(1)
    expect(within(table).queryByTestId('ontology-relations-row-order_has_payment')).toBeInTheDocument()
    expect(within(table).queryByTestId('ontology-relations-row-customer_submits_order')).toBeNull()
    expect(screen.getByText(/已选择对象：支付/)).toBeInTheDocument()
  })

  it('点击 relation 行 → 端点节点 / 边均高亮 + 表格只剩该行', () => {
    renderPage()
    fireEvent.click(screen.getByTestId('ontology-relations-row-customer_submits_order'))
    // 选中 relation 时，relation 端点的两个对象在视觉上同时高亮
    expect(screen.getByTestId('ontology-relation-node-customer')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('ontology-relation-node-order')).toHaveAttribute('aria-pressed', 'true')
    // 非端点对象不高亮
    expect(screen.getByTestId('ontology-relation-node-payment')).toHaveAttribute('aria-pressed', 'false')
    // 边的 aria-pressed
    expect(screen.getByTestId('ontology-relation-edge-customer_submits_order')).toHaveAttribute('aria-pressed', 'true')
    // 表格只剩 1 行
    const table = screen.getByTestId('ontology-relations-table')
    expect(within(table).getAllByRole('row').length - 1).toBe(1)
    expect(screen.getByText(/已选择关系：客户提交订单/)).toBeInTheDocument()
  })

  it('按关系类型筛选，并为关系枚举渲染色彩标签', () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('关系类型筛选'), { target: { value: 'has' } })
    const table = screen.getByTestId('ontology-relations-table')
    expect(within(table).getAllByRole('row').length - 1).toBe(1)
    expect(within(table).queryByTestId('ontology-relations-row-order_has_payment')).toBeInTheDocument()
    expect(within(table).queryByTestId('ontology-relations-row-customer_submits_order')).toBeNull()
    expect(screen.getByTestId('ontology-relation-type-order_has_payment')).toHaveAttribute(
      'data-relation-type',
      'has',
    )
  })

  it('点击清除按钮 → 选中态复位、表格恢复全量', () => {
    renderPage()
    fireEvent.click(screen.getByTestId('ontology-relation-node-customer'))
    const clearBtn = screen.getByLabelText('清除筛选')
    fireEvent.click(clearBtn)
    const table = screen.getByTestId('ontology-relations-table')
    expect(within(table).getAllByRole('row').length - 1).toBe(2)
  })
})
