import { fireEvent, render, screen } from '@testing-library/react'
import { forwardRef, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SchemaBrowser from './SchemaBrowser'
import type { TreeNode } from './types'

const schemaBrowserMocks = vi.hoisted(() => ({
  useSchemaTree: vi.fn(),
}))

vi.mock('./useSchemaTree', () => ({
  useSchemaTree: schemaBrowserMocks.useSchemaTree,
}))

vi.mock('@/components/ui/input', () => ({
  Input: forwardRef<HTMLInputElement, {
    value?: string
    onChange?: (event: { target: { value: string } }) => void
    placeholder?: string
  }>(({
    value,
    onChange,
    placeholder,
    ...props
  }, ref) => (
    <input
      ref={ref}
      value={value || ''}
      onChange={(event) => onChange?.({ target: { value: event.target.value } })}
      placeholder={placeholder}
      {...props}
    />
  )),
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    type = 'button',
    className,
  }: {
    children?: ReactNode
    onClick?: () => void
    disabled?: boolean
    type?: 'button' | 'submit' | 'reset'
    className?: string
  }) => (
    <button type={type} onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children, className }: { children?: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}))

vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
  }: {
    checked?: boolean
    onCheckedChange?: () => void
  }) => <input type="checkbox" checked={Boolean(checked)} onChange={() => onCheckedChange?.()} />,
}))

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}))

vi.mock('./SchemaContextMenu', () => ({
  default: ({
    children,
  }: {
    children?: ReactNode
  }) => <div data-testid="schema-context-menu">{children}</div>,
}))

vi.mock('./SchemaTreeNode', () => ({
  default: ({
    node,
    onSelect,
    onDoubleClick,
    onContextMenu,
  }: {
    node: TreeNode
    onSelect: (key: string) => void
    onDoubleClick: (node: TreeNode) => void
    onContextMenu: (event: React.MouseEvent, node: TreeNode) => void
  }) => (
    <div>
      <button type="button" onClick={() => onSelect(node.key)}>
        选择 {node.name}
      </button>
      <button type="button" onClick={() => onDoubleClick(node)}>
        双击 {node.name}
      </button>
      <button
        type="button"
        onClick={() =>
          onContextMenu(
            {
              preventDefault: vi.fn(),
            } as unknown as React.MouseEvent,
            node,
          )
        }
      >
        右键 {node.name}
      </button>
    </div>
  ),
}))

function createHookValue(overrides?: Partial<ReturnType<typeof schemaBrowserMocks.useSchemaTree>>) {
  const tableNode: TreeNode = {
    key: 'table:orders',
    type: 'table',
    name: 'orders',
    parentKey: null,
    children: [],
    loaded: true,
    loading: false,
    expanded: true,
  }
  const viewNode: TreeNode = {
    key: 'view:order_summary',
    type: 'view',
    name: 'order_summary',
    parentKey: null,
    children: [],
    loaded: true,
    loading: false,
    expanded: false,
  }

  return {
    nodes: new Map([
      [tableNode.key, tableNode],
      [viewNode.key, viewNode],
    ]),
    rootKeys: [tableNode.key, viewNode.key],
    selectedKey: tableNode.key,
    searchTerm: '',
    initialized: true,
    typeFilters: new Set(['table', 'view']),
    setSelectedKey: vi.fn(),
    setSearchTerm: vi.fn(),
    toggleTypeFilter: vi.fn(),
    loadDatabases: vi.fn(),
    toggleExpand: vi.fn(),
    refreshNode: vi.fn(),
    isNodeVisible: vi.fn(() => true),
    ...overrides,
  }
}

