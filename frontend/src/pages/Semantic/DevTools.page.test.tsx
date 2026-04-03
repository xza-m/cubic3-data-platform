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
  PythonPreviewTab: () => <div data-testid="mock-python-tab">Python Preview</div>,
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
}

describe('DevTools page', () => {
  it('默认进入已发布 Cube 的预览页并渲染新工作台', async () => {
    mockLists()
    renderPage()

    await screen.findByRole('heading', { name: '语义工作台' })

    expect(screen.getByTestId('devtools-screen')).toBeInTheDocument()
    expect(screen.getByTestId('devtools-workbench-shell')).toHaveClass('flex-col')
    expect(screen.queryByText('AI 辅助建模')).not.toBeInTheDocument()
    expect(screen.getByTestId('devtools-tree-panel')).toBeInTheDocument()
    expect(screen.getByTestId('devtools-inspector-wrapper')).toBeInTheDocument()
    expect(screen.queryByTestId('devtools-workbench-context-bar')).not.toBeInTheDocument()
    expect(screen.getByTestId('devtools-tab-editor')).toBeInTheDocument()
    expect(screen.getByTestId('devtools-tab-python')).toBeInTheDocument()
    expect(screen.getByTestId('devtools-tab-sync')).toBeInTheDocument()
    expect(await screen.findByTestId('mock-playground-tab')).toHaveTextContent('Playground answer_records|hide-select')
    expect(screen.queryByTestId('mock-yaml-editor-answer_records')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '发布' })).toBeInTheDocument()
    expect(screen.getAllByText('答题记录').length).toBeGreaterThan(0)
  })

  it('通过 cube 参数可以直达指定草稿 Cube，而不是默认第一个 Cube', async () => {
    mockLists()
    renderPage('/semantic/workbench?cube=answer_records__revision_draft')

    await screen.findByRole('heading', { name: '语义工作台' })

    expect(await screen.findByTestId('mock-yaml-editor-answer_records__revision_draft')).toBeInTheDocument()
    expect(screen.queryByTestId('mock-yaml-editor-answer_records')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '发布' })).toBeInTheDocument()
  })

  it('已发布 Cube 在无显式 tab 时默认进入预览', async () => {
    mockLists()
    renderPage('/semantic/workbench?cube=answer_records')

    await screen.findByRole('heading', { name: '语义工作台' })

    expect(await screen.findByTestId('mock-playground-tab')).toHaveTextContent('Playground answer_records|hide-select')
    expect(screen.queryByTestId('mock-yaml-editor-answer_records')).not.toBeInTheDocument()
  })

  it('资源树按当前对象类型展示单一资源库头部', async () => {
    mockLists()
    renderPage()

    await screen.findByRole('heading', { name: '语义工作台' })

    expect(screen.getByText('Cube 库')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('搜索 Cube...')).toBeInTheDocument()
    expect(screen.queryByTestId('semantic-resource-kind-cube')).not.toBeInTheDocument()
  })

  it('旧的 compiler tab 参数会兼容映射到预览页', async () => {
    mockLists()
    renderPage('/semantic/workbench?tab=compiler')

    await screen.findByRole('heading', { name: '语义工作台' })

    expect(await screen.findByTestId('mock-playground-tab')).toBeInTheDocument()
    expect(screen.queryByTestId('mock-yaml-editor-answer_records')).not.toBeInTheDocument()
  })

  it('切到 PY 后展示 Python 实现预览', async () => {
    mockLists()
    renderPage()

    await screen.findByRole('heading', { name: '语义工作台' })

    fireEvent.click(screen.getByTestId('devtools-tab-python'))

    expect(screen.getByTestId('mock-python-tab')).toBeInTheDocument()
  })

  it('选择领域旧链接时会自动回退到默认 Cube', async () => {
    mockLists()
    renderPage('/semantic/workbench?kind=domain&resource=domain-learning')

    await screen.findByRole('heading', { name: '语义工作台' })

    expect(await screen.findByTestId('mock-playground-tab')).toHaveTextContent('Playground answer_records|hide-select')
    expect(screen.queryByTestId('semantic-editor-empty-state')).not.toBeInTheDocument()
  })

  it('支持在工具页挂载 Recipe 定义文件', async () => {
    mockLists()
    renderPage('/semantic/workbench?kind=recipe&resource=learning_path&file=learning_path')

    await screen.findByRole('heading', { name: '语义工作台' })

    expect(screen.getByTestId('mock-yaml-editor-learning_path')).toBeInTheDocument()
    expect(screen.getByTestId('mock-recipe-yaml-summary')).toHaveTextContent('学习,转化|2|answer_records')
    expect(screen.getByText('Recipe 信息')).toBeInTheDocument()
    expect(screen.getByText('关联 Cube')).toBeInTheDocument()
    expect(screen.getByText('示例数')).toBeInTheDocument()
    expect(screen.getAllByText('学习路径示例').length).toBeGreaterThan(0)
  })

  it('选择目录旧链接时会自动回退到默认 Cube', async () => {
    mockLists()
    renderPage('/semantic/workbench?kind=catalog&resource=learning')

    await screen.findByRole('heading', { name: '语义工作台' })

    expect(await screen.findByTestId('mock-playground-tab')).toHaveTextContent('Playground answer_records|hide-select')
    expect(screen.queryByTestId('semantic-editor-empty-state')).not.toBeInTheDocument()
  })

  it('切到预览后展示统一预览工作区', async () => {
    mockLists()
    renderPage()

    await screen.findByRole('heading', { name: '语义工作台' })

    fireEvent.click(screen.getByTestId('devtools-tab-sync'))

    expect(screen.getByTestId('mock-playground-tab')).toHaveTextContent('Playground answer_records|hide-select')
    expect(screen.queryByTestId('devtools-workbench-context-bar')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '验证' })).not.toBeInTheDocument()
  })
})
