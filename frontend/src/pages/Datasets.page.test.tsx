import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Datasets from './Datasets'

const datasetMocks = vi.hoisted(() => ({
  getDatasets: vi.fn(),
  deleteDataset: vi.fn(),
  getDatasetStatistics: vi.fn(),
  syncDatasetSchema: vi.fn(),
  toast: vi.fn(),
}))
const navigateMock = vi.fn()

vi.mock('../api/datasets', () => ({
  getDatasets: datasetMocks.getDatasets,
  deleteDataset: datasetMocks.deleteDataset,
  getDatasetStatistics: datasetMocks.getDatasetStatistics,
  syncDatasetSchema: datasetMocks.syncDatasetSchema,
}))

vi.mock('@/components/business', async () => {
  const actual = await vi.importActual<typeof import('@/components/business')>('@/components/business')
  return {
    ...actual,
    useToast: () => ({ toast: datasetMocks.toast }),
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
        <Datasets />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('Datasets page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('展示数据集同步摘要、类型列与独立来源列', async () => {
    datasetMocks.getDatasets.mockResolvedValue({
      data: {
        items: [
          {
            id: 9,
            dataset_code: 'lesson_progress',
            dataset_name: '课堂进度',
            dataset_type: 'physical',
            source_type: 'postgresql',
            physical_table: 'dwd_lesson_progress',
            description: '学生课程进度明细',
            owner: 'data-team',
            sync_status: 'synced',
            last_sync_at: '2026-03-24T10:00:00Z',
            field_count: 24,
            created_at: '2026-03-20T10:00:00Z',
            updated_at: '2026-03-24T10:00:00Z',
          },
          {
            id: 10,
            dataset_code: 'behavior_segment',
            dataset_name: '行为细分',
            dataset_type: 'virtual',
            source_type: 'maxcompute',
            description: 'SQL 虚拟数据集',
            owner: 'ops-team',
            sync_status: 'failed',
            sync_error: 'schema_fetch_failed',
            field_count: 12,
            created_at: '2026-03-20T10:00:00Z',
            updated_at: '2026-03-24T10:00:00Z',
          },
          {
            id: 11,
            dataset_code: 'score_upload',
            dataset_name: '成绩上传',
            dataset_type: 'file',
            file_metadata: { file_name: 'scores.xlsx' },
            owner: 'teacher',
            sync_status: 'syncing',
            created_at: '2026-03-20T10:00:00Z',
            updated_at: '2026-03-24T10:00:00Z',
          },
        ],
        total: 3,
      },
    })
    datasetMocks.getDatasetStatistics.mockResolvedValue({
      data: { total: 3, synced: 1, failed: 1, pending: 1 },
    })

    renderPage()

    expect(await screen.findByRole('heading', { name: '数据集管理' })).toBeInTheDocument()
    expect(screen.getByText('总数据集')).toBeInTheDocument()
    expect(screen.getByText('已同步')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('搜索数据集名称或编码...')).toBeInTheDocument()
    expect(await screen.findByText('物理表 / 来源对象')).toBeInTheDocument()
    expect(screen.getByText('类型')).toBeInTheDocument()
    expect(screen.getByText('来源')).toBeInTheDocument()
    const physicalRow = (await screen.findByText('课堂进度')).parentElement?.parentElement
    const virtualRow = screen.getByText('行为细分').parentElement?.parentElement
    const fileRow = screen.getByText('成绩上传').parentElement?.parentElement
    expect(physicalRow).not.toBeNull()
    expect(virtualRow).not.toBeNull()
    expect(fileRow).not.toBeNull()

    expect(within(physicalRow!).getByText('物理数据集')).toBeInTheDocument()
    expect(within(physicalRow!).getByText('dwd_lesson_progress')).toBeInTheDocument()
    expect(within(physicalRow!).getByText('postgresql')).toBeInTheDocument()
    expect(within(physicalRow!).getByText('已同步')).toBeInTheDocument()
    expect(within(physicalRow!).getByText('data-team')).toBeInTheDocument()

    expect(within(virtualRow!).getByText('虚拟数据集')).toBeInTheDocument()
    expect(within(virtualRow!).getByText('视图')).toBeInTheDocument()
    expect(within(virtualRow!).getByText('maxcompute')).toBeInTheDocument()
    expect(within(virtualRow!).getByText('失败')).toBeInTheDocument()
    expect(within(virtualRow!).getByText('schema_fetch_failed')).toBeInTheDocument()
    expect(within(virtualRow!).getByText('ops-team')).toBeInTheDocument()

    expect(within(fileRow!).getByText('文件数据集')).toBeInTheDocument()
    expect(within(fileRow!).getByText('scores.xlsx')).toBeInTheDocument()
    expect(within(fileRow!).getByText('-')).toBeInTheDocument()
    expect(within(fileRow!).getByText('同步中')).toBeInTheDocument()
    expect(within(fileRow!).getByText('teacher')).toBeInTheDocument()
    expect(screen.queryByText('直接来自库表')).not.toBeInTheDocument()
    expect(screen.queryByText('由 SQL 加工得到')).not.toBeInTheDocument()
    expect(screen.queryByText('由文件导入')).not.toBeInTheDocument()
    expect(screen.getByText('血缘分析')).toBeInTheDocument()
    expect(screen.getByText('影响分析')).toBeInTheDocument()
    expect(screen.getByText('质量评分')).toBeInTheDocument()
    expect(screen.getAllByText('当前阶段未接入后端能力').length).toBeGreaterThanOrEqual(3)
    expect(screen.queryByText('血缘覆盖率')).not.toBeInTheDocument()
    expect(screen.queryByText('治理得分')).not.toBeInTheDocument()
  })

  it('支持空状态、搜索和注册入口导航', async () => {
    const user = userEvent.setup()

    datasetMocks.getDatasets.mockResolvedValue({
      data: { items: [], total: 0 },
    })
    datasetMocks.getDatasetStatistics.mockResolvedValue({
      data: { total: 0, synced: 0, failed: 0, pending: 0 },
    })

    renderPage()

    expect(await screen.findByText('暂无数据集')).toBeInTheDocument()

    const emptyState = screen.getByText('暂无数据集').closest('div')
    expect(emptyState).not.toBeNull()
    await user.click(within(emptyState!).getByRole('button', { name: '注册数据集' }))
    expect(navigateMock).toHaveBeenCalledWith('/data-center/datasets/register/table')

    await user.click(screen.getAllByRole('button', { name: '注册数据集' })[0])
    await user.click(await screen.findByRole('menuitem', { name: /物理表数据集/ }))
    await user.click(screen.getAllByRole('button', { name: '注册数据集' })[0])
    await user.click(await screen.findByRole('menuitem', { name: /SQL 虚拟数据集/ }))
    await user.click(screen.getAllByRole('button', { name: '注册数据集' })[0])
    await user.click(await screen.findByRole('menuitem', { name: /CSV \/ Excel 文件数据集/ }))

    expect(navigateMock).toHaveBeenCalledWith('/data-center/datasets/register/table')
    expect(navigateMock).toHaveBeenCalledWith('/queries?intent=create-virtual-dataset')
    expect(navigateMock).toHaveBeenCalledWith('/data-center/datasets/register/file')

    await user.type(screen.getByPlaceholderText('搜索数据集名称或编码...'), 'lesson')
    await waitFor(() => {
      expect(datasetMocks.getDatasets).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, page_size: 10, search: 'lesson' }),
      )
    })
  })

  it('列表动作仅保留语义工作台图标入口', async () => {
    const user = userEvent.setup()

    datasetMocks.getDatasets.mockResolvedValue({
      data: {
        items: [
          {
            id: 9,
            dataset_code: 'lesson_progress',
            dataset_name: '课堂进度',
            dataset_type: 'physical',
            source_type: 'postgresql',
            physical_table: 'dwd_lesson_progress',
            description: '学生课程进度明细',
            owner: 'data-team',
            sync_status: 'synced',
            created_at: '2026-03-20T10:00:00Z',
            updated_at: '2026-03-24T10:00:00Z',
          },
        ],
        total: 1,
      },
    })
    datasetMocks.getDatasetStatistics.mockResolvedValue({
      data: { total: 1, synced: 1, failed: 0, pending: 0 },
    })

    renderPage()

    await screen.findByText('课堂进度')

    expect(screen.queryByRole('button', { name: '在查询中心使用 课堂进度' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '用于语义建模 课堂进度' }))
    expect(navigateMock).toHaveBeenCalledWith('/semantic/workbench?intent=dataset-modeling&datasetId=9&datasetName=%E8%AF%BE%E5%A0%82%E8%BF%9B%E5%BA%A6')
  })

  it('支持同步成功、编辑跳转与删除成功', async () => {
    const user = userEvent.setup()

    datasetMocks.getDatasets.mockResolvedValue({
      data: {
        items: [
          {
            id: 9,
            dataset_code: 'lesson_progress',
            dataset_name: '课堂进度',
            dataset_type: 'physical',
            source_type: 'postgresql',
            physical_table: 'dwd_lesson_progress',
            description: '学生课程进度明细',
            owner: 'data-team',
            sync_status: 'syncing',
            field_count: 24,
          },
        ],
        total: 1,
      },
    })
    datasetMocks.getDatasetStatistics.mockResolvedValue({
      data: { total: 1, synced: 0, failed: 0, pending: 1 },
    })
    datasetMocks.syncDatasetSchema.mockResolvedValue({ job_id: 'job-1', status: 'queued' })
    datasetMocks.deleteDataset.mockResolvedValue({ data: {} })

    renderPage()

    await screen.findByText('课堂进度')

    await user.click(screen.getByTitle('同步元数据'))
    await waitFor(() => {
      expect(datasetMocks.syncDatasetSchema).toHaveBeenCalled()
    })
    expect(datasetMocks.syncDatasetSchema.mock.calls[0][0]).toBe(9)
    expect(datasetMocks.toast).toHaveBeenCalledWith({
      title: '元数据同步已触发',
      description: '正在刷新数据集元数据...',
    })

    await user.click(screen.getByTitle('编辑'))
    expect(navigateMock).toHaveBeenCalledWith('/data-center/datasets/9')

    await user.click(screen.getByTitle('删除'))
    expect(await screen.findByText('确认删除')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确定删除' }))
    await waitFor(() => {
      expect(datasetMocks.deleteDataset).toHaveBeenCalled()
    })
    expect(datasetMocks.deleteDataset.mock.calls[0][0]).toBe(9)
    expect(datasetMocks.toast).toHaveBeenCalledWith({ title: '删除成功' })
  })

  it('在同步或删除失败时给出 destructive 提示', async () => {
    const user = userEvent.setup()

    datasetMocks.getDatasets.mockResolvedValue({
      data: {
        items: [
          {
            id: 9,
            dataset_code: 'lesson_progress',
            dataset_name: '课堂进度',
            dataset_type: 'physical',
            source_type: 'postgresql',
            physical_table: 'dwd_lesson_progress',
            owner: 'data-team',
            sync_status: 'unknown',
          },
        ],
        total: 1,
      },
    })
    datasetMocks.getDatasetStatistics.mockResolvedValue({
      data: { total: 1, synced: 0, failed: 1, pending: 0 },
    })
    datasetMocks.syncDatasetSchema.mockRejectedValueOnce({
      response: { data: { message: '同步服务不可用' } },
    })
    datasetMocks.deleteDataset.mockRejectedValueOnce({
      response: { data: { message: '数据集仍被引用' } },
    })

    renderPage()

    await screen.findByText('课堂进度')

    await user.click(screen.getByTitle('同步元数据'))
    await waitFor(() => {
      expect(datasetMocks.toast).toHaveBeenCalledWith({
        title: '同步失败',
        description: '同步服务不可用',
        variant: 'destructive',
      })
    })

    await user.click(screen.getByTitle('删除'))
    await user.click(await screen.findByRole('button', { name: '确定删除' }))
    await waitFor(() => {
      expect(datasetMocks.toast).toHaveBeenCalledWith({
        title: '删除失败',
        description: '数据集仍被引用',
        variant: 'destructive',
      })
    })
  })

  it('同步时支持多行并发 pending，并按各自行结束时释放状态', async () => {
    const user = userEvent.setup()
    const pendingSyncResolves = new Map<number, (value: { job_id: string; status: string }) => void>()

    datasetMocks.getDatasets.mockResolvedValue({
      data: {
        items: [
          {
            id: 9,
            dataset_code: 'lesson_progress',
            dataset_name: '课堂进度',
            dataset_type: 'physical',
            physical_table: 'dwd_lesson_progress',
            owner: 'data-team',
            sync_status: 'synced',
          },
          {
            id: 10,
            dataset_code: 'behavior_segment',
            dataset_name: '行为细分',
            dataset_type: 'virtual',
            owner: 'ops-team',
            sync_status: 'failed',
            sync_error: 'schema_fetch_failed',
          },
        ],
        total: 2,
      },
    })
    datasetMocks.getDatasetStatistics.mockResolvedValue({
      data: { total: 2, synced: 1, failed: 1, pending: 0 },
    })
    datasetMocks.syncDatasetSchema.mockImplementation(
      (datasetId: number) =>
        new Promise<{ job_id: string; status: string }>((resolve) => {
          pendingSyncResolves.set(datasetId, resolve)
        }),
    )

    renderPage()

    const physicalRow = (await screen.findByText('课堂进度')).parentElement?.parentElement
    const virtualRow = screen.getByText('行为细分').parentElement?.parentElement
    expect(physicalRow).not.toBeNull()
    expect(virtualRow).not.toBeNull()

    const physicalSyncButton = within(physicalRow!).getByTitle('同步元数据')
    const virtualSyncButton = within(virtualRow!).getByTitle('同步元数据')

    await user.click(physicalSyncButton)

    await waitFor(() => {
      expect(datasetMocks.syncDatasetSchema).toHaveBeenCalledTimes(1)
      expect(datasetMocks.syncDatasetSchema.mock.calls[0][0]).toBe(9)
      expect(physicalSyncButton).toBeDisabled()
      expect(virtualSyncButton).not.toBeDisabled()
    })
    expect(physicalSyncButton.querySelector('svg')?.className.baseVal ?? '').toContain('animate-spin')
    expect(virtualSyncButton.querySelector('svg')?.className.baseVal ?? '').not.toContain('animate-spin')

    await user.click(virtualSyncButton)

    await waitFor(() => {
      expect(datasetMocks.syncDatasetSchema).toHaveBeenCalledTimes(2)
      expect(datasetMocks.syncDatasetSchema.mock.calls[1][0]).toBe(10)
      expect(physicalSyncButton).toBeDisabled()
      expect(virtualSyncButton).toBeDisabled()
    })
    expect(physicalSyncButton.querySelector('svg')?.className.baseVal ?? '').toContain('animate-spin')
    expect(virtualSyncButton.querySelector('svg')?.className.baseVal ?? '').toContain('animate-spin')

    await act(async () => {
      pendingSyncResolves.get(9)?.({ job_id: 'job-9', status: 'queued' })
    })

    await waitFor(() => {
      expect(physicalSyncButton).not.toBeDisabled()
      expect(virtualSyncButton).toBeDisabled()
    })
    expect(physicalSyncButton.querySelector('svg')?.className.baseVal ?? '').not.toContain('animate-spin')
    expect(virtualSyncButton.querySelector('svg')?.className.baseVal ?? '').toContain('animate-spin')

    await act(async () => {
      pendingSyncResolves.get(10)?.({ job_id: 'job-10', status: 'queued' })
    })

    await waitFor(() => {
      expect(physicalSyncButton).not.toBeDisabled()
      expect(virtualSyncButton).not.toBeDisabled()
    })
  })

  it('列表分页支持上一页禁用态、跨页切换和失败兜底文案', async () => {
    const user = userEvent.setup()

    datasetMocks.getDatasets.mockImplementation(async ({ page = 1 }: { page?: number }) => {
      const items = Array.from({ length: 11 }).map((_, index) => ({
        id: index + 1,
        dataset_code: `dataset_${index + 1}`,
        dataset_name: `数据集 ${index + 1}`,
        dataset_type: index === 10 ? 'physical' : 'virtual',
        source_type: index === 10 ? 'postgresql' : 'maxcompute',
        physical_table: index === 10 ? 'dwd_tail_dataset' : undefined,
        owner: `owner-${index + 1}`,
        sync_status: index === 10 ? 'failed' : 'synced',
        sync_error: index === 10 ? '' : undefined,
      }))
      const pageSize = 10
      const start = (page - 1) * pageSize
      return {
        data: {
          items: items.slice(start, start + pageSize),
          total: items.length,
        },
      }
    })
    datasetMocks.getDatasetStatistics.mockResolvedValue({
      data: { total: 11, synced: 10, failed: 1, pending: 0 },
    })

    renderPage()

    expect(await screen.findByText('数据集 1')).toBeInTheDocument()
    const prevButton = screen.getByRole('button', { name: '上一页' })
    expect(prevButton).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '下一页' }))
    expect(await screen.findByText('数据集 11')).toBeInTheDocument()
    expect(screen.getByText('同步失败，后端未返回具体原因')).toBeInTheDocument()

    const tailRow = screen.getByText('数据集 11').parentElement?.parentElement
    expect(tailRow).not.toBeNull()
    expect(tailRow).not.toHaveClass('border-b')

    await user.click(screen.getByRole('button', { name: '上一页' }))
    expect(await screen.findByText('数据集 1')).toBeInTheDocument()
  })
})
