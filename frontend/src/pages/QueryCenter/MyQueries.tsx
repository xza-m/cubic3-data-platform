/**
 * 我的查询页面 - Migrated to shadcn/ui
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  Star,
  Edit2,
  Trash2,
  Play,
  Grid,
  List as ListIcon,
} from 'lucide-react'
import { getQueries, deleteQuery, toggleFavorite, getFolders, type Query } from '../../api/queries'
import { FormButton, FormSelect, FormInput, useToast, Badge } from '@/components/business'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'

type ViewMode = 'list' | 'card'

export default function MyQueries() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [selectedFolder, setSelectedFolder] = useState<number>()
  const [searchText, setSearchText] = useState('')
  const [showFavorites, setShowFavorites] = useState(false)
  
  // 获取查询列表
  const { data: queriesData, isLoading } = useQuery({
    queryKey: ['queries', { folder_id: selectedFolder, is_favorite: showFavorites || undefined, search: searchText }],
    queryFn: () => getQueries({
      page: 1,
      page_size: 100,
      folder_id: selectedFolder,
      is_favorite: showFavorites || undefined,
      search: searchText
    })
  })
  
  // 获取文件夹列表
  const { data: folders } = useQuery({
    queryKey: ['folders'],
    queryFn: getFolders
  })
  
  const queries = queriesData?.items || []
  
  // 删除查询
  const deleteMutation = useMutation({
    mutationFn: deleteQuery,
    onSuccess: () => {
      toast({ title: "查询已删除" })
      queryClient.invalidateQueries({ queryKey: ['queries'] })
    },
    onError: () => {
      toast({ title: "删除失败", variant: "destructive" })
    }
  })
  
  // 切换收藏
  const favoriteMutation = useMutation({
    mutationFn: toggleFavorite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queries'] })
    }
  })
  
  return (
    <div className="h-full flex flex-col">
      {/* 页面标题 */}
      <div className="px-6 py-4 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">我的查询</h1>
            <p className="text-sm text-gray-500 mt-1">管理您保存的所有查询</p>
          </div>
          
          <FormButton onClick={() => navigate('/queries/editor')}>
            + 新建查询
          </FormButton>
        </div>
        
        {/* 搜索和过滤 */}
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <FormInput
              placeholder="搜索查询名称或 SQL 内容..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <FormSelect
            placeholder="文件夹"
            value={selectedFolder?.toString() || '__all__'}
            onValueChange={(val: string) => setSelectedFolder(val === '__all__' ? undefined : Number(val))}
            options={[
              { label: '全部', value: '__all__' },
              ...(folders || []).map((f: { id: number; folder_name: string }) => ({
                label: f.folder_name,
                value: f.id.toString()
              }))
            ]}
            className="w-[200px]"
          />
          
          <button
            onClick={() => setShowFavorites(!showFavorites)}
            className={`px-4 py-2 rounded-lg border transition-colors ${
              showFavorites
                ? 'bg-yellow-50 border-yellow-200 text-yellow-700'
                : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            <Star className={`w-4 h-4 ${showFavorites ? 'fill-yellow-500' : ''}`} />
          </button>
          
          <div className="flex gap-1 border border-gray-200 rounded-lg p-1">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded transition-colors ${
                viewMode === 'list'
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <ListIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('card')}
              className={`p-2 rounded transition-colors ${
                viewMode === 'card'
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Grid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      
      {/* 查询列表 */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : queries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-gray-400 mb-4">
              <Search className="w-16 h-16 mx-auto" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">暂无查询</h3>
            <p className="text-sm text-gray-500 mb-6">
              {searchText || showFavorites ? '未找到匹配的查询' : '开始创建您的第一个查询'}
            </p>
            <FormButton onClick={() => navigate('/queries/editor')}>
              + 新建查询
            </FormButton>
          </div>
        ) : viewMode === 'list' ? (
          <div className="space-y-3">
            {queries.map((query: Query) => (
              <div
                key={query.id}
                className="bg-white border border-gray-200 rounded-lg p-4 hover:border-indigo-200 hover:shadow-md transition-all group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-lg font-medium text-gray-900 truncate">
                        {query.query_name}
                      </h3>
                      {query.is_favorite && (
                        <Star className="w-4 h-4 text-yellow-500 fill-yellow-500 flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mb-2 line-clamp-2">
                      {query.description || '暂无描述'}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-gray-400">
                      <span>{query.folder_name}</span>
                      
                      <span>•</span>
                      <span>{new Date(query.updated_at).toLocaleString('zh-CN')}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <FormButton
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/queries/editor?id=${query.id}`)}
                    >
                      <Play className="w-4 h-4" />
                    </FormButton>
                    <FormButton
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/queries/editor?id=${query.id}`)}
                    >
                      <Edit2 className="w-4 h-4" />
                    </FormButton>
                    <button
                      onClick={() => favoriteMutation.mutate(query.id)}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <Star className={`w-4 h-4 ${query.is_favorite ? 'fill-yellow-500 text-yellow-500' : 'text-gray-400'}`} />
                    </button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button className="p-2 hover:bg-red-50 rounded-lg transition-colors text-gray-400 hover:text-red-600">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>确认删除</AlertDialogTitle>
                          <AlertDialogDescription>
                            确定要删除查询 "{query.query_name}" 吗？此操作无法撤销。
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>取消</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteMutation.mutate(query.id)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            删除
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {queries.map((query: Query) => (
              <div
                key={query.id}
                className="bg-white border border-gray-200 rounded-lg p-4 hover:border-indigo-200 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-medium text-gray-900 truncate flex-1">
                    {query.query_name}
                  </h3>
                  {query.is_favorite && (
                    <Star className="w-4 h-4 text-yellow-500 fill-yellow-500 flex-shrink-0" />
                  )}
                </div>
                <p className="text-sm text-gray-500 mb-4 line-clamp-2 min-h-[40px]">
                  {query.description || '暂无描述'}
                </p>
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="text-xs">
                    {query.folder_name || '未分类'}
                  </Badge>
                  <div className="flex gap-1">
                    <FormButton
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/queries/editor?id=${query.id}`)}
                    >
                      <Play className="w-4 h-4" />
                    </FormButton>
                    <FormButton
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/queries/editor?id=${query.id}`)}
                    >
                      <Edit2 className="w-4 h-4" />
                    </FormButton>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
