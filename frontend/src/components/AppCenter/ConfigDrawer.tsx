/**
 * 实例配置弹窗
 *
 * 使用统一的屏中弹窗承载实例配置表单
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Code2, FileCode, Wand2, Loader2 } from 'lucide-react'
import Editor from '@monaco-editor/react'
import Form from '@rjsf/core'
import validator from '@rjsf/validator-ajv8'
import type { AppDefinition, AppInstance, CreateInstanceInput, UpdateInstanceInput } from '../../api/appCenter'
import type { RJSFSchema, UiSchema, WidgetProps, RegistryWidgetsType } from '@rjsf/utils'
import DataSourceSelector from '../Selectors/DataSourceSelector'
import DatasetSelector from '../Selectors/DatasetSelector'
import { templates as rjsfTemplates, widgets as rjsfWidgets } from './rjsf-theme'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { PageModal, useToast } from '@/components/business'

interface ConfigDrawerProps {
  open: boolean
  app: AppDefinition | null
  instance?: AppInstance | null
  onClose: () => void
  onSubmit: (data: CreateInstanceInput | UpdateInstanceInput) => Promise<void>
}

// RJSF Widget 适配器：将独立的 DataSourceSelector 适配到 RJSF
function DataSourceWidget(props: WidgetProps) {
  const handleChange = (value: number) => {
    props.onChange(value)
  }

  return (
    <DataSourceSelector
      value={props.value}
      onChange={handleChange}
      disabled={props.disabled || props.readonly}
    />
  )
}

// RJSF Widget 适配器：将独立的 DatasetSelector 适配到 RJSF
function DatasetWidget(props: WidgetProps) {
  const handleChange = (value: number) => {
    props.onChange(value)
  }

  return (
    <DatasetSelector
      value={props.value}
      onChange={handleChange}
      disabled={props.disabled || props.readonly}
    />
  )
}

/**
 * 字符串数组 Tags Widget — 每行一个值，适用于 open_id 白名单等场景
 */
function StringTagsWidget(props: WidgetProps) {
  const values: string[] = Array.isArray(props.value) ? props.value : []
  const text = values.join('\n')

  return (
    <div className="space-y-1">
      <Textarea
        rows={4}
        placeholder={props.placeholder || '每行输入一个值（留空表示不限制）'}
        value={text}
        disabled={props.disabled || props.readonly}
        className="font-mono text-[0.875rem] leading-6"
        onChange={(e) => {
          const raw = e.target.value
          const arr = raw
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean)
          props.onChange(arr.length > 0 ? arr : [])
        }}
      />
      {values.length > 0 && (
        <p className="text-[0.75rem] leading-4 text-muted-foreground">共 {values.length} 个</p>
      )}
    </div>
  )
}

// 配置示例说明
function getConfigExample(appCode: string): string {
  const examples: Record<string, string> = {
    bi_dashboard_push: `需要配置：
• Superset URL、看板 ID、用户名密码
• 飞书群 ID（群设置中获取）
• 消息模板（可选）`,
    dataset_card_push: `需要配置：
• 数据集 ID（在数据中心查看）
• 飞书群 ID
• 是否包含字段列表和统计信息`,
    report_push: `需要配置：
• 数据源 ID（在数据中心选择）
• SQL 查询语句
• 报告类型（daily/weekly/monthly）
• 飞书群 ID`,
    anomaly_monitor: `需要配置：
• 数据源 ID
• 监控 SQL（需返回单个数值）
• 阈值（运算符和数值）
• 飞书群 ID`,
    query_result_push: `需要配置：
• 数据源 ID
• SQL 查询语句
• 输出格式（table/text/json）
• 飞书群 ID`,
    extraction_notify: `需要配置：
• 提取任务 ID（可选）
• 是否在成功/失败时通知
• 飞书群 ID
• 消息模板`,
    data_agent: `需要配置：
• 知识库 → 数仓数据源（从已注册数据源中选择）
• LLM 配置（可选，覆盖全局默认）
• Agent 参数（可选，最大轮次/超时/历史消息数）
• 飞书授权用户（可选，留空则允许所有用户）`,
  }
  return examples[appCode] || '请参考文档配置'
}

