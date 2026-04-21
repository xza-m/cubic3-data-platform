import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createContext, useContext, type ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogEditorDialog } from './CatalogEditorDialog'
import { CubeCard } from './CubeCard'
import { DomainCreateDialog } from './DomainCreateDialog'
import { ViewCard } from './ViewCard'

const semanticCardMocks = vi.hoisted(() => ({
  createDomain: vi.fn(),
  createCatalog: vi.fn(),
  updateCatalog: vi.fn(),
  materializeView: vi.fn(),
  toast: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock('@/api/semantic', () => ({
  createDomain: semanticCardMocks.createDomain,
  createCatalog: semanticCardMocks.createCatalog,
  updateCatalog: semanticCardMocks.updateCatalog,
  materializeView: semanticCardMocks.materializeView,
}))

vi.mock('@/components/business', () => ({
  useToast: () => ({ toast: semanticCardMocks.toast }),
}))

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: semanticCardMocks.toast }),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => semanticCardMocks.navigate,
  }
})

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    type = 'button',
    ...props
  }: {
    children?: ReactNode
    onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void
    disabled?: boolean
    type?: 'button' | 'submit' | 'reset'
  }) => (
    <button type={type} onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className }: { children?: ReactNode; className?: string }) => (
    <span className={className}>{children}</span>
  ),
}))

vi.mock('@/components/ui/input', () => ({
  Input: ({
    value,
    onChange,
    ...props
  }: {
    value?: string
    onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void
  }) => <input value={value || ''} onChange={onChange} {...props} />,
}))

vi.mock('@/components/ui/textarea', () => ({
  Textarea: ({
    value,
    onChange,
    ...props
  }: {
    value?: string
    onChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void
  }) => <textarea value={value || ''} onChange={onChange} {...props} />,
}))

const SelectContext = createContext<{
  value?: string
  onValueChange?: (value: string) => void
}>({})

vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value?: string
    onValueChange?: (value: string) => void
    children?: ReactNode
  }) => (
    <SelectContext.Provider value={{ value, onValueChange }}>
      <div>{children}</div>
    </SelectContext.Provider>
  ),
  SelectTrigger: ({ children, ...props }: { children?: ReactNode }) => <div {...props}>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => {
    const context = useContext(SelectContext)
    return <span>{context.value || placeholder || ''}</span>
  },
  SelectContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ value, children }: { value: string; children?: ReactNode }) => {
    const context = useContext(SelectContext)
    return (
      <button type="button" onClick={() => context.onValueChange?.(value)}>
        {children}
      </button>
    )
  },
}))

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({
    open,
    children,
  }: {
    open: boolean
    children?: ReactNode
  }) => (open ? <div role="dialog">{children}</div> : null),
  DialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
}))

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Tooltip: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  AlertDialogTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  AlertDialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children?: ReactNode }) => <h3>{children}</h3>,
  AlertDialogCancel: ({ children }: { children?: ReactNode }) => <button type="button">{children}</button>,
  AlertDialogAction: ({
    children,
    onClick,
    disabled,
  }: {
    children?: ReactNode
    onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void
    disabled?: boolean
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}))

function renderWithProviders(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  const view = render(
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>,
  )

  return { ...view, client }
}

