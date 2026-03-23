/**
 * 数据提取任务页面 - Migrated to shadcn/ui
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  FileText,
  Plus,
  Play,
  Edit2,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  Activity,
  Search,
  Filter,
  History
} from 'lucide-react'
import { getTasks, executeTask, deleteTask, createTask, updateTask, type CreateTaskRequest } from '../api/extraction'
import { getDatasets, getDataset } from '../api/datasets'
import type { ExtractionTask, DatasetField, Dataset } from '@/types'

interface AxiosLikeError {
  response?: { data?: { message?: string } }
  message?: string
}
import {
  FormButton,
  FormInput,
  FormSelect,
  PageModal,
  useToast,
  Badge,
} from '@/components/business'
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
import { Checkbox } from '@/components/ui/checkbox'

export default function ExtractionTasks() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [searchText, setSearchText] = useState('')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<ExtractionTask | null>(null)
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | null>(null)
  const [availableFields, setAvailableFields] = useState<DatasetField[]>([])
  
  // Form states
  const [taskName, setTaskName] = useState('')
  const [datasetId, setDatasetId] = useState<number>()
  const [selectFields, setSelectFields] = useState<string[]>([])
  const [taskType, setTaskType] = useState('manual')
  const [rowLimit, setRowLimit] = useState(1000)
  
  // Edit form states
  const [editTaskName, setEditTaskName] = useState('')
  const [editRowLimit, setEditRowLimit] = useState(1000)
  const [editIsActive, setEditIsActive] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['extraction-tasks'],
    queryFn: () => getTasks({ page: 1, page_size: 100 })
  })

  const { data: datasetsData } = useQuery({
    queryKey: ['datasets-for-task'],
    queryFn: () => getDatasets({ page: 1, page_size: 100 })
  })

  const datasets = datasetsData?.data?.items || []

  const executeMutation = useMutation({
    mutationFn: (taskId: number) => executeTask(taskId),
    onSuccess: () => {
      toast({ title: "任务已提交执行" })
      queryClient.invalidateQueries({ queryKey: ['extraction-tasks'] })
    }
  })

  const deleteMutation = useMutation({
    mutationFn: deleteTask,
    onSuccess: () => {
      toast({ title: "删除成功" })
      queryClient.invalidateQueries({ queryKey: ['extraction-tasks'] })
    }
  })

  const createMutation = useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      toast({ title: "任务创建成功" })
      queryClient.invalidateQueries({ queryKey: ['extraction-tasks'] })
      setIsCreateModalOpen(false)
      resetCreateForm()
    },
    onError: (error: unknown) => {
      const err = error as AxiosLikeError
      toast({ title: "创建任务失败", description: err.response?.data?.message, variant: "destructive" })
    }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateTaskRequest> }) => updateTask(id, data),
    onSuccess: () => {
      toast({ title: "任务更新成功" })
      queryClient.invalidateQueries({ queryKey: ['extraction-tasks'] })
      setIsEditModalOpen(false)
      setEditingTask(null)
      resetEditForm()
    },
    onError: (error: unknown) => {
      const err = error as AxiosLikeError
      toast({ title: "更新任务失败", description: err.response?.data?.message, variant: "destructive" })
    }
  })

  const tasks = data?.data?.items || []
  
  const filteredTasks = tasks.filter((task: ExtractionTask) =>
    task.task_name?.toLowerCase().includes(searchText.toLowerCase())
  )

  const resetCreateForm = () => {
    setTaskName('')
    setDatasetId(undefined)
    setSelectFields([])
    setTaskType('manual')
    setRowLimit(1000)
    setSelectedDatasetId(null)
    setAvailableFields([])
  }

  const resetEditForm = () => {
    setEditTaskName('')
    setEditRowLimit(1000)
    setEditIsActive(false)
  }

  const handleDatasetChange = async (value: string) => {
    const id = Number(value)
    setDatasetId(id)
    setSelectedDatasetId(id)
    try {
      const response = await getDataset(id, true)
      const fields = response.data?.fields || []
      setAvailableFields(fields)
      
      // 默认全选所有字段
      const allFieldNames = fields.map((f: DatasetField) => f.physical_name)
      setSelectFields(allFieldNames)
    } catch (error) {
      toast({ title: "加载字段失败", variant: "destructive" })
      setAvailableFields([])
    }
  }

  const handleCreateTask = () => {
    if (!taskName || !datasetId) {
      toast({ title: "请填写必填项", variant: "destructive" })
      return
    }
    
    // 如果选择了所有字段或未选择，发送空数组表示全部字段
    const allFieldNames = availableFields.map((f: DatasetField) => f.physical_name)
    const isAllSelected = selectFields.length === allFieldNames.length
    
    createMutation.mutate({
      task_name: taskName,
      dataset_id: datasetId,
      select_fields: isAllSelected ? [] : selectFields,
      filter_conditions: {},
      row_limit: rowLimit,
      task_type: taskType
    })
  }

  const handleEditTask = (task: ExtractionTask) => {
    setEditingTask(task)
    setEditTaskName(task.task_name)
    setEditRowLimit(task.row_limit)
    setEditIsActive(task.is_active)
    setIsEditModalOpen(true)
  }

  const handleUpdateTask = () => {
    if (!editTaskName) {
      toast({ title: "请填写任务名称", variant: "destructive" })
      return
    }
    if (!editingTask) return
    
    updateMutation.mutate({
      id: editingTask.id,
      data: {
        task_name: editTaskName,
        row_limit: editRowLimit,
        is_active: editIsActive
      }
    })
  }

  const stats = [
    { label: '总任务数', value: tasks.length, icon: FileText, gradient: 'from-purple-500 to-purple-600' },
    { label: '启用中', value: tasks.filter((t: ExtractionTask) => t.is_active).length, icon: CheckCircle, gradient: 'from-emerald-500 to-emerald-600' },
    { label: '定时任务', value: tasks.filter((t: ExtractionTask) => t.task_type === 'scheduled').length, icon: Clock, gradient: 'from-blue-500 to-blue-600' },
    { label: '本月执行', value: '-', icon: Activity, gradient: 'from-orange-500 to-orange-600' }
  ]

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/25">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">数据提取</h1>
            <p className="text-gray-500 text-sm">管理数据提取任务和执行记录</p>
          </div>
        </div>
        <FormButton onClick={() => navigate('/extraction/config')}>
          <Plus className="w-5 h-5 mr-2" />
          新建任务
        </FormButton>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon
          return (
            <div key={index} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-gray-500 font-medium mb-1">{stat.label}</div>
                  <div className="text-3xl font-bold text-gray-900">{stat.value}</div>
                </div>
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center shadow-lg`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 搜索和筛选 */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <FormInput
              placeholder="搜索任务名称..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="pl-12"
            />
          </div>
          <FormButton variant="outline">
            <Filter className="w-5 h-5 mr-2" />
            筛选
          </FormButton>
        </div>
      </div>

      {/* 任务列表 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-16 text-center">
            <Skeleton className="h-32 w-full" />
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-5">
              <FileText className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">暂无提取任务</h3>
            <p className="text-gray-500 mb-6">创建您的第一个数据提取任务</p>
            <FormButton onClick={() => navigate('/extraction/config')}>
              <Plus className="w-5 h-5 mr-2" />
              新建任务
            </FormButton>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">任务名称</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">类型</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">状态</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">最后执行</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredTasks.map((task: ExtractionTask) => (
                <tr key={task.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-semibold text-gray-900">{task.task_name}</div>
                    <div className="text-xs text-gray-400">ID: {task.id}</div>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={task.task_type === 'scheduled' ? 'default' : 'secondary'}>
                      {task.task_type === 'scheduled' ? '定时' : 
                       task.task_type === 'webhook' ? 'Webhook' : '手动'}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
                    {task.is_active ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-600 font-medium text-sm">
                        <CheckCircle className="w-4 h-4" />
                        启用
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-gray-400 font-medium text-sm">
                        <XCircle className="w-4 h-4" />
                        禁用
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {task.last_run_at ? new Date(task.last_run_at).toLocaleString() : '-'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <FormButton
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate(`/extraction/runs?task_id=${task.id}`)}
                        title="执行历史"
                      >
                        <History className="w-4 h-4" />
                      </FormButton>
                      <FormButton
                        variant="ghost"
                        size="icon"
                        onClick={() => executeMutation.mutate(task.id)}
                        title="执行"
                      >
                        <Play className="w-4 h-4" />
                      </FormButton>
                      <FormButton
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditTask(task)}
                        title="编辑"
                      >
                        <Edit2 className="w-4 h-4" />
                      </FormButton>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <FormButton
                            variant="ghost"
                            size="icon"
                            title="删除"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </FormButton>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>确认删除</AlertDialogTitle>
                            <AlertDialogDescription>
                              确定要删除任务"{task.task_name}"吗？
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMutation.mutate(task.id)}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              删除
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 创建任务 Modal */}
      <PageModal
        open={isCreateModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateModalOpen(false)
            resetCreateForm()
          }
        }}
        title="创建提取任务"
        footer={
          <div className="flex justify-end gap-2">
            <FormButton variant="outline" onClick={() => setIsCreateModalOpen(false)}>
              取消
            </FormButton>
            <FormButton onClick={handleCreateTask} loading={createMutation.isPending}>
              创建
            </FormButton>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">任务名称 *</label>
            <FormInput
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              placeholder="请输入任务名称"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">选择数据集 *</label>
            <FormSelect
              value={datasetId?.toString()}
              onValueChange={handleDatasetChange}
              placeholder="请选择数据集"
              searchable
              options={datasets.map((ds: Dataset) => ({
                label: `${ds.dataset_name} (${ds.dataset_code})`,
                value: ds.id.toString()
              }))}
            />
          </div>
          
          {selectedDatasetId && availableFields.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1">选择字段</label>
              <FormSelect
                value={selectFields[0] || ''}
                onValueChange={(val: string) => setSelectFields(val ? [val] : [])}
                placeholder="默认选择所有字段"
                options={availableFields.map((field: DatasetField) => ({
                  label: `${field.display_name} (${field.physical_name})`,
                  value: field.physical_name
                }))}
              />
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium mb-1">任务类型</label>
            <FormSelect
              value={taskType}
              onValueChange={setTaskType}
              options={[
                { label: '手动执行', value: 'manual' },
                { label: '定时执行', value: 'scheduled' }
              ]}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">数据行数限制</label>
            <FormInput
              type="number"
              value={rowLimit.toString()}
              onChange={(e) => setRowLimit(Number(e.target.value))}
              min={1}
              max={1000000}
              placeholder="请输入限制行数"
            />
          </div>
        </div>
      </PageModal>

      {/* 编辑任务 Modal */}
      <PageModal
        open={isEditModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsEditModalOpen(false)
            setEditingTask(null)
            resetEditForm()
          }
        }}
        title="编辑任务"
        footer={
          <div className="flex justify-end gap-2">
            <FormButton variant="outline" onClick={() => setIsEditModalOpen(false)}>
              取消
            </FormButton>
            <FormButton onClick={handleUpdateTask} loading={updateMutation.isPending}>
              保存
            </FormButton>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">任务名称 *</label>
            <FormInput
              value={editTaskName}
              onChange={(e) => setEditTaskName(e.target.value)}
              placeholder="请输入任务名称"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">数据行数限制</label>
            <FormInput
              type="number"
              value={editRowLimit.toString()}
              onChange={(e) => setEditRowLimit(Number(e.target.value))}
              min={1}
              max={1000000}
              placeholder="请输入限制行数"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Checkbox
              checked={editIsActive}
              onCheckedChange={(checked: boolean) => setEditIsActive(checked)}
              id="is-active"
            />
            <label htmlFor="is-active" className="text-sm text-gray-700 cursor-pointer">
              启用任务
            </label>
          </div>
        </div>
      </PageModal>
    </div>
  )
}
