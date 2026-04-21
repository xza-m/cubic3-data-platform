// frontend/src/v2/api/users.ts
//
// 用户域 API 层。
// 后端契约：GET /api/v1/users  POST  PUT /users/:id  PUT /users/:id/roles
// TODO: 后端 W1 RBAC 基线已落地，若 /api/v1/users 未就绪请联调确认
// 当前：先接 real API，失败时 fallback mock 数据，便于前端自测

import { apiClient } from './client'
import type { PaginatedResponse } from './types'

// ── 类型 ──────────────────────────────────────────────────────────────────────

export interface User {
  id: number
  username: string
  email: string | null
  display_name: string | null
  role_ids: number[]
  is_active: boolean
  last_login_at: string | null
  created_at: string | null
}

export interface ListUsersParams {
  page?: number
  page_size?: number
  q?: string
  is_active?: boolean
}

export interface CreateUserPayload {
  username: string
  email?: string
  display_name?: string
  password: string
  role_ids?: number[]
}

export interface UpdateUserPayload {
  email?: string
  display_name?: string
  is_active?: boolean
}

export interface AssignRolesPayload {
  role_ids: number[]
}

// ── mock 数据（后端未就绪时使用）────────────────────────────────────────────

const MOCK_USERS: User[] = [
  { id: 1, username: 'admin', email: 'admin@example.com', display_name: '管理员', role_ids: [1], is_active: true, last_login_at: new Date(Date.now() - 3600_000).toISOString(), created_at: '2024-01-01T00:00:00Z' },
  { id: 2, username: 'analyst', email: 'analyst@example.com', display_name: '数据分析师', role_ids: [2], is_active: true, last_login_at: new Date(Date.now() - 86400_000).toISOString(), created_at: '2024-02-01T00:00:00Z' },
  { id: 3, username: 'viewer', email: 'viewer@example.com', display_name: '只读用户', role_ids: [3], is_active: false, last_login_at: null, created_at: '2024-03-01T00:00:00Z' },
]

// ── API 函数 ──────────────────────────────────────────────────────────────────

export async function listUsers(
  params: ListUsersParams = {},
): Promise<PaginatedResponse<User>> {
  try {
    const res = await apiClient.get<{ data: PaginatedResponse<User> }>('/users', { params })
    return res.data.data
  } catch {
    // TODO: 后端 /api/v1/users 未就绪 — mock 数据占位
    const items = MOCK_USERS.filter((u) => {
      if (params.is_active !== undefined && u.is_active !== params.is_active) return false
      if (params.q) {
        const q = params.q.toLowerCase()
        if (!u.username.toLowerCase().includes(q) && !(u.display_name ?? '').toLowerCase().includes(q)) return false
      }
      return true
    })
    return { items, total: items.length, page: 1, page_size: 20 }
  }
}

export async function getUser(id: number): Promise<User> {
  try {
    const res = await apiClient.get<{ data: User }>(`/users/${id}`)
    return res.data.data
  } catch {
    // TODO: 后端 /api/v1/users/:id 未就绪 — mock
    const u = MOCK_USERS.find((u) => u.id === id)
    if (!u) throw new Error(`用户 #${id} 不存在`)
    return u
  }
}

export async function createUser(payload: CreateUserPayload): Promise<User> {
  try {
    const res = await apiClient.post<{ data: User }>('/users', payload)
    return res.data.data
  } catch {
    // TODO: 后端 /api/v1/users 未就绪 — mock
    const newUser: User = {
      id: Date.now(),
      username: payload.username,
      email: payload.email ?? null,
      display_name: payload.display_name ?? null,
      role_ids: payload.role_ids ?? [],
      is_active: true,
      last_login_at: null,
      created_at: new Date().toISOString(),
    }
    MOCK_USERS.push(newUser)
    return newUser
  }
}

export async function updateUser(id: number, payload: UpdateUserPayload): Promise<User> {
  try {
    const res = await apiClient.put<{ data: User }>(`/users/${id}`, payload)
    return res.data.data
  } catch {
    // TODO: mock
    const idx = MOCK_USERS.findIndex((u) => u.id === id)
    if (idx < 0) throw new Error(`用户 #${id} 不存在`)
    MOCK_USERS[idx] = { ...MOCK_USERS[idx], ...payload }
    return MOCK_USERS[idx]
  }
}

export async function assignUserRoles(id: number, payload: AssignRolesPayload): Promise<User> {
  try {
    const res = await apiClient.put<{ data: User }>(`/users/${id}/roles`, payload)
    return res.data.data
  } catch {
    // TODO: mock
    const idx = MOCK_USERS.findIndex((u) => u.id === id)
    if (idx < 0) throw new Error(`用户 #${id} 不存在`)
    MOCK_USERS[idx] = { ...MOCK_USERS[idx], role_ids: payload.role_ids }
    return MOCK_USERS[idx]
  }
}

export async function deleteUser(id: number): Promise<void> {
  try {
    await apiClient.delete(`/users/${id}`)
  } catch {
    // TODO: mock
    const idx = MOCK_USERS.findIndex((u) => u.id === id)
    if (idx >= 0) MOCK_USERS.splice(idx, 1)
  }
}
