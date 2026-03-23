/**
 * 查询中心首页
 */
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { 
  Code, 
  FileText, 
  History, 
  TrendingUp,
  Clock,
  Star,
  Database,
  Play
} from 'lucide-react'
import { getQueries, getHistories, getStatistics } from '../../api/queries'

export default function QueryCenterDashboard() {
  const navigate = useNavigate()
  
  // 获取最近查询
  const { data: recentQueries } = useQuery({
    queryKey: ['queries', 'recent'],
    queryFn: () => getQueries({ page: 1, page_size: 5 })
  })
  
  // 获取查询历史
  const { data: recentHistories } = useQuery({
    queryKey: ['histories', 'recent'],
    queryFn: () => getHistories({ page: 1, page_size: 5 })
  })
  
  // 获取统计数据
  const { data: stats } = useQuery({
    queryKey: ['queries', 'statistics'],
    queryFn: getStatistics
  })
  
  const quickStartCards = [
    {
      title: '新建查询',
      description: '创建一个新的SQL查询',
      icon: Code,
      color: 'from-blue-500 to-cyan-500',
      action: () => navigate('/queries/editor')
    },
    {
      title: '使用模板',
      description: '从模板快速开始',
      icon: FileText,
      color: 'from-purple-500 to-pink-500',
      action: () => navigate('/queries/templates')
    },
    {
      title: '查看历史',
      description: '查看最近执行的查询',
      icon: History,
      color: 'from-emerald-500 to-teal-500',
      action: () => navigate('/queries/history')
    }
  ]
  
  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">查询中心</h1>
          <p className="mt-1 text-sm text-gray-500">交互式数据探索与分析平台</p>
        </div>
      </div>
      
      {/* 快速开始 */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">快速开始</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {quickStartCards.map((card, index) => {
            const Icon = card.icon
            return (
              <button
                key={index}
                onClick={card.action}
                className="group relative bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6 text-left hover:shadow-2xl transition-all duration-300 hover:-translate-y-1"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">{card.title}</h3>
                    <p className="text-sm text-gray-500">{card.description}</p>
                  </div>
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center ml-4 group-hover:scale-110 transition-transform flex-shrink-0`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
      
      {/* 统计卡片 */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">我的统计</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">本周查询</p>
                <p className="mt-1 text-3xl font-bold text-gray-900">{stats?.query_count_week || 0}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
          
          <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">保存的查询</p>
                <p className="mt-1 text-3xl font-bold text-gray-900">{stats?.saved_queries_count || 0}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <Star className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
          
          <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">平均耗时</p>
                <p className="mt-1 text-3xl font-bold text-gray-900">
                  {stats?.avg_execution_time_ms ? `${(stats.avg_execution_time_ms / 1000).toFixed(2)}s` : '0s'}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
                <Clock className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* 最近使用的查询 */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">最近使用的查询</h2>
          <button
            onClick={() => navigate('/queries/my')}
            className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
          >
            查看
          </button>
        </div>
        
        <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl overflow-hidden">
          {recentQueries && recentQueries.items.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {recentQueries.items.map((query) => (
                <div
                  key={query.id}
                  className="p-4 hover:bg-gray-50/50 cursor-pointer transition-colors group"
                  onClick={() => navigate(`/queries/editor?id=${query.id}`)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Database className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <h3 className="font-semibold text-gray-900 truncate">{query.query_name}</h3>
                        {query.is_favorite && <Star className="w-4 h-4 text-yellow-500 fill-yellow-500 flex-shrink-0" />}
                      </div>
                      <p className="text-sm text-gray-500 font-mono truncate">{query.sql_query}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                        <span>执行 {query.execute_count} 次</span>
                        {query.last_executed_at && (
                          <span>{new Date(query.last_executed_at).toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/queries/editor?id=${query.id}`)
                      }}
                      className="ml-4 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Play className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-gray-400">
              <Code className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>暂无查询记录</p>
            </div>
          )}
        </div>
      </div>
      
      {/* 查询历史 */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">最近执行</h2>
          <button
            onClick={() => navigate('/queries/history')}
            className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
          >
            查看
          </button>
        </div>
        
        <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl overflow-hidden">
          {recentHistories && recentHistories.items.length > 0 ? (
            <table className="w-full">
              <thead className="bg-gray-50/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">时间</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">SQL</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">耗时</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">结果</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentHistories.items.map((history) => (
                  <tr key={history.id} className="hover:bg-gray-50/50">
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {new Date(history.executed_at).toLocaleTimeString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 font-mono max-w-md truncate">
                      {history.sql_query}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {(history.execution_time_ms / 1000).toFixed(2)}s
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {history.result_rows} 行
                    </td>
                    <td className="px-6 py-4">
                      {history.status === 'success' ? (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-emerald-50 text-emerald-700">
                          成功
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-50 text-red-700">
                          失败
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-center text-gray-400">
              <History className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>暂无执行历史</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
