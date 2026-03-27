import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DatasetDetail from './DatasetDetail'

const datasetDetailMocks = vi.hoisted(() => ({
  getDataset: vi.fn(),
  updateDataset: vi.fn(),
  toast: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock('@/api/datasets', () => ({
  getDataset: datasetDetailMocks.getDataset,
  updateDataset: datasetDetailMocks.updateDataset,
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => datasetDetailMocks.navigate,
  }
})

vi.mock('@/components/business', () => ({
  FormButton: ({
    children,
    onClick,
    disabled,
    loading,
    className,
  }: {
    children?: ReactNode
    onClick?: () => void
    disabled?: boolean
    loading?: boolean
    className?: string
  }) => (
    <button type="button" onClick={onClick} disabled={disabled || loading} className={className}>
      {children}
    </button>
  ),
  FormInput: ({
    value,
    onChange,
    disabled,
    placeholder,
    className,
  }: {
    value?: string
    onChange?: (event: { target: { value: string } }) => void
    disabled?: boolean
    placeholder?: string
    className?: string
  }) => (
    <input
      value={value ?? ''}
      onChange={(event) => onChange?.({ target: { value: event.target.value } })}
      disabled={disabled}
      placeholder={placeholder}
      className={className}
    />
  ),
  FormTextarea: ({
    value,
    onChange,
    rows,
    placeholder,
    className,
  }: {
    value?: string
    onChange?: (event: { target: { value: string } }) => void
    rows?: number
    placeholder?: string
    className?: string
  }) => (
    <textarea
      value={value ?? ''}
      onChange={(event) => onChange?.({ target: { value: event.target.value } })}
      rows={rows}
      placeholder={placeholder}
      className={className}
    />
  ),
  DataTable: ({
    columns,
    data,
  }: {
    columns: Array<{ key: string; title: string; dataIndex?: string; render?: (value: unknown, record: Record<string, unknown>) => ReactNode }>
    data: Array<Record<string, unknown>>
  }) => (
    <table>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.key}>{column.title}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((record, index) => (
          <tr key={String(record.id ?? index)}>
            {columns.map((column) => {
              const value = column.dataIndex ? record[column.dataIndex] : undefined
              return (
                <td key={column.key}>
                  {column.render ? column.render(value, record) : String(value ?? '')}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  ),
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  PageCard: ({ children, className }: { children: ReactNode; className?: string }) => <section className={className}>{children}</section>,
  DataCenterPageShell: ({
    title,
    description,
    actions,
    children,
  }: {
    title: string
    description?: ReactNode
    actions?: ReactNode
    children: ReactNode
  }) => (
    <div>
      <header>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
        {actions}
      </header>
      <div>{children}</div>
    </div>
  ),
  CapabilityGateCard: ({ title, reason }: { title: string; reason: string }) => (
    <section>
      <h3>{title}</h3>
      <p>{reason}</p>
      <span>当前阶段未接入后端能力</span>
    </section>
  ),
  PreviewPanel: ({
    title,
    state,
    emptyDescription,
    children,
  }: {
    title: string
    state: 'ready' | 'empty' | 'error' | 'loading'
    emptyDescription?: ReactNode
    children?: ReactNode
  }) => (
    <section>
      <h3>{title}</h3>
      {state === 'empty' ? <div>{emptyDescription}</div> : children}
    </section>
  ),
  useToast: () => ({ toast: datasetDetailMocks.toast }),
}))

vi.mock('@/components/ui/label', () => ({
  Label: ({ children }: { children: ReactNode }) => <label>{children}</label>,
}))

const datasetFixture = {
  id: 7,
  dataset_code: 'answer_summary',
  dataset_name: '答题汇总',
  physical_table: 'dws.answer_summary',
  source_type: 'maxcompute',
  owner: '教学数据组',
  created_at: '2026-03-20T10:00:00.000Z',
  last_sync_at: '2026-03-25T08:30:00.000Z',
  description: '按学生聚合的答题表现。',
  sync_status: 'synced',
  sync_error: '',
  fields: [
    {
      id: 1,
      physical_name: 'student_id',
      data_type: 'string',
      display_name: '学生ID',
      business_type: 'dimension',
      sensitivity_level: 'internal',
      comment: '学生唯一标识',
      field_order: 1,
    },
  ],
}

function renderPage(initialEntry = '/data-center/datasets/7') {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/data-center/datasets/:id" element={<DatasetDetail />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('DatasetDetail page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    datasetDetailMocks.getDataset.mockResolvedValue({ data: datasetFixture })
    datasetDetailMocks.updateDataset.mockResolvedValue({ data: { ...datasetFixture, dataset_name: '答题汇总（新）' } })
  })

  it('展示数据集基本信息和字段表格', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { level: 1, name: '答题汇总' })).toBeInTheDocument()
    expect(datasetDetailMocks.getDataset).toHaveBeenCalledWith(7, true)
    expect(screen.getAllByText('answer_summary')).toHaveLength(2)
    expect(screen.getByText('dws.answer_summary')).toBeInTheDocument()
    expect(screen.getByText('教学数据组')).toBeInTheDocument()
    expect(screen.getByText('学生ID')).toBeInTheDocument()
    expect(screen.getByText('内部')).toBeInTheDocument()
  })

  it('数据集不存在时展示空态', async () => {
    datasetDetailMocks.getDataset.mockResolvedValueOnce({ data: null })

    renderPage('/data-center/datasets/99')

    expect(await screen.findByText('数据集不存在')).toBeInTheDocument()
  })

  it('支持编辑并保存数据集信息', async () => {
    const user = userEvent.setup()

    renderPage()

    await screen.findByRole('heading', { level: 1, name: '答题汇总' })
    await user.click(screen.getByRole('button', { name: '编辑' }))

    const nameInput = screen.getByPlaceholderText('请输入数据集名称')
    const ownerInput = screen.getByPlaceholderText('请输入负责人')
    const descriptionInput = screen.getByPlaceholderText('请输入描述')

    await user.clear(nameInput)
    await user.type(nameInput, '答题汇总（新）')
    await user.clear(ownerInput)
    await user.type(ownerInput, '语义治理组')
    await user.clear(descriptionInput)
    await user.type(descriptionInput, '新的描述')
    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(datasetDetailMocks.updateDataset).toHaveBeenCalledWith(7, {
        dataset_name: '答题汇总（新）',
        description: '新的描述',
        owner: '语义治理组',
      })
    })
    expect(datasetDetailMocks.toast).toHaveBeenCalledWith({
      title: '保存成功',
      description: '数据集信息已更新',
    })
  })

  it('校验空名称并处理保存失败', async () => {
    const user = userEvent.setup()
    datasetDetailMocks.updateDataset.mockRejectedValueOnce({
      response: { data: { message: '没有权限修改数据集' } },
    })

    renderPage()

    await screen.findByRole('heading', { level: 1, name: '答题汇总' })
    await user.click(screen.getByRole('button', { name: '编辑' }))

    const nameInput = screen.getByPlaceholderText('请输入数据集名称') as HTMLInputElement
    const ownerInput = screen.getByPlaceholderText('请输入负责人') as HTMLInputElement
    const descriptionInput = screen.getByPlaceholderText('请输入描述') as HTMLTextAreaElement
    await user.clear(nameInput)
    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(datasetDetailMocks.toast).toHaveBeenCalledWith({
      title: '请输入数据集名称',
      variant: 'destructive',
    })

    await user.type(nameInput, '答题汇总（失败）')
    await user.clear(ownerInput)
    await user.type(ownerInput, '失败后的负责人')
    await user.clear(descriptionInput)
    await user.type(descriptionInput, '失败后的描述')
    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(datasetDetailMocks.toast).toHaveBeenCalledWith({
        title: '保存失败',
        description: '没有权限修改数据集',
        variant: 'destructive',
      })
    })
    expect(nameInput.value).toBe('答题汇总（失败）')
    expect(ownerInput.value).toBe('失败后的负责人')
    expect(descriptionInput.value).toBe('失败后的描述')
  })

  it('同步失败且没有字段时展示错误摘要和空字段态', async () => {
    datasetDetailMocks.getDataset.mockResolvedValueOnce({
      data: {
        ...datasetFixture,
        sync_status: 'failed',
        sync_error: '字段同步失败',
        source_type: '',
        description: '',
        fields: [],
      },
    })

    renderPage()

    expect(await screen.findByRole('heading', { level: 1, name: '答题汇总' })).toBeInTheDocument()
    expect(screen.getByText('失败')).toBeInTheDocument()
    expect(screen.getByText('字段同步失败')).toBeInTheDocument()
    expect(screen.getByText('无描述')).toBeInTheDocument()
    expect(screen.getByText('暂无字段信息')).toBeInTheDocument()
  })

  it('在详情页优先展示真实 sample_rows 预览，没有预览数据时展示明确空态', async () => {
    datasetDetailMocks.getDataset.mockResolvedValueOnce({
      data: {
        ...datasetFixture,
        sample_columns: ['student_id', 'score'],
        sample_rows: [{ student_id: 's1', score: 95 }],
      },
    })

    renderPage()

    expect(await screen.findByText('数据预览')).toBeInTheDocument()
    expect(screen.getByText('s1')).toBeInTheDocument()
    expect(screen.getByText('95')).toBeInTheDocument()
  })

  it('没有 sample_rows 时展示明确预览空态，并将治理模块保持为禁用态', async () => {
    renderPage()

    expect(await screen.findByText('数据预览')).toBeInTheDocument()
    expect(screen.getByText('当前数据集暂无可展示预览')).toBeInTheDocument()
    expect(screen.getByText('血缘分析')).toBeInTheDocument()
    expect(screen.getByText('影响分析')).toBeInTheDocument()
    expect(screen.getByText('质量评分')).toBeInTheDocument()
    expect(screen.getAllByText('当前阶段未接入后端能力').length).toBeGreaterThanOrEqual(3)
  })

  it('取消编辑会重置表单，并为缺失字段信息显示占位符', async () => {
    const user = userEvent.setup()
    datasetDetailMocks.getDataset.mockResolvedValueOnce({
      data: {
        ...datasetFixture,
        fields: [
          {
            ...datasetFixture.fields[0],
            display_name: '',
            comment: '',
          },
        ],
      },
    })

    renderPage()

    expect(await screen.findByRole('heading', { level: 1, name: '答题汇总' })).toBeInTheDocument()
    expect(screen.getAllByText('-').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: '编辑' }))
    const nameInput = screen.getByPlaceholderText('请输入数据集名称')
    await user.clear(nameInput)
    await user.type(nameInput, '临时名称')
    await user.click(screen.getByRole('button', { name: '取消' }))

    expect(screen.queryByDisplayValue('临时名称')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '编辑' })).toBeInTheDocument()
  })
})
