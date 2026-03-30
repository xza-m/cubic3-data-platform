import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SchemaTreeNode from './SchemaTreeNode'
import type { TreeNode } from './types'

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Tooltip: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}))

describe('SchemaTreeNode', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
  })

  it('父节点会响应选中、展开、双击和右键，并递归渲染可见子节点', () => {
    const onToggle = vi.fn()
    const onSelect = vi.fn()
    const onDoubleClick = vi.fn()
    const onContextMenu = vi.fn()

    const childNode: TreeNode = {
      key: 'datasource:1/database:analytics/table:orders/column:order_id',
      type: 'column',
      name: 'order_id',
      parentKey: 'datasource:1/database:analytics/table:orders',
      children: [],
      loaded: true,
      loading: false,
      expanded: false,
      metadata: {
        comment: '订单主键',
        dataType: 'bigint',
        typeCategory: 'numeric',
        isPrimaryKey: true,
        isPartition: true,
      },
    }
    const hiddenChild: TreeNode = {
      ...childNode,
      key: 'datasource:1/database:analytics/table:orders/column:hidden_col',
      name: 'hidden_col',
    }
    const tableNode: TreeNode = {
      key: 'datasource:1/database:analytics/table:orders',
      type: 'table',
      name: 'orders',
      parentKey: 'datasource:1/database:analytics',
      children: [childNode.key, hiddenChild.key],
      loaded: true,
      loading: false,
      expanded: true,
      metadata: {
        comment: '订单事实表',
      },
    }

    const nodes = new Map([
      [tableNode.key, tableNode],
      [childNode.key, childNode],
      [hiddenChild.key, hiddenChild],
    ])

    const { container } = render(
      <SchemaTreeNode
        node={tableNode}
        depth={0}
        isSelected
        searchTerm="ord"
        nodes={nodes}
        isNodeVisible={(key) => key !== hiddenChild.key}
        onToggle={onToggle}
        onSelect={onSelect}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
      />,
    )

    const tableRow = screen.getByTestId('schema-node-table-orders')
    fireEvent.click(tableRow)
    expect(onSelect).toHaveBeenCalledWith(tableNode.key)
    expect(onToggle).toHaveBeenCalledWith(tableNode.key)

    fireEvent.doubleClick(tableRow)
    expect(onDoubleClick).toHaveBeenCalledWith(tableNode)

    fireEvent.contextMenu(tableRow)
    expect(onContextMenu).toHaveBeenCalledWith(expect.any(Object), tableNode)

    expect(screen.getByTestId('schema-node-column-order_id')).toBeInTheDocument()
    expect(screen.queryByTestId('schema-node-column-hidden_col')).not.toBeInTheDocument()
    expect(screen.getByText((content) => content.includes('订单主键'))).toBeInTheDocument()
    expect(screen.getByText('bigint')).toBeInTheDocument()
    expect(screen.getByText('🔑')).toBeInTheDocument()
    expect(screen.getByText('🧩')).toBeInTheDocument()
    expect(container.querySelector('mark')).toHaveTextContent('ord')
  })

  it('loading 且未加载完成时会显示骨架子节点', () => {
    const schemaNode: TreeNode = {
      key: 'datasource:1/database:analytics/schema:public',
      type: 'schema',
      name: 'public',
      parentKey: 'datasource:1/database:analytics',
      children: [],
      loaded: false,
      loading: true,
      expanded: true,
    }

    const { container } = render(
      <SchemaTreeNode
        node={schemaNode}
        depth={1}
        isSelected={false}
        searchTerm=""
        nodes={new Map([[schemaNode.key, schemaNode]])}
        isNodeVisible={() => true}
        onToggle={vi.fn()}
        onSelect={vi.fn()}
        onDoubleClick={vi.fn()}
        onContextMenu={vi.fn()}
      />,
    )

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })
})
