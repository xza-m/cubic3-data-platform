// frontend/src/v2/api/users.ts
//
// 用户域 API 层。
// 后端契约：
//   GET    /api/v1/users           列表（?page=&size=&q=&status=active|disabled|all&is_active=）
//   POST   /api/v1/users           创建（admin）
//   GET    /api/v1/users/:id       详情
//   PUT    /api/v1/users/:id       更新（admin）
//   PUT    /api/v1/users/:id/roles 角色分配（admin，body: { role_codes? | role_ids? }）
//   DELETE /api/v1/users/:id       删除（admin）

import { apiClient } from './client'
import type { PaginatedResponse } from './types'

// ── 类型 ──────────────────────────────────────────────────────────────────────

/** 用户状态（与后端 `UserStatus` 枚举对齐）。 */
export type UserStatus = 'active' | 'disabled'

export interface User {
  id: number
  username: string
  email: string | null
  display_name: string | null
  /** 后端返回的状态枚举（权威字段） */
  status: UserStatus
  /** 便捷字段，等价于 `status === 'active'`（后端同时提供） */
  is_active: boolean
  is_system: boolean
  role_ids: number[]
  role_codes: string[]
  last_login_at: string | null
  created_at: string | null
  updated_at: string | null
}

export interface ListUsersParams {
  page?: number
  page_size?: number
  q?: string
  /** 推荐使用 status；is_active 保留向后兼容，后端会自动映射 */
  status?: UserStatus | 'all'
  is_active?: boolean
}

export interface CreateUserPayload {
  username: string
  password: string
  email?: string
  display_name?: string
  role_ids?: number[]
  role_codes?: string[]
}

export interface UpdateUserPayload {
  email?: string
  display_name?: string
  is_active?: boolean
  status?: UserStatus
}

export interface AssignRolesPayload {
  role_ids?: number[]
  role_codes?: string[]
}

// ── 响应信封 ──────────────────────────────────────────────────────────────────

interface Envelope<T> {
  code: number
  message: string
  data: T
  trace_id?: string | null
}

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

export async function listUsers(
  params: ListUsersParams = {},
): Promise<PaginatedResponse<User>> {
  // 后端 list_users 使用 `size` 作为每页数量入参。我们把 page_size 透传过去，
  // 后端已兼容 page_size → size 的别名。
  const res = await apiClient.get<Envelope<RawListPayload<User>>>('/users', {
    params: {
      page: params.page,
      size: params.page_size,
      page_size: params.page_size,
      q: params.q,
      status: params.status,
      is_active: params.is_active,
    },
  })
  return normalizeList(res.data.data)
}

export async function getUser(id: number): Promise<User> {
  const res = await apiClient.get<Envelope<User>>(`/users/${id}`)
  return res.data.data
}

export async function createUser(payload: CreateUserPayload): Promise<User> {
  const res = await apiClient.post<Envelope<User>>('/users', payload)
  return res.data.data
}

export async function updateUser(id: number, payload: UpdateUserPayload): Promise<User> {
  const res = await apiClient.put<Envelope<User>>(`/users/${id}`, payload)
  return res.data.data
}

export async function assignUserRoles(id: number, payload: AssignRolesPayload): Promise<User> {
  const res = await apiClient.put<Envelope<User>>(`/users/${id}/roles`, payload)
  return res.data.data
}

export async function deleteUser(id: number): Promise<void> {
  await apiClient.delete(`/users/${id}`)
}

// ── 登录历史（B-8）────────────────────────────────────────────────────────────
// 后端契约：GET /api/v1/users/:id/login-history?page=&size=
//          （app/interfaces/api/v1/users.py :: get_user_login_history）

export interface LoginHistoryItem {
  id: number
  logged_at: string | null
  status: 'success' | 'failed'
  ip: string | null
  user_agent: string | null
  error_reason: string | null
}

export interface ListLoginHistoryParams {
  page?: number
  page_size?: number
}

export async function listUserLoginHistory(
  id: number,
  params: ListLoginHistoryParams = {},
): Promise<PaginatedResponse<LoginHistoryItem>> {
  const res = await apiClient.get<Envelope<RawListPayload<LoginHistoryItem>>>(
    `/users/${id}/login-history`,
    {
      params: {
        page: params.page,
        size: params.page_size,
        page_size: params.page_size,
      },
    },
  )
  return normalizeList(res.data.data)
}
