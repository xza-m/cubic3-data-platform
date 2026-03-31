import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MessageList from './MessageList'

vi.mock('./ChartVisualization', () => ({
  default: ({
    data,
    config,
  }: {
    data: Array<Record<string, unknown>>
    config: Record<string, unknown>
  }) => (
    <div data-testid="chart-visualization">
      {`rows:${data.length};type:${String(config.type)}`}
    </div>
  ),
}))

describe('MessageList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  it('同时渲染用户消息、助手消息、SQL、图表、错误态和加载态', () => {
    render(
      <MessageList
        messages={[
          {
            id: 1,
            conversation_id: 9,
            role: 'user',
            content: '帮我看下最近一周的高分学生',
            created_at: '2026-03-26T10:00:00Z',
          },
          {
            id: 2,
            conversation_id: 9,
            role: 'assistant',
            content: '这是最近一周的高分学生概览',
            created_at: '2026-03-26T10:01:00Z',
            generated_sql: 'SELECT * FROM score_detail LIMIT 10',
            query_result: {
              columns: [
                { name: 'student', type: 'string' },
                { name: 'score', type: 'number' },
              ],
              data: [{ student: 'Alice', score: 99 }],
            },
            visualization_config: { type: 'bar', config: { x_field: 'student', y_field: 'score' } },
            error: '样本量不足，请补充筛选条件',
          },
        ]}
        loading
      />,
    )

    expect(screen.getByText('帮我看下最近一周的高分学生')).toBeInTheDocument()
    expect(screen.getByText('这是最近一周的高分学生概览')).toBeInTheDocument()
    expect(screen.getByText('生成的 SQL')).toBeInTheDocument()
    expect(screen.getByText('SELECT * FROM score_detail LIMIT 10')).toBeInTheDocument()
    expect(screen.getByTestId('chart-visualization')).toHaveTextContent('rows:1;type:bar')
    expect(screen.getByText('处理失败')).toBeInTheDocument()
    expect(screen.getByText('样本量不足，请补充筛选条件')).toBeInTheDocument()
    expect(screen.getByText('正在思考...')).toBeInTheDocument()
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled()
  })
})
