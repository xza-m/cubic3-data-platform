import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createContext, type ReactNode, useContext } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CubeStudio from './CubeStudio'

const semanticApiMocks = vi.hoisted(() => ({
  listDomains: vi.fn(),
  describeCube: vi.fn(),
  createCubeDraftFromTable: vi.fn(),
  createCube: vi.fn(),
  updateCube: vi.fn(),
  activateCube: vi.fn(),
  deprecateCube: vi.fn(),
}))

const datasourceMocks = vi.hoisted(() => ({
  getDataSources: vi.fn(),
}))

const toastMocks = vi.hoisted(() => ({
  toast: vi.fn(),
}))

vi.mock('@/api/semantic', async () => {
  const actual = await vi.importActual<typeof import('@/api/semantic')>('@/api/semantic')
  return {
    ...actual,
    listDomains: semanticApiMocks.listDomains,
    describeCube: semanticApiMocks.describeCube,
    createCubeDraftFromTable: semanticApiMocks.createCubeDraftFromTable,
    createCube: semanticApiMocks.createCube,
    updateCube: semanticApiMocks.updateCube,
    activateCube: semanticApiMocks.activateCube,
    deprecateCube: semanticApiMocks.deprecateCube,
  }
})

vi.mock('@/api/datasources', () => ({
  getDataSources: datasourceMocks.getDataSources,
}))

vi.mock('@/components/business', () => ({
  SchemaBrowser: ({ onSelect }: { onSelect?: (node: any) => void }) => (
    <div data-testid="schema-browser">
      <button
        type="button"
        onClick={() => onSelect?.({
          type: 'table',
          name: 'answer_records',
          metadata: {
            database: 'dw',
            schema: 'learning',
            table: 'answer_records',
          },
        })}
      >
        选择物理表
      </button>
    </div>
  ),
  useToast: () => ({
    toast: toastMocks.toast,
  }),
}))

const SelectContext = createContext<{
  value: string
  onValueChange: (value: string) => void
}>({
  value: '',
  onValueChange: () => {},
})

vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string
    onValueChange: (value: string) => void
    children: ReactNode
  }) => (
    <SelectContext.Provider value={{ value, onValueChange }}>
      <div>{children}</div>
    </SelectContext.Provider>
  ),
  SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder || 'select'}</span>,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({
    value,
    children,
  }: {
    value: string
    children: ReactNode
  }) => {
    const ctx = useContext(SelectContext)
    return (
      <button type="button" data-testid={`select-item-${value}`} onClick={() => ctx.onValueChange(value)}>
        {children}
      </button>
    )
  },
}))

vi.mock('@/hooks/useUnsavedChangesPrompt', () => ({
  useUnsavedChangesPrompt: vi.fn(),
}))

