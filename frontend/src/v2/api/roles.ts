// frontend/src/v2/api/roles.ts
//
// 角色域 API 层。
// 后端契约：
//   GET    /api/v1/roles          列表（支持 ?q=）
//   POST   /api/v1/roles          创建（admin）
//   GET    /api/v1/roles/:id      详情
//   PUT    /api/v1/roles/:id      更新（admin）
//   DELETE /api/v1/roles/:id      删除（admin）
//   GET    /api/v1/permissions    列出可分配权限码

import { apiClient } from './client'
import type { PaginatedResponse } from './types'

// ── 类型 ──────────────────────────────────────────────────────────────────────

/** 单条权限（后端 SEED_PERMISSIONS）：`{ id, code, description }` */
export interface Permission {
  id: number
  code: string
  description: string | null
}

export interface Role {
  id: number
  code: string
  name: string
  description: string | null
  /** 权限 code 列表，格式 "resource:action"，如 "datasource:read" */
  permissions: string[]
  is_system: boolean
  created_at: string | null
  updated_at: string | null
}

export interface ListRolesParams {
  page?: number
  page_size?: number
  q?: string
}

export interface CreateRolePayload {
  name: string
  /** 可选：未提供时后端由 name slugify 生成 */
  code?: string
  description?: string
  permissions?: string[]
}

export interface UpdateRolePayload {
  name?: string
  code?: string
  description?: string
  permissions?: string[]
}

// ── 内置权限矩阵定义（前端 schema，后端应保持一致）────────────────────────────

export const PERMISSION_RESOURCES = [
  'datasource',
  'dataset',
  'extraction',
  'query',
  'semantic',
  'ontology',
  'app',
  'app_instance',
  'channel',
  'subscription',
  'user',
  'role',
] as const

export const PERMISSION_ACTIONS = ['read', 'write', 'delete', 'admin'] as const

export type PermissionResource = (typeof PERMISSION_RESOURCES)[number]
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number]

export function permKey(resource: PermissionResource, action: PermissionAction): string {
  return `${resource}:${action}`
}

// ── 响应信封 ──────────────────────────────────────────────────────────────────

interface Envelope<T> {
  code: number
  message: string
  data: T
  trace_id?: string | null
}

/** 后端分页列表原始响应（注意字段名是 `size` 不是 `page_size`）。*/
interface RawListPayload<T> {
  items: T[]
  total: number
  page: number
  size: number
}

function normalizeList<T>(raw: RawListPayload<T>): PaginatedResponse<T> {
  return {
    items: raw.items,
    total: raw.total,
    page: raw.page,
    page_size: raw.size,
  }
}

// ── API 函数 ──────────────────────────────────────────────────────────────────

export async function listRoles(
  params: ListRolesParams = {},
): Promise<PaginatedResponse<Role>> {
  // 后端 list_roles 目前不分页（一次性返回全部），仍提供 total / page / size 信封
  const res = await apiClient.get<Envelope<RawListPayload<Role>>>('/roles', {
    params: { q: params.q },
  })
  return normalizeList(res.data.data)
}

export async function getRole(id: number): Promise<Role> {
  const res = await apiClient.get<Envelope<Role>>(`/roles/${id}`)
  return res.data.data
}

export async function createRole(payload: CreateRolePayload): Promise<Role> {
  const res = await apiClient.post<Envelope<Role>>('/roles', payload)
  return res.data.data
}

export async function updateRole(id: number, payload: UpdateRolePayload): Promise<Role> {
  const res = await apiClient.put<Envelope<Role>>(`/roles/${id}`, payload)
  return res.data.data
}

export async function deleteRole(id: number): Promise<void> {
  await apiClient.delete(`/roles/${id}`)
}

/** GET /api/v1/permissions — 列出所有可分配权限码 */
export async function listPermissions(): Promise<Permission[]> {
  const res = await apiClient.get<Envelope<{ items: Permission[] }>>('/permissions')
  return res.data.data.items
}
