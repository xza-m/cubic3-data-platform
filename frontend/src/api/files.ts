/**
 * 文件上传 API
 */
import apiClient from './client'

export interface FileUploadResponse {
  file_id: string
  file_name: string
  file_path: string
  file_size: number
  row_count: number
  preview_limit?: number
  sample_rows?: Record<string, unknown>[]
  sample_columns?: string[]
  columns: Array<{
    name: string
    type: string
    sample_values: (string | number | boolean | null)[]
  }>
  fields?: Array<{  // 统一字段名为 fields（与物理表一致）
    field_name?: string
    physical_name?: string
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
  preview: Record<string, unknown>[]
  uploaded_at: string
}

/**
 * 上传 CSV / Excel 文件
 */
export const uploadTabularFile = async (file: File): Promise<FileUploadResponse> => {
  const formData = new FormData()
  formData.append('file', file)
  
  const response = await apiClient.post('/files/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  })
  return response.data
}

export const uploadCSVFile = uploadTabularFile
