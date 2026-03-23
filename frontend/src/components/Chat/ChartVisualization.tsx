/**
 * 图表可视化组件 - Migrated to shadcn/ui
 * 支持多种图表类型：bar, line, pie, table, number
 */
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { DataTable } from '@/components/business'
import { TrendingUp } from 'lucide-react'

interface ChartConfig {
  type: 'bar' | 'line' | 'pie' | 'table' | 'number'
  x_field?: string
  y_field?: string
  title?: string
  [key: string]: unknown
}

interface ChartVisualizationProps {
  data: Array<Record<string, unknown>>
  config: ChartConfig
}

// 主题色配置
const COLORS = ['#6366f1', '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6']

const toDisplayText = (value: unknown) => {
  if (value === null || value === undefined) {
    return '-'
  }
  return typeof value === 'number' ? value.toLocaleString() : String(value)
}

export default function ChartVisualization({ data, config }: ChartVisualizationProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        暂无数据
      </div>
    )
  }

  // Number 卡片
  if (config.type === 'number') {
    const value = data[0][config.y_field || Object.keys(data[0])[0]]
    return (
      <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-8 border border-indigo-100">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <TrendingUp className="w-8 h-8 text-white" />
          </div>
          <div className="flex-1">
            {config.title && (
              <div className="text-sm text-gray-600 mb-1">{config.title}</div>
            )}
            <div className="text-4xl font-bold text-gray-900">
              {toDisplayText(value)}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Table 表格
  if (config.type === 'table') {
    const columns = Object.keys(data[0]).map(key => ({
      accessorKey: key,
      header: key,
      cell: ({ row }: { row: { getValue: (columnId: string) => unknown } }) => {
        const cellValue = String(row.getValue(key) ?? '')
        return (
          <div className="truncate max-w-[200px]" title={cellValue}>
            {cellValue}
          </div>
        )
      },
    }))

    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <DataTable
          columns={columns}
          data={data}
          showPagination={true}
        />
      </div>
    )
  }

  // 图表通用配置
  const xField = config.x_field || Object.keys(data[0])[0]
  const yField = config.y_field || Object.keys(data[0])[1]

  // 饼图单独处理
  if (config.type === 'pie') {
    return (
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        {config.title && (
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{config.title}</h3>
        )}
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              dataKey={yField}
              nameKey={xField}
              cx="50%"
              cy="50%"
              outerRadius={100}
              label={(item: Record<string, unknown>) => `${item[xField]}: ${item[yField]}`}
            >
              {data.map((_item, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="mt-4 flex flex-wrap gap-3 justify-center">
          {data.map((item, index) => (
            <div key={index} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              />
              <span className="text-sm text-gray-600">{toDisplayText(item[xField])}</span>
              
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl p-6 border border-gray-200">
      {config.title && (
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{config.title}</h3>
      )}
      
      {config.type === 'bar' && (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey={xField}
              tick={{ fill: '#6b7280', fontSize: 12 }}
              axisLine={{ stroke: '#d1d5db' }}
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 12 }}
              axisLine={{ stroke: '#d1d5db' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
              }}
            />
            <Legend wrapperStyle={{ paddingTop: '20px' }} />
            <Bar dataKey={yField} fill="#6366f1" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}

      {config.type === 'line' && (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey={xField}
              tick={{ fill: '#6b7280', fontSize: 12 }}
              axisLine={{ stroke: '#d1d5db' }}
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 12 }}
              axisLine={{ stroke: '#d1d5db' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
              }}
            />
            <Legend wrapperStyle={{ paddingTop: '20px' }} />
            <Line
              type="monotone"
              dataKey={yField}
              stroke="#6366f1"
              strokeWidth={2}
              dot={{ fill: '#6366f1', r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
