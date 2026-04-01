import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DomainModelingEntry from './DomainModelingEntry'

const domainEntryMocks = vi.hoisted(() => ({
  createDomain: vi.fn(),
  listDomains: vi.fn(),
  listDomainCatalogs: vi.fn(),
  toast: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock('@/api/semantic', () => ({
  createDomain: domainEntryMocks.createDomain,
  listDomains: domainEntryMocks.listDomains,
  listDomainCatalogs: domainEntryMocks.listDomainCatalogs,
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => domainEntryMocks.navigate,
  }
})

vi.mock('@/components/business', () => ({
  useToast: () => ({ toast: domainEntryMocks.toast }),
}))

vi.mock('@/components/Semantic/CatalogEditorDialog', () => ({
  CatalogEditorDialog: ({
    open,
    onOpenChange,
    onSuccess,
  }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess: (catalog: { code: string }) => void
  }) =>
    open ? (
      <div role="dialog" aria-label="目录编辑器">
        <button
          type="button"
          onClick={() => {
            onSuccess({ code: 'analytics' })
            onOpenChange(false)
          }}
        >
          使用 analytics 目录
        </button>
      </div>
    ) : null,
}))

vi.mock('@/components/Semantic/workbench', () => ({
  SemanticPageShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SemanticPageHeader: ({
    title,
    description,
    meta,
    actions,
  }: {
    title: string
    description: string
    meta?: ReactNode
    actions?: ReactNode
  }) => (
    <header>
      <h1>{title}</h1>
      <p>{description}</p>
      <div>{meta}</div>
      <div>{actions}</div>
    </header>
  ),
  SemanticSurface: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}))

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    asChild,
    ...props
  }: {
    children: ReactNode
    onClick?: () => void
    disabled?: boolean
    asChild?: boolean
  } & Record<string, unknown>) => (asChild ? <>{children}</> : <button type="button" onClick={onClick} disabled={disabled} {...props}>{children}</button>),
}))

vi.mock('@/components/ui/input', () => ({
  Input: ({
    value,
    onChange,
    ...props
  }: {
    value: string
    onChange: (event: { target: { value: string } }) => void
  } & Record<string, unknown>) => (
    <input
      {...props}
      value={value}
      onChange={(event) => onChange({ target: { value: event.target.value } })}
    />
  ),
}))

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => <button type="button" {...props}>{children}</button>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} />,
}))

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <DomainModelingEntry />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('DomainModelingEntry page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    domainEntryMocks.listDomainCatalogs.mockResolvedValue({
      data: {
        catalogs: [
          { code: 'default', name: '默认目录' },
          { code: 'analytics', name: '分析目录' },
        ],
      },
    })
    domainEntryMocks.listDomains.mockResolvedValue({
      data: {
        domains: [
          { id: 'draft-1', code: 'answer_analysis', name: '答题分析', catalog_name: '默认目录', status: 'draft' },
          { id: 'prod-1', code: 'teaching_ops', name: '教学运营', catalog_name: '分析目录', status: 'active' },
        ],
      },
    })
    domainEntryMocks.createDomain.mockResolvedValue({ data: { id: 'draft-99', code: 'draft-99' } })
  })

  it('加载中时展示骨架屏', () => {
    domainEntryMocks.listDomains.mockImplementation(() => new Promise(() => {}))

    renderPage()

    expect(screen.getAllByTestId('skeleton')).toHaveLength(2)
  })

  it('展示草稿领域、已发布领域并支持打开目录编辑器', async () => {
    const user = userEvent.setup()

    renderPage()

    expect(await screen.findByText('领域建模')).toBeInTheDocument()
    expect(await screen.findByText('2 个目录')).toBeInTheDocument()
    expect(screen.getByText('2 个领域')).toBeInTheDocument()
    expect(screen.getByText('答题分析')).toBeInTheDocument()
    expect(screen.getByText('教学运营')).toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: '新建目录' }))
    expect(screen.getByRole('dialog', { name: '目录编辑器' })).toBeInTheDocument()
  })

  it('支持创建领域草稿并跳转到画布', async () => {
    const user = userEvent.setup()

    renderPage()

    await screen.findByText('领域建模')
    await user.click(await screen.findByRole('button', { name: '新建目录' }))
    await user.click(screen.getByRole('button', { name: '使用 analytics 目录' }))
    await user.type(await screen.findByLabelText('领域名称'), '  答题画像  ')
    await user.click(screen.getByTestId('domain-create-submit'))

    await waitFor(() => {
      expect(domainEntryMocks.createDomain).toHaveBeenCalledWith({
        name: '答题画像',
        catalog_code: 'analytics',
      })
    })
    expect(domainEntryMocks.toast).toHaveBeenCalledWith({ title: '领域草稿已创建，开始进入建模画布' })
    expect(domainEntryMocks.navigate).toHaveBeenCalledWith('/semantic/domains/draft-99')
  })

  it('创建失败时给出 destructive 提示', async () => {
    const user = userEvent.setup()
    domainEntryMocks.createDomain.mockRejectedValueOnce(new Error('目录不存在'))

    renderPage()

    await screen.findByText('领域建模')
    await user.type(await screen.findByLabelText('领域名称'), '教学洞察')
    await user.click(screen.getByTestId('domain-create-submit'))

    await waitFor(() => {
      expect(domainEntryMocks.toast).toHaveBeenCalledWith({
        title: '创建领域失败',
        description: '目录不存在',
        variant: 'destructive',
      })
    })
  })

  it('草稿和已发布领域为空时展示对应空态', async () => {
    domainEntryMocks.listDomainCatalogs.mockResolvedValue({
      data: { catalogs: [{ code: 'default', name: '默认目录' }] },
    })
    domainEntryMocks.listDomains.mockResolvedValue({
      data: { domains: [] },
    })

    renderPage()

    expect(await screen.findByText('当前没有可继续的草稿领域。')).toBeInTheDocument()
    expect(screen.getByText('当前没有近期已发布领域。')).toBeInTheDocument()
  })
})
