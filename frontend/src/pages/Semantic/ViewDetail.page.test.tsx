import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ViewDetail from './ViewDetail'

const semanticApiMocks = vi.hoisted(() => ({
  describeView: vi.fn(),
  getMaterializeStatus: vi.fn(),
  materializeView: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@/api/semantic', async () => {
  const actual = await vi.importActual<typeof import('@/api/semantic')>('@/api/semantic')
  return {
    ...actual,
    describeView: semanticApiMocks.describeView,
    getMaterializeStatus: semanticApiMocks.getMaterializeStatus,
    materializeView: semanticApiMocks.materializeView,
  }
})

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: semanticApiMocks.toast }),
}))

function renderPage(initialEntry: string) {
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
          <Route path="/semantic/views/:name" element={<ViewDetail />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('ViewDetail page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('展示相关 Cube 与发布状态摘要', async () => {
    semanticApiMocks.describeView.mockResolvedValue({
      data: {
        name: 'learning_overview',
        title: '学习总览',
        description: '学习汇总视图',
        public: true,
        cubes: [
          { join_path: 'answer_records', includes: '*', excludes: [], prefix: false },
          { join_path: 'study_sessions', includes: ['session_count'], excludes: [], prefix: false },
        ],
        diagnostics: [],
        publish_summary: {
          publish_status: 'published',
          last_published_at: '2026-03-26T10:00:00Z',
        },
        drift_summary: {
          last_drift_status: 'ok',
          last_drift_checked_at: '2026-03-26T12:00:00Z',
        },
      },
    })
    semanticApiMocks.getMaterializeStatus.mockResolvedValue({
      data: {
        materialized: true,
        publish_status: 'published',
        published_at: '2026-03-26T10:00:00Z',
        definition_summary: {
          field_count: 3,
          dimension_count: 2,
          measure_count: 1,
        },
        field_mappings: [],
        state_summary: {
          last_drift_status: 'ok',
        },
      },
    })

    renderPage('/semantic/views/learning_overview')

    await screen.findByRole('heading', { name: '学习总览' })
    expect(screen.getByTestId('view-related-cubes')).toHaveTextContent('answer_records')
    expect(screen.getByTestId('view-related-cubes')).toHaveTextContent('study_sessions')
    expect(screen.getByTestId('view-publish-status')).toHaveTextContent('published')
  })

  it('未发布且存在错误诊断时展示阻塞摘要，并支持发布成功', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    semanticApiMocks.describeView.mockResolvedValue({
      data: {
        name: 'learning_overview',
        title: '学习总览',
        description: '学习汇总视图',
        public: false,
        cubes: [
          { join_path: 'answer_records.fact', includes: '*', excludes: [], prefix: false },
        ],
        diagnostics: [
          { level: 'error', kind: 'join', field: 'answer_records.score', message: 'Join 路径无效' },
        ],
        publish_summary: {
          publish_status: 'draft',
          last_published_at: null,
        },
        drift_summary: {
          last_drift_status: 'error',
          last_drift_checked_at: '2026-03-26T12:00:00Z',
        },
      },
    })
    semanticApiMocks.getMaterializeStatus.mockResolvedValue({
      data: {
        materialized: false,
        publish_status: 'draft',
        published_at: null,
        definition_summary: {
          field_count: 0,
          dimension_count: 0,
          measure_count: 0,
        },
        field_mappings: [],
        state_summary: {
          last_drift_status: 'error',
        },
      },
    })
    semanticApiMocks.materializeView.mockResolvedValue({ data: { publish_status: 'published' } })

    renderPage('/semantic/views/learning_overview')

    await screen.findByRole('heading', { name: '学习总览' })
    expect(screen.getByText('当前 View 存在发布风险')).toBeInTheDocument()
    expect(screen.getByText('当前还没有可展示的字段映射。请先发布 View，或在发布后刷新状态。')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: '诊断' }))
    expect(screen.getByText('Join 路径无效')).toBeInTheDocument()
    expect(screen.getByText('answer_records.score')).toBeInTheDocument()

    await user.click(screen.getByTestId('semantic-primary-action'))

    await waitFor(() => {
      expect(semanticApiMocks.materializeView).toHaveBeenCalledWith('learning_overview')
      expect(semanticApiMocks.toast).toHaveBeenCalledWith({
        title: '发布成功',
        description: '数据集状态已刷新，可在字段映射和发布摘要中查看最新结果。',
      })
    })

    confirmSpy.mockRestore()
  })

  it('重新发布失败时展示 destructive 提示，并支持查看 SQL 占位内容', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    semanticApiMocks.describeView.mockResolvedValue({
      data: {
        name: 'learning_overview',
        title: '学习总览',
        description: '学习汇总视图',
        public: true,
        cubes: [
          { join_path: 'answer_records', includes: ['score'], excludes: [], prefix: false },
        ],
        diagnostics: [],
        publish_summary: {
          definition_hash: 'hash-1',
          publish_status: 'published',
          last_published_at: '2026-03-26T10:00:00Z',
        },
        drift_summary: {
          last_drift_status: 'ok',
          last_drift_checked_at: '2026-03-26T12:00:00Z',
        },
      },
    })
    semanticApiMocks.getMaterializeStatus.mockResolvedValue({
      data: {
        materialized: true,
        dataset_id: 7,
        dataset_code: 'learning_overview',
        publish_status: 'published',
        published_at: '2026-03-26T10:00:00Z',
        definition_hash: 'hash-1',
        definition_summary: {
          field_count: 3,
          dimension_count: 2,
          measure_count: 1,
        },
        field_mappings: [
          {
            physical_name: 'score',
            source_ref: 'answer_records.score',
            source_cube: 'answer_records',
            business_type: 'metric',
          },
        ],
        state_summary: {
          last_drift_status: 'ok',
        },
      },
    })
    semanticApiMocks.materializeView.mockRejectedValue(new Error('发布服务暂不可用'))

    renderPage('/semantic/views/learning_overview')

    await screen.findByRole('heading', { name: '学习总览' })
    await user.click(screen.getByRole('tab', { name: '编译 SQL' }))
    expect(screen.getByText('当前暂无编译 SQL。请先发布或重新发布 View 后查看。')).toBeInTheDocument()

    await user.click(screen.getByTestId('semantic-primary-action'))

    await waitFor(() => {
      expect(semanticApiMocks.toast).toHaveBeenCalledWith({
        title: '发布失败',
        description: '发布服务暂不可用',
        variant: 'destructive',
      })
    })

    confirmSpy.mockRestore()
  })

  it('查询失败时展示未找到状态', async () => {
    semanticApiMocks.describeView.mockRejectedValue(new Error('not found'))
    semanticApiMocks.getMaterializeStatus.mockResolvedValue({ data: null })

    renderPage('/semantic/views/missing_view')

    expect(await screen.findByText('未找到 View: missing_view')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '返回 Cube 模块' })).toHaveAttribute('href', '/semantic/cubes?kind=view')
  })

  it('未发布但无阻塞时展示 dirty 状态，并在发布中显示挂起文案', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    semanticApiMocks.describeView.mockResolvedValue({
      data: {
        name: 'learning_overview',
        title: '学习总览',
        description: '学习汇总视图',
        public: true,
        cubes: [{ join_path: 'answer_records', includes: ['score'], excludes: [], prefix: false }],
        diagnostics: [],
        publish_summary: {
          publish_status: 'draft',
          last_published_at: null,
        },
        drift_summary: {
          last_drift_status: 'ok',
          last_drift_checked_at: '2026-03-26T12:00:00Z',
        },
      },
    })
    semanticApiMocks.getMaterializeStatus.mockResolvedValue({
      data: {
        materialized: false,
        publish_status: 'draft',
        published_at: null,
        definition_summary: {
          field_count: 1,
          dimension_count: 1,
          measure_count: 0,
        },
        field_mappings: [],
        state_summary: {
          last_drift_status: 'ok',
        },
      },
    })
    semanticApiMocks.materializeView.mockImplementation(
      () => new Promise(() => {}),
    )

    renderPage('/semantic/views/learning_overview')

    expect(await screen.findByText('当前 View 可继续运营操作')).toBeInTheDocument()
    await user.click(screen.getByTestId('semantic-primary-action'))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /发布中/ })).toBeDisabled()
    })

    confirmSpy.mockRestore()
  })
})