// 配置占位符示例
function getConfigPlaceholder(appCode: string): string {
  const placeholders: Record<string, string> = {
    bi_dashboard_push: `{
  "superset": {
    "base_url": "http://superset:8088",
    "dashboard_id": 123,
    "username": "admin",
    "password": "admin",
    "screenshot_width": 1920
  },
  "feishu": {
    "chat_id": "oc_xxxxxxxxxxxxx",
    "message_template": "📊 {{dashboard_name}}\\n时间：{{date}}"
  }
}`,
    dataset_card_push: `{
  "dataset_id": 456,
  "feishu": {
    "chat_id": "oc_xxxxxxxxxxxxx",
    "include_fields": true,
    "include_stats": true
  }
}`,
    report_push: `{
  "datasource_id": 1,
  "report_type": "daily",
  "sql_query": "SELECT date, total_sales, order_count FROM daily_sales WHERE date = CURRENT_DATE",
  "feishu": {
    "chat_id": "oc_xxxxxxxxxxxxx",
    "message_template": "📈 {{report_type}}数据报告\\n时间：{{date}}\\n\\n{{table}}"
  }
}`,
    anomaly_monitor: `{
  "datasource_id": 1,
  "sql_query": "SELECT COUNT(*) FROM orders WHERE status = 'failed' AND created_at > NOW() - INTERVAL '1 hour'",
  "threshold": {
    "operator": ">",
    "value": 10
  },
  "feishu": {
    "chat_id": "oc_xxxxxxxxxxxxx",
    "alert_template": "⚠️ 数据异常告警\\n时间：{{date}}\\n监控指标：{{value}} {{operator}} {{threshold}}"
  }
}`,
    query_result_push: `{
  "datasource_id": 1,
  "sql_query": "SELECT * FROM top_products WHERE sales_rank <= 10 ORDER BY sales DESC",
  "format": "table",
  "max_rows": 100,
  "feishu": {
    "chat_id": "oc_xxxxxxxxxxxxx"
  }
}`,
    extraction_notify: `{
  "extraction_task_id": 123,
  "notify_on_success": true,
  "notify_on_failure": true,
  "feishu": {
    "chat_id": "oc_xxxxxxxxxxxxx",
    "success_template": "✅ 数据提取完成\\n任务：{{task_name}}\\n提取行数：{{row_count}}",
    "failure_template": "❌ 数据提取失败\\n任务：{{task_name}}\\n失败原因：{{error}}"
  }
}`,
    data_agent: `{
  "knowledge": {
    "datasource_id": 1
  },
  "llm": {
    "model": "qwen-plus",
    "temperature": 0.0
  },
  "agent": {
    "max_loop_rounds": 10,
    "session_timeout": 120,
    "max_history_messages": 10
  },
  "allowed_user_ids": []
}`,
  }
  return placeholders[appCode] || '{\n  \n}'
}

/**
 * 根据 JSON Schema 的 format / 字段名自动生成 uiSchema，
 * 将 format:"textarea" -> textarea widget, format:"password" -> password widget,
 * trigger_on_event 默认折叠，datasource_id / dataset_id 使用自定义选择器。
 */
