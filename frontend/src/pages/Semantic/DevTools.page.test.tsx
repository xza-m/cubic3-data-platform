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
}))

vi.mock('@/api/semantic', async () => {
  const actual = await vi.importActual<typeof import('@/api/semantic')>('@/api/semantic')
  return {
    ...actual,
    listDomainCatalogs: semanticApiMocks.listDomainCatalogs,
    listDomains: semanticApiMocks.listDomains,
    listCubes: semanticApiMocks.listCubes,
    listViews: semanticApiMocks.listViews,
  }
})

vi.mock('@/components/Semantic/DevTools/YamlEditorTab', () => ({
  YamlEditorTab: ({ fileName }: { fileName?: string }) => (
    <div data-testid={`mock-yaml-editor-${fileName || 'empty'}`}>YAML {fileName}</div>
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

vi.mock('@/components/Semantic/DevTools/SchemaSyncTab', () => ({
  SchemaSyncTab: ({ highlightObjectName }: { highlightObjectName?: string | null }) => (
    <div data-testid="mock-schema-sync-tab">Schema {highlightObjectName || 'none'}</div>
  ),
}))

function renderPage(initialEntry = '/semantic/tools') {
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
}

describe('DevTools page', () => {
  it('默认进入 Cube 定义文件并渲染上下文条', async () => {
    mockLists()
    renderPage()

    await screen.findByRole('heading', { name: '开发工具' })

    expect(screen.getByTestId('devtools-workbench-context-bar')).toBeInTheDocument()
    expect(screen.getByTestId('devtools-workspace-header')).toBeInTheDocument()
    expect(screen.getByTestId('mock-yaml-editor-answer_records')).toBeInTheDocument()
    expect(screen.getByText('Cube / answer_records')).toBeInTheDocument()
  })

  it('切到编译调试后切换对象仍保留当前 tab', async () => {
    mockLists()
    renderPage()

    await screen.findByRole('heading', { name: '开发工具' })
    fireEvent.click(screen.getByTestId('devtools-tab-compiler'))

    expect(screen.getByTestId('mock-compile-tab')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('semantic-resource-item-view-learning_overview'))

    expect(screen.getByTestId('mock-compile-tab')).toBeInTheDocument()
    expect(screen.getByText('View / learning_overview')).toBeInTheDocument()
    expect(within(screen.getByTestId('devtools-workspace-header')).getByText('学习总览')).toBeInTheDocument()
  })

  it('选择领域时在定义文件页展示产品化空状态', async () => {
    mockLists()
    renderPage()

    await screen.findByRole('heading', { name: '开发工具' })
    fireEvent.click(screen.getByTestId('semantic-resource-item-domain-domain-learning'))

    expect(screen.getByText('当前对象暂不支持在线 YAML 编辑')).toBeInTheDocument()
    expect(within(screen.getByTestId('semantic-editor-empty-state')).getByRole('link', { name: '打开领域模块' })).toHaveAttribute('href', '/semantic/domains/domain-learning')
  })
})
