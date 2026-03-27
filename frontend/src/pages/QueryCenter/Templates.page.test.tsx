import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Templates from './Templates'

const navigateMock = vi.fn()

const templatePageMocks = vi.hoisted(() => ({
  getTemplates: vi.fn(),
  applyTemplate: vi.fn(),
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('../../api/queries', () => ({
  getTemplates: templatePageMocks.getTemplates,
  applyTemplate: templatePageMocks.applyTemplate,
  createTemplate: templatePageMocks.createTemplate,
  updateTemplate: templatePageMocks.updateTemplate,
  deleteTemplate: templatePageMocks.deleteTemplate,
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

vi.mock('@/components/business', async () => {
  const actual = await vi.importActual<typeof import('@/components/business')>('@/components/business')
  return {
    ...actual,
    FormButton: ({
      children,
      onClick,
      type = 'button',
      ...props
    }: {
      children: ReactNode
      onClick?: (event?: React.MouseEvent<HTMLButtonElement>) => void
      type?: 'button' | 'submit' | 'reset'
    }) => (
      <button type={type} onClick={onClick} {...props}>
        {children}
      </button>
    ),
    FormSelect: ({
      value,
      onValueChange,
      options,
      placeholder,
    }: {
      value: string
      onValueChange: (value: string) => void
      options: Array<{ value: string; label: string }>
      placeholder?: string
    }) => (
      <select
        aria-label={placeholder || 'select'}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      >
        <option value="">请选择</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    ),
    PageModal: ({
      open,
      title,
      description,
      children,
      footer,
    }: {
      open: boolean
      title: string
      description?: string
      children: ReactNode
      footer?: ReactNode
    }) => open ? (
      <div role="dialog" aria-label={title}>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
        {children}
        {footer}
      </div>
    ) : null,
    AlertDialog: ({ open, children }: { open: boolean; children: ReactNode }) => open ? <div role="alertdialog">{children}</div> : null,
    AlertDialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    AlertDialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    AlertDialogTitle: ({ children }: { children: ReactNode }) => <h3>{children}</h3>,
    AlertDialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
    AlertDialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    AlertDialogCancel: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
      <button type="button" onClick={onClick}>{children}</button>
    ),
    AlertDialogAction: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
      <button type="button" onClick={onClick}>{children}</button>
    ),
    Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
    FormDatePicker: ({
      placeholder,
      onChange,
    }: {
      placeholder?: string
      onChange: (date: Date) => void
    }) => (
      <button type="button" onClick={() => onChange(new Date('2026-03-25'))}>
        {placeholder || '选择日期'}
      </button>
    ),
    useToast: () => ({ toast: templatePageMocks.toast }),
  }
})

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <Templates />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('Templates page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    navigateMock.mockReset()
    templatePageMocks.applyTemplate.mockResolvedValue({
      sql_query: 'SELECT * FROM lesson_activity WHERE dt = \'2026-03-25\'',
      template_name: '课堂活跃度分析',
    })
    templatePageMocks.createTemplate.mockResolvedValue({})
    templatePageMocks.updateTemplate.mockResolvedValue({})
    templatePageMocks.deleteTemplate.mockResolvedValue({})
  })

  it('支持直接应用模板和参数化模板校验', async () => {
    const user = userEvent.setup()

    templatePageMocks.getTemplates.mockResolvedValue({
      items: [
        {
          id: 3,
          template_name: '课堂活跃度分析',
          template_description: '按班级统计课堂活跃度',
          sql_template: 'SELECT * FROM lesson_activity WHERE dt = {{date}}',
          parameters: [{ name: 'date', type: 'date', label: '日期', display_name: '日期', required: true }],
          category: '教学分析',
          tags: ['课堂', '活跃度'],
          use_count: 5,
          created_at: '2026-03-24T09:00:00Z',
        },
        {
          id: 4,
          template_name: '销售日报',
          template_description: '无需参数的固定模板',
          sql_template: 'SELECT * FROM daily_sales',
          parameters: [],
          category: '经营分析',
          tags: ['日报'],
          use_count: 2,
          created_at: '2026-03-24T09:00:00Z',
        },
      ],
      total: 2,
      page: 1,
      page_size: 100,
      total_pages: 1,
    })

    renderPage()

    expect(await screen.findByRole('heading', { name: '查询模板库' })).toBeInTheDocument()
    const parameterizedTemplate = await screen.findByText('课堂活跃度分析')
    expect(parameterizedTemplate).toBeInTheDocument()
    expect(screen.getByText('经营分析')).toBeInTheDocument()

    await user.click(await screen.findByText('销售日报'))
    await waitFor(() => {
      expect(templatePageMocks.applyTemplate).toHaveBeenCalledWith(4, {})
    })
    expect(navigateMock).toHaveBeenCalledWith('/queries/editor', {
      state: {
        sql: 'SELECT * FROM lesson_activity WHERE dt = \'2026-03-25\'',
        name: '课堂活跃度分析',
      },
    })

    await user.click(parameterizedTemplate)
    expect(await screen.findByRole('dialog', { name: '配置模板参数' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '应用模板' }))
    expect(templatePageMocks.toast).toHaveBeenCalledWith({
      title: '请填写所有必填参数',
      description: '缺少: 日期',
      variant: 'warning',
    })

    await user.click(screen.getByRole('button', { name: '请选择日期' }))
    await user.click(screen.getByRole('button', { name: '应用模板' }))
    await waitFor(() => {
      expect(templatePageMocks.applyTemplate).toHaveBeenCalledWith(3, { date: '2026-03-25' })
    })
  })

  it('支持创建、编辑和删除模板', async () => {
    const user = userEvent.setup()

    templatePageMocks.getTemplates.mockResolvedValue({
      items: [
        {
          id: 3,
          template_name: '课堂活跃度分析',
          template_description: '按班级统计课堂活跃度',
          sql_template: 'SELECT * FROM lesson_activity WHERE dt = {{date}}',
          parameters: [],
          category: '教学分析',
          tags: ['课堂'],
          use_count: 5,
          created_at: '2026-03-24T09:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      page_size: 100,
      total_pages: 1,
    })

    renderPage()

    await user.click(await screen.findByRole('button', { name: /新建模板/ }))
    expect(await screen.findByRole('dialog', { name: '新建模板' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '创建' }))
    expect(templatePageMocks.toast).toHaveBeenCalledWith({
      title: '请填写模板名称和SQL',
      variant: 'warning',
    })

    await user.type(screen.getByPlaceholderText('例如：用户活跃度分析'), '用户活跃分析')
    await user.type(screen.getByPlaceholderText('SELECT * FROM users WHERE created_at > {{start_date}}'), 'SELECT * FROM users')
    await user.selectOptions(screen.getByRole('combobox', { name: '选择分类' }), '教学分析')
    await user.click(screen.getByRole('button', { name: '创建' }))
    await waitFor(() => {
      expect(templatePageMocks.createTemplate).toHaveBeenCalledWith({
        template_name: '用户活跃分析',
        template_description: '',
        sql_template: 'SELECT * FROM users',
        category: '教学分析',
        tags: [],
      })
    })

    const templateCard = (await screen.findByText('课堂活跃度分析')).closest('.cursor-pointer')
    expect(templateCard).not.toBeNull()
    const actionButtons = within(templateCard as HTMLElement).getAllByRole('button')

    await user.click(actionButtons[0])
    expect(await screen.findByRole('dialog', { name: '编辑模板' })).toBeInTheDocument()
    const nameInput = screen.getByDisplayValue('课堂活跃度分析')
    await user.clear(nameInput)
    await user.type(nameInput, '课堂活跃度分析 V2')
    await user.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => {
      expect(templatePageMocks.updateTemplate).toHaveBeenCalledWith(3, {
        template_name: '课堂活跃度分析 V2',
        template_description: '按班级统计课堂活跃度',
        sql_template: 'SELECT * FROM lesson_activity WHERE dt = {{date}}',
        category: '教学分析',
        tags: ['课堂'],
      })
    })

    await user.click(actionButtons[1])
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '删除' }))
    await waitFor(() => {
      expect(templatePageMocks.deleteTemplate.mock.calls[0][0]).toBe(3)
      expect(templatePageMocks.toast).toHaveBeenCalledWith({ title: '模板已删除' })
    })
  })

  it('支持空状态、搜索筛选、复杂参数类型和失败提示', async () => {
    const user = userEvent.setup()

    templatePageMocks.getTemplates
      .mockResolvedValueOnce({
        items: [],
        total: 0,
        page: 1,
        page_size: 100,
        total_pages: 0,
      })
      .mockResolvedValue({
        items: [
          {
            id: 8,
            template_name: '复合参数模板',
            template_description: '同时包含文本、数字和枚举参数',
            sql_template: 'SELECT * FROM users WHERE keyword = {{keyword}} LIMIT {{limit}}',
            parameters: [
              { name: 'keyword', type: 'text', label: '关键词', display_name: '关键词', required: true },
              { name: 'limit', type: 'number', label: '条数', display_name: '条数', required: false },
              { name: 'status', type: 'select', label: '状态', display_name: '状态', required: false, options: ['active', 'inactive'] },
            ],
            category: '教学分析',
            tags: ['复杂参数'],
            use_count: 1,
            created_at: '2026-03-24T09:00:00Z',
          },
        ],
        total: 1,
        page: 1,
        page_size: 100,
        total_pages: 1,
      })

    templatePageMocks.applyTemplate.mockRejectedValueOnce(new Error('apply failed'))

    renderPage()

    expect(await screen.findByText('还没有查询模板')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '创建第一个模板' }))
    expect(await screen.findByRole('dialog', { name: '新建模板' })).toBeInTheDocument()

    await user.type(screen.getByPlaceholderText('搜索模板名称或描述...'), '复合')
    await waitFor(() => {
      expect(templatePageMocks.getTemplates).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: '复合' }),
      )
    })

    await user.click(await screen.findByText('复合参数模板'))
    expect(await screen.findByRole('dialog', { name: '配置模板参数' })).toBeInTheDocument()

    await user.type(screen.getByPlaceholderText('请输入关键词'), 'lesson')
    await user.type(screen.getByPlaceholderText('请输入条数'), '20')
    await user.selectOptions(screen.getByRole('combobox', { name: '请选择状态' }), 'active')
    await user.click(screen.getByRole('button', { name: '应用模板' }))

    await waitFor(() => {
      expect(templatePageMocks.applyTemplate).toHaveBeenCalledWith(8, {
        keyword: 'lesson',
        limit: '20',
        status: 'active',
      })
      expect(templatePageMocks.toast).toHaveBeenCalledWith({
        title: '使用模板失败',
        description: 'apply failed',
        variant: 'destructive',
      })
    })
  })

  it('在保存或删除模板失败时给出 destructive 提示', async () => {
    const user = userEvent.setup()

    templatePageMocks.getTemplates.mockResolvedValue({
      items: [
        {
          id: 9,
          template_name: '失败分支模板',
          template_description: '用于验证错误提示',
          sql_template: 'SELECT 1',
          parameters: [],
          category: '教学分析',
          tags: [],
          use_count: 0,
          created_at: '2026-03-24T09:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      page_size: 100,
      total_pages: 1,
    })
    templatePageMocks.updateTemplate.mockRejectedValueOnce(new Error('save failed'))
    templatePageMocks.deleteTemplate.mockRejectedValueOnce(new Error('delete failed'))

    renderPage()

    const templateCard = (await screen.findByText('失败分支模板')).closest('.cursor-pointer')
    expect(templateCard).not.toBeNull()
    const actionButtons = within(templateCard as HTMLElement).getAllByRole('button')

    await user.click(actionButtons[0])
    await user.click(await screen.findByRole('button', { name: '保存' }))
    await waitFor(() => {
      expect(templatePageMocks.toast).toHaveBeenCalledWith({
        title: '保存模板失败',
        description: 'save failed',
        variant: 'destructive',
      })
    })

    await user.click(actionButtons[1])
    await user.click(await screen.findByRole('button', { name: '删除' }))
    await waitFor(() => {
      expect(templatePageMocks.toast).toHaveBeenCalledWith({
        title: '删除模板失败',
        description: 'delete failed',
        variant: 'destructive',
      })
    })
  })
})
