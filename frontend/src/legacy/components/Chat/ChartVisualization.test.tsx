import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ChartVisualization from './ChartVisualization'

vi.mock('@/components/business', () => ({
  DataTable: ({
    columns,
    data,
  }: {
    columns: Array<{ accessorKey?: string | number }>
    data: Array<Record<string, unknown>>
  }) => <div data-testid="chart-table">{`rows:${data.length};cols:${columns.length}`}</div>,
}))

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive">{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div data-testid="bar-series" />,
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
  Line: () => <div data-testid="line-series" />,
  PieChart: ({ children }: { children: React.ReactNode }) => <div data-testid="pie-chart">{children}</div>,
  Pie: ({ children }: { children: React.ReactNode }) => <div data-testid="pie-series">{children}</div>,
  Cell: () => <div data-testid="pie-cell" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
}))

describe('ChartVisualization', () => {
  it('空数据时展示空态', () => {
    render(<ChartVisualization data={[]} config={{ type: 'bar' }} />)
    expect(screen.getByText('暂无数据')).toBeInTheDocument()
  })

  it('number 模式展示统计卡片', () => {
    render(
      <ChartVisualization
        data={[{ total: 12345 }]}
        config={{ type: 'number', y_field: 'total', title: '总记录数' }}
      />,
    )

    expect(screen.getByText('总记录数')).toBeInTheDocument()
    expect(screen.getByText('12,345')).toBeInTheDocument()
  })

  it('table 模式透传表格列和行', () => {
    render(
      <ChartVisualization
        data={[{ student: 'Alice', score: 98 }]}
        config={{ type: 'table' }}
      />,
    )

    expect(screen.getByTestId('chart-table')).toHaveTextContent('rows:1;cols:2')
  })

  it('pie 模式渲染标题和图例', () => {
    render(
      <ChartVisualization
        data={[
          { category: 'A', value: 10 },
          { category: 'B', value: 20 },
        ]}
        config={{ type: 'pie', x_field: 'category', y_field: 'value', title: '分类占比' }}
      />,
    )

    expect(screen.getByText('分类占比')).toBeInTheDocument()
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument()
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it('bar 和 line 模式渲染对应图表容器', () => {
    const { rerender } = render(
      <ChartVisualization
        data={[{ day: 'Mon', value: 10 }]}
        config={{ type: 'bar', x_field: 'day', y_field: 'value', title: '柱状图' }}
      />,
    )

    expect(screen.getByText('柱状图')).toBeInTheDocument()
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
    expect(screen.getByTestId('bar-series')).toBeInTheDocument()

    rerender(
      <ChartVisualization
        data={[{ day: 'Mon', value: 10 }]}
        config={{ type: 'line', x_field: 'day', y_field: 'value', title: '折线图' }}
      />,
    )

    expect(screen.getByText('折线图')).toBeInTheDocument()
    expect(screen.getByTestId('line-chart')).toBeInTheDocument()
    expect(screen.getByTestId('line-series')).toBeInTheDocument()
  })
})
