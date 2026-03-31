import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SchemaContextMenu from './SchemaContextMenu'
import type { TreeNode } from './types'

const schemaContextMenuMocks = vi.hoisted(() => ({
  toast: vi.fn(),
}))

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: schemaContextMenuMocks.toast }),
}))

vi.mock('@/components/ui/context-menu', () => ({
  ContextMenu: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ContextMenuTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ContextMenuContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ContextMenuItem: ({
    children,
    onClick,
  }: {
    children?: ReactNode
    onClick?: () => void
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  ContextMenuSeparator: () => <hr />,
}))

function buildTableNodes() {
  const schemaNode: TreeNode = {
    key: 'datasource:1/database:analytics/schema:public',
    type: 'schema',
    name: 'public',
    parentKey: 'datasource:1/database:analytics',
    children: [],
    loaded: true,
    loading: false,
    expanded: true,
  }
  const tableNode: TreeNode = {
    key: `${schemaNode.key}/table:orders`,
    type: 'table',
    name: 'orders',
    parentKey: schemaNode.key,
    children: [],
    loaded: true,
    loading: false,
    expanded: false,
    metadata: {
      database: 'analytics',
      table: 'orders',
    },
  }
  return {
    schemaNode,
    tableNode,
    nodes: new Map([
      [schemaNode.key, schemaNode],
      [tableNode.key, tableNode],
    ]),
  }
}

describe('SchemaContextMenu', () => {
  let writeTextMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: writeTextMock,
      },
    })
  })

  it('没有选中节点时只渲染子内容', () => {
    render(
      <SchemaContextMenu node={null} nodes={new Map()} onRefresh={vi.fn()}>
        <div>schema-browser-body</div>
      </SchemaContextMenu>,
    )

    expect(screen.getByText('schema-browser-body')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /复制/ })).not.toBeInTheDocument()
  })

  it('表节点支持复制、生成 SELECT、预览和刷新', async () => {
    const onInsert = vi.fn()
    const onPreview = vi.fn()
    const onRefresh = vi.fn()
    const { tableNode, nodes } = buildTableNodes()

    render(
      <SchemaContextMenu
        node={tableNode}
        nodes={nodes}
        onInsert={onInsert}
        onPreview={onPreview}
        onRefresh={onRefresh}
      >
        <div>schema-browser-body</div>
      </SchemaContextMenu>,
    )

    fireEvent.click(screen.getByRole('button', { name: /复制表名/i }))
    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith('orders')
    })
    expect(schemaContextMenuMocks.toast).toHaveBeenCalledWith({
      title: '已复制名称',
      description: 'orders',
    })

    fireEvent.click(screen.getByRole('button', { name: /复制完整路径/i }))
    expect(writeTextMock).toHaveBeenCalledWith('public.orders')

    fireEvent.click(screen.getByRole('button', { name: /生成 SELECT 语句/i }))
    expect(onInsert).toHaveBeenCalledWith('SELECT * FROM public.orders LIMIT 100')

    fireEvent.click(screen.getByRole('button', { name: /预览数据/i }))
    expect(onPreview).toHaveBeenCalledWith('analytics', 'orders')

    fireEvent.click(screen.getByRole('button', { name: /刷新/i }))
    expect(onRefresh).toHaveBeenCalledWith(tableNode.key)
  })

  it('未传 onInsert 时会回退为复制 SQL，列节点不会显示预览或刷新', async () => {
    const columnNode: TreeNode = {
      key: 'datasource:1/database:analytics/schema:public/table:orders/column:order_id',
      type: 'column',
      name: 'order_id',
      parentKey: 'datasource:1/database:analytics/schema:public/table:orders',
      children: [],
      loaded: true,
      loading: false,
      expanded: false,
      metadata: {
        database: 'analytics',
        table: 'orders',
      },
    }

    render(
      <SchemaContextMenu node={columnNode} nodes={new Map([[columnNode.key, columnNode]])} onRefresh={vi.fn()}>
        <div>schema-browser-body</div>
      </SchemaContextMenu>,
    )

    fireEvent.click(screen.getByRole('button', { name: /复制字段名/i }))
    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith('order_id')
    })

    fireEvent.click(screen.getByRole('button', { name: /复制完整路径/i }))
    expect(writeTextMock).toHaveBeenLastCalledWith('order_id')

    expect(screen.queryByRole('button', { name: /生成 SELECT 语句/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /预览数据/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /刷新/i })).not.toBeInTheDocument()
  })
})
