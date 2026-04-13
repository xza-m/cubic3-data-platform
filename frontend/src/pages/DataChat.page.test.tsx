import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DataChat from './DataChat'

const dataChatMocks = vi.hoisted(() => ({
  listConversations: vi.fn(),
  getConversation: vi.fn(),
  createConversation: vi.fn(),
  deleteConversation: vi.fn(),
  sendMessage: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@/components/business', async () => {
  const actual = await vi.importActual<typeof import('@/components/business')>('@/components/business')
  return {
    ...actual,
    useToast: () => ({ toast: dataChatMocks.toast }),
  }
})

vi.mock('../api/conversations', () => ({
  listConversations: dataChatMocks.listConversations,
  getConversation: dataChatMocks.getConversation,
  createConversation: dataChatMocks.createConversation,
  deleteConversation: dataChatMocks.deleteConversation,
  sendMessage: dataChatMocks.sendMessage,
}))

vi.mock('../components/Chat/DatasetSelector', () => ({
  default: ({
    value,
    onChange,
  }: {
    value?: number
    onChange: (value: number) => void
  }) => (
    <select
      aria-label="选择数据集"
      value={value?.toString() ?? ''}
      onChange={(event) => onChange(Number(event.target.value))}
    >
      <option value="">请选择数据集</option>
      <option value="9">课堂进度</option>
      <option value="12">用户画像</option>
    </select>
  ),
}))

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <DataChat />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('DataChat page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.HTMLElement.prototype.scrollIntoView = vi.fn()

    dataChatMocks.listConversations.mockResolvedValue({
      data: {
        items: [
          {
            id: 1,
            title: '课堂进度分析',
            dataset_id: 9,
            dataset_name: '课堂进度',
            user_id: 'tester',
            context: {},
            created_at: '2026-03-24T09:00:00Z',
            updated_at: '2026-03-24T10:00:00Z',
            message_count: 2,
          },
        ],
      },
    })
    dataChatMocks.getConversation.mockResolvedValue({
      data: {
        id: 1,
        title: '课堂进度分析',
        dataset_id: 9,
        dataset_name: '课堂进度',
        user_id: 'tester',
        context: {
          semantic_plan: {
            route: { route_type: 'cube' },
            primary_traceability: {
              business_metric: { title: '课堂进度' },
              business_object: { title: '课堂' },
              analysis_measure: { cube_name: 'classroom_progress' },
            },
          },
        },
        created_at: '2026-03-24T09:00:00Z',
        updated_at: '2026-03-24T10:00:00Z',
        message_count: 2,
        messages: [
          {
            id: 100,
            conversation_id: 1,
            role: 'assistant',
            content: '当前课堂进度稳定。',
            created_at: '2026-03-24T10:00:00Z',
          },
        ],
      },
    })
    dataChatMocks.createConversation.mockResolvedValue({
      data: { id: 2 },
    })
    dataChatMocks.deleteConversation.mockResolvedValue({
      data: {},
    })
    dataChatMocks.sendMessage.mockResolvedValue({
      data: {
        user_message: {
          id: 201,
          conversation_id: 1,
          role: 'user',
          content: '请分析课堂进度',
          created_at: '2026-03-24T10:01:00Z',
        },
        ai_message: {
          id: 202,
          conversation_id: 1,
          role: 'assistant',
          content: '课堂进度整体向好。',
          created_at: '2026-03-24T10:01:01Z',
        },
      },
    })
  })

  it('渲染新版问数工作区并支持选择会话与发送消息', async () => {
    const user = userEvent.setup()

    renderPage()

    expect(screen.getByTestId('data-chat-layout')).toBeInTheDocument()
    expect(screen.getByText('对话列表')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新对话' })).toBeInTheDocument()
    expect(screen.getByText('AI 语义驱动')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('输入您的数据问题...')).toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: '课堂进度分析' }))
    expect(await screen.findByText('当前课堂进度稳定。')).toBeInTheDocument()
    expect(screen.getByTestId('semantic-traceability-card')).toBeInTheDocument()
    expect(screen.getByText('语义执行来源')).toBeInTheDocument()
    expect(screen.getByText('路径：cube')).toBeInTheDocument()
    expect(screen.getByText('业务指标：课堂进度')).toBeInTheDocument()
    expect(screen.getByText('业务对象：课堂')).toBeInTheDocument()
    expect(screen.getByText('分析实体：classroom_progress')).toBeInTheDocument()

    const input = screen.getByPlaceholderText('输入您的数据问题...')
    await user.type(input, '请分析课堂进度')
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

    await waitFor(() => {
      expect(dataChatMocks.sendMessage).toHaveBeenCalledWith(1, '请分析课堂进度')
    })
    expect(await screen.findByText('课堂进度整体向好。')).toBeInTheDocument()
    expect(screen.getByText('请分析课堂进度')).toBeInTheDocument()
  })

  it('未建立数据集上下文时点击新对话给出 warning', async () => {
    const user = userEvent.setup()

    renderPage()

    await user.click(await screen.findByRole('button', { name: '新对话' }))
    expect(dataChatMocks.toast).toHaveBeenCalledWith({ title: '请先选择数据集', variant: 'warning' })
  })

  it('后端无真实会话时展示真实空态而不是样例内容', async () => {
    dataChatMocks.listConversations.mockResolvedValueOnce({
      data: {
        items: [],
      },
    })

    renderPage()

    expect(await screen.findByText('暂无历史对话')).toBeInTheDocument()
    expect(screen.getByText('选择数据集后创建新对话，系统才会展示真实问答内容。')).toBeInTheDocument()
    expect(screen.getByText('当前没有可展示的真实消息')).toBeInTheDocument()
    expect(screen.getByText('请选择左侧已有对话，或先选择数据集后创建新对话。')).toBeInTheDocument()
    expect(screen.queryByText('本月各产品线营收分析')).not.toBeInTheDocument()
    expect(screen.queryByText('已为您生成以下 SQL')).not.toBeInTheDocument()
    expect(screen.queryByText('已为您生成可视化图表')).not.toBeInTheDocument()
  })

  it('在已有对话上下文后支持创建同数据集的新对话', async () => {
    const user = userEvent.setup()

    renderPage()

    await user.click(await screen.findByRole('button', { name: '课堂进度分析' }))
    expect(await screen.findByText('当前课堂进度稳定。')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '新对话' }))
    await waitFor(() => {
      expect(dataChatMocks.createConversation).toHaveBeenCalledWith(9)
    })
    expect(dataChatMocks.toast).toHaveBeenCalledWith({ title: '对话已创建' })
  })

  it('选择数据集后支持从空状态创建首个对话', async () => {
    const user = userEvent.setup()

    renderPage()

    await user.selectOptions(screen.getByLabelText('选择数据集'), '12')
    await user.click(await screen.findByRole('button', { name: '新对话' }))

    await waitFor(() => {
      expect(dataChatMocks.createConversation).toHaveBeenCalledWith(12)
    })
    expect(dataChatMocks.toast).toHaveBeenCalledWith({ title: '对话已创建' })
  })

  it('在发送失败时给出 destructive 提示', async () => {
    const user = userEvent.setup()

    dataChatMocks.sendMessage.mockRejectedValueOnce({
      response: { data: { message: '模型服务暂不可用' } },
    })

    renderPage()

    await user.click(await screen.findByRole('button', { name: '课堂进度分析' }))
    expect(await screen.findByText('当前课堂进度稳定。')).toBeInTheDocument()

    const input = screen.getByPlaceholderText('输入您的数据问题...')
    await user.type(input, '请分析课堂进度')
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

    await waitFor(() => {
      expect(dataChatMocks.toast).toHaveBeenCalledWith({
        title: '发送消息失败',
        description: '模型服务暂不可用',
        variant: 'destructive',
      })
    })
  })

  it('未选择对话时发送消息给出 warning', async () => {
    const user = userEvent.setup()

    const { container } = renderPage()

    const input = screen.getByPlaceholderText('输入您的数据问题...')
    await user.type(input, '直接发送')
    const sendButton = container.querySelector('button[class*="h-10 w-10"]')
    if (!(sendButton instanceof HTMLButtonElement)) {
      throw new Error('未找到发送按钮')
    }
    fireEvent.click(sendButton)

    expect(dataChatMocks.toast).toHaveBeenCalledWith({
      title: '请先创建或选择对话',
      variant: 'warning',
    })
  })
})
