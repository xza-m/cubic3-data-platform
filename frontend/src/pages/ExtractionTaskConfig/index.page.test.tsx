import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ExtractionTaskConfig from './index'

const extractionConfigMocks = vi.hoisted(() => ({
  createTask: vi.fn(),
  toast: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock('../../api/extraction', () => ({
  createTask: extractionConfigMocks.createTask,
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => extractionConfigMocks.navigate,
  }
})

vi.mock('./StepDatasetFields', () => ({
  default: ({
    datasetId,
    selectedFields,
    onDatasetChange,
    onFieldsChange,
    onFieldsMetaChange,
  }: {
    datasetId: number | null
    selectedFields: string[]
    onDatasetChange: (id: number) => void
    onFieldsChange: (fields: string[]) => void
    onFieldsMetaChange: (fields: Array<{ name: string; type: string }>) => void
  }) => (
    <div>
      <div>当前数据集：{datasetId ?? '未选择'}</div>
      <div>已选字段：{selectedFields.length}</div>
      <button
        type="button"
        onClick={() => {
          onDatasetChange(42)
          onFieldsChange(['student_id', 'score'])
          onFieldsMetaChange([
            { name: 'student_id', type: 'string' },
            { name: 'score', type: 'number' },
          ])
        }}
      >
        选择示例数据集
      </button>
    </div>
  ),
}))

vi.mock('./StepFilterConfig', () => ({
  default: ({
    fields,
    onFilterChange,
  }: {
    fields: Array<{ name: string; type: string }>
    onFilterChange: (value: unknown) => void
  }) => (
    <div>
      <div>字段数量：{fields.length}</div>
      <button
        type="button"
        onClick={() =>
          onFilterChange({
            logic: 'AND',
            filters: [{ field: 'score', operator: '>', value: 80 }],
            groups: [],
          })
        }
      >
        应用过滤条件
      </button>
    </div>
  ),
}))

vi.mock('./StepPreview', () => ({
  default: ({
    datasetId,
    selectedFields,
    filterConditions,
    onSave,
    isSaving,
  }: {
    datasetId: number
    selectedFields: string[]
    filterConditions: { filters: unknown[] }
    onSave: (payload: Record<string, unknown>) => void
    isSaving: boolean
  }) => (
    <div>
      <div>预览数据集：{datasetId}</div>
      <div>预览字段：{selectedFields.join(',')}</div>
      <div>过滤器数量：{filterConditions.filters.length}</div>
      <button
        type="button"
        disabled={isSaving}
        onClick={() =>
          onSave({
            task_name: '高分学员导出',
            dataset_id: datasetId,
            selected_fields: selectedFields,
            filter_conditions: filterConditions,
          })
        }
      >
        保存任务
      </button>
    </div>
  ),
}))

vi.mock('@/components/business', () => ({
  FormButton: ({
    children,
    onClick,
    disabled,
    className,
  }: {
    children?: ReactNode
    onClick?: () => void
    disabled?: boolean
    className?: string
  }) => (
    <button type="button" onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  ),
  useToast: () => ({ toast: extractionConfigMocks.toast }),
}))

function renderPage(path = '/extraction/config') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/extraction/config" element={<ExtractionTaskConfig />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('ExtractionTaskConfig page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    extractionConfigMocks.createTask.mockResolvedValue({ id: 101 })
  })

  it('支持从预选数据集继续向导并创建任务', async () => {
    const user = userEvent.setup()

    renderPage('/extraction/config?dataset=42')

    expect(screen.getByText('当前数据集：42')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下一步' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: '下一步' }))
    expect(screen.getByText('字段数量：0')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '应用过滤条件' }))

    await user.click(screen.getByRole('button', { name: '下一步' }))
    expect(screen.getByText('预览数据集：42')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '保存任务' }))

    await waitFor(() => {
      expect(extractionConfigMocks.createTask).toHaveBeenCalled()
      expect(extractionConfigMocks.createTask.mock.calls[0]?.[0]).toEqual({
        task_name: '高分学员导出',
        dataset_id: 42,
        selected_fields: [],
        filter_conditions: {
          logic: 'AND',
          filters: [{ field: 'score', operator: '>', value: 80 }],
          groups: [],
        },
      })
    })
    expect(extractionConfigMocks.toast).toHaveBeenCalledWith({ title: '任务创建成功' })

    await waitFor(() => {
      expect(extractionConfigMocks.navigate).toHaveBeenCalledWith('/extraction-tasks')
    })
  })

  it('未选择数据集时下一步禁用，选择后可推进向导', async () => {
    const user = userEvent.setup()

    renderPage()

    expect(screen.getByText('当前数据集：未选择')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下一步' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '选择示例数据集' }))
    expect(screen.getByText('已选字段：2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下一步' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: '下一步' }))
    expect(screen.getByText('字段数量：2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '上一步' }))
    expect(screen.getByText('当前数据集：42')).toBeInTheDocument()
  })

  it('创建失败时展示 destructive 提示，并支持返回任务列表', async () => {
    const user = userEvent.setup()
    extractionConfigMocks.createTask.mockRejectedValueOnce(new Error('保存失败'))

    renderPage()

    await user.click(screen.getByRole('button', { name: '返回任务列表' }))
    expect(extractionConfigMocks.navigate).toHaveBeenCalledWith('/extraction-tasks')

    await user.click(screen.getByRole('button', { name: '选择示例数据集' }))
    await user.click(screen.getByRole('button', { name: '下一步' }))
    await user.click(screen.getByRole('button', { name: '下一步' }))
    await user.click(screen.getByRole('button', { name: '保存任务' }))

    await waitFor(() => {
      expect(extractionConfigMocks.toast).toHaveBeenCalledWith({
        title: '创建任务失败',
        description: '保存失败',
        variant: 'destructive',
      })
    })
  })
})
