import type { FilterGroup } from './filter'

// API 响应基础类型
export interface ApiResponse<T = any> {
  code: number
  message: string
  data: T
  trace_id?: string
}

// 分页响应
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

// 数据源类型
export interface DataSource {
  id: number
  name: string
  source_type: string
  description?: string
  connection_config: Record<string, any>
  extra_config?: {
    catalog_sync?: {
      status?: 'pending' | 'syncing' | 'synced' | 'failed' | string
      last_run_at?: string | null
      last_error?: string | null
      tracked_databases?: string[]
      database_count?: number
    }
    [key: string]: unknown
  }
  is_active: boolean
  connection_status: string
  last_test_at?: string
  last_test_error?: string | null
  created_at: string
  updated_at: string
}

// 数据集类型
export interface Dataset {
  id: number
  dataset_code: string
  dataset_name: string
  dataset_type: 'physical' | 'virtual' | 'file' | string
  source_id?: number
  source_type?: string
  physical_table?: string
  sql_query?: string
  file_metadata?: Record<string, any>
  description?: string
  owner?: string
  sync_status: string
  last_sync_at?: string
  sync_error?: string
  preview_limit?: number
  sample_rows?: Record<string, unknown>[]
  sample_columns?: string[]
  field_count?: number
  fields?: DatasetField[]
  created_at: string
  updated_at: string
}

// 数据集字段
export interface DatasetField {
  id: number
  physical_name: string
  data_type: string
  display_name?: string
  business_type: 'partition' | 'dimension' | 'metric' | 'partition_key' | 'measure' | string  // partition/metric 为新命名，partition_key/measure 为旧命名兼容
  sensitivity_level: 'public' | 'internal' | 'pii' | 'confidential' | 'secret' | string
  is_sensitive: boolean
  mask_rule?: string
  comment?: string
  field_order?: number
  is_partition_key?: boolean
  is_nullable?: boolean
  default_value?: string
  field_tags?: Record<string, unknown>
  sample_values?: (string | number | boolean | null)[]
}

// 提取任务
export interface ExtractionTask {
  id: number
  task_name: string
  task_code: string
  dataset_id: number
  select_fields: string[]
  filter_conditions: Record<string, unknown>
  row_limit: number
  task_type: string
  is_active: boolean
  is_enabled?: boolean
  last_run_at?: string
  last_run_status?: string
  created_at: string
  updated_at: string
}

// 执行记录
export interface ExtractionRun {
  id: number
  task_id: number
  status: string
  triggered_by: string
  start_time?: string
  end_time?: string
  duration_ms?: number
  row_count?: number
  error_message?: string
  created_at: string
  delivery_method?: string
  result_size_mb?: number
  generated_sql?: string
  delivery_info?: Record<string, unknown>
}

// 创建任务请求
export interface CreateTaskRequest {
  task_name: string
  dataset_id: number
  select_fields: string[]
  filter_conditions: Record<string, unknown> | FilterGroup
  row_limit?: number
  task_type?: string
  description?: string
  is_active?: boolean
  subscription_config?: Record<string, unknown>
}

// 执行任务请求
export interface ExecuteTaskRequest {
  triggered_by?: string
}

// SQL 查询结果（前端规范化后，data 为对象数组）
export interface NormalizedQueryResult {
  columns: string[]
  data: Record<string, unknown>[]
  row_count: number
  execution_time_ms: number
  fields?: Array<{
    field_name: string
    data_type: string
    business_type: string
    sensitivity_level: string
    mask_rule?: string
    confidence_score: number
    matched_rules: string[]
    display_name: string
    comment: string
    is_partition: boolean
    is_measure: boolean
    is_sensitive: boolean
  }>
  statistics?: {
    total_fields: number
    partition_fields: number
    measure_fields: number
    sensitive_fields: number
  }
}

// 字段配置项（数据集注册流程中的字段配置）
export interface FieldConfigItem {
  physical_name: string
  data_type: string
  display_name?: string
  business_type?: string
  sensitivity_level?: string
  mask_rule?: string
  comment?: string
  confidence_score?: number
  matched_rules?: string[]
  auto_recognized?: boolean
  field_order?: number
}

// 数据提取预览结果
export interface PreviewDataResult {
  sql?: string
  columns: string[]
  data: Record<string, unknown>[]
  total: number
}

// 查询结果数据（可视化构建器等）
export interface QueryResultData {
  columns: string[]
  data: unknown[][]
  row_count: number
  execution_time_ms: number
  status?: string
}

// 导出 Filter 相关类型
export type { 
  FilterCondition, 
  FilterGroup, 
  FieldMeta 
} from './filter'
