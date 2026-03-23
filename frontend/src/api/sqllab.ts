/**
 * SQL Lab API
 * 支持同步和异步两种查询模式
 */
import apiClient from './client'

export interface ExecuteSQLRequest {
  source_id: number
  sql_query: string
  limit?: number
  async?: boolean  // 是否异步执行
}

/** SQL 结果单元格值类型 */
export type SQLCellValue = string | number | boolean | null

export interface ExecuteSQLResponse {
  columns: string[]
  data: SQLCellValue[][]
  row_count: number
  execution_time_ms: number
  fields?: Array<{  // 统一字段名为 fields（与物理表一致）
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

// 异步查询相关类型
export type SQLQueryStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface AsyncQuerySubmitResponse {
  query_id: number
  status: SQLQueryStatus
}

export interface QueryStatusResponse {
  id: number
  status: SQLQueryStatus
  execution_time_ms: number | null
  row_count: number | null
  error_message: string | null
}

export interface QueryResultResponse {
  id: number
  status: SQLQueryStatus
  source_id: number
  created_at: string
  started_at: string | null
  completed_at: string | null
  execution_time_ms: number | null
  row_count: number | null
  error_message: string | null
  result?: ExecuteSQLResponse
}

export interface ValidateSQLRequest {
  sql_query: string
}

export interface ValidateSQLResponse {
  valid: boolean
  errors: string[]
}

/**
 * 执行 SQL 查询（同步模式，预览）
 * 返回完整 ApiResponse（{code, message, data}），调用方使用 .data 获取业务数据
 */
export const executeSQL = async (data: ExecuteSQLRequest) => {
  const response = await apiClient.post('/sql_lab/execute', data)
  return response
}

/**
 * 提交异步 SQL 查询
 * @returns 返回 query_id，用于后续轮询状态
 */
export const submitAsyncQuery = async (data: Omit<ExecuteSQLRequest, 'async'>): Promise<AsyncQuerySubmitResponse> => {
  const response = await apiClient.post('/sql_lab/execute', { ...data, async: true })
  return response.data
}

/**
 * 获取异步查询状态
 */
export const getQueryStatus = async (queryId: number): Promise<QueryStatusResponse> => {
  const response = await apiClient.get(`/sql_lab/query/${queryId}/status`)
  return response.data
}

/**
 * 获取异步查询结果
 */
export const getQueryResult = async (queryId: number): Promise<QueryResultResponse> => {
  const response = await apiClient.get(`/sql_lab/query/${queryId}/result`)
  return response.data
}

/**
 * 轮询异步查询直到完成
 * @param queryId 查询 ID
 * @param onStatusChange 状态变化回调
 * @param intervalMs 轮询间隔（默认 2000ms）
 * @param maxAttempts 最大尝试次数（默认 300 次，即 10 分钟）
 * @returns 查询结果
 */
export const pollQueryUntilComplete = async (
  queryId: number,
  onStatusChange?: (status: QueryStatusResponse) => void,
  intervalMs: number = 2000,
  maxAttempts: number = 300
): Promise<QueryResultResponse> => {
  let attempts = 0
  
  while (attempts < maxAttempts) {
    const status = await getQueryStatus(queryId)
    onStatusChange?.(status)
    
    if (status.status === 'completed' || status.status === 'failed') {
      // 查询已完成，获取结果
      return await getQueryResult(queryId)
    }
    
    // 等待后重试
    await new Promise(resolve => setTimeout(resolve, intervalMs))
    attempts++
  }
  
  throw new Error('查询超时，请稍后重试')
}

/**
 * 智能执行 SQL 查询
 * 根据数据源类型自动选择同步或异步模式
 * 
 * @param data 查询参数
 * @param useAsync 是否使用异步模式（默认 true）
 * @param onStatusChange 异步模式下的状态变化回调
 * @returns 查询结果
 */
export const executeSQLSmart = async (
  data: Omit<ExecuteSQLRequest, 'async'>,
  useAsync: boolean = true,
  onStatusChange?: (status: QueryStatusResponse) => void
): Promise<ExecuteSQLResponse> => {
  if (!useAsync) {
    // 同步模式
    const response = await executeSQL(data)
    return response.data
  }
  
  // 异步模式
  const submitResponse = await submitAsyncQuery(data)
  const result = await pollQueryUntilComplete(
    submitResponse.query_id,
    onStatusChange
  )
  
  if (result.status === 'failed') {
    throw new Error(result.error_message || '查询执行失败')
  }
  
  return result.result!
}

/**
 * 验证 SQL 语法
 */
export const validateSQL = async (data: ValidateSQLRequest): Promise<ValidateSQLResponse> => {
  const response = await apiClient.post('/sql_lab/validate', data)
  return response.data
}