function buildUiSchema(schema: RJSFSchema): UiSchema {
  const ui: UiSchema = {
    'ui:submitButtonOptions': { norender: true },
  }

  function walk(s: RJSFSchema, target: UiSchema, path: string) {
    if (!s || !s.properties) return

    for (const [key, prop] of Object.entries(s.properties as Record<string, RJSFSchema>)) {
      if (!prop) continue

      if (key === 'datasource_id') {
        target[key] = { 'ui:widget': 'datasource_id' }
        continue
      }
      if (key === 'dataset_id') {
        target[key] = { 'ui:widget': 'dataset_id' }
        continue
      }
      if (
        prop.type === 'array' &&
        (prop as RJSFSchema).items &&
        ((prop as RJSFSchema).items as RJSFSchema)?.type === 'string'
      ) {
        target[key] = { 'ui:widget': 'string_tags' }
        continue
      }
      if (key === 'trigger_on_event') {
        target[key] = { 'ui:options': { collapsed: true } }
        walk(prop, target[key], `${path}.${key}`)
        continue
      }

      if (prop.format === 'textarea') {
        target[key] = { ...target[key], 'ui:widget': 'textarea' }
      } else if (prop.format === 'password') {
        target[key] = { ...target[key], 'ui:widget': 'password' }
      }

      if (prop.type === 'object') {
        target[key] = target[key] || {}
        walk(prop, target[key], `${path}.${key}`)
      }
    }
  }

  walk(schema, ui, '')
  return ui
}

// 表单内部状态类型
interface FormValues {
  name: string
  description: string
  schedule_type: string
  schedule_config: string
  config: string
  enabled: boolean
}