vi.mock('@/components/Semantic/workbench', async () => {
  const actual = await vi.importActual<typeof import('@/components/Semantic/workbench')>('@/components/Semantic/workbench')
  return {
    ...actual,
    SemanticPageShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SemanticPageHeader: ({
      title,
      description,
    }: {
      title: string
      description?: string
    }) => (
      <div data-testid="semantic-page-header">
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
    ),
    SemanticStatusBanner: ({
      summary,
      primaryAction,
    }: {
      summary: {
        title: string
        description: string
        blockers?: string[]
        hints?: string[]
        stats?: Array<{ label: string; value: string | number }>
      }
      primaryAction?: {
        label: string
        onClick?: () => void
        testId?: string
      }
    }) => (
      <div data-testid="semantic-status-banner">
        <div>{summary.title}</div>
        <div>{summary.description}</div>
        {summary.blockers?.map((item) => <div key={item}>{item}</div>)}
        {summary.hints?.map((item) => <div key={item}>{item}</div>)}
        {summary.stats?.map((item) => (
          <div key={item.label}>
            <span>{item.label}</span>
            <span>{String(item.value)}</span>
          </div>
        ))}
        {primaryAction ? (
          <button type="button" data-testid={primaryAction.testId ?? 'semantic-primary-action'} onClick={primaryAction.onClick}>
            {primaryAction.label}
          </button>
        ) : null}
      </div>
    ),
  }
})

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
          <Route path="/semantic/cubes/new" element={<CubeStudio />} />
          <Route path="/semantic/cubes/:name/edit" element={<CubeStudio />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

function buildCubeDetail(overrides: Record<string, any> = {}) {
  return {
    name: 'answer_records',
    title: '学生答题记录',
    description: '用于答题分析',
    table: 'dws.answer_records',
    status: 'draft',
    source_id: 1,
    source_binding_summary: {
      source_name: '学习数仓',
      source_type: 'maxcompute',
      database: 'dw',
      schema: 'learning',
    },
    domain_id: 'learning',
    domain_name: '学习领域',
    domain_ids: ['learning'],
    domains: [{ id: 'learning', code: 'learning', name: '学习领域' }],
    domain_count: 1,
    dimensions: {
      user_id: { title: '学生', type: 'string' },
    },
    measures: {
      answer_count: { title: '答题次数', type: 'count' },
    },
    segments: {},
    joins: {},
    ...overrides,
  }
}

function buildDraft(overrides: Record<string, any> = {}) {
  return {
    name: 'answer_records',
    title: '学生答题记录',
    description: '用于答题分析',
    table: 'answer_records',
    source_id: 1,
    source_database: 'dw',
    source_schema: 'learning',
    status: 'draft',
    domain_id: 'learning',
    dimensions: {
      user_id: { title: '学生', type: 'string' },
    },
    measures: {
      answer_count: { title: '答题次数', type: 'count' },
    },
    segments: {},
    joins: {},
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('CubeStudio page', () => {
  it('新建模式显示六步工作流并默认聚焦来源绑定', async () => {
    datasourceMocks.getDataSources.mockResolvedValueOnce({
      data: {
        items: [{ id: 1, name: '学习数仓', source_type: 'maxcompute' }],
      },
    })
    semanticApiMocks.listDomains.mockResolvedValueOnce({
      data: {
        domains: [{ id: 'learning', code: 'learning', name: '学习领域' }],
      },
    })

    renderPage('/semantic/cubes/new')

    await screen.findByRole('heading', { name: '新建 Cube' })
    expect(screen.getByTestId('cube-studio-step-1')).toBeInTheDocument()
    expect(screen.getByTestId('cube-studio-step-6')).toBeInTheDocument()
    expect(screen.getAllByText('来源绑定').length).toBeGreaterThan(0)
    expect(screen.getByTestId('schema-browser')).toBeInTheDocument()
    expect(screen.getByTestId('cube-studio-source-assist')).toBeInTheDocument()
    expect(screen.getByText('自动生成草稿')).toBeInTheDocument()
    expect(screen.getByText('当前阻塞')).toBeInTheDocument()
  })

  it('切换到语义规则步骤后显示规则表单', async () => {
    datasourceMocks.getDataSources.mockResolvedValueOnce({
      data: {
        items: [{ id: 1, name: '学习数仓', source_type: 'maxcompute' }],
      },
    })
    semanticApiMocks.listDomains.mockResolvedValueOnce({
      data: {
        domains: [{ id: 'learning', code: 'learning', name: '学习领域' }],
      },
    })

    renderPage('/semantic/cubes/new')

    await screen.findByRole('heading', { name: '新建 Cube' })
    fireEvent.click(screen.getByTestId('cube-studio-step-4'))

    expect(screen.getAllByText('语义规则').length).toBeGreaterThan(0)
    expect(screen.getByText('默认粒度')).toBeInTheDocument()
    expect(screen.getByText('实体主键')).toBeInTheDocument()
    expect(screen.getByTestId('cube-studio-rules-assist')).toBeInTheDocument()
  })

  it('未完成来源绑定时仍有生成草稿兜底校验', async () => {
    datasourceMocks.getDataSources.mockResolvedValueOnce({
      data: {
        items: [{ id: 1, name: '学习数仓', source_type: 'maxcompute' }],
      },
    })
    semanticApiMocks.listDomains.mockResolvedValueOnce({
      data: {
        domains: [{ id: 'learning', code: 'learning', name: '学习领域' }],
      },
    })

    renderPage('/semantic/cubes/new')

    await screen.findByRole('heading', { name: '新建 Cube' })
    fireEvent.click(screen.getByTestId('cube-banner-generate-draft'))

    await waitFor(() => expect(toastMocks.toast).toHaveBeenCalledWith({
      title: '生成草稿失败',
      description: '请先选择数据源和物理表',
      variant: 'destructive',
    }))
  })

  it('编辑模式在多领域引用时展示非阻断提示', async () => {
    datasourceMocks.getDataSources.mockResolvedValueOnce({
      data: {
        items: [{ id: 1, name: '学习数仓', source_type: 'maxcompute' }],
      },
    })
    semanticApiMocks.listDomains.mockResolvedValueOnce({
      data: {
        domains: [{ id: 'learning', code: 'learning', name: '学习领域' }],
      },
    })
    semanticApiMocks.describeCube.mockResolvedValueOnce({
      data: {
        name: 'answer_records',
        title: '学生答题记录',
        description: '用于答题分析',
        table: 'dws.answer_records',
        status: 'active',
        domain_id: 'learning',
        domain_name: '学习领域',
        domain_ids: ['learning', 'teaching'],
        domains: [
          { id: 'learning', code: 'learning', name: '学习领域' },
          { id: 'teaching', code: 'teaching', name: '教学领域' },
        ],
        domain_count: 2,
        dimensions: {
          user_id: { title: '学生', type: 'string' },
        },
        measures: {
          answer_count: { title: '答题次数', type: 'count' },
        },
        segments: {},
        joins: {},
      },
    })

    renderPage('/semantic/cubes/answer_records/edit')

    await screen.findByRole('heading', { name: '编辑 Cube' })
    expect(screen.getByText('该 Cube 已被多个领域引用，当前编辑仅维护投影领域字段。')).toBeInTheDocument()
  })

  it('生成草稿后切换为保存 Draft 主操作', async () => {
    const user = userEvent.setup()
    datasourceMocks.getDataSources.mockResolvedValueOnce({
      data: {
        items: [{ id: 1, name: '学习数仓', source_type: 'maxcompute' }],
      },
    })
    semanticApiMocks.listDomains.mockResolvedValueOnce({
      data: {
        domains: [{ id: 'learning', code: 'learning', name: '学习领域' }],
      },
    })
    semanticApiMocks.createCubeDraftFromTable.mockResolvedValueOnce({
      data: buildDraft(),
    })

    renderPage('/semantic/cubes/new')

    await screen.findByRole('heading', { name: '新建 Cube' })
    await user.click(screen.getByRole('button', { name: '选择物理表' }))
    await waitFor(() => expect(screen.getByTestId('cube-banner-generate-draft')).not.toBeDisabled())
    await user.click(screen.getByTestId('cube-banner-generate-draft'))

    await waitFor(() => {
      expect(semanticApiMocks.createCubeDraftFromTable).toHaveBeenCalledWith({
        source_id: 1,
        database: 'dw',
        schema: 'learning',
        table: 'answer_records',
      })
    })
    expect(await screen.findByTestId('cube-banner-save-draft')).toBeInTheDocument()
  })

  it('重新生成草稿时展示与上一次草稿的差异提示', async () => {
    const user = userEvent.setup()
    datasourceMocks.getDataSources.mockResolvedValueOnce({
      data: {
        items: [{ id: 1, name: '学习数仓', source_type: 'maxcompute' }],
      },
    })
    semanticApiMocks.listDomains.mockResolvedValueOnce({
      data: {
        domains: [{ id: 'learning', code: 'learning', name: '学习领域' }],
      },
    })
    semanticApiMocks.createCubeDraftFromTable
      .mockResolvedValueOnce({
        data: buildDraft(),
      })
      .mockResolvedValueOnce({
        data: buildDraft({
          table: 'answer_records_snapshot',
          dimensions: {
            user_id: { title: '学生', type: 'string' },
            class_id: { title: '班级', type: 'string' },
          },
          measures: {},
        }),
      })

    renderPage('/semantic/cubes/new')

    await screen.findByRole('heading', { name: '新建 Cube' })
    await user.click(screen.getByRole('button', { name: '选择物理表' }))
    await user.click(screen.getByTestId('cube-banner-generate-draft'))
    await screen.findByTestId('cube-banner-save-draft')

    await user.click(screen.getByRole('button', { name: '重新生成草稿' }))

    expect((await screen.findAllByText('本次重生成对比上一次草稿：维度 +1，指标 -1，物理表已变更。')).length).toBeGreaterThan(0)
  })

  it('切换数据源时确认后会清空当前草稿', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('confirm', vi.fn(() => true))
    datasourceMocks.getDataSources.mockResolvedValueOnce({
      data: {
        items: [
          { id: 1, name: '学习数仓', source_type: 'maxcompute' },
          { id: 2, name: '教学数仓', source_type: 'postgres' },
        ],
      },
    })
    semanticApiMocks.listDomains.mockResolvedValueOnce({
      data: {
        domains: [{ id: 'learning', code: 'learning', name: '学习领域' }],
      },
    })
    semanticApiMocks.createCubeDraftFromTable.mockResolvedValueOnce({
      data: buildDraft(),
    })

    renderPage('/semantic/cubes/new')

    await screen.findByRole('heading', { name: '新建 Cube' })
    await user.click(screen.getByRole('button', { name: '选择物理表' }))
    await user.click(screen.getByTestId('cube-banner-generate-draft'))
    await screen.findByTestId('cube-banner-save-draft')

    await user.click(screen.getByTestId('cube-studio-step-2'))
    await user.click(screen.getByTestId('select-item-2'))

    expect(window.confirm).toHaveBeenCalledWith('切换数据源会清空当前草稿和已选物理表，确认继续吗？')
    await waitFor(() => expect(screen.getByTestId('cube-banner-generate-draft')).toBeInTheDocument())
    expect(screen.queryByTestId('cube-banner-save-draft')).not.toBeInTheDocument()
    expect(screen.getByText('尚未选择物理表')).toBeInTheDocument()
  })

  it('重新选择物理表时会先确认是否放弃当前草稿', async () => {
    const user = userEvent.setup()
    const confirmMock = vi.fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
    vi.stubGlobal('confirm', confirmMock)
    datasourceMocks.getDataSources.mockResolvedValueOnce({
      data: {
        items: [{ id: 1, name: '学习数仓', source_type: 'maxcompute' }],
      },
    })
    semanticApiMocks.listDomains.mockResolvedValueOnce({
      data: {
        domains: [{ id: 'learning', code: 'learning', name: '学习领域' }],
      },
    })
    semanticApiMocks.createCubeDraftFromTable.mockResolvedValueOnce({
      data: buildDraft(),
    })

    renderPage('/semantic/cubes/new')

    await screen.findByRole('heading', { name: '新建 Cube' })
    await user.click(screen.getByRole('button', { name: '选择物理表' }))
    await user.click(screen.getByTestId('cube-banner-generate-draft'))
    await screen.findByTestId('cube-banner-save-draft')

    await user.click(screen.getByTestId('cube-studio-step-2'))
    await user.click(screen.getByRole('button', { name: '选择物理表' }))
    expect(confirmMock).toHaveBeenCalledWith('重新选择物理表会放弃当前草稿，确认继续吗？')
    expect(screen.getByTestId('cube-banner-save-draft')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '选择物理表' }))
    await waitFor(() => expect(screen.getByTestId('cube-banner-generate-draft')).toBeInTheDocument())
    expect(screen.queryByTestId('cube-banner-save-draft')).not.toBeInTheDocument()
  })

  it('编辑模式加载中时显示骨架屏', () => {
    datasourceMocks.getDataSources.mockResolvedValueOnce({
      data: {
        items: [{ id: 1, name: '学习数仓', source_type: 'maxcompute' }],
      },
    })
    semanticApiMocks.listDomains.mockResolvedValueOnce({
      data: {
        domains: [{ id: 'learning', code: 'learning', name: '学习领域' }],
      },
    })
    semanticApiMocks.describeCube.mockImplementationOnce(() => new Promise(() => {}))

    const view = renderPage('/semantic/cubes/answer_records/edit')
    expect(view.container.querySelectorAll('.rounded-3xl')).toHaveLength(3)
  })

  it('新建模式可将当前草稿保存为 Draft Cube', async () => {
    const user = userEvent.setup()
    datasourceMocks.getDataSources.mockResolvedValueOnce({
      data: {
        items: [{ id: 1, name: '学习数仓', source_type: 'maxcompute' }],
      },
    })
    semanticApiMocks.listDomains.mockResolvedValueOnce({
      data: {
        domains: [{ id: 'learning', code: 'learning', name: '学习领域' }],
      },
    })
    semanticApiMocks.createCubeDraftFromTable.mockResolvedValueOnce({
      data: buildDraft(),
    })
    semanticApiMocks.createCube.mockResolvedValueOnce({
      data: buildDraft({ table: 'dws.answer_records' }),
    })

    renderPage('/semantic/cubes/new')

    await screen.findByRole('heading', { name: '新建 Cube' })
    await user.click(screen.getByRole('button', { name: '选择物理表' }))
    await user.click(screen.getByTestId('cube-banner-generate-draft'))
    await screen.findByTestId('cube-banner-save-draft')

    await user.click(screen.getByTestId('cube-studio-step-1'))
    fireEvent.change(screen.getByTestId('cube-draft-title'), { target: { value: '答题明细 Cube' } })
    await user.click(screen.getByTestId('cube-banner-save-draft'))

    await waitFor(() => expect(semanticApiMocks.createCube).toHaveBeenCalledWith(expect.objectContaining({
      name: 'answer_records',
      title: '答题明细 Cube',
      table: 'answer_records',
      source_id: 1,
    })))
  })

  it('新建模式保存 Draft 失败时给出 destructive 提示', async () => {
    const user = userEvent.setup()
    datasourceMocks.getDataSources.mockResolvedValueOnce({
      data: {
        items: [{ id: 1, name: '学习数仓', source_type: 'maxcompute' }],
      },
    })
    semanticApiMocks.listDomains.mockResolvedValueOnce({
      data: {
        domains: [{ id: 'learning', code: 'learning', name: '学习领域' }],
      },
    })
    semanticApiMocks.createCubeDraftFromTable.mockResolvedValueOnce({
      data: buildDraft(),
    })
    semanticApiMocks.createCube.mockRejectedValueOnce(new Error('create failed'))

    renderPage('/semantic/cubes/new')

    await screen.findByRole('heading', { name: '新建 Cube' })
    await user.click(screen.getByRole('button', { name: '选择物理表' }))
    await user.click(screen.getByTestId('cube-banner-generate-draft'))
    await screen.findByTestId('cube-banner-save-draft')

    await user.click(screen.getByTestId('cube-banner-save-draft'))

    await waitFor(() => expect(toastMocks.toast).toHaveBeenCalledWith({
      title: '创建 Cube 失败',
      description: 'create failed',
      variant: 'destructive',
    }))
  })

  it('编辑模式修改基础信息后可保存当前修改', async () => {
    const user = userEvent.setup()
    datasourceMocks.getDataSources.mockResolvedValueOnce({
      data: {
        items: [{ id: 1, name: '学习数仓', source_type: 'maxcompute' }],
      },
    })
    semanticApiMocks.listDomains.mockResolvedValueOnce({
      data: {
        domains: [{ id: 'learning', code: 'learning', name: '学习领域' }],
      },
    })
    semanticApiMocks.describeCube.mockResolvedValueOnce({
      data: buildCubeDetail(),
    })
    semanticApiMocks.updateCube.mockResolvedValueOnce({
      data: buildCubeDetail({ title: '答题记录宽表' }),
    })

    renderPage('/semantic/cubes/answer_records/edit')

    await screen.findByRole('heading', { name: '编辑 Cube' })
    await user.click(screen.getByTestId('cube-studio-step-1'))
    fireEvent.change(screen.getByTestId('cube-draft-title'), { target: { value: '答题记录宽表' } })
    await user.click(screen.getByTestId('cube-banner-save-current'))

    await waitFor(() => expect(semanticApiMocks.updateCube).toHaveBeenCalledWith('answer_records', {
      title: '答题记录宽表',
      description: '用于答题分析',
      status: 'draft',
      domain_id: 'learning',
      grain: undefined,
      entity_key: undefined,
    }))
  })

  it('编辑模式保存失败时给出 destructive 提示', async () => {
    const user = userEvent.setup()
    datasourceMocks.getDataSources.mockResolvedValueOnce({
      data: {
        items: [{ id: 1, name: '学习数仓', source_type: 'maxcompute' }],
      },
    })
    semanticApiMocks.listDomains.mockResolvedValueOnce({
      data: {
        domains: [{ id: 'learning', code: 'learning', name: '学习领域' }],
      },
    })
    semanticApiMocks.describeCube.mockResolvedValueOnce({
      data: buildCubeDetail(),
    })
    semanticApiMocks.updateCube.mockRejectedValueOnce(new Error('update failed'))

    renderPage('/semantic/cubes/answer_records/edit')

    await screen.findByRole('heading', { name: '编辑 Cube' })
    await user.click(screen.getByTestId('cube-studio-step-1'))
    fireEvent.change(screen.getByTestId('cube-draft-title'), { target: { value: '答题记录宽表' } })
    await user.click(screen.getByTestId('cube-banner-save-current'))

    await waitFor(() => expect(toastMocks.toast).toHaveBeenCalledWith({
      title: '更新 Cube 失败',
      description: 'update failed',
      variant: 'destructive',
    }))
  })

  it('编辑模式确认后可激活当前 Cube', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('confirm', vi.fn(() => true))
    datasourceMocks.getDataSources.mockResolvedValueOnce({
      data: {
        items: [{ id: 1, name: '学习数仓', source_type: 'maxcompute' }],
      },
    })
    semanticApiMocks.listDomains.mockResolvedValueOnce({
      data: {
        domains: [{ id: 'learning', code: 'learning', name: '学习领域' }],
      },
    })
    semanticApiMocks.describeCube.mockResolvedValueOnce({
      data: buildCubeDetail(),
    })
    semanticApiMocks.activateCube.mockResolvedValueOnce({
      data: buildDraft({ table: 'dws.answer_records' }),
    })

    renderPage('/semantic/cubes/answer_records/edit')

    await screen.findByRole('heading', { name: '编辑 Cube' })
    await user.click(screen.getByTestId('cube-studio-step-6'))
    await user.click(screen.getByRole('button', { name: '激活' }))

    expect(window.confirm).toHaveBeenCalledWith('确认将当前 Cube 激活吗？激活后会进入默认查询链路。')
    await waitFor(() => expect(semanticApiMocks.activateCube).toHaveBeenCalledWith('answer_records'))
  })

  it('编辑模式确认后可弃用当前 Cube', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('confirm', vi.fn(() => true))
    datasourceMocks.getDataSources.mockResolvedValueOnce({
      data: {
        items: [{ id: 1, name: '学习数仓', source_type: 'maxcompute' }],
      },
    })
    semanticApiMocks.listDomains.mockResolvedValueOnce({
      data: {
        domains: [{ id: 'learning', code: 'learning', name: '学习领域' }],
      },
    })
    semanticApiMocks.describeCube.mockResolvedValueOnce({
      data: buildCubeDetail({ status: 'active' }),
    })
    semanticApiMocks.deprecateCube.mockResolvedValueOnce({
      data: buildDraft({ status: 'deprecated', table: 'dws.answer_records' }),
    })

    renderPage('/semantic/cubes/answer_records/edit')

    await screen.findByRole('heading', { name: '编辑 Cube' })
    await user.click(screen.getByTestId('cube-studio-step-6'))
    await user.click(screen.getByRole('button', { name: '弃用' }))

    expect(window.confirm).toHaveBeenCalledWith('确认将当前 Cube 弃用吗？弃用后不应继续用于默认查询链路。')
    await waitFor(() => expect(semanticApiMocks.deprecateCube).toHaveBeenCalledWith('answer_records'))
  })

  it('编辑模式激活失败时给出 destructive 提示', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('confirm', vi.fn(() => true))
    datasourceMocks.getDataSources.mockResolvedValueOnce({
      data: {
        items: [{ id: 1, name: '学习数仓', source_type: 'maxcompute' }],
      },
    })
    semanticApiMocks.listDomains.mockResolvedValueOnce({
      data: {
        domains: [{ id: 'learning', code: 'learning', name: '学习领域' }],
      },
    })
    semanticApiMocks.describeCube.mockResolvedValueOnce({
      data: buildCubeDetail(),
    })
    semanticApiMocks.activateCube.mockRejectedValueOnce(new Error('activate failed'))

    renderPage('/semantic/cubes/answer_records/edit')

    await screen.findByRole('heading', { name: '编辑 Cube' })
    await user.click(screen.getByTestId('cube-studio-step-6'))
    await user.click(screen.getByRole('button', { name: '激活' }))

    await waitFor(() => expect(toastMocks.toast).toHaveBeenCalledWith({
      title: '激活失败',
      description: 'activate failed',
      variant: 'destructive',
    }))
  })

  it('编辑模式弃用失败时给出 destructive 提示', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('confirm', vi.fn(() => true))
    datasourceMocks.getDataSources.mockResolvedValueOnce({
      data: {
        items: [{ id: 1, name: '学习数仓', source_type: 'maxcompute' }],
      },
    })
    semanticApiMocks.listDomains.mockResolvedValueOnce({
      data: {
        domains: [{ id: 'learning', code: 'learning', name: '学习领域' }],
      },
    })
    semanticApiMocks.describeCube.mockResolvedValueOnce({
      data: buildCubeDetail({ status: 'active' }),
    })
    semanticApiMocks.deprecateCube.mockRejectedValueOnce(new Error('deprecate failed'))

    renderPage('/semantic/cubes/answer_records/edit')

    await screen.findByRole('heading', { name: '编辑 Cube' })
    await user.click(screen.getByTestId('cube-studio-step-6'))
    await user.click(screen.getByRole('button', { name: '弃用' }))

    await waitFor(() => expect(toastMocks.toast).toHaveBeenCalledWith({
      title: '弃用失败',
      description: 'deprecate failed',
      variant: 'destructive',
    }))
  })
})
