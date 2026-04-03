import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import DevTools from './DevTools'

const semanticApiMocks = vi.hoisted(() => ({
  listDomainCatalogs: vi.fn(),
  listDomains: vi.fn(),
  listCubes: vi.fn(),
  listViews: vi.fn(),
  listRecipes: vi.fn(),
  describeCube: vi.fn(),
}))

vi.mock('@/api/semantic', async () => {
  const actual = await vi.importActual<typeof import('@/api/semantic')>('@/api/semantic')
  return {
    ...actual,
    listDomainCatalogs: semanticApiMocks.listDomainCatalogs,
    listDomains: semanticApiMocks.listDomains,
    listCubes: semanticApiMocks.listCubes,
    listViews: semanticApiMocks.listViews,
    listRecipes: semanticApiMocks.listRecipes,
    describeCube: semanticApiMocks.describeCube,
  }
})

vi.mock('@/components/Semantic/DevTools/YamlEditorTab', () => ({
  YamlEditorTab: ({
    fileName,
    recipeMeta,
  }: {
    fileName?: string
    recipeMeta?: { tags: string[]; exampleCount: number; relatedCubes: string[] } | null
  }) => (
    <div>
      <div data-testid={`mock-yaml-editor-${fileName || 'empty'}`}>YAML {fileName}</div>
      {recipeMeta ? (
        <div data-testid="mock-recipe-yaml-summary">
          {recipeMeta.tags.join(',')}|{recipeMeta.exampleCount}|{recipeMeta.relatedCubes.join(',')}
        </div>
      ) : null}
    </div>
  ),
}))

vi.mock('@/components/Semantic/DevTools/PlaygroundTab', () => ({
  PlaygroundTab: ({
    preferredCube,
    hideCubeSelect,
  }: {
    preferredCube?: string
    hideCubeSelect?: boolean
  }) => (
    <div data-testid="mock-playground-tab">
      Playground {preferredCube || 'none'}|{hideCubeSelect ? 'hide-select' : 'show-select'}
    </div>
  ),
}))

vi.mock('@/components/Semantic/DevTools/PythonPreviewTab', () => ({
  PythonPreviewTab: ({ cube }: { cube?: { name?: string } }) => (
    <div data-testid="mock-python-tab">Python Preview {cube?.name || 'none'}</div>
  ),
}))

