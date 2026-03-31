import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DatasetRegister, {
  handleInvalidDatasetRegisterSubmit,
  submitDatasetRegistration,
} from './DatasetRegister'

const datasetRegisterMocks = vi.hoisted(() => ({
  getDataSources: vi.fn(),
  getDataSourceDatabases: vi.fn(),
  getDataSourceTables: vi.fn(),
  previewDataset: vi.fn(),
  createDataset: vi.fn(),
  toast: vi.fn(),
}))

const navigateMock = vi.fn()
const configuredFields = [
  {
    physical_name: 'user_id',
    data_type: 'string',
    display_name: '用户 ID',
    comment: '主键',
    business_type: 'dimension',
    sensitivity_level: 'public',
    field_order: 1,
  },
]

vi.mock('../api/datasources', () => ({
  getDataSources: datasetRegisterMocks.getDataSources,
  getDataSourceDatabases: datasetRegisterMocks.getDataSourceDatabases,
  getDataSourceTables: datasetRegisterMocks.getDataSourceTables,
}))

vi.mock('../api/datasets', () => ({
  previewDataset: datasetRegisterMocks.previewDataset,
  createDataset: datasetRegisterMocks.createDataset,
}))

vi.mock('../components/FieldConfigurator/FieldConfigurator', () => ({
  default: ({
    onConfigChange,
  }: {
    onConfigChange: (configs: typeof configuredFields) => void
  }) => (
    <div>
      <div>字段配置器</div>
      <button type="button" onClick={() => onConfigChange(configuredFields)}>
        应用字段配置
      </button>
    </div>
  ),
}))

