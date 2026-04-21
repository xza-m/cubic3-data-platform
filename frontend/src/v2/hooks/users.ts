// frontend/src/v2/hooks/users.ts
//
// 用户域 react-query hooks。
// query key 规范：qk('users', action, ...args)
// TODO: 后端 /api/v1/users 待联调确认，当前 API 层有 mock fallback

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from './query-client'
import {
  listUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  assignUserRoles,
  type ListUsersParams,
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
