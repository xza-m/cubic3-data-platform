import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'
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

vi.mock('@/components/Semantic/DevTools/CompileDebugTab', () => ({
  CompileDebugTab: ({ onStatusChange }: { onStatusChange?: (status: any) => void }) => {
    React.useEffect(() => {
      onStatusChange?.({ state: 'idle', label: '未执行', lastRunAt: null })
    }, [onStatusChange])
    return <div data-testid="mock-compile-tab">Compile</div>
  },
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
      ],
      total: 1,
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
  it('默认进入 Cube 定义文件并渲染新工作台', async () => {
    mockLists()
    renderPage()

    await screen.findByRole('heading', { name: '语义工作台' })

    expect(screen.getByTestId('devtools-screen')).toBeInTheDocument()
    expect(screen.queryByTestId('devtools-workbench-context-bar')).not.toBeInTheDocument()
    expect(screen.getByTestId('devtools-tab-editor')).toBeInTheDocument()
    expect(screen.getByTestId('devtools-tab-python')).toBeInTheDocument()
    expect(screen.getByTestId('devtools-tab-compiler')).toBeInTheDocument()
    expect(screen.getByTestId('devtools-tab-sync')).toBeInTheDocument()
    expect(await screen.findByTestId('mock-yaml-editor-answer_records')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '验证' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '发布' })).toBeInTheDocument()
    expect(screen.getAllByText('答题记录').length).toBeGreaterThan(0)
  })

  it('资源树按当前对象类型展示单一资源库头部', async () => {
    mockLists()
    renderPage()

    await screen.findByRole('heading', { name: '语义工作台' })

    expect(screen.getByText('Cube 资源库')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('搜索 Cube...')).toBeInTheDocument()
    expect(screen.queryByTestId('semantic-resource-kind-cube')).not.toBeInTheDocument()
  })

  it('切到编译调试后切换对象仍保留当前 tab', async () => {
    mockLists()
    renderPage('/semantic/workbench?kind=view&resource=learning_overview&file=learning_overview')

    await screen.findByRole('heading', { name: '语义工作台' })
    fireEvent.click(screen.getByTestId('devtools-tab-compiler'))

    expect(screen.getByTestId('mock-compile-tab')).toBeInTheDocument()
    expect(screen.getByTestId('mock-compile-tab')).toBeInTheDocument()
    expect(screen.getAllByText('学习总览').length).toBeGreaterThan(0)
  })

  it('切到 PY 后展示 Python 实现预览', async () => {
    mockLists()
    renderPage()

    await screen.findByRole('heading', { name: '语义工作台' })

    fireEvent.click(screen.getByTestId('devtools-tab-python'))

    expect(screen.getByTestId('mock-python-tab')).toBeInTheDocument()
  })

  it('选择领域时在定义文件页展示产品化空状态', async () => {
    mockLists()
    renderPage('/semantic/workbench?kind=domain&resource=domain-learning')

    await screen.findByRole('heading', { name: '语义工作台' })

    expect(screen.getByText('当前对象暂不支持在线 YAML 编辑')).toBeInTheDocument()
    expect(within(screen.getByTestId('semantic-editor-empty-state')).getByRole('link', { name: '打开领域模块' })).toHaveAttribute('href', '/semantic/domains/domain-learning')
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

  it('选择目录时在定义文件页展示稳定空状态并提供返回动作', async () => {
    mockLists()
    renderPage('/semantic/workbench?kind=catalog&resource=learning')

    await screen.findByRole('heading', { name: '语义工作台' })

    expect(screen.getByText('当前对象暂不支持在线 YAML 编辑')).toBeInTheDocument()
    expect(screen.getByText('目录对象已并入领域建模页维护。这里显示资源树、编译调试和 Schema 同步。')).toBeInTheDocument()
    expect(within(screen.getByTestId('semantic-editor-empty-state')).getByRole('link', { name: '打开领域建模' })).toHaveAttribute('href', '/semantic/domains')
  })

  it('切到预览后展示 Schema 工作区', async () => {
    mockLists()
    renderPage()

    await screen.findByRole('heading', { name: '语义工作台' })

    fireEvent.click(screen.getByTestId('devtools-tab-sync'))

    expect(screen.getByTestId('mock-playground-tab')).toHaveTextContent('Playground answer_records|hide-select')
    expect(screen.queryByTestId('devtools-workbench-context-bar')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '验证' })).not.toBeInTheDocument()
  })
})
