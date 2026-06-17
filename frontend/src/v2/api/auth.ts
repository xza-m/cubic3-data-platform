import { apiClient } from './client'

interface Envelope<T> {
  code: number
  message: string
  data: T
  trace_id?: string | null
}

export interface CurrentUser {
  user_id?: string | null
  principal_id?: string | null
  user_name?: string | null
  roles?: string[]
  platform_roles?: string[]
  data_roles?: string[]
  access_roles?: string[]
  permissions?: string[]
}

export async function getCurrentUser(): Promise<CurrentUser> {
  const res = await apiClient.get<Envelope<CurrentUser>>('/auth/me')
  return res.data.data
}
