import apiClient from './client'

// API 基础路径
const API_BASE = '/data-center/datasources'

// Schema 列表响应
export const getSchemas = (datasourceId: number, database: string) => {
    return apiClient.get<string[]>(
        `${API_BASE}/${datasourceId}/schemas`,
        { params: { database } }
    )
}

// 表 Schema 响应类型
export interface TableSchemaColumn {
    name: string
    type: string
    comment?: string
    is_nullable?: boolean
    is_partition?: boolean
    is_primary_key?: boolean
    default_value?: string | null
}

export interface TableSchemaResponse {
    table_name: string
    comment?: string
    columns: TableSchemaColumn[]
    partitions: string[]
    row_count?: number
    size?: number | string
}

// 获取表的字段 Schema
export const getTableSchema = (
    datasourceId: number,
    database: string,
    table: string,
    schema?: string
) => {
    return apiClient.get<TableSchemaResponse>(
        `${API_BASE}/${datasourceId}/table-schema`,
        { params: { database, table, ...(schema ? { schema } : {}) } }
    )
}
