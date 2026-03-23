import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import DomainCanvas from './DomainCanvas'

const semanticApiMocks = vi.hoisted(() => ({
  getDomainCanvas: vi.fn(),
  publishDomain: vi.fn(),
}))

vi.mock('@/api/semantic', async () => {
  const actual = await vi.importActual<typeof import('@/api/semantic')>('@/api/semantic')
  return {
    ...actual,
    getDomainCanvas: semanticApiMocks.getDomainCanvas,
    publishDomain: semanticApiMocks.publishDomain,
  }
})

vi.mock('@/components/business', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}))

vi.mock('@/hooks/useUnsavedChangesPrompt', () => ({
  useUnsavedChangesPrompt: vi.fn(),
}))

vi.mock('@xyflow/react', async () => {
  const React = await vi.importActual<typeof import('react')>('react')

  return {
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    ReactFlow: ({
      nodes = [],
      edges = [],
      onNodeClick,
      onEdgeClick,
      children,
    }: {
      nodes?: Array<any>
      edges?: Array<any>
      onNodeClick?: (event: any, node: any) => void
      onEdgeClick?: (event: any, edge: any) => void
      children?: React.ReactNode
    }) => (
      <div data-testid="mock-reactflow">
        <div>
          {nodes.filter((node) => !node.hidden).map((node) => (
            <button key={node.id} type="button" data-testid={`mock-node-${node.id}`} onClick={() => onNodeClick?.({}, node)}>
              {node.id}
            </button>
          ))}
        </div>
        <div>
          {edges.filter((edge) => !edge.hidden).map((edge) => (
            <button key={edge.id} type="button" data-testid={`mock-edge-${edge.id}`} onClick={() => onEdgeClick?.({}, edge)}>
              {edge.id}
            </button>
          ))}
        </div>
        {children}
      </div>
    ),
    BackgroundVariant: { Dots: 'dots' },
    useNodesState: (initial: any[]) => React.useState(initial).concat([vi.fn()]),
    useEdgesState: (initial: any[]) => React.useState(initial).concat([vi.fn()]),
  }
})

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <MemoryRouter initialEntries={['/semantic/domains/domain-learning']}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/semantic/domains/:id" element={<DomainCanvas />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('DomainCanvas page', () => {
  it('渲染上下文条和资源库', async () => {
    semanticApiMocks.getDomainCanvas.mockResolvedValueOnce({
      data: {
        domain: {
          id: 'domain-learning',
          code: 'learning',
          name: '学习领域',
          status: 'draft',
          description: '学习过程与结果相关语义模型',
        },
        nodes: [
          { id: 'answer_records', title: '答题记录', type: 'fact', dimensions: 3, measures: 2, status: 'active' },
        ],
        edges: [],
        library_cubes: [
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
            in_domain: true,
          },
          {
            name: 'user_profile',
            title: '学生档案',
            description: '',
            table: 'user_profile',
            dimensions: [],
            measures: [],
            dimension_count: 4,
            measure_count: 0,
            status: 'active',
            in_domain: false,
          },
        ],
      },
    })

    renderPage()

    await screen.findByRole('heading', { name: '领域设计' })
    expect(screen.getByTestId('domain-workbench-context-bar')).toBeInTheDocument()
    expect(screen.getByTestId('domain-library-cube-user_profile')).toBeInTheDocument()
    expect(screen.getByTestId('mock-reactflow')).toBeInTheDocument()
  })

  it('点击连线后切到 Join Inspector', async () => {
    semanticApiMocks.getDomainCanvas.mockResolvedValueOnce({
      data: {
        domain: {
          id: 'domain-learning',
          code: 'learning',
          name: '学习领域',
          status: 'draft',
        },
        nodes: [
          { id: 'answer_records', title: '答题记录', type: 'fact', dimensions: 3, measures: 2, status: 'active' },
          { id: 'user_profile', title: '学生档案', type: 'dimension', dimensions: 2, measures: 0, status: 'active' },
        ],
        edges: [
          {
            id: 'answer_records__user_profile',
            source: 'answer_records',
            target: 'user_profile',
            relationship: 'N:1',
            join_type: 'left',
            source_field: 'user_id',
            target_field: 'id',
          },
        ],
        library_cubes: [
          {
            name: 'answer_records',
            title: '答题记录',
            description: '',
            table: 'answer_records',
            dimensions: ['user_id'],
            measures: [],
            dimension_count: 3,
            measure_count: 2,
            status: 'active',
            in_domain: true,
          },
          {
            name: 'user_profile',
            title: '学生档案',
            description: '',
            table: 'user_profile',
            dimensions: ['id'],
            measures: [],
            dimension_count: 2,
            measure_count: 0,
            status: 'active',
            in_domain: true,
          },
        ],
      },
    })

    renderPage()

    await screen.findByRole('heading', { name: '领域设计' })
    fireEvent.click(await screen.findByTestId('mock-edge-answer_records__user_profile'))

    expect(screen.getByTestId('domain-inspector-join')).toBeInTheDocument()
    expect(screen.getByText('源字段')).toBeInTheDocument()
    expect(screen.getByText('目标字段')).toBeInTheDocument()
  })
})
