import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SaveAsDatasetDialog from './SaveAsDatasetDialog'

const dialogMocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  toast: vi.fn(),
  executeSQLSmart: vi.fn(),
  createDataset: vi.fn(),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => dialogMocks.navigate,
  }
})

vi.mock('./PageModal', () => ({
  PageModal: ({
    open,
    title,
    description,
    children,
  }: {
    open: boolean
    title: string
    description?: string
    children: ReactNode
  }) => (open ? (
    <div role="dialog" aria-label={title}>
      <div>{description}</div>
      {children}
    </div>
  ) : null),
}))

vi.mock('./FormButton', () => ({
  FormButton: ({
    children,
    onClick,
    disabled,
    loading,
    className,
  }: {
    children: ReactNode
    onClick?: () => void
    disabled?: boolean
    loading?: boolean
    className?: string
  }) => (
    <button type="button" onClick={onClick} disabled={disabled || loading} className={className}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/FieldConfigurator/FieldConfigurator', () => ({
  default: ({
    fields,
    sourceType,
    onConfigChange,
  }: {
    fields: Array<{ name: string }>
    sourceType: string
    onConfigChange: (configs: Array<Record<string, unknown>>) => void
  }) => (
    <div>
      <div data-testid="field-configurator">source:{sourceType}; fields:{fields.length}</div>
      <button
        type="button"
        onClick={() =>
          onConfigChange([
            {
              field_name: fields[0]?.name || 'user_id',
              display_name: '学生',
              data_type: 'STRING',
            },
          ])
        }
      >
        应用字段配置
      </button>
    </div>
  ),
}))

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: dialogMocks.toast }),
}))

vi.mock('@/api/sqllab', () => ({
  executeSQLSmart: dialogMocks.executeSQLSmart,
}))

vi.mock('@/api/datasets', () => ({
  createDataset: dialogMocks.createDataset,
}))