vi.mock('@/components/business', async () => {
  const actual = await vi.importActual<typeof import('@/components/business')>('@/components/business')
  return {
    ...actual,
    FormButton: ({
      children,
      onClick,
      disabled,
      type = 'button',
    }: {
      children: ReactNode
      onClick?: () => void
      disabled?: boolean
      type?: 'button' | 'submit' | 'reset'
    }) => (
      <button type={type} onClick={onClick} disabled={disabled}>
        {children}
      </button>
    ),
    FormInput: ({
      value,
      onChange,
      placeholder,
      id,
    }: {
      value: string
      onChange: (value: string) => void
      placeholder?: string
      id?: string
    }) => (
      <input
        id={id}
        aria-label={placeholder || id || 'input'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    ),
    FormTextarea: ({
      value,
      onChange,
      placeholder,
      id,
    }: {
      value: string
      onChange: (value: string) => void
      placeholder?: string
      id?: string
    }) => (
      <textarea
        id={id}
        aria-label={placeholder || id || 'textarea'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    ),
    FormSelect: ({
      value,
      onValueChange,
      options,
      placeholder,
      disabled,
    }: {
      value?: string
      onValueChange: (value: string) => void
      options: Array<{ value: string; label: string }>
      placeholder?: string
      disabled?: boolean
    }) => (
      <select
        aria-label={placeholder || 'select'}
        value={value || ''}
        disabled={disabled}
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
    DataTable: ({
      columns,
      data,
    }: {
      columns: Array<{ accessorKey?: string | number; header?: ReactNode }>
      data: Array<Record<string, unknown>>
    }) => (
      <table>
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th key={String(column.accessorKey || index)}>{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((column, colIndex) => (
                <td key={`${rowIndex}-${String(column.accessorKey || colIndex)}`}>
                  {column.accessorKey ? String(row[String(column.accessorKey)] ?? '') : ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    ),
    PageCard: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    useToast: () => ({ toast: datasetRegisterMocks.toast }),
  }
})

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigateMock,
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
        <DatasetRegister />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('DatasetRegister page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    datasetRegisterMocks.getDataSources.mockReset()
    datasetRegisterMocks.getDataSourceDatabases.mockReset()
    datasetRegisterMocks.getDataSourceTables.mockReset()
    datasetRegisterMocks.previewDataset.mockReset()
    datasetRegisterMocks.createDataset.mockReset()
    datasetRegisterMocks.toast.mockReset()
    navigateMock.mockReset()
    datasetRegisterMocks.getDataSources.mockResolvedValue({
      data: {
        items: [
          { id: 1, name: '教学 PostgreSQL', source_type: 'postgresql' },
        ],
      },
    })
    datasetRegisterMocks.getDataSourceDatabases.mockResolvedValue({ data: ['learning'] })
    datasetRegisterMocks.getDataSourceTables.mockResolvedValue({
      data: [{ table_name: 'lesson_progress', comment: '课堂进度明细' }],
    })
    datasetRegisterMocks.previewDataset.mockResolvedValue({
      data: {
        preview_limit: 20,
        sample_columns: ['user_id', 'score'],
        sample_rows: [{ user_id: 'alice', score: 95 }],
        fields: [
          { physical_name: 'user_id', data_type: 'string', business_type: 'dimension', sensitivity_level: 'public' },
          { physical_name: 'score', data_type: 'int', business_type: 'metric', sensitivity_level: 'internal' },
        ],
        statistics: {
          total_fields: 2,
          partition_fields: 1,
          measure_fields: 1,
          sensitive_fields: 1,
        },
        table_info: {
          database: 'learning',
          table: 'lesson_progress',
        },
      },
    })
    datasetRegisterMocks.createDataset.mockResolvedValue({ data: { id: 101 } })
  })

  it('在选择物理表后展示字段识别摘要与 LIMIT 20 样本预览', async () => {
    const user = userEvent.setup()

    renderPage()

    await screen.findByRole('option', { name: '教学 PostgreSQL (postgresql)' })
    await user.selectOptions(await screen.findByRole('combobox', { name: '请选择数据源' }), '1')
    await user.selectOptions(await screen.findByRole('combobox', { name: '请选择数据库' }), 'learning')
    await user.selectOptions(await screen.findByRole('combobox', { name: '请选择数据表' }), 'lesson_progress')

    expect(await screen.findByText('元数据加载成功，共 2 个字段')).toBeInTheDocument()
    expect(screen.getByText('样本预览（前 20 行）')).toBeInTheDocument()
    expect(screen.getByText('字段识别摘要：分区 1 个，敏感字段 1 个。')).toBeInTheDocument()
    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.getByText('95')).toBeInTheDocument()

    await waitFor(() => {
      expect(datasetRegisterMocks.previewDataset).toHaveBeenCalledWith({
        datasource_id: 1,
        database: 'learning',
        table: 'lesson_progress',
      })
    })
  })

  it('物理表注册流程在 preview 失败时展示 error 态，并保留已选择的数据源上下文', async () => {
    const user = userEvent.setup()
    datasetRegisterMocks.previewDataset.mockRejectedValueOnce({
      response: { data: { message: 'schema offline' } },
    })

    renderPage()

    await screen.findByRole('option', { name: '教学 PostgreSQL (postgresql)' })
    await user.selectOptions(await screen.findByRole('combobox', { name: '请选择数据源' }), '1')
    await user.selectOptions(await screen.findByRole('combobox', { name: '请选择数据库' }), 'learning')
    await user.selectOptions(await screen.findByRole('combobox', { name: '请选择数据表' }), 'lesson_progress')

    expect(await screen.findByText('元数据加载失败')).toBeInTheDocument()
    expect(screen.getByText('schema offline')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '请选择数据源' })).toHaveValue('1')
    expect(screen.getByRole('combobox', { name: '请选择数据库' })).toHaveValue('learning')
    expect(screen.getByRole('combobox', { name: '请选择数据表' })).toHaveValue('lesson_progress')
  })

  it('物理表 preview 失败后支持直接重试加载', async () => {
    const user = userEvent.setup()
    datasetRegisterMocks.previewDataset
      .mockRejectedValueOnce({
        response: { data: { message: 'schema offline' } },
      })
      .mockResolvedValueOnce({
        data: {
          preview_limit: 20,
          sample_columns: ['user_id', 'score'],
          sample_rows: [{ user_id: 'alice', score: 95 }],
          fields: [
            { physical_name: 'user_id', data_type: 'string', business_type: 'dimension', sensitivity_level: 'public' },
          ],
          statistics: {
            total_fields: 1,
            partition_fields: 0,
            measure_fields: 0,
            sensitive_fields: 0,
          },
          table_info: {
            database: 'learning',
            table: 'lesson_progress',
          },
        },
      })

    renderPage()

    await screen.findByRole('option', { name: '教学 PostgreSQL (postgresql)' })
    await user.selectOptions(await screen.findByRole('combobox', { name: '请选择数据源' }), '1')
    await user.selectOptions(await screen.findByRole('combobox', { name: '请选择数据库' }), 'learning')
    await user.selectOptions(await screen.findByRole('combobox', { name: '请选择数据表' }), 'lesson_progress')

    expect(await screen.findByText('元数据加载失败')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试加载' }))

    expect(await screen.findByText('元数据加载成功，共 1 个字段')).toBeInTheDocument()
    expect(screen.getByText('alice')).toBeInTheDocument()
    await waitFor(() => {
      expect(datasetRegisterMocks.previewDataset).toHaveBeenCalledTimes(2)
    })
  })

  it('在未完成前置条件时阻止继续下一步', async () => {
    const user = userEvent.setup()

    renderPage()

    await user.click(screen.getByRole('button', { name: '下一步' }))
    expect(datasetRegisterMocks.toast).toHaveBeenCalledWith({
      title: '请先选择数据源、数据库和表',
      variant: 'warning',
    })
  })

  it('提交校验为空名称时触发回退，填写名称时继续提交', () => {
    const toast = vi.fn()
    const setCurrentStep = vi.fn()
    const onValid = vi.fn()

    submitDatasetRegistration({
      datasetName: '',
      toast,
      setCurrentStep,
      onValid,
    })

    expect(toast).toHaveBeenCalledWith({
      title: '请填写数据集名称',
      variant: 'destructive',
    })
    expect(setCurrentStep).toHaveBeenCalledWith(1)
    expect(onValid).not.toHaveBeenCalled()

    submitDatasetRegistration({
      datasetName: '课堂进度数据集',
      toast,
      setCurrentStep,
      onValid,
    })

    expect(onValid).toHaveBeenCalledTimes(1)
  })

  it('提交校验失败时弹出 destructive 提示并回到填写信息步骤', () => {
    const toast = vi.fn()
    const setCurrentStep = vi.fn()

    handleInvalidDatasetRegisterSubmit({ toast, setCurrentStep })

    expect(toast).toHaveBeenCalledWith({
      title: '请填写数据集名称',
      variant: 'destructive',
    })
    expect(setCurrentStep).toHaveBeenCalledWith(1)
  })

  it('支持从第一步返回列表，并在后续步骤回到上一步', async () => {
    const user = userEvent.setup()

    renderPage()

    await user.click(screen.getByRole('button', { name: '返回' }))
    expect(navigateMock).toHaveBeenCalledWith('/data-center/datasets')

    navigateMock.mockClear()

    await screen.findByRole('option', { name: '教学 PostgreSQL (postgresql)' })
    await user.selectOptions(await screen.findByRole('combobox', { name: '请选择数据源' }), '1')
    await user.selectOptions(await screen.findByRole('combobox', { name: '请选择数据库' }), 'learning')
    await user.selectOptions(await screen.findByRole('combobox', { name: '请选择数据表' }), 'lesson_progress')
    await screen.findByText('元数据加载成功，共 2 个字段')
    await user.click(screen.getByRole('button', { name: '下一步' }))
    await user.click(screen.getByRole('button', { name: '上一步' }))

    expect(screen.getByText('选择数据源和表')).toBeInTheDocument()
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('使用统一注册流程壳与预览面板承载步骤内容', async () => {
    const user = userEvent.setup()

    renderPage()

    expect(screen.getByTestId('register-flow-shell')).toBeInTheDocument()
    expect(screen.getByTestId('preview-panel')).toBeInTheDocument()
    expect(screen.getByText('样本预览')).toBeInTheDocument()

    await screen.findByRole('option', { name: '教学 PostgreSQL (postgresql)' })
    await user.selectOptions(await screen.findByRole('combobox', { name: '请选择数据源' }), '1')
    await user.selectOptions(await screen.findByRole('combobox', { name: '请选择数据库' }), 'learning')
    await user.selectOptions(await screen.findByRole('combobox', { name: '请选择数据表' }), 'lesson_progress')

    expect(await screen.findByText('样本预览（前 20 行）')).toBeInTheDocument()
  })

  it('支持完成多步骤注册并提交创建数据集', async () => {
    const user = userEvent.setup()

    renderPage()

    await screen.findByRole('option', { name: '教学 PostgreSQL (postgresql)' })
    await user.selectOptions(await screen.findByRole('combobox', { name: '请选择数据源' }), '1')
    await user.selectOptions(await screen.findByRole('combobox', { name: '请选择数据库' }), 'learning')
    await user.selectOptions(await screen.findByRole('combobox', { name: '请选择数据表' }), 'lesson_progress')

    await screen.findByText('元数据加载成功，共 2 个字段')
    await user.click(screen.getByRole('button', { name: '下一步' }))

    await user.click(screen.getByRole('button', { name: '下一步' }))
    expect(datasetRegisterMocks.toast).toHaveBeenLastCalledWith({
      title: '请输入数据集名称',
      variant: 'warning',
    })

    await user.type(screen.getByRole('textbox', { name: '例如: 用户订单数据集' }), '课堂进度数据集')
    await user.type(screen.getByRole('textbox', { name: '描述此数据集的用途和业务含义' }), '用于跟踪课堂答题进度')
    await user.clear(screen.getByRole('textbox', { name: '负责人' }))
    await user.type(screen.getByRole('textbox', { name: '负责人' }), 'teacher.ops')
    await user.click(screen.getByRole('button', { name: '下一步' }))

    expect(await screen.findByText('字段配置器')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '下一步' }))
    expect(datasetRegisterMocks.toast).toHaveBeenLastCalledWith({
      title: '请先配置字段信息',
      variant: 'warning',
    })

    await user.click(screen.getByRole('button', { name: '应用字段配置' }))
    await user.click(screen.getByRole('button', { name: '下一步' }))

    expect(await screen.findByText('确认注册数据集')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确认注册' }))

    await waitFor(() => {
      expect(datasetRegisterMocks.createDataset).toHaveBeenCalled()
      expect(datasetRegisterMocks.createDataset.mock.calls[0][0]).toEqual({
        dataset_name: '课堂进度数据集',
        description: '用于跟踪课堂答题进度',
        owner: 'teacher.ops',
        source_id: 1,
        physical_table: 'learning.lesson_progress',
        fields: configuredFields,
      })
    })
    expect(datasetRegisterMocks.toast).toHaveBeenCalledWith({ title: '数据集注册成功' })
  })

  it('在创建失败时展示 destructive 提示', async () => {
    const user = userEvent.setup()
    datasetRegisterMocks.createDataset.mockRejectedValueOnce({
      response: { data: { message: '数据集编码已存在' } },
    })

    renderPage()

    await screen.findByRole('option', { name: '教学 PostgreSQL (postgresql)' })
    await user.selectOptions(await screen.findByRole('combobox', { name: '请选择数据源' }), '1')
    await user.selectOptions(await screen.findByRole('combobox', { name: '请选择数据库' }), 'learning')
    await user.selectOptions(await screen.findByRole('combobox', { name: '请选择数据表' }), 'lesson_progress')
    await screen.findByText('元数据加载成功，共 2 个字段')

    await user.click(screen.getByRole('button', { name: '下一步' }))
    await user.type(screen.getByRole('textbox', { name: '例如: 用户订单数据集' }), '重复数据集')
    await user.click(screen.getByRole('button', { name: '下一步' }))
    await user.click(screen.getByRole('button', { name: '应用字段配置' }))
    await user.click(screen.getByRole('button', { name: '下一步' }))
    await user.click(screen.getByRole('button', { name: '确认注册' }))

    await waitFor(() => {
      expect(datasetRegisterMocks.toast).toHaveBeenCalledWith({
        title: '注册失败，请重试',
        description: '数据集编码已存在',
        variant: 'destructive',
      })
    })
  })
})