describe('Semantic cards and dialogs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('CubeCard 渲染事实表信息、状态和数据源摘要', () => {
    renderWithProviders(
      <CubeCard
        cube={{
          name: 'answer_records',
          title: '答题记录',
          description: '答题记录主表\n第二行描述',
          table: 'dw.answer_records',
          domain_ids: [],
          domains: [],
          domain_count: 0,
          dimensions: [],
          measures: [],
          dimension_count: 4,
          measure_count: 3,
          join_count: 2,
          status: 'active',
          sync_status: 'warn',
          state_summary: {
            source_binding_summary: {
              source_name: '学习仓库',
            },
          },
        }}
      />,
    )

    expect(screen.getByRole('link', { name: /答题记录/ })).toHaveAttribute('href', '/semantic/cubes/answer_records')
    expect(screen.getByText('答题记录主表')).toBeInTheDocument()
    expect(screen.getByText(/4.*维度/)).toBeInTheDocument()
    expect(screen.getByText(/3.*指标/)).toBeInTheDocument()
    expect(screen.getByText(/2.*关联/)).toBeInTheDocument()
    expect(screen.getByText('活跃')).toBeInTheDocument()
    expect(screen.getByText('学习仓库')).toBeInTheDocument()
  })

  it('ViewCard 支持打开详情、发布为数据集并写回发布状态缓存', async () => {
    semanticCardMocks.materializeView.mockResolvedValue({
      data: {
        action: 'created',
        publish_status: 'published',
        dataset_id: 12,
        dataset_code: 'view_learning_overview',
        field_count: 8,
        sql_query: 'select 1',
        source_view: 'learning_overview',
        field_mappings: [],
        definition_hash: 'abc',
        definition_summary: { dimension_count: 2, measure_count: 2, field_count: 8 },
      },
    })

    const { client } = renderWithProviders(
      <ViewCard
        view={{
          name: 'learning_overview',
          title: '学习总览',
          description: '面向教学运营的总览视图',
          public: false,
          cube_count: 3,
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /学习总览/ }))
    expect(semanticCardMocks.navigate).toHaveBeenCalledWith('/semantic/views/learning_overview')

    await userEvent.click(screen.getByRole('button', { name: '确认发布' }))

    await waitFor(() => {
      expect(semanticCardMocks.materializeView).toHaveBeenCalledWith('learning_overview')
    })
    expect(semanticCardMocks.toast).toHaveBeenCalledWith({
      title: '发布成功',
      description: '数据集 view_learning_overview（8 个字段）',
    })
    expect(client.getQueryData(['semantic', 'view-mat-status', 'learning_overview'])).toEqual(
      expect.objectContaining({
        materialized: true,
        dataset_id: 12,
        dataset_code: 'view_learning_overview',
      }),
    )
    expect(screen.getByText('私有')).toBeInTheDocument()
  })

  it('ViewCard 在重新发布失败时给出 destructive 提示', async () => {
    semanticCardMocks.materializeView.mockRejectedValue(new Error('下游数据集不可写'))

    renderWithProviders(
      <ViewCard
        view={{
          name: 'learning_overview',
          title: '学习总览',
          description: '',
          public: true,
          cube_count: 2,
        }}
        materializeStatus={{
          materialized: true,
          publish_status: 'published',
          dataset_id: 5,
          dataset_code: 'view_learning_overview',
          published_at: '2026-03-26T00:00:00Z',
        }}
      />,
    )

    expect(screen.getByText('已发布')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '确认发布' }))

    await waitFor(() => {
      expect(semanticCardMocks.toast).toHaveBeenCalledWith({
        title: '发布失败',
        description: '下游数据集不可写',
        variant: 'destructive',
      })
    })
  })

  it('DomainCreateDialog 支持选择目录并创建领域草稿', async () => {
    const onOpenChange = vi.fn()
    const onSuccess = vi.fn()
    semanticCardMocks.createDomain.mockResolvedValue({
      data: {
        id: 'domain_learning',
        code: 'learning',
        name: '学习分析',
        status: 'draft',
        cubes: [],
        joins: [],
      },
    })

    renderWithProviders(
      <DomainCreateDialog
        open
        onOpenChange={onOpenChange}
        initialCatalogCode="learning"
        catalogs={[
          { code: 'learning', name: '学习目录', status: 'active', domain_count: 1, active_count: 1, draft_count: 0, domains: [] },
          { code: 'ops', name: '运营目录', status: 'active', domain_count: 0, active_count: 0, draft_count: 0, domains: [] },
        ]}
        onSuccess={onSuccess}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: '运营目录' }))
    await userEvent.type(screen.getByTestId('domain-create-name'), '  学习分析  ')
    await userEvent.click(screen.getByTestId('domain-create-submit'))

    await waitFor(() => {
      expect(semanticCardMocks.createDomain).toHaveBeenCalledWith({
        name: '学习分析',
        catalog_code: 'ops',
      })
    })
    expect(semanticCardMocks.toast).toHaveBeenCalledWith({ title: '领域草稿已创建' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'domain_learning', name: '学习分析' }),
    )
  })

  it('DomainCreateDialog 在创建失败时给出 destructive 提示', async () => {
    semanticCardMocks.createDomain.mockRejectedValue(new Error('catalog 不存在'))

    renderWithProviders(
      <DomainCreateDialog
        open
        onOpenChange={vi.fn()}
        catalogs={[{ code: 'learning', name: '学习目录', status: 'active', domain_count: 1, active_count: 1, draft_count: 0, domains: [] }]}
      />,
    )

    await userEvent.type(screen.getByTestId('domain-create-name'), '失败目录')
    await userEvent.click(screen.getByTestId('domain-create-submit'))

    await waitFor(() => {
      expect(semanticCardMocks.toast).toHaveBeenCalledWith({
        title: '创建领域失败',
        description: 'catalog 不存在',
        variant: 'destructive',
      })
    })
  })

  it('CatalogEditorDialog 支持创建目录和编辑目录', async () => {
    const onOpenChange = vi.fn()
    const onSuccess = vi.fn()
    semanticCardMocks.createCatalog.mockResolvedValueOnce({
      data: {
        code: 'learning',
        name: '学习目录',
        description: '学习域目录',
        status: 'archived',
      },
    })
    semanticCardMocks.updateCatalog.mockResolvedValueOnce({
      data: {
        code: 'learning',
        name: '学习分析目录',
        description: '更新后的说明',
        status: 'active',
      },
    })

    const { rerender } = renderWithProviders(
      <CatalogEditorDialog open onOpenChange={onOpenChange} onSuccess={onSuccess} />,
    )

    await userEvent.type(screen.getByTestId('catalog-editor-name'), ' 学习目录 ')
    await userEvent.type(screen.getByTestId('catalog-editor-code'), ' learning ')
    await userEvent.type(screen.getByTestId('catalog-editor-description'), '学习域目录')
    await userEvent.click(screen.getByRole('button', { name: '归档' }))
    await userEvent.click(screen.getByTestId('catalog-editor-submit'))

    await waitFor(() => {
      expect(semanticCardMocks.createCatalog).toHaveBeenCalledWith({
        code: 'learning',
        name: '学习目录',
        description: '学习域目录',
        status: 'archived',
      })
    })
    expect(semanticCardMocks.toast).toHaveBeenCalledWith({ title: '目录已创建' })

    rerender(
      <MemoryRouter>
        <QueryClientProvider
          client={new QueryClient({
            defaultOptions: {
              queries: { retry: false },
              mutations: { retry: false },
            },
          })}
        >
          <CatalogEditorDialog
            open
            onOpenChange={onOpenChange}
            onSuccess={onSuccess}
            catalog={{
              code: 'learning',
              name: '学习目录',
              description: '旧说明',
              status: 'archived',
              domain_count: 1,
              active_count: 0,
              draft_count: 1,
              domains: [],
            }}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    expect(screen.getByTestId('catalog-editor-code')).toBeDisabled()
    fireEvent.change(screen.getByTestId('catalog-editor-name'), { target: { value: '学习分析目录' } })
    fireEvent.change(screen.getByTestId('catalog-editor-description'), { target: { value: '更新后的说明' } })
    await userEvent.click(screen.getByRole('button', { name: '活跃' }))
    await userEvent.click(screen.getByTestId('catalog-editor-submit'))

    await waitFor(() => {
      expect(semanticCardMocks.updateCatalog).toHaveBeenCalledWith('learning', {
        name: '学习分析目录',
        description: '更新后的说明',
        status: 'active',
      })
    })
    expect(semanticCardMocks.toast).toHaveBeenCalledWith({ title: '目录已更新' })
  })

  it('CatalogEditorDialog 在更新失败时给出 destructive 提示', async () => {
    semanticCardMocks.updateCatalog.mockRejectedValue(new Error('目录编码冲突'))

    renderWithProviders(
      <CatalogEditorDialog
        open
        onOpenChange={vi.fn()}
        catalog={{
          code: 'learning',
          name: '学习目录',
          description: '旧说明',
          status: 'active',
          domain_count: 1,
          active_count: 1,
          draft_count: 0,
          domains: [],
        }}
      />,
    )

    fireEvent.change(screen.getByTestId('catalog-editor-name'), { target: { value: '学习目录' } })
    await userEvent.click(screen.getByTestId('catalog-editor-submit'))

    await waitFor(() => {
      expect(semanticCardMocks.toast).toHaveBeenCalledWith({
        title: '更新目录失败',
        description: '目录编码冲突',
        variant: 'destructive',
      })
    })
  })
})
