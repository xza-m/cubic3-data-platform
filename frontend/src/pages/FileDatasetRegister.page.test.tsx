import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FileDatasetRegister, {
  handleInvalidFileDatasetSubmit,
  submitFileDatasetRegistration,
} from './FileDatasetRegister'

const fileRegisterMocks = vi.hoisted(() => ({
  uploadTabularFile: vi.fn(),
  createDataset: vi.fn(),
  toast: vi.fn(),
}))

const navigateMock = vi.fn()
const configuredFields = [
  {
    physical_name: 'student_name',
    data_type: 'string',
    display_name: '学生姓名',
    comment: '上传识别字段',
    field_order: 1,
  },
]

vi.mock('../api/files', () => ({
  uploadTabularFile: fileRegisterMocks.uploadTabularFile,
}))

vi.mock('../api/datasets', () => ({
  createDataset: fileRegisterMocks.createDataset,
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
      onClick?: (event?: React.MouseEvent<HTMLButtonElement>) => void
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
    useToast: () => ({ toast: fileRegisterMocks.toast }),
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
        <FileDatasetRegister />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('FileDatasetRegister page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fileRegisterMocks.uploadTabularFile.mockReset()
    fileRegisterMocks.createDataset.mockReset()
    fileRegisterMocks.toast.mockReset()
    navigateMock.mockReset()
    fileRegisterMocks.uploadTabularFile.mockResolvedValue({
      file_id: 'f1',
      file_name: 'scores.xlsx',
      file_path: '/tmp/scores.xlsx',
      file_size: 1024,
      row_count: 2,
      uploaded_at: '2026-03-25T10:00:00Z',
      columns: [
        { name: 'student_name', type: 'string', sample_values: ['Alice'] },
        { name: 'score', type: 'int', sample_values: [98] },
      ],
      fields: [
        {
          physical_name: 'student_name',
          data_type: 'string',
          business_type: 'dimension',
          sensitivity_level: 'public',
          confidence_score: 0.9,
          matched_rules: [],
          display_name: '学生姓名',
          comment: '',
        },
      ],
      sample_rows: [{ student_name: 'Alice', score: 98 }],
      preview: [{ student_name: 'Alice', score: 98 }],
    })
    fileRegisterMocks.createDataset.mockResolvedValue({ data: { id: 201 } })
  })

  it('明确支持 CSV / Excel 上传，并强调重新上传只会创建新数据集', async () => {
    const user = userEvent.setup()

    renderPage()

    expect(screen.getByText('上传 CSV / Excel 文件')).toBeInTheDocument()
    expect(screen.getByText(/支持 CSV \/ Excel 格式/)).toBeInTheDocument()

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).not.toBeNull()
    expect(input.accept).toBe('.csv,.xls,.xlsx')

    const file = new File(['name,score\nAlice,98'], 'scores.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    await user.upload(input, file)

    await waitFor(() => {
      expect(fileRegisterMocks.uploadTabularFile).toHaveBeenCalled()
    })
    expect(await screen.findByText('scores.xlsx')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.queryByText('示例文件.xlsx')).not.toBeInTheDocument()
    expect(screen.queryByText('示例样本')).not.toBeInTheDocument()
    expect(screen.getByText('重新上传将创建新的数据集对象，不会覆盖已有文件数据集。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新上传并重新创建' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '重新上传并重新创建' }))
    expect(screen.getByText('scores.xlsx')).toBeInTheDocument()
  })

  it('未上传文件时阻止进入下一步，并在上传失败时提示错误', async () => {
    const user = userEvent.setup()
    fileRegisterMocks.uploadTabularFile.mockRejectedValueOnce({
      response: { data: { message: '仅支持 CSV / Excel 文件' } },
      message: '仅支持 CSV / Excel 文件',
    })

    renderPage()

    await user.click(screen.getByRole('button', { name: '下一步' }))
    expect(fileRegisterMocks.toast).toHaveBeenCalledWith({
      title: '请先上传 CSV / Excel 文件',
      variant: 'warning',
    })

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['bad'], 'scores.csv', { type: 'text/csv' })
    await user.upload(input, file)

    await waitFor(() => {
      expect(fileRegisterMocks.uploadTabularFile).toHaveBeenCalled()
      expect(fileRegisterMocks.toast).toHaveBeenCalledWith({
        title: '上传失败',
        description: '仅支持 CSV / Excel 文件',
        variant: 'destructive',
      })
    })

    await user.click(screen.getByRole('button', { name: '下一步' }))
    expect(fileRegisterMocks.toast).toHaveBeenLastCalledWith({
      title: '请先上传 CSV / Excel 文件',
      variant: 'warning',
    })
  })

  it('已有成功上传上下文后重传失败时保留原文件上下文、已填表单与字段配置', async () => {
    const user = userEvent.setup()

    renderPage()

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const firstFile = new File(['name,score\nAlice,98'], 'scores.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    await user.upload(input, firstFile)

    await waitFor(() => {
      expect(fileRegisterMocks.uploadTabularFile).toHaveBeenCalledTimes(1)
    })
    expect(await screen.findByText('scores.xlsx')).toBeInTheDocument()

    fileRegisterMocks.uploadTabularFile.mockRejectedValueOnce({
      response: { data: { message: '重新上传失败' } },
      message: '重新上传失败',
    })

    await user.click(screen.getByRole('button', { name: '下一步' }))
    await user.type(screen.getByRole('textbox', { name: '例如: 2025年销售明细' }), '课堂成绩文件数据集')
    await user.click(screen.getByRole('button', { name: '下一步' }))
    await user.click(screen.getByRole('button', { name: '应用字段配置' }))

    expect(screen.getByText('字段配置器')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '上一步' }))
    await user.click(screen.getByRole('button', { name: '上一步' }))

    await user.click(screen.getByRole('button', { name: '重新上传并重新创建' }))
    const retryInput = document.querySelector('input[type="file"]') as HTMLInputElement

    const retryFile = new File(['name,score\nBob,88'], 'retry.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    await user.upload(retryInput, retryFile)

    await waitFor(() => {
      expect(fileRegisterMocks.uploadTabularFile).toHaveBeenCalledTimes(2)
      expect(fileRegisterMocks.toast).toHaveBeenCalledWith({
        title: '上传失败',
        description: '重新上传失败',
        variant: 'destructive',
      })
    })

    expect(screen.getByText('scores.xlsx')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新上传并重新创建' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '下一步' }))
    expect(fileRegisterMocks.toast).toHaveBeenLastCalledWith({
      title: '请先修复上传失败问题',
      variant: 'warning',
    })
    expect(screen.getByText('scores.xlsx')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新上传并重新创建' })).toBeInTheDocument()
  })

  it('提交校验失败时弹出 destructive 提示并回到填写信息步骤', () => {
    const toast = vi.fn()
    const setCurrentStep = vi.fn()

    handleInvalidFileDatasetSubmit({ toast, setCurrentStep })

    expect(toast).toHaveBeenCalledWith({
      title: '请输入数据集名称',
      variant: 'destructive',
    })
    expect(setCurrentStep).toHaveBeenCalledWith(1)
  })

  it('文件数据集提交校验为空名称时阻止继续，填写名称时允许提交', () => {
    const toast = vi.fn()
    const setCurrentStep = vi.fn()
    const onValid = vi.fn()

    submitFileDatasetRegistration({
      datasetName: '',
      toast,
      setCurrentStep,
      onValid,
    })

    expect(toast).toHaveBeenCalledWith({
      title: '请输入数据集名称',
      variant: 'destructive',
    })
    expect(setCurrentStep).toHaveBeenCalledWith(1)
    expect(onValid).not.toHaveBeenCalled()

    submitFileDatasetRegistration({
      datasetName: '课堂成绩文件数据集',
      toast,
      setCurrentStep,
      onValid,
    })

    expect(onValid).toHaveBeenCalledTimes(1)
  })

  it('支持完成多步骤并创建文件数据集', async () => {
    const user = userEvent.setup()

    renderPage()

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['name,score\nAlice,98'], 'scores.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    await user.upload(input, file)

    await waitFor(() => {
      expect(fileRegisterMocks.uploadTabularFile).toHaveBeenCalled()
    })
    await screen.findByText('scores.xlsx')
    await user.click(screen.getByRole('button', { name: '下一步' }))

    await user.click(screen.getByRole('button', { name: '下一步' }))
    expect(fileRegisterMocks.toast).toHaveBeenLastCalledWith({
      title: '请输入数据集名称',
      variant: 'destructive',
    })

    await user.type(screen.getByRole('textbox', { name: '例如: 2025年销售明细' }), '课堂成绩文件数据集')
    await user.type(screen.getByRole('textbox', { name: '描述此文件数据集的用途' }), '导入课堂成绩 Excel 文件')
    await user.clear(screen.getByRole('textbox', { name: '负责人' }))
    await user.type(screen.getByRole('textbox', { name: '负责人' }), 'data.ops')
    await user.click(screen.getByRole('button', { name: '下一步' }))

    expect(await screen.findByText('字段配置器')).toBeInTheDocument()
    expect(screen.getByText('请先完成字段配置，确认需要注册的字段后才能继续。')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '下一步' }))
    expect(fileRegisterMocks.toast).toHaveBeenLastCalledWith({
      title: '请先配置字段信息',
      variant: 'warning',
    })

    await user.click(screen.getByRole('button', { name: '应用字段配置' }))
    await user.click(screen.getByRole('button', { name: '下一步' }))
    expect(await screen.findByText('确认创建文件数据集')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '确认创建' }))

    await waitFor(() => {
      expect(fileRegisterMocks.createDataset).toHaveBeenCalled()
      expect(fileRegisterMocks.createDataset.mock.calls[0][0]).toEqual({
        dataset_type: 'file',
        dataset_name: '课堂成绩文件数据集',
        description: '导入课堂成绩 Excel 文件',
        owner: 'data.ops',
        file_metadata: {
          file_id: 'f1',
          file_path: '/tmp/scores.xlsx',
          file_name: 'scores.xlsx',
          file_size: 1024,
          row_count: 2,
          uploaded_at: '2026-03-25T10:00:00Z',
        },
        fields: configuredFields,
      })
    })
    expect(fileRegisterMocks.toast).toHaveBeenCalledWith({ title: '文件数据集创建成功' })
  })

  it('使用统一注册流程壳与预览面板承载上传流程', async () => {
    const user = userEvent.setup()

    renderPage()

    expect(screen.getByTestId('register-flow-shell')).toBeInTheDocument()
    expect(screen.getByTestId('preview-panel')).toBeInTheDocument()
    expect(screen.getByText('文件样本预览')).toBeInTheDocument()

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['name,score\nAlice,98'], 'scores.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    await user.upload(input, file)

    expect(await screen.findByText('真实文件预览')).toBeInTheDocument()
    expect(screen.getByText('样本预览（前 2 行）')).toBeInTheDocument()
  })

  it('创建文件数据集失败时展示 destructive 提示', async () => {
    const user = userEvent.setup()
    fileRegisterMocks.createDataset.mockRejectedValueOnce({
      response: { data: { message: '文件数据集已存在' } },
    })

    renderPage()

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['name,score\nAlice,98'], 'scores.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    await user.upload(input, file)

    await waitFor(() => {
      expect(fileRegisterMocks.uploadTabularFile).toHaveBeenCalled()
    })
    await screen.findByText('scores.xlsx')
    await user.click(screen.getByRole('button', { name: '下一步' }))
    await user.type(screen.getByRole('textbox', { name: '例如: 2025年销售明细' }), '重复文件数据集')
    await user.click(screen.getByRole('button', { name: '下一步' }))
    await user.click(screen.getByRole('button', { name: '应用字段配置' }))
    await user.click(screen.getByRole('button', { name: '下一步' }))
    await user.click(screen.getByRole('button', { name: '确认创建' }))

    await waitFor(() => {
      expect(fileRegisterMocks.toast).toHaveBeenCalledWith({
        title: '创建失败',
        description: '文件数据集已存在',
        variant: 'destructive',
      })
    })
  })

  it('支持从首步返回列表，并在后续步骤回到上一步', async () => {
    const user = userEvent.setup()

    renderPage()

    await user.click(screen.getByRole('button', { name: '返回' }))
    expect(navigateMock).toHaveBeenCalledWith('/data-center/datasets')

    navigateMock.mockClear()

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['name,score\nAlice,98'], 'scores.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    await user.upload(input, file)
    await waitFor(() => {
      expect(fileRegisterMocks.uploadTabularFile).toHaveBeenCalled()
    })

    await user.click(screen.getByRole('button', { name: '下一步' }))
    await user.click(screen.getByRole('button', { name: '上一步' }))

    expect(screen.getByText('scores.xlsx')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新上传并重新创建' })).toBeInTheDocument()
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('后端未返回识别字段时使用列信息回退生成字段配置', async () => {
    const user = userEvent.setup()
    fileRegisterMocks.uploadTabularFile.mockResolvedValueOnce({
      file_id: 'f2',
      file_name: 'fallback.csv',
      file_path: '/tmp/fallback.csv',
      file_size: 256,
      row_count: 1,
      uploaded_at: '2026-03-25T10:00:00Z',
      columns: [{ name: 'student_name', type: 'string', sample_values: ['Alice'] }],
      sample_rows: [{ student_name: 'Alice' }],
      preview: [{ student_name: 'Alice' }],
      fields: undefined,
    })

    renderPage()

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['student_name\nAlice'], 'fallback.csv', { type: 'text/csv' })
    await user.upload(input, file)

    await waitFor(() => {
      expect(fileRegisterMocks.uploadTabularFile).toHaveBeenCalled()
    })
    await user.click(screen.getByRole('button', { name: '下一步' }))
    await user.type(screen.getByRole('textbox', { name: '例如: 2025年销售明细' }), '回退字段文件数据集')
    await user.click(screen.getByRole('button', { name: '下一步' }))

    expect(await screen.findByText('字段配置器')).toBeInTheDocument()
  })
})
