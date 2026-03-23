/**
 * 查询模板库页面 - Migrated to shadcn/ui
 */
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Search, FileText, TrendingUp, Tag, Plus, Edit2, Trash2, Loader2, Inbox } from 'lucide-react'
import { 
  getTemplates, 
  useTemplate, 
  createTemplate, 
  updateTemplate, 
  deleteTemplate,
  QueryTemplate, 
  TemplateParameter,
  CreateTemplateRequest 
} from '../../api/queries'
import {
  FormButton,
  FormSelect,
  useToast,
  PageModal,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  FormDatePicker
} from '@/components/business'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const getInputValue = (value: string | number | Date | undefined) => {
  if (value === undefined || value instanceof Date) {
    return ''
  }
  return value
}

const getSelectValue = (value: string | number | Date | undefined) => {
  return value === undefined || value instanceof Date ? '' : String(value)
}

const getDateValue = (value: string | number | Date | undefined) => {
  return value instanceof Date ? value : undefined
}

export default function Templates() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [selectedCategory, setSelectedCategory] = useState<string>()
  const [searchText, setSearchText] = useState('')
  const [useModalVisible, setUseModalVisible] = useState(false)
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<QueryTemplate | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [templateToDelete, setTemplateToDelete] = useState<QueryTemplate | null>(null)
  
  // 表单数据
  const [paramFormData, setParamFormData] = useState<Record<string, string | number | Date | undefined>>({})
  const [editFormData, setEditFormData] = useState({
    template_name: '',
    template_description: '',
    sql_template: '',
    category: '',
    tags: [] as string[]
  })
  
  // 获取模板列表
  const { data: templatesData, isLoading } = useQuery({
    queryKey: ['templates', { category: selectedCategory, search: searchText }],
    queryFn: () => getTemplates({
      page: 1,
      page_size: 100,
      category: selectedCategory,
      search: searchText
    })
  })
  
  const templates = templatesData?.items || []
  
  // 动态从模板列表提取分类（统计每个分类的模板数量）
  const categories = useMemo(() => {
    const categoryMap = new Map<string, number>()
    templates.forEach((t: QueryTemplate) => {
      if (t.category) {
        categoryMap.set(t.category, (categoryMap.get(t.category) || 0) + 1)
      }
    })
    
    return [
      { label: '全部', value: '__all__', count: templates.length },
      ...Array.from(categoryMap.entries())
        .sort((a, b) => b[1] - a[1]) // 按数量降序排序
        .map(([cat, count]) => ({
          label: `${cat} (${count})`,
          value: cat,
          count
        }))
    ]
  }, [templates])
  
  // 使用模板
  const useTemplateMutation = useMutation({
    mutationFn: ({ id, params }: { id: number; params: Record<string, string | number | Date | undefined> }) => 
      useTemplate(id, params as Record<string, unknown>),
    onSuccess: (data) => {
      toast({ title: '模板已应用' })
      navigate(`/queries/editor`, {
        state: { sql: data.sql_query, name: data.template_name }
      })
    },
    onError: (error: unknown) => {
      toast({ title: '使用模板失败', description: (error as Error).message, variant: 'destructive' })
    }
  })
  
  const handleUseTemplate = (template: QueryTemplate) => {
    if (template.parameters && template.parameters.length > 0) {
      setSelectedTemplate(template)
      setParamFormData({})
      setUseModalVisible(true)
    } else {
      useTemplateMutation.mutate({ id: template.id, params: {} })
    }
  }
  
  const handleSubmitParams = () => {
    // 验证必填参数
    const missingParams = selectedTemplate?.parameters.filter(p => p.required && !paramFormData[p.name])
    if (missingParams && missingParams.length > 0) {
      toast({ 
        title: '请填写所有必填参数', 
        description: `缺少: ${missingParams.map(p => p.display_name).join(', ')}`,
        variant: 'warning' 
      })
      return
    }
    
    // 转换日期格式
    const params: Record<string, string | number | Date | undefined> = {}
    Object.keys(paramFormData).forEach(key => {
      const param = selectedTemplate?.parameters.find(p => p.name === key)
      if (param?.type === 'date' && paramFormData[key]) {
        // 如果是Date对象，转换为字符串
        const dateVal = paramFormData[key]
        params[key] = dateVal instanceof Date ? 
          dateVal.toISOString().split('T')[0] : dateVal
      } else {
        params[key] = paramFormData[key]
      }
    })
    
    useTemplateMutation.mutate({ id: selectedTemplate!.id, params })
    setUseModalVisible(false)
  }

  // 创建/更新模板
  const saveTemplateMutation = useMutation({
    mutationFn: ({ id, data }: { id?: number; data: CreateTemplateRequest }) => 
      id ? updateTemplate(id, data) : createTemplate(data),
    onSuccess: () => {
      toast({ title: isEditing ? '模板已更新' : '模板已创建' })
      setEditModalVisible(false)
      setEditFormData({
        template_name: '',
        template_description: '',
        sql_template: '',
        category: '',
        tags: []
      })
      queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
    onError: (error: unknown) => {
      toast({ title: '保存模板失败', description: (error as Error).message, variant: 'destructive' })
    }
  })

  // 删除模板
  const deleteTemplateMutation = useMutation({
    mutationFn: deleteTemplate,
    onSuccess: () => {
      toast({ title: '模板已删除' })
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      setDeleteConfirmOpen(false)
      setTemplateToDelete(null)
    },
    onError: (error: unknown) => {
      toast({ title: '删除模板失败', description: (error as Error).message, variant: 'destructive' })
    }
  })

  const handleCreateTemplate = () => {
    setIsEditing(false)
    setSelectedTemplate(null)
    setEditFormData({
      template_name: '',
      template_description: '',
      sql_template: '',
      category: '',
      tags: []
    })
    setEditModalVisible(true)
  }

  const handleEditTemplate = (template: QueryTemplate, e: React.MouseEvent) => {
    e.stopPropagation()
    setIsEditing(true)
    setSelectedTemplate(template)
    setEditFormData({
      template_name: template.template_name,
      template_description: template.template_description || '',
      sql_template: template.sql_template,
      category: template.category || '',
      tags: template.tags || []
    })
    setEditModalVisible(true)
  }

  const handleDeleteClick = (template: QueryTemplate, e: React.MouseEvent) => {
    e.stopPropagation()
    setTemplateToDelete(template)
    setDeleteConfirmOpen(true)
  }

  const handleSaveTemplate = () => {
    if (!editFormData.template_name || !editFormData.sql_template) {
      toast({ title: '请填写模板名称和SQL', variant: 'warning' })
      return
    }

    const data: CreateTemplateRequest = {
      template_name: editFormData.template_name,
      template_description: editFormData.template_description,
      sql_template: editFormData.sql_template,
      category: editFormData.category,
      tags: editFormData.tags
    }

    saveTemplateMutation.mutate({ 
      id: isEditing ? selectedTemplate?.id : undefined, 
      data 
    })
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* 页面标题 */}
      <div className="px-6 py-4 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">查询模板库</h1>
            <p className="text-sm text-gray-500 mt-1">管理和使用常用的查询模板</p>
          </div>
          <FormButton onClick={handleCreateTemplate}>
            <Plus className="w-4 h-4 mr-2" />
            新建模板
          </FormButton>
        </div>

        {/* 筛选栏 */}
        <div className="flex items-center gap-4 mt-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              type="text"
              placeholder="搜索模板名称或描述..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="h-11 pl-12 pr-4"
            />
          </div>
          <FormSelect
            placeholder="分类筛选"
            value={selectedCategory || '__all__'}
            onValueChange={(val) => setSelectedCategory(val === '__all__' ? undefined : val)}
            options={categories.map(c => ({ value: c.value, label: c.label }))}
            className="w-40"
          />
        </div>
      </div>

      {/* 模板列表 */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64">
            <Inbox className="w-16 h-16 text-gray-300 mb-4" />
            <p className="text-gray-500 mb-4">
              {searchText || selectedCategory ? '未找到匹配的模板' : '还没有查询模板'}
            </p>
            <FormButton onClick={handleCreateTemplate}>
              <Plus className="w-4 h-4 mr-2" />
              创建第一个模板
            </FormButton>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template: QueryTemplate) => (
              <div
                key={template.id}
                onClick={() => handleUseTemplate(template)}
                className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{template.template_name}</h3>
                      {template.category && (
                        <Badge variant="secondary" className="mt-1 text-xs">
                          {template.category}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <FormButton
                      variant="ghost"
                      size="icon"
                      onClick={(e) => handleEditTemplate(template, e)}
                      className="h-8 w-8"
                    >
                      <Edit2 className="w-4 h-4" />
                    </FormButton>
                    <FormButton
                      variant="ghost"
                      size="icon"
                      onClick={(e) => handleDeleteClick(template, e)}
                      className="h-8 w-8 hover:text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </FormButton>
                  </div>
                </div>

                {template.template_description && (
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                    {template.template_description}
                  </p>
                )}

                {template.tags && template.tags.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    {template.tags.map((tag, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}

                {template.parameters && template.parameters.length > 0 && (
                  <div className="flex items-center gap-2 text-xs text-gray-500 mt-3 pt-3 border-t border-gray-100">
                    <Tag className="w-3 h-3" />
                    <span>{template.parameters.length} 个参数</span>
                  </div>
                )}

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                  <span className="text-xs text-gray-400">
                    使用 {template.use_count || 0} 次
                  </span>
                  <TrendingUp className="w-4 h-4 text-gray-300" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 使用模板参数配置弹窗 */}
      <PageModal
        open={useModalVisible}
        onOpenChange={setUseModalVisible}
        title="配置模板参数"
        description="请填写以下参数以使用此模板"
        footer={
          <div className="flex justify-end gap-2">
            <FormButton variant="outline" onClick={() => setUseModalVisible(false)}>
              取消
            </FormButton>
            <FormButton 
              onClick={handleSubmitParams}
              loading={useTemplateMutation.isPending}
            >
              应用模板
            </FormButton>
          </div>
        }
      >
        {selectedTemplate && (
          <div className="space-y-4">
            {selectedTemplate.parameters.map((param: TemplateParameter) => (
              <div key={param.name}>
                <Label>
                  {param.display_name} {param.required && <span className="text-red-500">*</span>}
                </Label>
                {param.type === 'text' && (
                  <Input
                    value={getInputValue(paramFormData[param.name])}
                    onChange={(e) => setParamFormData({ ...paramFormData, [param.name]: e.target.value })}
                    placeholder={param.default_value ? String(param.default_value) : `请输入${param.display_name}`}
                    className="mt-1"
                  />
                )}
                {param.type === 'number' && (
                  <Input
                    type="number"
                    value={getInputValue(paramFormData[param.name])}
                    onChange={(e) => setParamFormData({ ...paramFormData, [param.name]: e.target.value })}
                    placeholder={param.default_value ? String(param.default_value) : `请输入${param.display_name}`}
                    className="mt-1"
                  />
                )}
                {param.type === 'date' && (
                  <FormDatePicker
                    value={getDateValue(paramFormData[param.name])}
                    onChange={(date) => setParamFormData({ ...paramFormData, [param.name]: date })}
                    placeholder={`请选择${param.display_name}`}
                    className="mt-1"
                  />
                )}
                {param.type === 'select' && (
                  <FormSelect
                    value={getSelectValue(paramFormData[param.name])}
                    onValueChange={(val) => setParamFormData({ ...paramFormData, [param.name]: val })}
                    placeholder={`请选择${param.display_name}`}
                    options={param.options?.map(opt => ({ value: opt, label: opt })) || []}
                    className="mt-1"
                  />
                )}
              </div>
            ))}
            
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500 mb-2">SQL 模板预览:</p>
              <pre className="text-xs font-mono text-gray-700 overflow-x-auto max-h-40">
                {selectedTemplate.sql_template}
              </pre>
            </div>
          </div>
        )}
      </PageModal>

      {/* 创建/编辑模板弹窗 */}
      <PageModal
        open={editModalVisible}
        onOpenChange={setEditModalVisible}
        title={isEditing ? '编辑模板' : '新建模板'}
        description="配置查询模板的基本信息"
        className="max-w-3xl"
        footer={
          <div className="flex justify-end gap-2">
            <FormButton 
              variant="outline" 
              onClick={() => setEditModalVisible(false)}
            >
              取消
            </FormButton>
            <FormButton 
              onClick={handleSaveTemplate}
              loading={saveTemplateMutation.isPending}
            >
              {isEditing ? '保存' : '创建'}
            </FormButton>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <Label>模板名称 *</Label>
            <Input
              value={editFormData.template_name}
              onChange={(e) => setEditFormData({ ...editFormData, template_name: e.target.value })}
              placeholder="例如：用户活跃度分析"
              className="mt-1"
            />
          </div>

          <div>
            <Label>模板描述</Label>
            <Textarea
              value={editFormData.template_description}
              onChange={(e) => setEditFormData({ ...editFormData, template_description: e.target.value })}
              rows={2}
              placeholder="简要描述模板的用途和使用场景"
              className="mt-1"
            />
          </div>

          <div>
            <Label>SQL 模板 *</Label>
            <Textarea
              value={editFormData.sql_template}
              onChange={(e) => setEditFormData({ ...editFormData, sql_template: e.target.value })}
              rows={8}
              placeholder="SELECT * FROM users WHERE created_at > {{start_date}}"
              className="mt-1 font-mono text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              💡 使用 {`{{参数名}}`} 格式定义参数占位符
            </p>
          </div>

          <div>
            <Label>分类</Label>
            <FormSelect
              value={editFormData.category}
              onValueChange={(val) => setEditFormData({ ...editFormData, category: val })}
              placeholder="选择分类"
              options={categories.slice(1).map(c => ({ value: c.value, label: c.label }))}
              className="mt-1"
            />
          </div>
        </div>
      </PageModal>

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除模板 "{templateToDelete?.template_name}" 吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => templateToDelete && deleteTemplateMutation.mutate(templateToDelete.id)}
              className="bg-red-500 hover:bg-red-600"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