function renderDialog(overrides?: Partial<React.ComponentProps<typeof SaveAsDatasetDialog>>) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <SaveAsDatasetDialog
          open
          onOpenChange={vi.fn()}
          sql="select user_id, score from learning_records"
          sourceId={9}
          sourceType="postgresql"
          {...overrides}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('SaveAsDatasetDialog', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    dialogMocks.executeSQLSmart.mockResolvedValue({
      fields: [
        {
          field_name: 'user_id',
          data_type: 'STRING',
          display_name: '学生 ID',
          confidence_score: 0.9,
        },
      ],
      columns: ['user_id', 'score'],
    })
    dialogMocks.createDataset.mockResolvedValue({
      id: 11,
      dataset_name: '学习成绩宽表',
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('支持完成多步骤配置并创建虚拟数据集', async () => {
    const onOpenChange = vi.fn()
    const user = userEvent.setup()

    renderDialog({ onOpenChange })

    expect(await screen.findByText('数据集名称 *')).toBeInTheDocument()
    expect(dialogMocks.executeSQLSmart).toHaveBeenCalledWith(
      {
        source_id: 9,
        sql_query: 'select user_id, score from learning_records',
        limit: 100,
      },
      false,
    )

    await user.type(screen.getByPlaceholderText('例如: 高价值订单分析'), '学习成绩宽表')
    await user.type(screen.getByPlaceholderText('描述此虚拟数据集的用途和业务含义'), '用于成绩洞察')
    await user.clear(screen.getByPlaceholderText('负责人'))
    await user.type(screen.getByPlaceholderText('负责人'), 'semantic-owner')
    await user.click(screen.getByRole('button', { name: /下一步/ }))

    expect(await screen.findByTestId('field-configurator')).toHaveTextContent('source:postgresql; fields:1')
    await user.click(screen.getByRole('button', { name: '应用字段配置' }))
    await user.click(screen.getByRole('button', { name: /下一步/ }))

    expect(await screen.findByText('确认创建虚拟数据集')).toBeInTheDocument()
    expect(screen.getByText('学习成绩宽表')).toBeInTheDocument()
    expect(screen.getByText('1 个')).toBeInTheDocument()
    expect(screen.getByText('semantic-owner')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /确认创建/ }))

    await waitFor(() => {
      expect(dialogMocks.createDataset).toHaveBeenCalledWith({
        dataset_type: 'virtual',
        dataset_name: '学习成绩宽表',
        description: '用于成绩洞察',
        owner: 'semantic-owner',
        source_id: 9,
        sql_query: 'select user_id, score from learning_records',
        fields: [
          {
            field_name: 'user_id',
            display_name: '学生',
            data_type: 'STRING',
          },
        ],
      })
      expect(dialogMocks.toast).toHaveBeenCalledWith({ title: '虚拟数据集创建成功' })
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    await new Promise((resolve) => setTimeout(resolve, 120))
    expect(dialogMocks.navigate).toHaveBeenCalledWith('/data-center/datasets')
  })

  it('字段分析失败时展示告警，并在继续流程中保留已填写的名称描述负责人', async () => {
    const user = userEvent.setup()
    dialogMocks.executeSQLSmart.mockRejectedValueOnce({
      response: {
        data: {
          message: 'SQL engine unavailable',
          details: { reason_code: 'ENGINE_DOWN' },
        },
      },
    })

    renderDialog({ sourceType: undefined })

    expect(await screen.findByText(/字段元数据获取失败: SQL engine unavailable（ENGINE_DOWN）/)).toBeInTheDocument()
    await user.type(screen.getByPlaceholderText('例如: 高价值订单分析'), '降级虚拟数据集')
    await user.type(screen.getByPlaceholderText('描述此虚拟数据集的用途和业务含义'), '字段分析失败时继续使用')
    await user.clear(screen.getByPlaceholderText('负责人'))
    await user.type(screen.getByPlaceholderText('负责人'), 'fallback-owner')
    await user.click(screen.getByRole('button', { name: /下一步/ }))

    expect(await screen.findByText('当前没有可配置的字段信息')).toBeInTheDocument()
    expect(screen.getByText('可以继续创建，后续通过数据集详情补充字段元数据。')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /上一步/ }))

    expect(screen.getByPlaceholderText('例如: 高价值订单分析')).toHaveValue('降级虚拟数据集')
    expect(screen.getByPlaceholderText('描述此虚拟数据集的用途和业务含义')).toHaveValue('字段分析失败时继续使用')
    expect(screen.getByPlaceholderText('负责人')).toHaveValue('fallback-owner')

    await user.click(screen.getByRole('button', { name: /下一步/ }))
    expect(await screen.findByText('当前没有可配置的字段信息')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /下一步/ }))

    expect(await screen.findByText('确认创建虚拟数据集')).toBeInTheDocument()
    expect(screen.getByText('降级虚拟数据集')).toBeInTheDocument()
    expect(screen.getByText('fallback-owner')).toBeInTheDocument()
    expect(screen.getByText('0 个')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /确认创建/ }))

    await waitFor(() => {
      expect(dialogMocks.createDataset).toHaveBeenCalledWith({
        dataset_type: 'virtual',
        dataset_name: '降级虚拟数据集',
        description: '字段分析失败时继续使用',
        owner: 'fallback-owner',
        source_id: 9,
        sql_query: 'select user_id, score from learning_records',
        fields: [],
      })
    })
  })

  it('创建失败时给出 destructive 提示，并停留在对话框确认流内', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    dialogMocks.createDataset.mockRejectedValueOnce({
      response: {
        data: {
          message: 'dataset exists',
        },
      },
    })

    renderDialog({ onOpenChange })

    expect(await screen.findByText('数据集名称 *')).toBeInTheDocument()
    await user.type(screen.getByPlaceholderText('例如: 高价值订单分析'), '重复数据集')
    await user.click(screen.getByRole('button', { name: /下一步/ }))
    await user.click(screen.getByRole('button', { name: '应用字段配置' }))
    await user.click(screen.getByRole('button', { name: /下一步/ }))

    expect(await screen.findByText('确认创建虚拟数据集')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /上一步/ }))
    expect(screen.getByTestId('field-configurator')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /下一步/ }))
    await user.click(screen.getByRole('button', { name: /确认创建/ }))

    await waitFor(() => {
      expect(dialogMocks.toast).toHaveBeenCalledWith({
        title: '创建失败',
        description: 'dataset exists',
        variant: 'destructive',
      })
    })
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: '保存为虚拟数据集' })).toBeInTheDocument()
    expect(screen.getByText('确认创建虚拟数据集')).toBeInTheDocument()
    expect(screen.getByText('重复数据集')).toBeInTheDocument()
  })
})