export default function ConfigDrawer({
  open,
  app,
  instance,
  onClose,
  onSubmit,
}: ConfigDrawerProps) {
  const { toast } = useToast()
  const [mode, setMode] = useState<'smart' | 'json' | 'code'>('smart')
  const [configJson, setConfigJson] = useState<string>(
    JSON.stringify(instance?.config || {}, null, 2)
  )
  const [smartFormData, setSmartFormData] = useState<Record<string, unknown>>(instance?.config || {})
  const [submitting, setSubmitting] = useState(false)
  const [formValues, setFormValues] = useState<FormValues>({
    name: '',
    description: '',
    schedule_type: 'manual',
    schedule_config: '{}',
    config: '',
    enabled: false,
  })
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({})

  const isEdit = !!instance
  const hasSchema = app?.config_schema && Object.keys(app.config_schema).length > 0

  const uiSchema = useMemo(
    () => (hasSchema ? buildUiSchema(app!.config_schema as RJSFSchema) : {}),
    [hasSchema, app],
  )

  const mergedWidgets = useMemo<RegistryWidgetsType>(
    () => ({
      ...rjsfWidgets,
      datasource_id: DataSourceWidget,
      dataset_id: DatasetWidget,
      string_tags: StringTagsWidget,
    }),
    [],
  )

  // 初始化表单值
  useEffect(() => {
    if (open) {
      setFormValues({
        name: instance?.name || '',
        description: instance?.description || '',
        schedule_type: instance?.schedule_type || 'manual',
        schedule_config: instance?.schedule_config ? JSON.stringify(instance.schedule_config, null, 2) : '{}',
        config: instance?.config ? JSON.stringify(instance.config, null, 2) : '',
        enabled: instance?.enabled ?? false,
      })
      setErrors({})
    }
  }, [open, instance])

  // 当实例变化时，同步更新智能表单数据
  useEffect(() => {
    if (instance?.config) {
      setSmartFormData(instance.config)
      setConfigJson(JSON.stringify(instance.config, null, 2))
    } else {
      setSmartFormData({})
      setConfigJson('{}')
    }
  }, [instance])

  // 当打开弹窗时，根据是否有 schema 自动选择模式
  useEffect(() => {
    if (open) {
      setMode(hasSchema ? 'smart' : 'json')
    }
  }, [open, hasSchema])

  const updateField = useCallback((field: keyof FormValues, value: string | boolean) => {
    setFormValues(prev => ({ ...prev, [field]: value }))
    setErrors(prev => ({ ...prev, [field]: undefined }))
  }, [])

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof FormValues, string>> = {}

    if (!formValues.name.trim()) {
      newErrors.name = '请输入实例名称'
    } else if (formValues.name.length > 100) {
      newErrors.name = '名称不超过100字符'
    }

    if (formValues.schedule_type === 'cron') {
      try {
        JSON.parse(formValues.schedule_config)
      } catch {
        newErrors.schedule_config = 'Cron 配置 JSON 格式错误'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return

    try {
      // 解析配置 JSON
      let config: Record<string, unknown>
      if (mode === 'smart') {
        config = smartFormData
      } else if (mode === 'code') {
        try {
          config = JSON.parse(configJson)
        } catch {
          toast({ title: '配置 JSON 格式错误', variant: 'destructive' })
          return
        }
      } else {
        try {
          config = JSON.parse(formValues.config)
        } catch {
          toast({ title: '配置 JSON 格式错误', variant: 'destructive' })
          return
        }
      }

      const data: CreateInstanceInput | UpdateInstanceInput = {
        ...(isEdit ? {} : { app_code: app!.code }),
        name: formValues.name,
        description: formValues.description,
        config,
        schedule_type: formValues.schedule_type,
        schedule_config: formValues.schedule_config ? JSON.parse(formValues.schedule_config) : null,
        enabled: formValues.enabled,
      }

      setSubmitting(true)
      await onSubmit(data)
      onClose()
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || '操作失败'
      toast({ title: msg, variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    setMode(hasSchema ? 'smart' : 'json')
    setSmartFormData({})
    setErrors({})
    onClose()
  }

  // 一键填充示例配置
  const handleFillExample = () => {
    if (!app) return

    const exampleConfig = getConfigPlaceholder(app.code)

    try {
      const parsedConfig = JSON.parse(exampleConfig)

      if (mode === 'smart') {
        setSmartFormData(parsedConfig)
      } else if (mode === 'code') {
        setConfigJson(exampleConfig)
      } else {
        updateField('config', exampleConfig)
      }

      toast({ title: '已填充示例配置，请根据实际情况修改' })
    } catch {
      toast({ title: '示例配置解析失败', variant: 'destructive' })
    }
  }

  // 模式切换函数
  const handleModeSwitch = () => {
    if (mode === 'smart') {
      const jsonStr = JSON.stringify(smartFormData, null, 2)
      updateField('config', jsonStr)
      setMode('json')
    } else if (mode === 'json') {
      setConfigJson(formValues.config || '{}')
      setMode('code')
    } else {
      if (hasSchema) {
        try {
          const parsed = JSON.parse(configJson)
          setSmartFormData(parsed)
          setMode('smart')
        } catch {
          toast({ title: 'JSON 格式错误，无法切换到智能表单', variant: 'destructive' })
        }
      } else {
        updateField('config', configJson)
        setMode('json')
      }
    }
  }

  const getModeName = () => {
    if (mode === 'smart') return '智能表单'
    if (mode === 'json') return 'JSON文本'
    return '代码编辑器'
  }

  return (
    <PageModal
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose()
      }}
      title={isEdit ? '编辑实例' : `创建实例 - ${app?.name}`}
      description="配置应用实例参数"
      width="min(960px, 92vw)"
      className="max-h-[90vh]"
      bodyClassName="modal-scrollbar-hidden px-1"
      footer={
        <div className="flex items-center justify-end gap-3 border-t border-[#E2E8F0] px-6 py-4">
          <Button variant="outline" onClick={handleClose}>取消</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEdit ? '保存' : '创建'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-1">
        {/* 实例名称 */}
        <div className="space-y-2">
          <Label htmlFor="name">实例名称 <span className="text-red-500">*</span></Label>
          <Input
            id="name"
            placeholder="例如：每日销售看板推送"
            value={formValues.name}
            onChange={(e) => updateField('name', e.target.value)}
          />
          {errors.name && <p className="text-[0.875rem] leading-5 text-red-500">{errors.name}</p>}
        </div>

        {/* 描述 */}
        <div className="space-y-2">
          <Label htmlFor="description">描述</Label>
          <Textarea
            id="description"
            rows={2}
            placeholder="可选，描述此实例的用途"
            value={formValues.description}
            onChange={(e) => updateField('description', e.target.value)}
          />
        </div>

        {/* 调度类型（Agent 类应用固定为手动触发） */}
        {app?.category === 'agent' ? (
          <div className="space-y-2">
            <Label>调度类型</Label>
            <Input value="消息驱动（无需调度）" disabled />
          </div>
        ) : (
          <div className="space-y-2">
            <Label>调度类型 <span className="text-red-500">*</span></Label>
            <Select
              value={formValues.schedule_type}
              onValueChange={(v) => updateField('schedule_type', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择调度类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">手动触发</SelectItem>
                <SelectItem value="cron">定时调度</SelectItem>
                <SelectItem value="event">事件触发</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Cron 表达式（条件显示） */}
        {formValues.schedule_type === 'cron' && (
          <div className="space-y-2">
            <Label htmlFor="schedule_config">
              Cron 表达式
              <span className="text-red-500"> *</span>
              <span className="ml-2 text-xs text-muted-foreground">
                格式：分 时 日 月 周，例如：0 9 * * * 表示每天早上9点
              </span>
            </Label>
            <Textarea
              id="schedule_config"
              rows={2}
              placeholder='{"cron": "0 9 * * *"}'
              className="font-mono text-[0.875rem] leading-6"
              value={formValues.schedule_config}
              onChange={(e) => updateField('schedule_config', e.target.value)}
            />
            {errors.schedule_config && <p className="text-[0.875rem] leading-5 text-red-500">{errors.schedule_config}</p>}
          </div>
        )}

        {/* 配置内容 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>
              应用配置
              <span className="ml-2 text-[0.75rem] leading-4 text-muted-foreground">({getModeName()})</span>
            </Label>
            <div className="flex gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={handleFillExample}>
                      <FileCode className="w-4 h-4 mr-1" />
                      填充示例
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>一键填充示例配置</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={handleModeSwitch}>
                      {mode === 'smart' ? <Code2 className="w-4 h-4 mr-1" /> : <Wand2 className="w-4 h-4 mr-1" />}
                      切换模式
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    切换到{mode === 'smart' ? 'JSON文本' : mode === 'json' ? '代码编辑器' : hasSchema ? '智能表单' : 'JSON文本'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          {mode === 'smart' && hasSchema ? (
            <div className="rounded-md">
              <Form
                schema={app!.config_schema as RJSFSchema}
                formData={smartFormData}
                validator={validator}
                onChange={(e) => setSmartFormData(e.formData)}
                templates={rjsfTemplates}
                widgets={mergedWidgets}
                uiSchema={uiSchema}
              >
                <></>
              </Form>
            </div>
          ) : mode === 'code' ? (
            <div className="border rounded-md overflow-hidden">
              <Editor
                height="300px"
                language="json"
                value={configJson}
                onChange={(value) => setConfigJson(value || '{}')}
                options={{ minimap: { enabled: false }, fontSize: 13 }}
              />
            </div>
          ) : (
            <>
              {app && (
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-[0.9375rem] leading-6">
                  <div className="mb-2 font-medium text-blue-900">配置说明</div>
                  <div className="whitespace-pre-wrap text-blue-800">
                    {getConfigExample(app.code)}
                  </div>
                </div>
              )}
              <Textarea
                rows={12}
                placeholder={app ? getConfigPlaceholder(app.code) : '请输入 JSON 格式的配置'}
                className="font-mono text-[0.875rem] leading-6"
                value={formValues.config}
                onChange={(e) => updateField('config', e.target.value)}
              />
            </>
          )}
        </div>

        {/* 启用开关 */}
        <div className="flex items-center gap-3">
          <Label htmlFor="enabled">启用状态</Label>
          <Switch
            id="enabled"
            checked={formValues.enabled}
            onCheckedChange={(v) => updateField('enabled', v)}
          />
          <span className="text-[0.875rem] leading-5 text-muted-foreground">
            {formValues.enabled ? '已启用' : '已禁用'}
          </span>
        </div>
      </div>
    </PageModal>
  )
}
