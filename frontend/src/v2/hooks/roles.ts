// frontend/src/v2/hooks/roles.ts
//
// 角色域 react-query hooks。
// query key 规范：qk('roles', action, ...args)
// TODO: 后端 /api/v1/roles 待联调确认，当前 API 层有 mock fallback

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from './query-client'
import {
  listRoles,
  getRole,
  createRole,
  updateRole,
  deleteRole,
  type ListRolesParams,
  type CreateRolePayload,
  type UpdateRolePayload,
} from '../api/roles'

// ── 列表 ──────────────────────────────────────────────────────────────────────

export function useListRoles(params: ListRolesParams = {}) {
  return useQuery({
    queryKey: qk('roles', 'list', params),
    queryFn: () => listRoles(params),
    staleTime: 5 * 60_000, // 配置类，5 分钟
  })
}

// ── 详情 ──────────────────────────────────────────────────────────────────────

export function useRole(id: number) {
  return useQuery({
    queryKey: qk('roles', 'detail', id),
    queryFn: () => getRole(id),
    enabled: Number.isFinite(id) && id > 0,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  })
}

// ── Mutation ──────────────────────────────────────────────────────────────────

export function useCreateRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateRolePayload) => createRole(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] })
    },
  })
}

export function useUpdateRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdateRolePayload }) =>
      updateRole(id, payload),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['roles'] })
      qc.invalidateQueries({ queryKey: qk('roles', 'detail', id) })
    },
  })
}

export function useDeleteRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteRole(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] })
    },
  })
}