function renderPage(initialEntry = '/semantic/workbench') {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={client}>
        <DevTools />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

function mockLists() {
  semanticApiMocks.listDomainCatalogs.mockResolvedValue({
    data: {
      catalogs: [
        {
          code: 'learning',
          name: '学习目录',
          status: 'active',
          domain_count: 1,
          active_count: 1,
          draft_count: 0,
          domains: [],
        },
      ],
      total: 1,
    },
  })
  semanticApiMocks.listDomains.mockResolvedValue({
    data: {
      domains: [
        {
          id: 'domain-learning',
          code: 'learning',
          name: '学习领域',
          catalog_name: '学习目录',
          status: 'draft',
          cube_count: 2,
          join_count: 1,
          state_summary: { sync_status: 'warn' },
        },
      ],
      total: 1,
    },
  })
  semanticApiMocks.listCubes.mockResolvedValue({
    data: {
      cubes: [
        {
          name: 'answer_records',
          title: '答题记录',
          description: '',
          table: 'answer_records',
          dimensions: [],
          measures: [],
          dimension_count: 3,
          measure_count: 2,
          status: 'active',
          state_summary: { sync_status: 'ok' },
        },
        {
          name: 'answer_records__revision_draft',
          title: '答题记录修订草稿',
          description: '',
          table: 'answer_records',
          dimensions: [],
          measures: [],
          dimension_count: 1,
          measure_count: 1,
          status: 'draft',
          state_summary: { sync_status: 'warn' },
        },
      ],
      total: 2,
    },
  })
  semanticApiMocks.listViews.mockResolvedValue({
    data: {
      views: [
        {
          name: 'learning_overview',
          title: '学习总览',
          description: '',
          public: true,
          cube_count: 2,
        },
      ],
      total: 1,
    },
  })
  semanticApiMocks.listRecipes.mockResolvedValue({
    data: {
      recipes: [
        {
          name: 'learning_path',
          title: '学习路径示例',
          tags: ['学习', '转化'],
          example_count: 2,
          related_cubes: ['answer_records'],
          state_summary: { object_type: 'recipe', status: 'active' },
        },
      ],
      total: 1,
    },
  })
  semanticApiMocks.describeCube.mockImplementation(async (name: string) => ({
    data: {
      name,
      title: name === 'answer_records' ? '答题记录' : '答题记录修订草稿',
      description: name === 'answer_records' ? '答题行为事实表' : '待修订版本',
      table: 'answer_records',
      domain_ids: [],
      domains: [],
      domain_count: 0,
      status: name === 'answer_records' ? 'active' : 'draft',
      dimensions: {
        occurred_at: { title: '发生时间', type: 'time' },
        student_name: { title: '学生', type: 'string' },
        subject_name: { title: '学科', type: 'string' },
      },
      measures: {
        answer_count: { title: '答题次数', type: 'count', certified: true },
        correct_rate: { title: '正确率', type: 'number' },
      },
      segments: {},
      joins: {},
      source_binding_summary: {
        source_name: '学习行为仓',
      },
      state_summary: {
        status: name === 'answer_records' ? 'active' : 'draft',
      },
    },
  }))
}

describe('DevTools page', () => {
  it('工作台首屏显示 AI 辅助建模主任务区与继续工作区', async () => {
    mockLists()
    renderPage()

    await screen.findByRole('heading', { name: '语义工作台' })

    expect(screen.getAllByText('AI 辅助建模').length).toBeGreaterThan(0)
    expect(screen.getByText('最近草稿')).toBeInTheDocument()
    expect(screen.getByText('最近发布')).toBeInTheDocument()
    expect(screen.getByText('继续工作')).toBeInTheDocument()
    expect(screen.queryByTestId('mock-playground-tab')).not.toBeInTheDocument()
    expect(screen.queryByTestId('mock-yaml-editor-answer_records')).not.toBeInTheDocument()
  })

  it('草稿 Cube 在无显式 tab 时默认进入建模', async () => {
    mockLists()
    renderPage('/semantic/workbench?cube=answer_records__revision_draft')

    await screen.findByRole('heading', { name: '语义工作台' })

    expect(screen.getByTestId('devtools-tab-modeling')).toHaveAttribute('data-state', 'active')
    expect(screen.getAllByText('推荐指标').length).toBeGreaterThan(0)
    expect(screen.getByText('来源摘要')).toBeInTheDocument()
    expect(screen.queryByTestId('mock-playground-tab')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '发布' })).toBeInTheDocument()
  })

  it('已发布 Cube 在无显式 tab 时默认进入预览', async () => {
    mockLists()
    renderPage('/semantic/workbench?cube=answer_records')

    await screen.findByRole('heading', { name: '语义工作台' })

    expect(screen.getByTestId('devtools-tab-preview')).toHaveAttribute('data-state', 'active')
    expect(await screen.findByTestId('mock-playground-tab')).toHaveTextContent('Playground answer_records|hide-select')
    expect(screen.queryByTestId('mock-yaml-editor-answer_records')).not.toBeInTheDocument()
  })

  it('旧的 compiler tab 参数会兼容映射到预览页', async () => {
    mockLists()
    renderPage('/semantic/workbench?cube=answer_records&tab=compiler')

    await screen.findByRole('heading', { name: '语义工作台' })

    expect(screen.getByTestId('devtools-tab-preview')).toHaveAttribute('data-state', 'active')
    expect(await screen.findByTestId('mock-playground-tab')).toBeInTheDocument()
    expect(screen.queryByTestId('mock-yaml-editor-answer_records')).not.toBeInTheDocument()
  })

  it('旧版无 cube 的 sync 入口会回退到默认 Cube 预览', async () => {
    mockLists()
    renderPage('/semantic/workbench?tab=sync')

    await screen.findByRole('heading', { name: '语义工作台' })

    expect(screen.getByTestId('devtools-tab-preview')).toHaveAttribute('data-state', 'active')
    expect(await screen.findByTestId('mock-playground-tab')).toHaveTextContent('Playground answer_records|hide-select')
  })

  it('旧版 cube preview 深链会保留目标 Cube', async () => {
    mockLists()
    renderPage('/semantic/workbench?kind=cube&resource=answer_records__revision_draft&file=answer_records__revision_draft&tab=sync')

    await screen.findByRole('heading', { name: '语义工作台' })

    expect(screen.getByTestId('devtools-tab-preview')).toHaveAttribute('data-state', 'active')
    expect(await screen.findByTestId('mock-playground-tab')).toHaveTextContent('Playground answer_records__revision_draft|hide-select')
  })

  it('旧版 cube python 深链会保留目标 Cube 详情', async () => {
    mockLists()
    renderPage('/semantic/workbench?kind=cube&resource=answer_records__revision_draft&file=answer_records__revision_draft&tab=python')

    await screen.findByRole('heading', { name: '语义工作台' })

    expect(screen.getByTestId('devtools-tab-python')).toHaveAttribute('data-state', 'active')
    expect(await screen.findByTestId('mock-python-tab')).toHaveTextContent('Python Preview answer_records__revision_draft')
  })

  it('旧版 recipe YAML 深链仍会进入对应对象态', async () => {
    mockLists()
    renderPage('/semantic/workbench?tab=editor&kind=recipe&resource=learning_path&file=learning_path')

    await screen.findByRole('heading', { name: '语义工作台' })

    expect(await screen.findByTestId('mock-yaml-editor-learning_path')).toBeInTheDocument()
    expect(screen.getByTestId('mock-recipe-yaml-summary')).toHaveTextContent('学习,转化|2|answer_records')
    expect(screen.queryByText('最近草稿')).not.toBeInTheDocument()
  })

  it('旧版 view YAML 深链仍会进入对应对象态', async () => {
    mockLists()
    renderPage('/semantic/workbench?tab=editor&kind=view&resource=learning_overview&file=learning_overview')

    await screen.findByRole('heading', { name: '语义工作台' })

    expect(await screen.findByTestId('mock-yaml-editor-learning_overview')).toBeInTheDocument()
    expect(screen.queryByText('最近发布')).not.toBeInTheDocument()
  })

  it('旧版 domain 链接会保留原始领域对象而不是回退默认 Cube', async () => {
    mockLists()
    renderPage('/semantic/workbench?tab=editor&kind=domain&resource=domain-learning')

    await screen.findByRole('heading', { name: '语义工作台' })

    expect(screen.getByTestId('semantic-editor-empty-state')).toBeInTheDocument()
    expect(screen.getByText('当前对象暂不支持在线 YAML 编辑')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '打开领域模块' })).toBeInTheDocument()
    expect(screen.queryByTestId('mock-playground-tab')).not.toBeInTheDocument()
  })

  it('旧版 catalog 链接会保留原始目录对象而不是回退默认 Cube', async () => {
    mockLists()
    renderPage('/semantic/workbench?tab=editor&kind=catalog&resource=learning')

    await screen.findByRole('heading', { name: '语义工作台' })

    expect(screen.getByTestId('semantic-editor-empty-state')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '打开领域建模' })).toBeInTheDocument()
    expect(screen.queryByTestId('mock-playground-tab')).not.toBeInTheDocument()
  })

  it('切到 PY 后展示 Python 实现预览', async () => {
    mockLists()
    renderPage('/semantic/workbench?cube=answer_records')

    await screen.findByRole('heading', { name: '语义工作台' })

    fireEvent.click(screen.getByTestId('devtools-tab-python'))

    expect(screen.getByTestId('mock-python-tab')).toHaveTextContent('Python Preview answer_records')
  })
})
