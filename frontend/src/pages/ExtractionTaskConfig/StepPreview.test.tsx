import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import StepPreview from './StepPreview'

const previewMocks = vi.hoisted(() => ({
  previewData: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('../../api/extraction', () => ({
  previewData: previewMocks.previewData,
}))

vi.mock('@/components/business', () => ({
  FormButton: ({
    children,
    onClick,
    disabled,
    loading,
    className,
    variant,
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    loading?: boolean
    className?: string
    variant?: string
  }) => (
    <button type="button" onClick={onClick} disabled={disabled} data-variant={variant} className={className}>
      {loading ? '处理中...' : children}
    </button>
  ),
  DataTable: ({
    columns,
    data,
  }: {
    columns: Array<{ accessorKey?: string | number }>
    data: Array<Record<string, unknown>>
  }) => <div data-testid="preview-table">{`rows:${data.length};cols:${columns.length}`}</div>,
  useToast: () => ({ toast: previewMocks.toast }),
}))

vi.mock('@/components/ui/accordion', () => ({
  Accordion: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AccordionItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AccordionTrigger: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
  AccordionContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

function renderStep(props: Partial<React.ComponentProps<typeof StepPreview>> = {}) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  const onSave = vi.fn()

  render(
    <QueryClientProvider client={client}>
      <StepPreview
        datasetId={42}
        selectedFields={['student_id', 'score']}
        filterConditions={{
          logic: 'AND',
          filters: [{ field: 'score', operator: '>', value: 80 }],
          groups: [],
        }}
        onSave={onSave}
        isSaving={false}
        {...props}
      />
    </QueryClientProvider>,
  )

  return { onSave }
}

describe('StepPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('在缺少任务名称或行数非法时阻止保存', async () => {
    const user = userEvent.setup()
    const { onSave } = renderStep({ selectedFields: [] })

    expect(screen.getByText('所有字段')).toBeInTheDocument()
    expect(screen.getByText('1 条')).toBeInTheDocument()
    expect(screen.getByText('0 组')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /保存任务/ }))
    expect(previewMocks.toast).toHaveBeenCalledWith({
      title: '请输入任务名称',
      variant: 'destructive',
    })
    expect(onSave).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText(/任务名称/), '每日提取任务')
    fireEvent.change(screen.getByLabelText(/行数限制/), { target: { value: '0' } })
    await user.click(screen.getByRole('button', { name: /保存任务/ }))

    expect(previewMocks.toast).toHaveBeenCalledWith({
      title: '行数限制在1-1000000之间',
      variant: 'destructive',
    })
    expect(onSave).not.toHaveBeenCalled()
  })

  it('支持刷新预览并保存任务配置', async () => {
    const user = userEvent.setup()
    previewMocks.previewData.mockResolvedValueOnce({
      data: {
        columns: ['student_id', 'score'],
        data: [{ student_id: 's-1', score: 99 }],
        sql: 'SELECT student_id, score FROM answer_detail LIMIT 10',
      },
    })

    const { onSave } = renderStep()

    expect(screen.getByText('点击"刷新预览"查看数据')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /刷新预览/ }))

    await waitFor(() => {
      expect(previewMocks.previewData).toHaveBeenCalledWith({
        dataset_id: 42,
        select_fields: ['student_id', 'score'],
        filter_conditions: {
          logic: 'AND',
          filters: [{ field: 'score', operator: '>', value: 80 }],
          groups: [],
        },
        limit: 10,
      })
    })
    expect(previewMocks.toast).toHaveBeenCalledWith({ title: '预览成功' })
    expect(await screen.findByTestId('preview-table')).toHaveTextContent('rows:1;cols:2')
    expect(screen.getByText('🔍 SQL 预览')).toBeInTheDocument()
    expect(screen.getByText('SELECT student_id, score FROM answer_detail LIMIT 10')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/任务名称/), '高分学员导出')
    await user.type(screen.getByLabelText(/任务说明/), '每天同步高分学员')
    fireEvent.change(screen.getByLabelText(/行数限制/), { target: { value: '1200' } })
    await user.click(screen.getByRole('button', { name: /保存任务/ }))

    expect(onSave).toHaveBeenCalledWith({
      task_name: '高分学员导出',
      description: '每天同步高分学员',
      dataset_id: 42,
      select_fields: ['student_id', 'score'],
      filter_conditions: {
        logic: 'AND',
        filters: [{ field: 'score', operator: '>', value: 80 }],
        groups: [],
      },
      row_limit: 1200,
      task_type: 'manual',
    })
  })

  it('在预览失败时展示 destructive 提示', async () => {
    const user = userEvent.setup()
    previewMocks.previewData.mockRejectedValueOnce({
      response: {
        data: { message: '预览超时' },
      },
      message: 'network error',
    })

    renderStep()

    await user.click(screen.getByRole('button', { name: /刷新预览/ }))

    await waitFor(() => {
      expect(previewMocks.toast).toHaveBeenCalledWith({
        title: '预览失败',
        description: '预览超时',
        variant: 'destructive',
      })
    })
  })
})
