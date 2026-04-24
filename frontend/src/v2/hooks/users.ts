// frontend/src/v2/hooks/users.ts
//
// 用户域 react-query hooks。
// query key 规范：qk('users', action, ...args)

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from './query-client'
import {
  listUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  assignUserRoles,
  listUserLoginHistory,
  type ListUsersParams,
  type ListLoginHistoryParams,
  type CreateUserPayload,
  type UpdateUserPayload,
  type AssignRolesPayload,
} from '../api/users'

// ── 列表 ──────────────────────────────────────────────────────────────────────

export function useListUsers(params: ListUsersParams = {}) {
  return useQuery({
    queryKey: qk('users', 'list', params),
    queryFn: () => listUsers(params),
    staleTime: 30_000,
  })
}

// ── 详情 ──────────────────────────────────────────────────────────────────────

export function useUser(id: number) {
  return useQuery({
    queryKey: qk('users', 'detail', id),
    queryFn: () => getUser(id),
    enabled: Number.isFinite(id) && id > 0,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

// ── Mutation ──────────────────────────────────────────────────────────────────

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateUserPayload) => createUser(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdateUserPayload }) =>
      updateUser(id, payload),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['users'] })
      qc.invalidateQueries({ queryKey: qk('users', 'detail', id) })
    },
  })
}

export function useDeleteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

// ── 登录历史（B-8）────────────────────────────────────────────────────────────

export function useUserLoginHistory(
  id: number | undefined,
  params: ListLoginHistoryParams = {},
) {
  return useQuery({
    queryKey: qk('users', 'login-history', id, params),
    queryFn: () => listUserLoginHistory(id as number, params),
    enabled: Number.isFinite(id) && (id ?? 0) > 0,
    staleTime: 15_000,
  })
}

export function useAssignUserRoles() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: AssignRolesPayload }) =>
      assignUserRoles(id, payload),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['users'] })
      qc.invalidateQueries({ queryKey: qk('users', 'detail', id) })
    },
  })
}