describe('SchemaBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('未选择数据源时展示空状态', () => {
    schemaBrowserMocks.useSchemaTree.mockReturnValue(createHookValue())

    render(<SchemaBrowser />)

    expect(screen.getByText('请先选择数据源')).toBeInTheDocument()
    expect(screen.getByText('选择后将显示数据库结构')).toBeInTheDocument()
  })

  it('初始化中时展示骨架屏，搜索或过滤无结果时展示空结果态', () => {
    schemaBrowserMocks.useSchemaTree.mockReturnValueOnce(
      createHookValue({
        initialized: false,
        rootKeys: [],
      }),
    )

    const { rerender, container } = render(<SchemaBrowser datasourceId={1} />)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)

    schemaBrowserMocks.useSchemaTree.mockReturnValue(
      createHookValue({
        rootKeys: [],
        searchTerm: 'orders',
      }),
    )
    rerender(<SchemaBrowser datasourceId={1} />)

    expect(screen.getByText('未找到匹配结果')).toBeInTheDocument()
  })

  it('支持折叠展开、搜索清空、类型过滤，并透传选择与双击回调', async () => {
    const onSelect = vi.fn()
    const onDoubleClick = vi.fn()
    const hookValue = createHookValue()
    schemaBrowserMocks.useSchemaTree.mockReturnValue(hookValue)

    render(
      <SchemaBrowser
        datasourceId={3}
        title="Schema Browser"
        onSelect={onSelect}
        onDoubleClick={onDoubleClick}
      />,
    )

    expect(hookValue.loadDatabases).toHaveBeenCalled()
    expect(screen.getByText('1 张表 · 1 个视图')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button')[0])
    expect(screen.getByText('Schema Browser')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Schema Browser'))
    expect(screen.getByPlaceholderText('搜索表名或字段…')).toBeInTheDocument()

    const searchInput = screen.getByPlaceholderText('搜索表名或字段…')
    fireEvent.change(searchInput, { target: { value: 'orders' } })
    await vi.advanceTimersByTimeAsync(250)
    expect(hookValue.setSearchTerm).toHaveBeenLastCalledWith('orders')

    fireEvent.click(screen.getByRole('button', { name: '×' }))
    await vi.advanceTimersByTimeAsync(250)
    expect(hookValue.setSearchTerm).toHaveBeenLastCalledWith('')

    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])
    expect(hookValue.toggleTypeFilter).toHaveBeenCalledWith('table')

    fireEvent.click(screen.getByRole('button', { name: /选择 orders/i }))
    expect(hookValue.setSelectedKey).toHaveBeenCalledWith('table:orders')
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'orders' }))

    fireEvent.click(screen.getByRole('button', { name: /双击 orders/i }))
    expect(onDoubleClick).toHaveBeenCalledWith(expect.objectContaining({ name: 'orders' }), 'orders')
  })

  it('初始自动展开完成后，手动收起首个表不会被再次自动展开', () => {
    const toggleExpand = vi.fn()
    const datasourceKey = 'datasource:1'
    const databaseKey = 'database:analytics'
    const schemaKey = 'schema:public'
    const tableKey = 'table:orders'

    const expandedTree = new Map<string, TreeNode>([
      [datasourceKey, {
        key: datasourceKey,
        type: 'datasource',
        name: '数据源 #1',
        parentKey: null,
        children: [databaseKey],
        loaded: true,
        loading: false,
        expanded: true,
      }],
      [databaseKey, {
        key: databaseKey,
        type: 'database',
        name: 'analytics',
        parentKey: datasourceKey,
        children: [schemaKey],
        loaded: true,
        loading: false,
        expanded: true,
      }],
      [schemaKey, {
        key: schemaKey,
        type: 'schema',
        name: 'public',
        parentKey: databaseKey,
        children: [tableKey],
        loaded: true,
        loading: false,
        expanded: true,
      }],
      [tableKey, {
        key: tableKey,
        type: 'table',
        name: 'orders',
        parentKey: schemaKey,
        children: [],
        loaded: true,
        loading: false,
        expanded: true,
      }],
    ])

    schemaBrowserMocks.useSchemaTree.mockReturnValueOnce(createHookValue({
      nodes: expandedTree,
      rootKeys: [databaseKey],
      initialized: true,
      toggleExpand,
    }))

    const { rerender } = render(
      <SchemaBrowser datasourceId={1} sourceType="postgresql" />,
    )

    expect(toggleExpand).not.toHaveBeenCalled()

    const collapsedTree = new Map(expandedTree)
    collapsedTree.set(tableKey, {
      ...collapsedTree.get(tableKey)!,
      expanded: false,
    })

    schemaBrowserMocks.useSchemaTree.mockReturnValueOnce(createHookValue({
      nodes: collapsedTree,
      rootKeys: [databaseKey],
      initialized: true,
      toggleExpand,
    }))

    rerender(<SchemaBrowser datasourceId={1} sourceType="postgresql" />)

    expect(toggleExpand).not.toHaveBeenCalled()
  })
})
