// Phase 5 可信标注：DataChat 来源徽标与语义 trace 展示
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import DataChat from './DataChat'

const appShellMocks = vi.hoisted(() => ({
  setBreadcrumbs: vi.fn(),
  setTopBarActions: vi.fn(),
  setContextPanel: vi.fn(),
}))

vi.mock('@v2/layout/AppShell', () => ({
  useAppShell: () => appShellMocks,
}))

vi.mock('@v2/hooks/datasets', () => ({
  useDatasets: () => ({
    data: { items: [{ id: 10, dataset_name: '销售数据集' }] },
    isLoading: false,
  }),
}))

vi.mock('@v2/hooks/agent', () => ({
  useAgentSemanticExecute: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}))

const conversation = {
  id: 1,
  title: '销售额查询',
  dataset_id: 10,
  dataset_name: '销售数据集',
  description: null,
  created_at: null,
  updated_at: null,
  message_count: 3,
}

vi.mock('@v2/hooks/conversations', () => ({
  useConversations: () => ({
    data: { items: [conversation] },
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useConversation: () => ({
    data: {
      ...conversation,
      context: {
        semantic_plan: {
          route: { route_type: 'cube' },
          primary_traceability: {
            business_metric: { title: 'GMV' },
            analysis_measure: { cube_name: 'orders' },
          },
        },
      },
      messages: [
        {
          id: 1,
          conversation_id: 1,
          role: 'user',
          content: '查询销售额',
          generated_sql: null,
          query_result: null,
          visualization_config: null,
          error: null,
          source: null,
          created_at: null,
        },
        {
          id: 2,
          conversation_id: 1,
          role: 'assistant',
          content: '已通过语义路由执行查询。',
          generated_sql: 'SELECT SUM(amount) FROM orders',
          query_result: null,
          visualization_config: null,
          error: null,
          source: 'semantic',
          via_semantic_layer: true,
          created_at: null,
        },
        {
          id: 3,
          conversation_id: 1,
          role: 'assistant',
          content: '【未经语义层验证】直连回答。',
          generated_sql: null,
          query_result: null,
          visualization_config: null,
          error: null,
          source: 'legacy_llm',
          via_semantic_layer: false,
          created_at: null,
        },
      ],
    },
    refetch: vi.fn(),
    isFetching: false,
  }),
  useCreateConversation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSendConversationMessage: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

describe('DataChat 来源徽标', () => {
  it('上下文面板不展示接口契约或前端实现说明', () => {
    render(<DataChat />)

    const calls = appShellMocks.setContextPanel.mock.calls
    const payload = calls[calls.length - 1]?.[0]
    expect(payload).toBeTruthy()
    render(<>{payload.body}</>)

    expect(screen.getByText('对话记录')).toBeInTheDocument()
    expect(screen.getByText('先选择数据集，再围绕该数据集发起自然语言问数。')).toBeInTheDocument()
    expect(screen.queryByText(/conversations|接口返回内容|前端伪造/)).not.toBeInTheDocument()
  })

  it('assistant 消息按 source 展示徽标：语义层 / 直连 LLM-未验证', () => {
    render(<DataChat />)

    expect(screen.getByText('语义层')).toBeInTheDocument()
    expect(screen.getByText('直连 LLM · 未验证')).toBeInTheDocument()
  })

  it('展示业务化的语义执行摘要，不直出 route_type 或 SQL', () => {
    render(<DataChat />)

    const trace = screen.getByTestId('semantic-plan-trace')
    expect(trace.textContent).toContain('Cube 指标匹配')
    expect(trace.textContent).toContain('GMV')
    expect(trace.textContent).toContain('orders')
    expect(trace.textContent).not.toContain('route')
    expect(screen.queryByText('SELECT SUM(amount) FROM orders')).not.toBeInTheDocument()
    expect(screen.getByText('已生成可追溯查询语句，详情可在执行记录中查看。')).toBeInTheDocument()
  })
})
