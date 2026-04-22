// frontend/src/v2/api/roles.ts
//
// 角色域 API 层。
// 后端契约：GET /api/v1/roles  POST  PUT /roles/:id  DELETE /roles/:id
// TODO: 后端 W1 RBAC 基线已落地，若 /api/v1/roles 未就绪请联调确认

import { apiClient } from './client'
import type { PaginatedResponse } from './types'
import { t } from '@v2/i18n'

// ── 类型 ──────────────────────────────────────────────────────────────────────

/** 资源 × 动作权限项 */
export interface Permission {
  resource: string
  action: string
}

export interface Role {
  id: number
  name: string
  description: string | null
  /** 权限字符串列表，格式 "resource:action"，如 "datasource:read" */
  permissions: string[]
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
  description?: string
  permissions?: string[]
}

export interface UpdateRolePayload {
  name?: string
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

// ── mock 数据（后端未就绪时使用）────────────────────────────────────────────

const MOCK_ROLES: Role[] = [
  {
    id: 1,
    name: t('roles.mock.superAdmin.name', '超级管理员'),
    description: t('roles.mock.superAdmin.desc', '拥有所有权限'),
    permissions: PERMISSION_RESOURCES.flatMap((r) => PERMISSION_ACTIONS.map((a) => `${r}:${a}`)),
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 2,
    name: t('roles.mock.analyst.name', '数据分析师'),
    description: t('roles.mock.analyst.desc', '可读取数据、执行查询'),
    permissions: ['datasource:read', 'dataset:read', 'query:read', 'query:write', 'semantic:read'],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 3,
    name: t('roles.mock.viewer.name', '只读访客'),
    description: t('roles.mock.viewer.desc', '只能查看基础数据'),
    permissions: ['datasource:read', 'dataset:read'],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
]

// ── API 函数 ──────────────────────────────────────────────────────────────────

export async function listRoles(
  params: ListRolesParams = {},
): Promise<PaginatedResponse<Role>> {
  try {
    const res = await apiClient.get<{ data: PaginatedResponse<Role> }>('/roles', { params })
    return res.data.data
  } catch {
    // TODO: 后端 /api/v1/roles 未就绪 — mock 数据占位
    const items = MOCK_ROLES.filter((r) => {
      if (params.q) {
        const q = params.q.toLowerCase()
        if (!r.name.toLowerCase().includes(q)) return false
      }
      return true
    })
    return { items, total: items.length, page: 1, page_size: 20 }
  }
}

export async function getRole(id: number): Promise<Role> {
  try {
    const res = await apiClient.get<{ data: Role }>(`/roles/${id}`)
    return res.data.data
  } catch {
    // TODO: mock
    const r = MOCK_ROLES.find((r) => r.id === id)
    if (!r) throw new Error(t('roles.error.notFound', '角色 #{id} 不存在', { id }))
    return r
  }
}

export async function createRole(payload: CreateRolePayload): Promise<Role> {
  try {
    const res = await apiClient.post<{ data: Role }>('/roles', payload)
    return res.data.data
  } catch {
    // TODO: mock
    const newRole: Role = {
      id: Date.now(),
      name: payload.name,
      description: payload.description ?? null,
      permissions: payload.permissions ?? [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    MOCK_ROLES.push(newRole)
    return newRole
  }
}

export async function updateRole(id: number, payload: UpdateRolePayload): Promise<Role> {
  try {
    const res = await apiClient.put<{ data: Role }>(`/roles/${id}`, payload)
    return res.data.data
  } catch {
    // TODO: mock
    const idx = MOCK_ROLES.findIndex((r) => r.id === id)
    if (idx < 0) throw new Error(t('roles.error.notFound', '角色 #{id} 不存在', { id }))
    MOCK_ROLES[idx] = { ...MOCK_ROLES[idx], ...payload, updated_at: new Date().toISOString() }
    return MOCK_ROLES[idx]
  }
}

export async function deleteRole(id: number): Promise<void> {
  try {
    await apiClient.delete(`/roles/${id}`)
  } catch {
    // TODO: mock
    const idx = MOCK_ROLES.findIndex((r) => r.id === id)
    if (idx >= 0) MOCK_ROLES.splice(idx, 1)
  }
}
